import { Prisma, StaffRole, StaffStatus } from 'generated/client';

type LessonPlanHeadCommissionClient = Prisma.TransactionClient;

export function computeLessonPlanHeadCommissionAmount(
  tuitionFee: number,
  coefPercent: number,
): number {
  return Math.round((tuitionFee * coefPercent) / 100);
}

/**
 * Đồng bộ snapshot hoa hồng doanh thu (lesson_plan_head_commission) cho các attendance vừa
 * tạo/cập nhật: mỗi attendance chargeable (tuitionFee > 0) sinh 1 dòng cho MỖI nhân sự
 * `lesson_plan_head` active có `revenueSharePercent` tại thời điểm gọi. Không đụng tới dòng
 * đã tồn tại của staff/attendance khác ngoài phạm vi `attendanceIds` truyền vào.
 */
export async function syncLessonPlanHeadCommissions(
  tx: LessonPlanHeadCommissionClient,
  attendanceIds: string[],
): Promise<void> {
  const uniqueAttendanceIds = Array.from(new Set(attendanceIds)).filter(
    (id) => id.trim().length > 0,
  );

  if (uniqueAttendanceIds.length === 0) {
    return;
  }

  const [attendances, staffList] = await Promise.all([
    tx.attendance.findMany({
      where: { id: { in: uniqueAttendanceIds } },
      select: { id: true, tuitionFee: true },
    }),
    tx.staffInfo.findMany({
      where: {
        status: StaffStatus.active,
        roles: { has: StaffRole.lesson_plan_head },
        revenueSharePercent: { not: null },
      },
      select: { id: true, revenueSharePercent: true },
    }),
  ]);

  const chargeableAttendances = attendances.filter(
    (attendance) => (attendance.tuitionFee ?? 0) > 0,
  );
  const nonChargeableAttendanceIds = attendances
    .filter((attendance) => (attendance.tuitionFee ?? 0) <= 0)
    .map((attendance) => attendance.id);

  if (nonChargeableAttendanceIds.length > 0) {
    await tx.lessonPlanHeadCommission.deleteMany({
      where: {
        attendanceId: { in: nonChargeableAttendanceIds },
        paymentStatus: 'pending',
      },
    });
  }

  if (chargeableAttendances.length === 0 || staffList.length === 0) {
    return;
  }

  for (const attendance of chargeableAttendances) {
    const tuitionFee = attendance.tuitionFee ?? 0;

    for (const staff of staffList) {
      const coefPercent = Number(staff.revenueSharePercent);
      const amount = computeLessonPlanHeadCommissionAmount(
        tuitionFee,
        coefPercent,
      );

      const updated = await tx.lessonPlanHeadCommission.updateMany({
        where: {
          attendanceId: attendance.id,
          staffId: staff.id,
          paymentStatus: 'pending',
        },
        data: {
          coefPercent,
          amount,
        },
      });

      if (updated.count === 0) {
        await tx.lessonPlanHeadCommission.upsert({
          where: {
            attendanceId_staffId: {
              attendanceId: attendance.id,
              staffId: staff.id,
            },
          },
          create: {
            attendanceId: attendance.id,
            staffId: staff.id,
            coefPercent,
            amount,
          },
          update: {},
        });
      }
    }
  }
}
