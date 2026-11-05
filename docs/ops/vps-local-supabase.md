# Runbook: Supabase tối giản self-host trên VPS (DB + Storage cho IT / ENG / JP)

Quyết định kiến trúc: [ADR 2026-10-27](../adr/2026-10-27-self-hosted-supabase-on-vps.md). Mã nguồn: [`deploy/data-stack/`](../../deploy/data-stack/).

## Kiến trúc

```
/root/uniedu-data  (compose project `uniedu-data`)
  db            postgres:17.6-alpine   DB: uniedu_it, uniedu_eng, uniedu_jp   127.0.0.1:54322
  storage-it    supabase/storage-api   volumes/storage-it                     127.0.0.1:55001
  storage-eng   supabase/storage-api   volumes/storage-eng                    127.0.0.1:55002
  storage-jp    supabase/storage-api   volumes/storage-jp                     127.0.0.1:55003

network uniedu-data-it  (internal): db(alias db) + storage-it(alias storage) + unicorns-it api/nginx
network uniedu-data-eng (internal): db + storage-eng + unicorns-eng api/nginx
network uniedu-data-jp  (internal): db + storage-jp  + unicorns-jp  api/nginx
```

Browser → `https://<instance>/storage/v1/...` → Cloudflare → nginx instance → `storage:5000`.
API → `http://nginx/storage/v1/...` (`SUPABASE_INTERNAL_URL`) → `storage:5000`.
API → Postgres: `postgresql://uniedu_<id>:<pw>@db:5432/uniedu_<id>` (không PgBouncer; `DIRECT_URL` = `DATABASE_URL`).

Port loopback chỉ để ops (psql, curl) trên VPS; không mở ra ngoài.

## `.env` của instance

```env
DATA_NETWORK=uniedu-data-<id>
DATABASE_URL="postgresql://uniedu_<id>:<<ID>_DB_PASSWORD>@db:5432/uniedu_<id>"
DIRECT_URL="postgresql://uniedu_<id>:<<ID>_DB_PASSWORD>@db:5432/uniedu_<id>"
SUPABASE_URL="https://<id>.uniedu.vn"
SUPABASE_INTERNAL_URL="http://nginx"
SUPABASE_SERVICE_ROLE_KEY="<<ID>_STORAGE_SERVICE_KEY>"
```

Giá trị bí mật nằm ở `/root/uniedu-data/.env` (chmod 600, sinh bởi `gen-env.sh`). `DATA_NETWORK` bắt buộc — thiếu thì `docker compose -f docker-compose.prod.yml` báo lỗi.

## Bootstrap (đã làm 2026-10-27)

```bash
# Từ repo local
scp -r deploy/data-stack/* UnicornsEdu:/root/uniedu-data/
ssh UnicornsEdu
cd /root/uniedu-data
./gen-env.sh https://it.uniedu.vn https://eng.uniedu.vn https://jp.uniedu.vn
docker compose up -d          # initdb tạo 3 role + 3 database, storage tự chạy migration
```

## Sao chép từ Supabase cloud

`cloud/<id>.env` (chmod 600) giữ `CLOUD_DB_URL`, `CLOUD_SUPABASE_URL`, `CLOUD_SERVICE_KEY` của project cloud cũ.

```bash
cd /root/uniedu-data
python3 -I sync_from_supabase.py <id> db       # pg_dump schema public → restore (ghi đè)
python3 -I sync_from_supabase.py <id> storage  # bucket + object; chỉ chép object thiếu/khác eTag, xoá object thừa
python3 -I sync_from_supabase.py <id> verify   # so số dòng từng bảng + số object mỗi bucket
```

## Cutover một instance

```bash
cd /root/<deploy_dir>                 # UnicornsEdu | UnicornsEduEng | UnicornsEduJP
export COMPOSE_PROJECT_NAME=unicorns-<id> NGINX_PUBLISH=<nginx_publish>
docker compose -f docker-compose.prod.yml stop api        # ngừng ghi
cd /root/uniedu-data && python3 -I sync_from_supabase.py <id> db \
  && python3 -I sync_from_supabase.py <id> storage && python3 -I sync_from_supabase.py <id> verify
# sửa .env instance theo mục trên, rồi:
cd /root/<deploy_dir> && docker compose -f docker-compose.prod.yml up -d --force-recreate api nginx
curl -fsS https://<id>.uniedu.vn/api/public/app-config
```

## Rollback về Supabase cloud

`cp .env.bak-pre-localdb-<ts> .env` trong thư mục instance rồi `up -d --force-recreate api nginx`. Dữ liệu ghi sau cutover chỉ có ở local — cần dump/restore ngược nếu muốn giữ.

## Backup

`/root/uniedu-data/backup.sh` (cron `30 20 * * *` UTC = 03:30 giờ VN): `pg_dump` từng DB giữ 14 ngày, tar volume storage giữ 3 ngày, trong `backups/daily/`.

**Offsite R2:** có `/root/uniedu-data/r2.env` thì `backup.sh` gọi `offsite-r2.sh <TS>` đẩy bản vừa tạo lên bucket R2 `uni-manage` bằng `wrangler r2 object put` (wrangler 4.153.0 chạy trong container `node:22-bookworm-slim`, cài sẵn ở `.wrangler-cli/`; VPS không cần node).

```env
# /root/uniedu-data/r2.env (chmod 600)
CLOUDFLARE_API_TOKEN=...   # API token quyền Account › Workers R2 Storage › Edit
CLOUDFLARE_ACCOUNT_ID=...
R2_BUCKET=uni-manage
```

| Key R2 | Lifecycle rule |
|--------|----------------|
| `uniedu-data/db/<TS>/uniedu_<id>.dump` | `uniedu-db-30d` — xoá sau 30 ngày |
| `uniedu-data/storage/<TS>/storage-<id>.tar.gz` | `uniedu-storage-7d` — xoá sau 7 ngày |

File > 300 MB (giới hạn `object put` là 315 MB) được `split` thành `….partNN`; khôi phục: tải đủ part rồi `cat storage-it.tar.gz.part* > storage-it.tar.gz`.

Tải một dump về:

```bash
cd /root/uniedu-data && set -a && . ./r2.env && set +a
docker run --rm -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID -v $PWD/.wrangler-cli:/w:ro -v $PWD/backups:/out \
  node:22-bookworm-slim /w/node_modules/.bin/wrangler r2 object get \
  uni-manage/uniedu-data/db/<TS>/uniedu_<id>.dump --file /out/restore.dump --remote
```

Khôi phục một DB:

```bash
docker exec uniedu-data-db-1 pg_restore -U postgres --clean --if-exists --no-owner \
  --role=uniedu_<id> -d uniedu_<id> /backups/daily/uniedu_<id>-<ts>.dump
```

## Lưu ý vận hành

- Data stack phải chạy trước app (network external). `docker compose down` ở `/root/uniedu-data` sẽ lỗi khi app còn gắn network — dừng app trước hoặc chỉ `restart`.
- Nâng `postgres` major version cần dump/restore; nâng `storage-api` thì đọc release note (tự chạy migration schema `storage`).
- `psql` nhanh: `docker exec -it uniedu-data-db-1 psql -U postgres -d uniedu_<id>`.
