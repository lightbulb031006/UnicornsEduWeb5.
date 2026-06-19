# Ops / data migrations

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

On shared/staging/production: run `db:deploy` on the target environment before rollout (CD does not auto-migrate).

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
