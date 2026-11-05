# Runbook: Multi-instance VPS (IT + ENG + JP trên cùng máy)

Triển khai **nhiều bản UnicornsEduWeb5** độc lập trên **một VPS**: **IT**, **ENG** (Tiếng Anh), **JP** (Tiếng Nhật). Mỗi instance có database riêng, domain Cloudflare riêng, cổng loopback Nginx riêng; **dùng chung image `unicorns-api:latest` và `unicorns-web:latest`**. Web gọi API qua same-origin `/api` nên một web image phục vụ mọi domain.

## Tổng quan kiến trúc

```
GitHub push main
    │
    ├─ build-api  ──► unicorns-api:latest
    ├─ build-web  ──► unicorns-web:latest  (NEXT_PUBLIC_BACKEND_URL=/api)
    └─ deploy     ──► SSH: it → eng → jp (tuần tự, chỉ instance enabled)
```

| Instance | Thư mục VPS | Compose project | Nginx loopback | Domain ví dụ |
|----------|-------------|-----------------|----------------|--------------|
| `it` | `/root/UnicornsEdu` | `unicorns-it` | `127.0.0.1:80` | `it.unicornsedu.com` |
| `eng` | `/root/UnicornsEduEng` | `unicorns-eng` | `127.0.0.1:8080` | `eng.unicornsedu.com` |
| `jp` | `/root/UnicornsEduJP` | `unicorns-jp` | `127.0.0.1:8081` | `jp.unicornsedu.com` |

**Khác nhau giữa các instance:** chỉ `.env` runtime (DB, `LMS_PROFILE`, `FRONTEND_URL`, `BACKEND_URL`, JWT, SePay, …) — **không** build web image riêng.

### `LMS_PROFILE` — bắt buộc trên mọi instance

API đọc **Hồ sơ môn** từ `LMS_PROFILE` (`it` | `jp` | `eng`); thiếu hoặc sai thì API **không khởi động** (ADR [`2026-10-07-instance-subject-profile`](../adr/2026-10-07-instance-subject-profile.md)). Web lấy hồ sơ qua `GET /api/public/app-config`.

| Instance | `LMS_PROFILE` |
|---|---|
| `it` | `it` |
| `eng` | `eng` |
| `jp` | `jp` |

Lần đầu lên bản có biến này: thêm `LMS_PROFILE` vào `.env` của **cả ba** VPS **trước** khi merge vào `main` (CD). Sau deploy kiểm tra `curl -s https://<domain>/api/public/app-config`.

Registry: [`deploy/instances.json`](../../deploy/instances.json). Tắt instance tạm thời: `"enabled": false`.

---

## Phần A — GitHub (một lần)

| Secret / variable | Mô tả |
|-------------------|--------|
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` | SSH VPS |
| `GHCR_USERNAME`, `GHCR_TOKEN` | Pull GHCR trên VPS |

**Không cần** secret build theo từng domain — web build một lần với `/api`.

Bật CD cho instance mới: bootstrap VPS (Phần B/C/E) → `"enabled": true` trong `deploy/instances.json` → push `main`.

---

## Phần B — Bootstrap instance `eng` trên VPS

### B1. `jq`

```bash
apt update && apt install -y jq
```

### B2. Clone

```bash
git clone https://github.com/unicorns-prj-dev/UnicornsEduWeb5.git /root/UnicornsEduEng
cd /root/UnicornsEduEng && git checkout main
```

### B3. `.env`

```bash
cp /root/UnicornsEduEng/.env.production.eng.example /root/UnicornsEduEng/.env
nano /root/UnicornsEduEng/.env
```

Bắt buộc khác IT: `DATA_NETWORK`, `DATABASE_URL`/`DIRECT_URL`, `SUPABASE_*`, `JWT_*`, `FRONTEND_URL`, `BACKEND_URL`, `GOOGLE_CALLBACK_URL`. DB + Storage lấy từ data stack local — xem [vps-local-supabase.md](vps-local-supabase.md).

```env
COMPOSE_PROJECT_NAME=unicorns-eng
NGINX_PUBLISH=127.0.0.1:8080:80
DATA_NETWORK=uniedu-data-eng
```

### B4. Migration DB ENG

CD tự chạy `prisma migrate deploy` khi push `main` nếu `.env` có `DIRECT_URL`. Bootstrap / chạy tay:

```bash
cd /root/UnicornsEduEng
# Postgres local (data stack): DIRECT_URL = DATABASE_URL (không PgBouncer)
pnpm --filter api db:deploy
# hoặc trong container api sau khi pull image
```

### B5. Cloudflared (ví dụ)

```yaml
ingress:
  - hostname: it.unicornsedu.com
    service: http://127.0.0.1:80
  - hostname: eng.unicornsedu.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

### B6. Smoke test

```bash
cd /root/UnicornsEduEng
export COMPOSE_PROJECT_NAME=unicorns-eng NGINX_PUBLISH=127.0.0.1:8080:80
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
curl -fsS http://127.0.0.1:8080/nginx-health
curl -fsS https://eng.unicornsedu.com/api/
```

---

## Phần C — Cập nhật instance IT (một lần)

Thêm vào `/root/UnicornsEdu/.env`:

```env
COMPOSE_PROJECT_NAME=unicorns-it
NGINX_PUBLISH=127.0.0.1:80:80
```

```bash
cd /root/UnicornsEdu && git pull --ff-only origin main
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## Phần D — CD tự động

Push `main` → build **một** web image → deploy tuần tự các instance `enabled` trong `deploy/instances.json` (thứ tự: `it` → `eng` → `jp`).

Migration: CD tự `prisma migrate deploy` trên từng instance (cần `DIRECT_URL` trong `.env` khi `DATABASE_URL` là pooler). Chạy tay khi bootstrap hoặc debug: `pnpm --filter api db:deploy` / `prisma migrate deploy` trong container.

---

## Phần E — Bootstrap instance `jp` (Tiếng Nhật)

Làm tương tự ENG; thư mục gốc **`/root/UnicornsEduJP`**, cổng loopback **`8081`**.

### E1. Clone

```bash
git clone https://github.com/Unicorns-Prj-DEV/UnicornsEduWeb5.git /root/UnicornsEduJP
cd /root/UnicornsEduJP && git checkout main
```

### E2. `.env`

```bash
cp /root/UnicornsEduJP/.env.production.jp.example /root/UnicornsEduJP/.env
nano /root/UnicornsEduJP/.env
```

Bắt buộc: database `uniedu_jp` + storage-jp trên data stack local ([vps-local-supabase.md](vps-local-supabase.md)), JWT secrets mới, domain JP:

```env
COMPOSE_PROJECT_NAME=unicorns-jp
NGINX_PUBLISH=127.0.0.1:8081:80
DATA_NETWORK=uniedu-data-jp
FRONTEND_URL="https://jp.unicornsedu.com"
BACKEND_URL="https://jp.unicornsedu.com/api"
GOOGLE_CALLBACK_URL="https://jp.unicornsedu.com/api/auth/google/callback"
```

### E3. Migration DB JP

CD tự migrate khi push `main` nếu `.env` có `DIRECT_URL` (`@db:5432` chỉ resolve trong network `uniedu-data-jp`, nên chạy trong container api). Bootstrap / chạy tay:

```bash
cd /root/UnicornsEduJP
docker compose -f docker-compose.prod.yml run --rm --no-deps api npx prisma migrate deploy
```

Tạo admin (nếu cần): đăng nhập bằng handle/email + mật khẩu đã seed, hoặc insert user `role_type=admin` qua script tương tự instance ENG.

### E4. Cloudflared

Thêm rule (giữ các rule IT/ENG):

```yaml
ingress:
  - hostname: it.unicornsedu.com
    service: http://127.0.0.1:80
  - hostname: eng.unicornsedu.com
    service: http://127.0.0.1:8080
  - hostname: jp.unicornsedu.com
    service: http://127.0.0.1:8081
  - service: http_status:404
```

### E5. Bật CD và smoke test

1. Trong repo: `"enabled": true` cho `jp` trong [`deploy/instances.json`](../../deploy/instances.json), push `main`.
2. Hoặc test tay trước:

```bash
cd /root/UnicornsEduJP
export COMPOSE_PROJECT_NAME=unicorns-jp NGINX_PUBLISH=127.0.0.1:8081:80
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
curl -fsS http://127.0.0.1:8081/nginx-health
curl -fsS https://jp.unicornsedu.com/api/
```

---

## Checklist

### ENG

- [ ] Database `uniedu_eng` + storage-eng trên data stack (`/root/uniedu-data`)
- [ ] Clone `/root/UnicornsEduEng` + `.env` (có `LMS_PROFILE=eng`)
- [ ] Migrate DB ENG
- [ ] Cloudflared `eng.*` → `:8080`
- [ ] `"enabled": true` cho `eng`

### JP

- [ ] Database `uniedu_jp` + storage-jp trên data stack (`/root/uniedu-data`)
- [ ] Clone `/root/UnicornsEduJP` + `.env` từ `.env.production.jp.example` (có `LMS_PROFILE=jp`)
- [ ] Migrate DB JP
- [ ] Cloudflared `jp.*` → `:8081`
- [ ] `jq` trên VPS (nếu chưa có)
- [ ] `"enabled": true` cho `jp` trong `deploy/instances.json`
- [ ] Push `main` → verify domain JP

---

## Tài liệu liên quan

- [vps-local-supabase.md](vps-local-supabase.md) — Postgres + Storage self-host cho cả ba instance
- [`docs/Cách làm việc.md`](../Cách%20làm%20việc.md)
- [`deploy/instances.json`](../../deploy/instances.json)
- [`.env.production.example`](../../.env.production.example)
- [`.env.production.eng.example`](../../.env.production.eng.example)
- [`.env.production.jp.example`](../../.env.production.jp.example)
