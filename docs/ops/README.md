# Ops / data migrations

Đồng bộ nguồn Tin → Toán mới nhất: [08/10/2026 — phạm vi, backup và migration cần kiểm tra](upstream-sync-math-2026-10-08.md). Chưa triển khai bản đồng bộ này.

## Multi-instance VPS deploy

Nhiều bản UnicornsEduWeb5 trên **cùng một VPS** — mỗi môn học / domain riêng, database riêng, cổng Nginx loopback riêng.

| Tài liệu | Nội dung |
|----------|----------|
| [vps-single-instance-runbook.md](vps-single-instance-runbook.md) | **Runbook triển khai** — instance `math`, Cloudflare Tunnel, secrets GitHub, xử lý sự cố deploy |
| [`deploy/instances.json`](../../deploy/instances.json) | Registry instance (`it`, `eng`, `jp`, …) |
| [`.env.production.eng.example`](../../.env.production.eng.example) | Mẫu `.env` cho instance ENG |
| [`.env.production.jp.example`](../../.env.production.jp.example) | Mẫu `.env` cho instance JP (`/root/UnicornsEduJP`) |

Bật CD cho instance mới: bootstrap VPS theo runbook, rồi `"enabled": true` trong `deploy/instances.json`. Mọi instance **dùng chung** `unicorns-api:latest` và `unicorns-web:latest`.

## Troubleshooting

| Tài liệu | Triệu chứng |
|----------|-------------|
| [troubleshoot-login-500.md](troubleshoot-login-500.md) | Web mở được nhưng đăng nhập luôn thất bại (API trả `500`/`502`, thường do database) |

---

## Inactivate tutors on teacher-paid ended classes

**Migrations:**

| Migration | Status |
|-----------|--------|
| `20260617120000_inactivate_teachers_on_settled_ended_classes` | Superseded (required student `transaction_id`; blocked legacy data) |
| `20260617130000_inactivate_teachers_on_teacher_paid_ended_classes` | **Current** — teacher payroll only |

Soft-removes active tutor assignments (`class_teachers.status` → `inactive`) for `ended` classes where **every session** has `teacher_payment_status = paid`. Does **not** modify `student_classes`.

### Apply

```bash
pnpm --filter api db:deploy
```

On shared/staging/production: CD auto-runs `db:deploy` per instance on push `main` when `DIRECT_URL` is set in VPS `.env`. Manual fallback: `pnpm --filter api db:deploy` with `DIRECT_URL` (or direct `DATABASE_URL`).

### Eligibility (all must be true)

1. `classes.status = 'ended'`
2. At least one `sessions` row
3. Every session: `LOWER(teacher_payment_status) = 'paid'` (excludes `unpaid`, `pending`, `deposit`)
4. At least one active `class_teachers` row (`status` IS NULL or `active`)

**Not required:** `attendance.transaction_id` / student wallet tuition (legacy rows often have `tuition_fee` without linked wallet txn).

### Preview before deploy (optional)

```sql
WITH class_session_stats AS (
  SELECT c.id AS class_id, c.name
  FROM classes c
  INNER JOIN sessions s ON s.class_id = c.id
  WHERE c.status = 'ended'
  GROUP BY c.id, c.name
  HAVING COUNT(s.id) > 0
    AND COUNT(*) FILTER (
      WHERE LOWER(COALESCE(s.teacher_payment_status, '')) <> 'paid'
    ) = 0
),
active_class_teachers AS (
  SELECT ct.class_id, ct.teacher_id
  FROM class_teachers ct
  INNER JOIN classes c ON c.id = ct.class_id AND c.status = 'ended'
  WHERE ct.status IS NULL OR ct.status = 'active'
)
SELECT css.class_id, css.name, act.teacher_id
FROM class_session_stats css
JOIN active_class_teachers act ON act.class_id = css.class_id
ORDER BY css.name, act.teacher_id;
```

### Rollback

No automatic rollback. Restore `class_teachers.status` from backup if needed. Idempotent for rows already `inactive`.
