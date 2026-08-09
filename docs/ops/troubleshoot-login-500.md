# Troubleshoot: đăng nhập báo "Đăng nhập thất bại." trên production

Runbook cho triệu chứng: **web mở được, trang login hiện bình thường, nhưng bấm Đăng nhập luôn báo lỗi** — kể cả với tài khoản admin đúng mật khẩu.

---

## 1. Phân biệt sai mật khẩu và sự cố hạ tầng

Toast trên `/auth/login` cho biết chính xác loại lỗi (xem [`docs/pages/auth-login.md`](../pages/auth-login.md)):

| Toast | Nghĩa |
|---|---|
| *"Sai tài khoản hoặc mật khẩu."* | Backend trả `401` — thật sự sai credential |
| *"Máy chủ gặp lỗi khi xử lý đăng nhập (500)…"* | Backend trả `500` — **sự cố phía server**, thường là database |
| *"Máy chủ đang tạm thời không phản hồi (502/503/504)…"* | API container chết / nginx không tới được upstream |
| *"Không kết nối được tới máy chủ…"* | Request không rời được trình duyệt (mạng, CORS, DNS) |
| *"Đăng nhập thất bại."* | Lỗi không xác định — chạy bước 2 |

> Trước 2026-08-05 mọi trường hợp trên đều hiển thị chung *"Đăng nhập thất bại."*. Nếu bản deploy đang chạy còn cũ, hãy dựa vào bước 2.

---

## 2. Khoanh vùng từ ngoài (không cần SSH)

Mở DevTools Console trên chính domain đang lỗi và chạy:

```js
const t = async (u, o) => { const s = performance.now(); const r = await fetch(u, o); const b = await r.text();
  return { status: r.status, ms: Math.round(performance.now() - s), body: b.slice(0, 120) }; };

// Route KHÔNG chạm database
console.log('no-db ', await t('/api/'));
// Route CÓ chạm database
console.log('db    ', await t('/api/auth/forgot-password',
  { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'probe@example.com' }) }));
```

Đọc kết quả:

| `/api/` | Route chạm DB | Kết luận |
|---|---|---|
| `200 Hello World!` nhanh | `500` sau **~5–6s đều đặn** | **API sống, không kết nối được database.** Sang bước 3. Thời gian cố định ~5–6s là TCP connect timeout — sai mật khẩu DB hoặc sai schema sẽ lỗi *ngay lập tức* |
| `200` nhanh | `500` **tức thì** | DB nối được nhưng query lỗi — thiếu migration / lệch schema. Sang bước 4 |
| `502` | `502` | API container chết hoặc đang restart. Sang bước 3.1 |
| Lỗi mạng | Lỗi mạng | DNS / Cloudflare Tunnel / nginx ngoài cùng |

---

### 2.1. Trường hợp nặng: cả route không chạm DB cũng treo

Nếu `/api/` — vốn chỉ trả chuỗi tĩnh `Hello World!` và **không đụng database** — cũng không phản hồi sau 30–60 giây, thì vấn đề **không còn nằm ở database**. Nest process đã bị chặn event loop hoặc container/VPS đã chết.

Dấu hiệu nhận biết: `/api/` lúc đầu còn trả về trong ~250ms, sau vài chục phút thì treo hẳn. Đây là kiểu suy giảm dần, thường do:

- Connection tới database treo tích tụ dần → cạn socket/bộ nhớ của process
- VPS hết RAM (OOM killer) hoặc hết disk
- Container restart-loop liên tục

Việc cần làm ngay là bước 3.0 rồi restart, **trước** khi đào sâu vào database.

---

## 3. Kiểm tra trên VPS

### 3.0. Tài nguyên máy (làm trước tiên khi API treo)

```bash
free -h          # còn RAM không — nếu swap đầy và RAM cạn thì API bị OOM
df -h            # còn disk không — Docker log đầy ổ là nguyên nhân rất hay gặp
uptime           # load average
docker stats --no-stream
dmesg -T | grep -i -E "out of memory|oom-killer" | tail -20
```

Nếu hết disk vì log Docker:

```bash
docker system df
docker system prune -f
```

Restart API sau khi đã giải phóng tài nguyên:

```bash
cd /root/<deploy_dir>
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml logs -f --tail=100 api
```


Thay `<deploy_dir>` bằng thư mục của instance (xem [`deploy/instances.json`](../../deploy/instances.json), ví dụ `/root/UnicornsEdu`).

### 3.1. Trạng thái container và log API

```bash
cd /root/<deploy_dir>
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=200 api
```

Lọc nhanh nguyên nhân database:

```bash
docker compose -f docker-compose.prod.yml logs --tail=500 api \
  | grep -iE "prisma|econnrefused|etimedout|enotfound|password authentication|does not exist|too many clients|P1001|P1017|P2021|P2022"
```

Mã lỗi thường gặp:

| Log | Nguyên nhân |
|---|---|
| `ETIMEDOUT` / `P1001 Can't reach database server` | Không tới được host DB — Supabase pause, firewall, sai host |
| `ECONNREFUSED` | Host đúng nhưng sai cổng (`6543` pooler vs `5432` direct) |
| `ENOTFOUND` | Sai hostname trong `DATABASE_URL` |
| `password authentication failed` | Sai user/password |
| `sorry, too many clients already` / `P1017` | Cạn connection pool |
| `P2021` / `P2022` (table/column không tồn tại) | DB thiếu migration — sang bước 4 |

### 3.2. Test kết nối DB từ trong container API

```bash
cd /root/<deploy_dir>
docker compose -f docker-compose.prod.yml exec api node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
const t0 = Date.now();
c.connect()
  .then(() => c.query('select current_database(), now()'))
  .then(r => { console.log('OK', Date.now() - t0, 'ms', r.rows[0]); process.exit(0); })
  .catch(e => { console.error('FAIL', Date.now() - t0, 'ms |', e.code || '', e.message); process.exit(1); });
"
```

Kiểm tra `DATABASE_URL` đang thực sự nạp vào container (che mật khẩu):

```bash
docker compose -f docker-compose.prod.yml exec api \
  sh -c 'echo "$DATABASE_URL" | sed -E "s#://[^:]+:[^@]+@#://***:***@#"'
```

So sánh với `.env` trên máy — nếu lệch thì container đang chạy env cũ:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate api
```

### 3.3. Nếu dùng Supabase

Kiểm tra theo thứ tự:

1. **Project có bị pause không** — Supabase tự pause project ít hoạt động. Vào dashboard bấm *Restore / Resume*, đợi vài phút rồi chạy lại bước 3.2. **Đây là nguyên nhân phổ biến nhất của triệu chứng "hôm qua vẫn chạy bình thường".**
2. **Đúng chuỗi kết nối chưa:**
   - `DATABASE_URL` → pooler `:6543` kèm `?pgbouncer=true&sslmode=require` (runtime API)
   - `DIRECT_URL` → direct `:5432` kèm `?sslmode=require` (chỉ dùng cho `prisma migrate deploy`)
   - Dùng nhầm `:5432` cho runtime sẽ cạn connection; dùng nhầm `:6543` cho migrate sẽ lỗi prepared statement.
3. **VPS ra được internet tới host DB không:**

   ```bash
   docker compose -f docker-compose.prod.yml exec api \
     node -e "require('node:dns').lookup('<db-host>', { all: true }, (e, a) => console.log(e || a))"
   ```

   Nếu chỉ ra bản ghi IPv6 mà VPS không có IPv6 thì kết nối sẽ treo đúng ~5–6s. Ép IPv4 bằng [`ops/dns-ipv4-first.cjs`](../../ops/dns-ipv4-first.cjs):

   ```yaml
   # docker-compose.prod.yml → service api
   environment:
     NODE_OPTIONS: "--require /app/ops/dns-ipv4-first.cjs"
   ```

   (Cần mount hoặc COPY file này vào image trước.)

---

## 4. Nếu DB nối được nhưng query lỗi

Lệch schema giữa Prisma client trong image và database thật (hay gặp sau khi chuyển sang DB mới):

```bash
cd /root/<deploy_dir>
docker compose -f docker-compose.prod.yml exec api npx prisma migrate status --schema=./prisma/schema/
docker compose -f docker-compose.prod.yml exec api sh -c \
  'if [ -n "$DIRECT_URL" ]; then export DATABASE_URL="$DIRECT_URL"; fi; npx prisma migrate deploy --schema=./prisma/schema/'
docker compose -f docker-compose.prod.yml restart api
```

> `prisma migrate deploy` **phải** chạy bằng `DIRECT_URL` (`:5432`). Chạy qua pooler `:6543` sẽ lỗi.

---

## 5. Xác nhận đã khỏi

```bash
# Trên VPS — cổng loopback lấy từ deploy/instances.json
curl -fsS http://127.0.0.1:<port>/nginx-health
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' \
  -X POST http://127.0.0.1:<port>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"accountHandle":"probe_not_a_real_user","password":"probe12345"}'
```

Kết quả đúng là **`401`** trong dưới 1 giây — nghĩa là backend đã đọc được bảng `users` và từ chối đúng cách. Nhận `500` kèm ~5–6s là vẫn còn lỗi database.

Sau đó thử đăng nhập lại bằng tài khoản admin thật trên trình duyệt.

---

## Liên quan

- [vps-single-instance-runbook.md](vps-single-instance-runbook.md) — deploy, bootstrap instance
- [`docs/pages/auth-login.md`](../pages/auth-login.md) — hợp đồng thông báo lỗi phía frontend
