#!/usr/bin/env python3
"""Sao chép một instance từ Supabase cloud sang data stack local.

    python3 -I sync_from_supabase.py <it|eng|jp> db       # dump public → restore (ghi đè)
    python3 -I sync_from_supabase.py <it|eng|jp> storage  # bucket + object, chỉ chép phần lệch
    python3 -I sync_from_supabase.py <it|eng|jp> verify   # so số dòng từng bảng + số object

Đọc creds cloud từ cloud/<id>.env, creds local từ .env (cùng thư mục script).
Postgres local chạy trong container `uniedu-data-db-1`; pg_dump/psql cũng chạy trong đó
để client và server cùng bản 17.
"""

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DB_CONTAINER = "uniedu-data-db-1"
STORAGE_PORTS = {"it": 55001, "eng": 55002, "jp": 55003}


def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key] = value
    return env


def psql(dsn_or_db, sql, superuser=True):
    """Chạy SQL trong container db; trả stdout. dsn_or_db là URL cloud hoặc tên DB local."""
    target = dsn_or_db if "://" in dsn_or_db else f"dbname={dsn_or_db} user=postgres"
    out = subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "psql", target, "-v", "ON_ERROR_STOP=1", "-Atq"],
        input=sql,
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise SystemExit(f"psql lỗi: {out.stderr.strip()}")
    return out.stdout


def query_json(dsn_or_db, sql):
    raw = psql(dsn_or_db, f"select coalesce(json_agg(_row), '[]') from ({sql}) _row;").strip()
    return json.loads(raw)


def sync_db(instance, cloud):
    db = f"uniedu_{instance}"
    dump = f"/backups/cloud-{instance}.dump"
    print(f"[db] pg_dump cloud → {dump}")
    subprocess.run(
        ["docker", "exec", DB_CONTAINER, "pg_dump", cloud["CLOUD_DB_URL"],
         "--schema=public", "--format=custom", "--no-owner", "--no-acl", "--file", dump],
        check=True,
    )
    print(f"[db] reset schema public trong {db}")
    psql(db, f"""
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION pg_database_owner;
GRANT USAGE ON SCHEMA public TO PUBLIC;
""")
    # Bỏ entry SCHEMA public trong dump (đã tạo ở trên).
    toc = subprocess.run(
        ["docker", "exec", DB_CONTAINER, "pg_restore", "--list", dump],
        check=True, capture_output=True, text=True,
    ).stdout
    keep = "\n".join(l for l in toc.splitlines() if " SCHEMA - public " not in l)
    subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "sh", "-c", f"cat > {dump}.list"],
        input=keep, check=True, text=True,
    )
    print(f"[db] pg_restore → {db} (owner {db})")
    subprocess.run(
        ["docker", "exec", DB_CONTAINER, "pg_restore", "--username", "postgres",
         "--dbname", db, "--no-owner", "--no-acl", f"--role={db}",
         "--exit-on-error", "--single-transaction", f"--use-list={dump}.list", dump],
        check=True,
    )
    psql(db, "ANALYZE;")
    print("[db] xong")


def http(method, url, key, body=None, headers=None):
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def object_url(base, bucket, name):
    return f"{base}/object/{bucket}/" + "/".join(urllib.parse.quote(s, safe="") for s in name.split("/"))


def sync_storage(instance, cloud, local_env):
    db = f"uniedu_{instance}"
    cloud_base = cloud["CLOUD_SUPABASE_URL"].rstrip("/") + "/storage/v1"
    cloud_key = cloud["CLOUD_SERVICE_KEY"]
    local_base = f"http://127.0.0.1:{STORAGE_PORTS[instance]}"
    local_key = local_env[f"{instance.upper()}_STORAGE_SERVICE_KEY"]

    buckets = query_json(cloud["CLOUD_DB_URL"],
                         "select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id")
    local_buckets = {b["id"] for b in query_json(db, "select id from storage.buckets")}
    for b in buckets:
        payload = json.dumps({k: b[k] for k in ("id", "name", "public", "file_size_limit", "allowed_mime_types")
                              if b[k] is not None}).encode()
        if b["id"] in local_buckets:
            status, out = http("PUT", f"{local_base}/bucket/{b['id']}", local_key, payload,
                               {"Content-Type": "application/json"})
        else:
            status, out = http("POST", f"{local_base}/bucket", local_key, payload,
                               {"Content-Type": "application/json"})
        if status >= 300:
            raise SystemExit(f"bucket {b['id']}: {status} {out[:200]!r}")
    print(f"[storage] {len(buckets)} bucket: {', '.join(b['id'] for b in buckets)}")

    obj_sql = ("select bucket_id, name, metadata->>'eTag' as etag, metadata->>'mimetype' as mimetype, "
               "metadata->>'cacheControl' as cache_control from storage.objects")
    cloud_objs = {(o["bucket_id"], o["name"]): o for o in query_json(cloud["CLOUD_DB_URL"], obj_sql)}
    local_objs = {(o["bucket_id"], o["name"]): o for o in query_json(db, obj_sql)}

    todo = [k for k, o in cloud_objs.items()
            if k not in local_objs or local_objs[k]["etag"] != o["etag"]]
    extra = [k for k in local_objs if k not in cloud_objs]
    print(f"[storage] cloud={len(cloud_objs)} local={len(local_objs)} cần chép={len(todo)} cần xoá={len(extra)}")

    failed = []
    for i, (bucket, name) in enumerate(sorted(todo), 1):
        o = cloud_objs[(bucket, name)]
        status, data = http("GET", object_url(cloud_base, bucket, name).replace("/object/", "/object/authenticated/", 1),
                            cloud_key)
        if status != 200:
            failed.append((bucket, name, f"tải {status}"))
            continue
        headers = {"Content-Type": o["mimetype"] or "application/octet-stream", "x-upsert": "true"}
        if o["cache_control"]:
            headers["Cache-Control"] = o["cache_control"]
        status, out = http("POST", object_url(local_base, bucket, name), local_key, data, headers)
        if status >= 300:
            failed.append((bucket, name, f"up {status} {out[:120]!r}"))
        if i % 50 == 0:
            print(f"  … {i}/{len(todo)}")

    by_bucket = {}
    for bucket, name in extra:
        by_bucket.setdefault(bucket, []).append(name)
    for bucket, names in by_bucket.items():
        status, out = http("DELETE", f"{local_base}/object/{bucket}", local_key,
                           json.dumps({"prefixes": names}).encode(), {"Content-Type": "application/json"})
        if status >= 300:
            failed.append((bucket, f"{len(names)} object", f"xoá {status}"))

    for f in failed:
        print("  LỖI", *f)
    print(f"[storage] xong, lỗi={len(failed)}")
    if failed:
        raise SystemExit(1)


def verify(instance, cloud):
    db = f"uniedu_{instance}"
    count_sql = """
select coalesce(string_agg(format('select %L as t, count(*) as n from public.%I', tablename, tablename),
       ' union all ' order by tablename), 'select null::text as t, 0::bigint as n where false')
from pg_tables where schemaname = 'public'"""
    def counts(target):
        union = psql(target, count_sql + ";").strip()
        return {r["t"]: r["n"] for r in query_json(target, union)}
    c, l = counts(cloud["CLOUD_DB_URL"]), counts(db)
    diff = {t: (c.get(t), l.get(t)) for t in set(c) | set(l) if c.get(t) != l.get(t)}
    print(f"[verify] bảng cloud={len(c)} local={len(l)} tổng dòng cloud={sum(c.values())} local={sum(l.values())}")
    for t, (a, b) in sorted(diff.items()):
        print(f"  LỆCH {t}: cloud={a} local={b}")
    obj = "select bucket_id, count(*) as n from storage.objects group by 1 order by 1"
    co, lo = query_json(cloud["CLOUD_DB_URL"], obj), query_json(db, obj)
    print(f"[verify] object cloud={co}")
    print(f"[verify] object local={lo}")
    ok = not diff and co == lo
    print("[verify] KHỚP" if ok else "[verify] CÓ LỆCH")
    if not ok:
        raise SystemExit(1)


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in STORAGE_PORTS or sys.argv[2] not in ("db", "storage", "verify"):
        raise SystemExit(__doc__)
    instance, action = sys.argv[1], sys.argv[2]
    cloud = load_env(os.path.join(HERE, "cloud", f"{instance}.env"))
    local_env = load_env(os.path.join(HERE, ".env"))
    if action == "db":
        sync_db(instance, cloud)
    elif action == "storage":
        sync_storage(instance, cloud, local_env)
    else:
        verify(instance, cloud)


if __name__ == "__main__":
    main()
