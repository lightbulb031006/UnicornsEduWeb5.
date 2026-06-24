# Runbook: Triển khai CD lên VPS (amd64, Cloudflare Tunnel)

Hướng dẫn one-time setup và vận hành pipeline GitHub Actions deploy lên VPS cloud **x86_64/amd64**, SSH công khai, **không Tailscale**. TLS và hostname public do **Cloudflare Tunnel** xử lý; nginx chỉ lắng nghe `127.0.0.1:80` trên VPS.

**Workflow:** [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)  
**Script deploy trên VPS:** [`scripts/gha-deploy-remote.sh`](../../scripts/gha-deploy-remote.sh)

---

## Tổng quan kiến trúc

```
push main → GitHub Actions
  ├─ build-api / build-web (linux/amd64 → GHCR)
  ├─ mirror-nginx (Docker Hub → GHCR)
  └─ deploy: SSH → VPS
        ├─ git pull
        ├─ docker login ghcr.io
        └─ pull/recreate api → web → nginx

Internet → Cloudflare (TLS) → cloudflared → http://127.0.0.1:80 → nginx → api/web
```

---

## Phần A — Chuẩn bị VPS (one-time)

### Yêu cầu

- Ubuntu 22.04 hoặc 24.04, **amd64** (`uname -m` → `x86_64`)
- Tối thiểu **2 GB RAM**; nếu 1 GB, thêm **swap 2 GB** (giảm OOM khi `docker pull`)
- Disk ≥ 20 GB (Docker images + layer cache)

### A.1 Cài Docker Engine + Compose plugin

Chạy trên VPS với quyền root hoặc sudo:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version
docker compose version
```

### A.2 Tạo user deploy

```bash
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chown -R deploy:deploy /home/deploy
```

### A.3 SSH hardening

Chỉnh `/etc/ssh/sshd_config` (hoặc file trong `sshd_config.d/`):

```
PasswordAuthentication no
PermitRootLogin prohibit-password
```

Khởi động lại sshd: `systemctl restart ssh`

Firewall (chỉ mở SSH; **không** mở 80/443 ra internet — Cloudflare Tunnel là ingress):

```bash
ufw allow OpenSSH
# Nếu đổi cổng SSH: ufw allow <port>/tcp
ufw enable
ufw status
```

Tùy chọn: cài `fail2ban` cho sshd.

### A.4 Clone repo và tạo `.env`

```bash
mkdir -p /opt/unicorns-edu
chown deploy:deploy /opt/unicorns-edu
sudo -u deploy git clone git@github.com:<ORG>/<REPO>.git /opt/unicorns-edu
cd /opt/unicorns-edu
sudo -u deploy git checkout main
```

Tạo file env production (không commit):

```bash
sudo -u deploy cp .env.production.example .env
sudo -u deploy nano .env   # điền DATABASE_URL, JWT, SMTP, URL public, v.v.
```

Tham chiếu biến: [`.env.production.example`](../../.env.production.example).

**Lưu ý:** Không đặt `NODE_ENV` trong `.env` — `docker-compose.prod.yml` đã pin `production` cho cookie auth.

### A.5 Swap (khuyến nghị nếu RAM ≤ 2 GB)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## Phần B — SSH key cho GitHub Actions

### B.1 Tạo cặp key (trên máy local)

```bash
ssh-keygen -t ed25519 -C "gha-deploy-unicorns" -f ./gha_deploy_key -N ""
```

### B.2 Gắn public key lên VPS

```bash
cat gha_deploy_key.pub | ssh deploy@<VPS_IP> 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

### B.3 Lưu secrets trên GitHub

Vào **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Giá trị |
|--------|---------|
| `VPS_HOST` | IP public hoặc hostname SSH của VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Toàn bộ nội dung file `gha_deploy_key` (gồm `-----BEGIN/END OPENSSH PRIVATE KEY-----`) |

### B.4 Kiểm tra SSH

```bash
ssh -i gha_deploy_key -o BatchMode=yes deploy@<VPS_IP> 'echo OK'
```

Nếu dùng cổng SSH khác 22, đặt **Repository variable** `VPS_SSH_PORT` (ví dụ `2222`).

---

## Phần C — GHCR pull credentials

VPS cần đăng nhập GHCR để kéo image private.

### C.1 Tạo PAT

1. GitHub → **Settings → Developer settings → Personal access tokens**
2. Fine-grained hoặc classic với scope **`read:packages`**
3. Nếu org dùng SSO: **Authorize** PAT cho org

### C.2 Secrets GitHub

| Secret / Variable | Giá trị |
|-----------------|--------|
| `GHCR_TOKEN` | PAT |
| `GHCR_USERNAME` | Username GitHub của chủ PAT (có thể dùng Repository **variable**) |

### C.3 Test trên VPS

```bash
echo '<GHCR_TOKEN>' | docker login ghcr.io -u '<GHCR_USERNAME>' --password-stdin
docker pull ghcr.io/unicorns-prj-dev/unicorns-api:latest
```

---

## Phần D — Cloudflare Tunnel

TLS và domain public **không** terminate trên VPS. `cloudflared` kết nối outbound tới Cloudflare; nginx chỉ phục vụ loopback.

### D.1 Tạo tunnel (Cloudflare Zero Trust)

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels**
2. **Create a tunnel** → chọn **Cloudflared**
3. Đặt tên tunnel (ví dụ `unicorns-vps-prod`)

### D.2 Cài cloudflared trên VPS

Theo [hướng dẫn Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) cho Ubuntu, hoặc:

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
apt update && apt install -y cloudflared
```

Chạy lệnh `cloudflared service install <TOKEN>` mà dashboard cung cấp, hoặc cấu hình file `/etc/cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /etc/cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: it.unicornsedu.com
    service: http://127.0.0.1:80
  - service: http_status:404
```

### D.3 DNS

Trong Cloudflare DNS, thêm **CNAME** hostname → `<tunnel-id>.cfargotunnel.com` (dashboard hướng dẫn sau khi tạo tunnel).

### D.4 Kiểm tra local (sau khi stack Docker chạy)

```bash
curl -fsS http://127.0.0.1/nginx-health
curl -fsS http://127.0.0.1/api/
curl -fsS https://it.unicornsedu.com/api/
```

---

## Phần E — GitHub secrets & first deploy

### E.1 Danh sách secrets bắt buộc

| Tên | Mục đích |
|-----|----------|
| `VPS_HOST` | IP/hostname SSH |
| `VPS_USER` | User SSH (`deploy`) |
| `VPS_SSH_KEY` | Private key CI |
| `GHCR_TOKEN` | PAT `read:packages` |
| `GHCR_USERNAME` | Username GitHub |
| `NEXT_PUBLIC_BACKEND_URL` | Build web image, ví dụ `https://it.unicornsedu.com/api` |

### E.2 Variables tùy chọn

| Variable | Mặc định | Mục đích |
|----------|----------|----------|
| `DEPLOY_DIR` | `/opt/unicorns-edu` | Thư mục repo trên VPS |
| `VPS_SSH_PORT` | `22` | Cổng SSH |

### E.3 Dọn secrets Tailscale (nếu chuyển từ setup cũ)

Có thể xóa: `TAILSCALE_*`, `TS_OAUTH_*`, variables `TAILSCALE_ENABLED`, `TAILSCALE_AUTH_MODE`, `TAILSCALE_TAGS`, `VPS_TAILSCALE_PING`.

### E.4 First deploy thủ công (trước hoặc song song CI)

```bash
sudo -u deploy bash -lc '
  cd /opt/unicorns-edu
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
  docker compose -f docker-compose.prod.yml pull
  docker compose -f docker-compose.prod.yml up -d
'
```

### E.5 Kích hoạt CD tự động

Push lên nhánh `main` → workflow **Build and Deploy** chạy. Theo dõi tab **Actions** trên GitHub.

---

## Phần F — Vận hành & troubleshooting

### Migration database

Workflow **không** chạy `prisma migrate deploy`. Khi release có thay đổi schema:

1. Commit migration trong `apps/api/prisma/schema/migrations/`
2. Áp migration thủ công trước hoặc sau deploy (tùy breaking change):

```bash
cd /opt/unicorns-edu
docker compose -f docker-compose.prod.yml exec -T api \
  ./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema/
```

Không dùng `prisma migrate dev` trên database shared/production.

### Exit code 137 (OOM)

- Thêm swap / nâng RAM
- Script deploy đã pull/recreate tuần tự (`api` → `web` → `nginx`) để giảm peak memory

### `no space left on device`

```bash
docker system df
df -h / /var/lib/docker /var/lib/containerd
docker container prune -f
docker image prune -af
docker builder prune -af
```

### SSH fail từ GitHub Actions

- Kiểm tra `VPS_HOST`, `VPS_USER`, format `VPS_SSH_KEY` (xuống dòng đúng)
- `ufw` / security group cloud provider: cổng SSH mở cho internet (hoặc IP GitHub nếu whitelist)
- Test: `ssh -i key deploy@host` từ máy ngoài

### Image sai kiến trúc

VPS amd64 cần image `linux/amd64`. Kiểm tra:

```bash
docker inspect ghcr.io/unicorns-prj-dev/unicorns-api:latest --format '{{.Architecture}}'
```

Kỳ vọng: `amd64`.

### Rollback nhanh

```bash
cd /opt/unicorns-edu
git fetch origin main
git checkout <commit-sha-cũ>
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

Hoặc pull image theo tag commit: `unicorns-api:<github-sha>` nếu đã push tag SHA trong workflow.

### Nginx 502 sau deploy

Xem [mục troubleshooting trong `docs/Cách làm việc.md`](../Cách%20làm%20việc.md#nginx-502-connection-refused-tới-172xx3000-sau-khi-docker-compose-up). Thường do config cũ hoặc container chưa ready — chạy lại deploy hoặc `nginx -t` + reload.

---

## Checklist triển khai

- [ ] VPS Ubuntu amd64, Docker + Compose plugin OK
- [ ] User `deploy` trong group `docker`, SSH key-only
- [ ] Repo clone tại `/opt/unicorns-edu`, file `.env` production đầy đủ
- [ ] `GHCR_TOKEN` / `GHCR_USERNAME` — pull image thành công trên VPS
- [ ] `cloudflared` chạy, ingress → `http://127.0.0.1:80`
- [ ] GitHub secrets: `VPS_*`, `GHCR_*`, `NEXT_PUBLIC_BACKEND_URL`
- [ ] Không còn variables/secrets Tailscale
- [ ] Push `main` → workflow Actions thành công
- [ ] `https://<domain>/` và `https://<domain>/api/` hoạt động

---

## Tham chiếu nhanh

| Thành phần | Giá trị mặc định |
|------------|------------------|
| Deploy path | `/opt/unicorns-edu` |
| Compose file | `docker-compose.prod.yml` |
| Nginx bind | `127.0.0.1:80` |
| Image registry | `ghcr.io/unicorns-prj-dev/*` |
| Build platform | `linux/amd64` |
