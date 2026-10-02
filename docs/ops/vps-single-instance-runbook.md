# Runbook: VPS instance `math` (math.uniedu.vn)

Repo này deploy **một instance duy nhất** trên VPS. Mọi giá trị dưới đây phải khớp
[`deploy/instances.json`](../../deploy/instances.json) — script deploy đọc trực tiếp file đó.

| Trường | Giá trị |
|--------|---------|
| Instance id | `math` |
| Thư mục deploy trên VPS | `/root/UnicornsEduWeb5.` |
| Compose project | `unicornseduweb5` |
| Nginx loopback | `127.0.0.1:80` |
| Domain public | `math.uniedu.vn` (TLS kết thúc ở Cloudflare) |
| GHCR namespace | `ghcr.io/lightbulb031006` |
| Kiến trúc image | `linux/amd64` |

Thư mục deploy **trùng với repo clone** — đây là điểm khác biệt so với dự án gốc, nơi
repo canonical (`/root/UnicornsEdu`) tách khỏi các thư mục instance.

---

## Quy tắc số một: luôn kèm `-p unicornseduweb5`

`docker-compose.prod.yml` khai báo `name: ${COMPOSE_PROJECT_NAME:-unicornseduweb5}`. Nếu shell
chưa export `COMPOSE_PROJECT_NAME` và bạn **quên `-p`**, Compose vẫn chạy được nhưng có thể
tạo/điều khiển nhầm stack khác với stack đang phục vụ site.

```bash
cd /root/UnicornsEduWeb5.
docker compose -p unicornseduweb5 -f docker-compose.prod.yml ps
```

Kiểm tra nhanh có bao nhiêu stack tồn tại:

```bash
docker compose ls
```

Chỉ được thấy **một** dòng `unicornseduweb5`. Nếu xuất hiện thêm `unicorns` hoặc tên khác trỏ
về cùng file compose, đó là stack rác — xoá:

```bash
docker compose -p <ten-stack-rac> -f docker-compose.prod.yml down
```

---

## Deploy chuẩn (khuyến nghị)

```
git push origin main
    │
    ├─ build-api   ──► ghcr.io/lightbulb031006/unicorns-api:latest   (linux/amd64)
    ├─ build-web   ──► ghcr.io/lightbulb031006/unicorns-web:latest   (linux/amd64)
    ├─ mirror-nginx ─► ghcr.io/lightbulb031006/nginx:1.27-alpine
    └─ deploy      ──► SSH VPS → scripts/gha-deploy-remote.sh → instance `math`
```

Không cần thao tác tay trên VPS. Script deploy sẽ `git pull`, `docker login ghcr.io`,
pull image, kiểm tra/sao lưu database Toán và chạy thử migration trên bản sao riêng,
chạy `prisma migrate deploy`, rồi recreate lần lượt `api` → `web` → `nginx`
kèm healthcheck.

Preflight chạy `scripts/math-release-preflight.sh`: backup schema public trong `/root/unicorns-math-predeploy-*` (quyền 700), giữ file dump/checksum và báo cáo số bản ghi; thông tin kết nối tạm được xoá. PostgreSQL kiểm thử không publish port và không có mạng ngoài. Nếu preflight thất bại, điều tra log/báo cáo trước khi triển khai tiếp; nginx đang chạy được giữ trong giai đoạn này. VPS cần truy cập image `postgres:<major>-alpine` khớp phiên bản database.

### Secrets / variables GitHub bắt buộc

| Tên | Mô tả |
|-----|-------|
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` | SSH vào VPS |
| `GHCR_USERNAME` | Tự lấy từ `github.actor` trong job deploy |
| `GHCR_TOKEN` | Tự lấy từ `github.token` tạm thời; job có quyền `packages: read` |

Không cần tạo secret GHCR thủ công. Workflow truyền `GHCR_TOKEN` / `GHCR_USERNAME` tạm thời vào VPS; nếu thiếu, script dừng ngay với thông báo rõ ràng.

---

## Deploy tay khi CI hỏng

Chỉ dùng khi thật cần. Image build tay được tag `:latest` **local**, lần CI deploy kế tiếp
sẽ ghi đè — nên đừng coi đây là cách deploy thường xuyên.

```bash
cd /root/UnicornsEduWeb5.
git pull --ff-only origin main

docker build -f apps/web/Dockerfile -t ghcr.io/lightbulb031006/unicorns-web:latest .
docker compose -p unicornseduweb5 -f docker-compose.prod.yml up -d --force-recreate web

docker compose -p unicornseduweb5 -f docker-compose.prod.yml ps
```

### Verify sau deploy

Lấy tên chunk mới trong image rồi kiểm tra qua domain public — đây là cách chắc chắn nhất để
biết code mới đã thực sự được phục vụ:

```bash
CHUNK=$(docker compose -p unicornseduweb5 -f docker-compose.prod.yml exec -T web \
  sh -c 'ls /app/apps/web/.next/static/chunks/ | head -1' | tr -d '\r')
curl -sI "https://math.uniedu.vn/_next/static/chunks/${CHUNK}" | head -1
```

`HTTP/2 200` là đạt. `404` nghĩa là site đang được phục vụ bởi container khác với container
bạn vừa build — quay lại kiểm tra `docker compose ls`.

---

## Sự cố thường gặp

### Compose kẹt ở `network has active endpoints`

Xảy ra khi cấu hình network trong compose file lệch với network đang tồn tại (ví dụ option
MTU), khiến Compose muốn xoá network nhưng `api`/`nginx` vẫn đang bám vào.

Không `down` cả stack nếu chưa chắc pull được image `api` — sẽ mất luôn backend. Thay vào đó
dựng `web` thủ công và gắn vào network hiện có:

```bash
docker rm -f unicornseduweb5-web-1

docker run -d \
  --name unicornseduweb5-web-1 \
  --restart unless-stopped \
  --env-file /root/UnicornsEduWeb5./.env \
  -e NODE_ENV=production -e PORT=3000 -e HOSTNAME=0.0.0.0 \
  -e INTERNAL_API_URL=http://api:4000 \
  --network unicornseduweb5_app-net \
  --network-alias web \
  ghcr.io/lightbulb031006/unicorns-web:latest
```

`--network-alias web` là bắt buộc: `nginx/conf.d/snippets/proxy-locations.conf` proxy tới
hostname `web`, và `nginx/nginx.conf` có `resolver 127.0.0.11 valid=5s` nên nginx tự nhận
container mới sau ~5 giây, không cần restart nginx.

### `docker compose pull` báo `denied`

VPS chưa đăng nhập GHCR hoặc PAT hết hạn:

```bash
printf '%s' '<GITHUB_PAT>' | docker login ghcr.io -u lightbulb031006 --password-stdin
```

### Site 502

`web` không chạy hoặc chưa healthy:

```bash
docker compose -p unicornseduweb5 -f docker-compose.prod.yml ps
docker compose -p unicornseduweb5 -f docker-compose.prod.yml logs --tail=50 web
```

### Thấy code cũ dù đã deploy

Kiểm tra theo thứ tự — dừng ở bước đầu tiên sai:

1. `docker compose ls` — đúng stack `unicornseduweb5` chưa?
2. `curl -sI https://math.uniedu.vn/_next/static/chunks/<chunk-moi>` — 200 hay 404?
3. Response header `cf-cache-status` của trang HTML — `DYNAMIC` là Cloudflare không cache;
   `HIT` thì purge cache trên Cloudflare Dashboard.
4. Hard refresh `Ctrl+Shift+R` hoặc tab ẩn danh.

---

## Thêm instance thứ hai (nếu sau này cần)

Thêm một object vào mảng `instances` trong [`deploy/instances.json`](../../deploy/instances.json)
với `deploy_dir`, `compose_project`, `nginx_publish` **không trùng** instance hiện có, clone repo
vào thư mục đó, tạo `.env` riêng (DB, `FRONTEND_URL`, `BACKEND_URL`, JWT, OAuth callback), rồi
push `main`. Web image dùng chung vì browser gọi API qua same-origin `/api`.
