import { Prisma } from '../../generated/client';
import {
  LEGACY_MANUAL_TOP_UP_NOTE_PREFIX,
  MANUAL_TOP_UP_NOTE_PREFIX,
} from '../common/manual-top-up-note';
import { QUALIFYING_TOP_UP_WHERE_SQL } from './first-wallet-top-up.sql';

/** Số buổi tối thiểu (cộng mọi lớp) để một học sinh nghỉ là **Học sinh cũ nghỉ**. */
export const OLD_DROPPED_MIN_SESSIONS = 2;

/** Trạng thái điểm danh được đếm là "đã học" một buổi; `absent` không đếm. */
export const COUNTED_ATTENDANCE_STATUSES = [
  'present',
  'excused',
  'trial',
] as const;

/**
 * Một dòng `wallet_transactions_history` là tiền nạp ví cho điều kiện cũ nghỉ:
 * lần nạp hợp lệ (`QUALIFYING_TOP_UP_WHERE_SQL`) hoặc **bất kỳ** lần nạp tay
 * dương nào (ghi chú mới hoặc kiểu cũ), không giới hạn giao dịch đầu / 30 ngày.
 */
const OLD_DROPPED_TOP_UP_WHERE_SQL = Prisma.sql`(
  (${QUALIFYING_TOP_UP_WHERE_SQL})
  OR (
    wallet_transactions_history.type::text = 'topup'
    AND wallet_transactions_history.amount > 0
    AND (
      wallet_transactions_history.note LIKE ${`${MANUAL_TOP_UP_NOTE_PREFIX}%`}
      OR wallet_transactions_history.note LIKE ${`${LEGACY_MANUAL_TOP_UP_NOTE_PREFIX}%`}
    )
  )
)`;

/**
 * Điều kiện **Học sinh cũ nghỉ** (CONTEXT.md): đã có ít nhất một lần nạp ví
 * (gồm mọi lần nạp tay, xem `OLD_DROPPED_TOP_UP_WHERE_SQL`) và đã học từ `OLD_DROPPED_MIN_SESSIONS` buổi trở lên, cộng mọi
 * lớp. Cần `student_info` trong FROM/JOIN. Phủ định là **Học sinh thử nghỉ**.
 */
export const OLD_DROPPED_STUDENT_WHERE_SQL = Prisma.sql`(
  EXISTS (
    SELECT 1
    FROM wallet_transactions_history
    WHERE wallet_transactions_history.student_id = student_info.id
      AND ${OLD_DROPPED_TOP_UP_WHERE_SQL}
  )
  AND (
    SELECT COUNT(*)
    FROM attendance AS counted_attendance
    WHERE counted_attendance.student_id = student_info.id
      AND counted_attendance.status::text IN (${Prisma.join([
        ...COUNTED_ATTENDANCE_STATUSES,
      ])})
  ) >= ${OLD_DROPPED_MIN_SESSIONS}
)`;

export type DroppedStudentKind = 'old' | 'trial';

/** Lọc học sinh nghỉ theo nhóm: `old` = cũ nghỉ, `trial` = thử nghỉ. */
export function droppedStudentKindSql(kind: DroppedStudentKind): Prisma.Sql {
  return kind === 'old'
    ? OLD_DROPPED_STUDENT_WHERE_SQL
    : Prisma.sql`NOT ${OLD_DROPPED_STUDENT_WHERE_SQL}`;
}
