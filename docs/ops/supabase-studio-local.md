# Xem DB production bằng Supabase Studio (chạy trên máy dev)

Hướng dẫn dùng giao diện Supabase Studio để xem/truy vấn Postgres self-host trên VPS (`uniedu_it`, `uniedu_eng`, `uniedu_jp`) mà **không chạy thêm gì trên VPS** và **không mở port mới ra Internet**.

Mã nguồn: [`deploy/studio-local/`](../../deploy/studio-local/) · Data stack trên VPS: [vps-local-supabase.md](vps-local-supabase.md)

> ⚠️ Đây là DB **production**. Sửa ô trong Table Editor hoặc chạy lệnh ghi trong SQL Editor là ghi thẳng vào DB — không đi qua API, migration hay audit (`action_history`). Chỉ đọc nếu không chắc.

---

## 1. Vì sao cần cách này

Data stack trên VPS ([`deploy/data-stack/`](../../deploy/data-stack/)) chỉ có `postgres` + `storage-api` — **không có** Studio, `postgres-meta` hay gateway. Postgres chỉ publish `127.0.0.1:54322` trên VPS (loopback), nên không thể nối thẳng qua IP Tailscale.

Giải pháp: chạy Studio + `postgres-meta` bằng Docker **trên Mac**, nối về Postgres qua **SSH tunnel đi trong Tailscale**.

```
Trình duyệt
  │  http://localhost:64323
  ▼
studio (container, Mac)
  │  http://meta:8080
  ▼
meta = postgres-meta (container, Mac)
  │  host.docker.internal:64322
  ▼
ssh -L 127.0.0.1:64322 → 127.0.0.1:54322   (đi qua Tailscale, alias SSH UnicornsEdu)
  ▼
Postgres trên VPS (uniedu-data-db-1)
```

Ưu điểm so với chạy Studio trên VPS:

- VPS không tốn RAM thêm (~300–500 MB cho Studio + meta).
- Studio self-host **không có màn đăng nhập** — chạy local thì chỉ chính máy bạn vào được, không phụ thuộc ACL Tailscale.
- Dữ liệu đi trong SSH, SSH đi trong Tailscale: không port nào mở ra ngoài.

## 2. Yêu cầu

| Yêu cầu | Kiểm tra |
|---|---|
| Docker (OrbStack hoặc Docker Desktop) | `docker version` |
| Mac đã join tailnet, VPS `uni-manage` online | `tailscale status` |
| Alias SSH `UnicornsEdu` trong `~/.ssh/config` (HostName = IP Tailscale của VPS, user `root`) | `ssh UnicornsEdu true` |
| `openssl` (có sẵn trên macOS) | `openssl version` |

## 3. Bắt đầu nhanh

```bash
# Từ root repo
deploy/studio-local/studio.sh up it
# → Studio uniedu_it: http://localhost:64323
```

Mở `http://localhost:64323` → **Table Editor** để duyệt bảng, **SQL Editor** để chạy query.

Xong việc:

```bash
deploy/studio-local/studio.sh down
```

## 4. Lệnh

| Lệnh | Tác dụng |
|---|---|
| `studio.sh up [it\|eng\|jp]` | Mở tunnel (nếu chưa có), đọc mật khẩu từ VPS, chạy Studio của instance. Mặc định `it`. Chạy lại = khởi động lại Studio đó. |
| `studio.sh down [it\|eng\|jp\|all]` | Dừng Studio. Mặc định `all`. Không còn Studio nào chạy thì tự đóng tunnel. |
| `studio.sh status` | Trạng thái tunnel + danh sách Studio đang chạy. |

Chạy được cả 3 instance cùng lúc — dùng chung một tunnel:

| Instance | Database / role | URL |
|---|---|---|
| `it` | `uniedu_it` | http://localhost:64323 |
| `eng` | `uniedu_eng` | http://localhost:64324 |
| `jp` | `uniedu_jp` | http://localhost:64325 |

Mỗi instance là một compose project riêng `uniedu-studio-<id>` (container `uniedu-studio-<id>-studio-1`, `uniedu-studio-<id>-meta-1`).

## 5. Bảo mật

- **Role theo instance, không dùng superuser.** Studio đăng nhập bằng `uniedu_<id>` — owner của DB instance đó. Role này bị `REVOKE CONNECT` ở DB instance khác (xem `deploy/data-stack/initdb/10-uniedu-databases.sh`), nên Studio IT không đọc được dữ liệu ENG/JP.
- **Mật khẩu không ghi ra đĩa local.** Mỗi lần `up`, script đọc `<ID>_DB_PASSWORD` từ `/root/uniedu-data/.env` trên VPS qua SSH và chỉ truyền qua biến môi trường cho `docker compose`.
- **Chỉ loopback.** Tunnel bind `127.0.0.1:64322`, Studio publish `127.0.0.1:6432x` — máy khác trong LAN/tailnet không vào được.
- **`PG_META_CRYPTO_KEY` sinh mới mỗi lần `up`** (`openssl rand -hex 32`). Studio dùng key này mã hoá thông tin kết nối gửi sang `meta`; hai container chỉ cần dùng chung key trong một lần chạy.
- Không bao giờ chạy Studio trên VPS rồi mở bằng `tailscale funnel` hoặc publish `0.0.0.0` — Studio không có đăng nhập, SQL Editor ghi được toàn DB.

## 6. Dùng được / không dùng được

| Tính năng Studio | Trạng thái | Ghi chú |
|---|---|---|
| Table Editor | ✅ | Xem, lọc, sắp xếp. Sửa ô = ghi production. |
| SQL Editor | ✅ | Chạy với quyền `uniedu_<id>`. Snippet không được lưu giữa các lần `up`. |
| Database (schema, index, function, extension) | ✅ | Đọc qua `postgres-meta`. |
| Authentication, API docs, Realtime, Edge Functions | ❌ | Stack không có GoTrue / PostgREST / gateway. App dùng auth riêng của API. |
| Storage browser | ❌ | Không có gateway. Xem file qua `https://<id>.uniedu.vn/storage/v1/...` hoặc trên VPS. |
| Logs | ❌ | Tắt (`ENABLED_FEATURES_LOGS_ALL=false`). |

Studio có thể hiện cảnh báo/khung trống ở các trang ❌ — bình thường.

## 7. Cấu hình

Biến môi trường tuỳ chọn khi gọi `studio.sh`:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `STUDIO_SSH_HOST` | `UnicornsEdu` | Alias/host SSH của VPS |
| `STUDIO_TUNNEL_PORT` | `64322` | Port local của tunnel |

Port `64322–64325` được chọn để tránh đụng Supabase CLI local (`54322` DB, `54323` Studio).

Phiên bản image (ghim trong `deploy/studio-local/docker-compose.yml`, lấy từ compose chính thức của Supabase):

- `supabase/studio:2026.10.12-sha-3699278`
- `supabase/postgres-meta:v0.100.0`

Nâng cấp: đổi tag theo [`supabase/docker/docker-compose.yml`](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml) rồi `studio.sh up <id>`.

## 8. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `bind [127.0.0.1]:64322: Address already in use` | Tunnel cũ còn chạy nhưng mất socket điều khiển, hoặc app khác dùng port | `lsof -nP -iTCP:64322 -sTCP:LISTEN` → kill tiến trình `ssh` cũ, hoặc dùng `STUDIO_TUNNEL_PORT=64332` |
| `Không đọc được IT_DB_PASSWORD …` | SSH được nhưng `/root/uniedu-data/.env` thiếu biến | Kiểm tra trên VPS: `grep -c '^IT_DB_PASSWORD=' /root/uniedu-data/.env` |
| `ssh: connect to host … timed out` | Mac hoặc VPS rớt khỏi tailnet | `tailscale status`, `tailscale ping uni-manage` |
| Studio mở được nhưng bảng trống / lỗi kết nối | Tunnel chết (Mac sleep, đổi mạng) | `studio.sh up <id>` — script dọn socket cũ và mở lại tunnel |
| `Cannot connect to the Docker daemon` | OrbStack/Docker Desktop chưa chạy | Mở OrbStack rồi chạy lại |
| `password authentication failed for user "uniedu_it"` | Mật khẩu role trên VPS đã đổi nhưng `.env` data stack chưa cập nhật | Đồng bộ lại `/root/uniedu-data/.env` với mật khẩu role |

Xem log:

```bash
docker logs uniedu-studio-it-meta-1 --tail 50
docker logs uniedu-studio-it-studio-1 --tail 50
```

Kiểm tra nhanh `meta` có nối được DB:

```bash
docker exec uniedu-studio-it-meta-1 node -e \
  "fetch('http://127.0.0.1:8080/tables?included_schemas=public&include_columns=false').then(r=>r.json()).then(j=>console.log(j.length ?? j))"
```

## 9. Cách script hoạt động

`deploy/studio-local/studio.sh up <id>`:

1. **Tunnel** — `ssh -f -N -M -S $TMPDIR/uniedu-studio-tunnel.sock -L 127.0.0.1:64322:127.0.0.1:54322 UnicornsEdu`. ControlMaster (`-M -S`) cho phép kiểm tra (`-O check`) và đóng (`-O exit`) đúng tunnel này mà không đụng session SSH khác. `ExitOnForwardFailure=yes` làm ssh báo lỗi ngay nếu port bận; `ServerAliveInterval=30` giữ kết nối.
2. **Mật khẩu** — `ssh UnicornsEdu "sed -n 's/^IT_DB_PASSWORD=//p' /root/uniedu-data/.env"`.
3. **Crypto key** — `openssl rand -hex 32` → `PG_META_CRYPTO_KEY`.
4. **Compose** — `docker compose -f deploy/studio-local/docker-compose.yml up -d --force-recreate` với `STUDIO_INSTANCE`, `STUDIO_PORT`, `TUNNEL_PORT`, `POSTGRES_PASSWORD`, `PG_META_CRYPTO_KEY` qua env. Container nối về tunnel bằng `host.docker.internal` (`extra_hosts: host-gateway`).

Compose bắt buộc các biến trên (`${VAR:?}`) nên chạy `docker compose` trực tiếp mà không qua script sẽ báo lỗi ngay — chủ ý, tránh khởi động với cấu hình thiếu.

## 10. Lựa chọn thay thế

- **Client GUI (TablePlus, DBeaver, Postico):** chỉ cần tunnel `ssh -N -L 64322:127.0.0.1:54322 UnicornsEdu`, rồi kết nối `localhost:64322`, user/db `uniedu_<id>`.
- **psql trên VPS:** `ssh UnicornsEdu` → `docker exec -it uniedu-data-db-1 psql -U postgres -d uniedu_<id>`.
