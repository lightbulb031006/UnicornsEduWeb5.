import { Prisma } from '../../generated/client';
import { MANUAL_TOP_UP_NOTE_PREFIX } from '../common/manual-top-up-note';

export { MANUAL_TOP_UP_NOTE_PREFIX };

/** Nạp tay chỉ được coi là tiền đăng ký khi nằm trong khoảng này từ lúc tạo hồ sơ. */
export const MANUAL_FIRST_TOP_UP_MAX_DAYS = 30;

/**
 * Điều kiện một dòng `wallet_transactions_history` là **lần nạp hợp lệ**: giao
 * dịch `topup` gắn với đơn QR SePay `completed` hoặc yêu cầu nạp thẳng
 * `approved`; hoặc **nạp tay đăng ký** — nạp tay từ trang chi tiết học sinh,
 * là giao dịch ví đầu tiên của học sinh và trong
 * `MANUAL_FIRST_TOP_UP_MAX_DAYS` ngày từ lúc tạo hồ sơ. Hoàn tiền buổi học,
 * nạp tay về sau và nạp tay cho học sinh cũ không tính.
 */
export const QUALIFYING_TOP_UP_WHERE_SQL = Prisma.sql`
  wallet_transactions_history.type::text = 'topup'
    AND (
      EXISTS (
        SELECT 1
        FROM student_wallet_sepay_orders
        WHERE student_wallet_sepay_orders.wallet_transaction_id = wallet_transactions_history.id
          AND student_wallet_sepay_orders.status::text = 'completed'
      )
      OR EXISTS (
        SELECT 1
        FROM student_wallet_direct_topup_requests
        WHERE student_wallet_direct_topup_requests.wallet_transaction_id = wallet_transactions_history.id
          AND student_wallet_direct_topup_requests.status::text = 'approved'
      )
      OR (
        wallet_transactions_history.note LIKE ${`${MANUAL_TOP_UP_NOTE_PREFIX}%`}
        AND NOT EXISTS (
          SELECT 1
          FROM wallet_transactions_history AS earlier_wallet_transaction
          WHERE earlier_wallet_transaction.student_id = wallet_transactions_history.student_id
            AND earlier_wallet_transaction.created_at < wallet_transactions_history.created_at
        )
        AND EXISTS (
          SELECT 1
          FROM student_info AS manual_top_up_student
          WHERE manual_top_up_student.id = wallet_transactions_history.student_id
            AND wallet_transactions_history.created_at
              < manual_top_up_student.created_at + make_interval(days => ${MANUAL_FIRST_TOP_UP_MAX_DAYS})
        )
      )
    )
`;

/**
 * Lần nạp ví thành công đầu tiên của từng học sinh (định nghĩa **Học sinh mới**
 * trong CONTEXT.md), theo `QUALIFYING_TOP_UP_WHERE_SQL`: SePay `completed`,
 * nạp thẳng `approved` hoặc nạp tay đăng ký.
 *
 * Trả về cột `student_id`, `first_top_up_at`. Dùng làm subquery:
 * `LEFT JOIN (${FIRST_WALLET_TOP_UP_SQL}) AS first_wallet_top_up ON ...`.
 */
export const FIRST_WALLET_TOP_UP_SQL = Prisma.sql`
  SELECT
    wallet_transactions_history.student_id AS student_id,
    MIN(wallet_transactions_history.created_at) AS first_top_up_at
  FROM wallet_transactions_history
  WHERE ${QUALIFYING_TOP_UP_WHERE_SQL}
  GROUP BY wallet_transactions_history.student_id
`;

/** Gắn lần nạp đầu vào `student_info` dưới alias `first_wallet_top_up`. */
export const FIRST_WALLET_TOP_UP_JOIN_SQL = Prisma.sql`
  LEFT JOIN (${FIRST_WALLET_TOP_UP_SQL}) AS first_wallet_top_up
    ON first_wallet_top_up.student_id = student_info.id
`;

/** Điều kiện lần nạp đầu rơi vào kỳ `[monthStart, monthEnd)`. */
export function firstTopUpInRangeSql(range: {
  monthStart: Date;
  monthEnd: Date;
}): Prisma.Sql {
  return Prisma.sql`first_wallet_top_up.first_top_up_at >= ${range.monthStart}
    AND first_wallet_top_up.first_top_up_at < ${range.monthEnd}`;
}

/**
 * Điều kiện **Học sinh mới đăng ký** (góc nhìn CSKH): hồ sơ `student_info`
 * được tạo trong kỳ, kể cả chưa nạp. Cần `student_info` trong FROM/JOIN.
 * Admin shell dùng `firstTopUpInRangeSql` thay vì hàm này.
 */
export function studentCreatedInRangeSql(range: {
  monthStart: Date;
  monthEnd: Date;
}): Prisma.Sql {
  return Prisma.sql`student_info.created_at >= ${range.monthStart}
    AND student_info.created_at < ${range.monthEnd}`;
}
