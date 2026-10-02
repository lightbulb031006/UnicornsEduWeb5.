import { Prisma } from '../../generated/client';

/**
 * Payroll gross before CPVH/tax.
 *
 * `base = allowance_amount × coefficient` (`allowance_amount` already includes
 * scale_amount — do not add `classes.scale_amount` again).
 *
 * Cap:
 * - lớp `per_block` có `sessions.snapshot_block_count` > 0:
 *   `max_allowance_per_block × snapshot_block_count`
 * - còn lại (lớp theo buổi, hoặc buổi frozen chưa có snapshot block):
 *   `max_allowance_per_session`
 *
 * `0` / NULL = không trần (`NULLIF(..., 0)`). Payroll không suy số block từ giờ buổi.
 */
export const SQL_TEACHER_SESSION_CAPPED_GROSS = Prisma.sql`
LEAST(
  COALESCE(
    CASE
      WHEN classes.pricing_mode = 'per_block'
        AND sessions.snapshot_block_count IS NOT NULL
        AND sessions.snapshot_block_count > 0
      THEN NULLIF(classes.max_allowance_per_block, 0) * sessions.snapshot_block_count
      ELSE NULLIF(classes.max_allowance_per_session, 0)
    END,
    COALESCE(sessions.allowance_amount, 0) * COALESCE(sessions.coefficient, 1)
  ),
  COALESCE(sessions.allowance_amount, 0) * COALESCE(sessions.coefficient, 1)
)
`;

export const SQL_TEACHER_SESSION_CAP_GROUP_BY = Prisma.sql`
classes.max_allowance_per_session,
classes.pricing_mode,
classes.max_allowance_per_block,
sessions.snapshot_block_count
`;

/** Same cap, but columns already flattened in `session_attendance_allowances`. */
export const SQL_TEACHER_SESSION_CAPPED_GROSS_FROM_ALLOWANCE_CTE = Prisma.sql`
LEAST(
  COALESCE(
    CASE
      WHEN pricing_mode = 'per_block'
        AND snapshot_block_count IS NOT NULL
        AND snapshot_block_count > 0
      THEN NULLIF(max_allowance_per_block, 0) * snapshot_block_count
      ELSE NULLIF(max_allowance_per_session, 0)
    END,
    allowance_per_session * coefficient
  ),
  allowance_per_session * coefficient
)
`;
