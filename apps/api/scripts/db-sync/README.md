# Đồng bộ dữ liệu DB cũ → DB mới

Bộ script xử lý tình huống: web cũ ngừng nhập từ **19/07/2026**, web mới chạy từ **20/07/2026**, nhưng DB mới thiếu toàn bộ buổi học trước 20/7.

## Cách tiếp cận (và vì sao không làm theo cách "backup → xoá → nạp lại")

Ý tưởng ban đầu là: backup dữ liệu 20–30/7, đồng bộ hai DB, rồi nạp lại phần 20–30/7. Cách đó phải **xoá dữ liệu đang chạy** rồi phục hồi — mỗi bước xoá là một cơ hội mất dữ liệu thật.

Vì mốc chuyển đổi rất sạch (cũ ≤ 19/7, mới ≥ 20/7), hai tập dữ liệu **bổ sung nhau chứ không đè nhau**. Nên chỉ cần:

> Chèn thêm những bản ghi mà DB mới chưa có. Không xoá gì, không sửa gì.

Dữ liệu 20–30/7 trên web mới **không bị đụng tới**, nên cũng không cần backup riêng rồi nạp lại. Backup vẫn làm, nhưng để phòng thân chứ không nằm trong quy trình.

Tính chất của script backfill:

| | |
|---|---|
| Chỉ `INSERT` | Không `UPDATE`, không `DELETE`, không `TRUNCATE` |
| Idempotent | Chạy lại 10 lần vẫn ra kết quả như 1 lần, không nhân đôi dữ liệu |
| Một transaction | Lỗi giữa chừng → rollback sạch, DB trở về nguyên trạng |
| Mặc định dry-run | Chèn thật trong transaction rồi ROLLBACK → thấy trước kết quả, rủi ro bằng 0 |
| Hoàn tác được | Ghi lại đúng ID đã chèn, xoá lại chính xác bằng script 04 |

## Chuẩn bị

1. Kiểm tra `apps/api/scripts/.env.migration` có đủ `OLD_DATABASE_URL` và `NEW_DATABASE_URL`.

2. **Dùng direct connection, không dùng pooler.** Trên Supabase lấy chuỗi ở
   _Project Settings → Database → Connection string → **Direct connection**_ (cổng `5432`).
   Chuỗi có `:6543` hoặc chữ `pooler` sẽ làm transaction và savepoint hoạt động sai.

3. Cài `pg` nếu chưa có:

   ```bash
   cd apps/api/scripts/db-sync
   npm install
   ```

## Quy trình

Chạy toàn bộ trong thư mục `apps/api/scripts/db-sync`.

### Bước 1 — Chẩn đoán (chỉ đọc)

```bash
node 01-diagnose.mjs
```

Cho biết: schema hai bên lệch chỗ nào, mỗi bảng thiếu bao nhiêu bản ghi, buổi học thiếu rơi vào tháng nào và lớp nào, và quan trọng nhất — **có bản ghi trùng tên nhưng khác ID không**.

> **Đọc kỹ mục 6 của báo cáo.** Nếu lớp "Tuấn - Hà Nội - Toán IKMC" tồn tại ở cả hai DB nhưng **khác ID**, thì chèn dữ liệu cũ vào sẽ tạo ra **hai lớp song song**: buổi học cũ nằm ở lớp này, buổi học mới nằm ở lớp kia, và trên web vẫn không thấy đủ. Trường hợp đó cần map ID trước khi chèn — dừng lại và xử lý riêng, đừng chạy tiếp bước 3.

Kết quả lưu ở `out/diagnose_*.json`.

### Bước 2 — Backup cả hai DB

```bash
node 02-backup.mjs
```

Dump mọi bảng của cả hai DB ra `out/backup_<thời-gian>/`. Copy thư mục này sang ổ khác hoặc cloud trước khi đi tiếp.

Nên bật thêm **Point-in-Time Recovery** trên Supabase (_Database → Backups_) làm lớp bảo vệ thứ hai.

### Bước 3 — Chạy thử (không ghi gì)

```bash
node 03-backfill.mjs
```

Thực hiện chèn thật bên trong transaction rồi `ROLLBACK`. Nghĩa là mọi lỗi kiểu dữ liệu, khoá ngoại, trùng khoá đều lộ ra ngay, nhưng DB không thay đổi một byte nào.

Xem kỹ số liệu ở cuối: bao nhiêu bản ghi sẽ chèn, bao nhiêu bị bỏ qua và vì sao.

### Bước 4 — Ghi thật

Chỉ chạy khi bước 3 sạch:

```bash
node 03-backfill.mjs --apply
```

Giữ lại file `out/backfill_applied_*.json` — đó là vé hoàn tác.

### Bước 5 — Kiểm chứng

```bash
node 05-verify.mjs
```

Kiểm tra ba thứ: không còn bản ghi thiếu, không có bản ghi mồ côi (khoá ngoại trỏ vào khoảng không), và số buổi học theo tháng đã khớp.

Cuối cùng mở web mới, vào vài lớp và xác nhận đã thấy buổi học trước 20/7.

### Nếu cần hoàn tác

```bash
node 04-rollback.mjs out/backfill_applied_<thời-gian>.json          # xem trước
node 04-rollback.mjs out/backfill_applied_<thời-gian>.json --apply  # xoá thật
```

Chỉ xoá đúng những ID mà script 03 đã chèn, theo thứ tự ngược để không vướng khoá ngoại. Dữ liệu bạn nhập trên web mới không nằm trong danh sách này nên không bị ảnh hưởng.

## Tuỳ chọn thêm

```bash
node 03-backfill.mjs --only=sessions,attendance      # chỉ vài bảng
node 03-backfill.mjs --exclude=action_history        # bỏ bảng audit cho nhẹ
```

## Ghi chú kỹ thuật

Một vài điểm bộ script này xử lý mà script `migrate-db.ts` trước đó chưa xử lý:

- **Ngày không bị lệch.** Mọi kiểu `date`/`timestamp` được đọc ở dạng text thô thay vì để driver parse thành `Date` của JavaScript — tránh lệch một ngày do timezone của máy chạy script.
- **Cột `jsonb` không bị hỏng.** `classes.schedule` là một mảng JSON. Nếu để driver parse thành mảng JS rồi ghi lại, `node-postgres` sẽ serialize nó thành cú pháp mảng Postgres `{...}` và làm hỏng dữ liệu. Script giữ nguyên chuỗi JSON gốc.
- **Session setting áp dụng đúng chỗ.** Script cũ dùng `Pool` nên `SET session_replication_role` chỉ có tác dụng trên một connection ngẫu nhiên trong pool, các query sau đó có thể chạy trên connection khác. Ở đây dùng một `Client` duy nhất.
- **Batch lỗi không giết cả transaction.** Trong Postgres, một lệnh lỗi giữa transaction làm mọi lệnh sau bị từ chối. Mỗi batch được bọc trong `SAVEPOINT` nên khi lỗi vẫn cô lập và thử lại từng dòng được.
- **Thứ tự bảng tính từ khoá ngoại thật** trong DB (topological sort), không phải danh sách viết tay — có bỏ qua self-reference như `staff_info.customer_care_managed_by_staff_id`.
- **Kiểm tra bản ghi mồ côi sau khi chèn**, vì lúc chèn có tạm tắt kiểm tra khoá ngoại.
