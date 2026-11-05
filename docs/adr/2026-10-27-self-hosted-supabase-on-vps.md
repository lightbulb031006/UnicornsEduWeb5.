# ADR: Chuyển DB + Storage từ Supabase cloud về Supabase tối giản self-host trên VPS

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Ba instance IT / ENG / JP chạy trên cùng VPS `uni-manage` (arm64, 2 vCPU, 3.3 GB RAM) nhưng mỗi instance dùng một Supabase cloud project riêng cho Postgres (qua PgBouncer pooler) và Storage. App chỉ dùng hai phần đó: Prisma ↔ Postgres, và `@supabase/supabase-js` storage (upload, xoá, signed URL, public URL). Không dùng Supabase Auth (`auth.users` rỗng), Realtime, PostgREST. Dữ liệu nhỏ (DB 156/25/25 MB, Storage ~225/22/37 MB).

## Decision

1. **Supabase tối giản, không phải full stack.** Data stack riêng (`deploy/data-stack`, chạy ở `/root/uniedu-data`): một container `postgres:17.6-alpine` + ba container `supabase/storage-api` (file backend), mỗi instance một container + volume. Không có Kong, GoTrue, Realtime, Studio… (full stack ~1.5–2 GB RAM/stack, không vừa VPS).
2. **Một Postgres server, ba database** `uniedu_it|eng|jp`, mỗi database do role cùng tên sở hữu; role của instance này không CONNECT được database của instance khác. Layout giống Supabase: extension ở schema `extensions`, `search_path` có `extensions` (một số default cột gọi `extensions.uuid_generate_v4()`).
3. **Mỗi instance một network Docker `uniedu-data-<id>` (internal).** Postgres gắn cả ba với alias `db`; storage của instance chỉ gắn network của nó với alias `storage`. `api` + `nginx` của instance join `${DATA_NETWORK}`, nên compose / nginx dùng chung hostname `db` / `storage` cho mọi instance, chỉ `.env` khác.
4. **Storage cùng domain instance.** `SUPABASE_URL=https://<instance-domain>`; nginx route `/storage/v1/*` → `storage:5000` (cắt prefix từ `$request_uri`). DB vẫn lưu path, nên đổi `SUPABASE_URL` là đủ, không rewrite dữ liệu, không thêm hostname Cloudflare.
5. **Server→storage đi mạng nội bộ.** `SUPABASE_INTERNAL_URL=http://nginx`: client supabase-js vẫn dựng bằng URL public (signed URL trả browser đúng domain), `global.fetch` rewrite request đi ra từ origin public sang origin nội bộ.

## Considered options

- **Full Supabase self-host ×3:** có Studio, nhưng không đủ RAM; app không dùng các service thêm.
- **Ba container Postgres:** cô lập hơn nhưng tốn RAM; người dùng chọn một server.
- **Giữ Storage trên cloud, chỉ chuyển DB:** đơn giản hơn nhưng vẫn phụ thuộc Supabase cloud.
- **Hostname Cloudflare riêng cho storage:** tunnel đang quản lý ingress bằng token trên dashboard; route qua nginx của instance không cần đụng Cloudflare.

## Consequences

- Mất backup/PITR managed của Supabase → phải tự backup (`/root/uniedu-data/backup.sh`, cron hằng ngày) và nên đẩy bản dump ra ngoài VPS.
- Postgres + 3 storage dùng thêm ~600–700 MB RAM; VPS còn ~1.2 GB available.
- `docker-compose.prod.yml` yêu cầu `DATA_NETWORK` trong `.env` và data stack phải chạy trước app (network external).
- Supabase cloud projects giữ nguyên làm đường lui: khôi phục `.env.bak-pre-localdb-*` là quay lại cloud (dữ liệu ghi sau cutover chỉ ở local).
