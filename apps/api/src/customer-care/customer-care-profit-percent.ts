import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/client';

/**
 * Chuẩn hoá % CSKH (phân số 0.00–0.99, cùng đơn vị `customer_care_service.profit_percent`
 * và `staff_info.customer_care_default_profit_percent`). `undefined` = không đổi.
 */
export function normalizeCustomerCareProfitPercent(
  value: number | null | undefined,
): Prisma.Decimal | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!Number.isFinite(value)) {
    throw new BadRequestException(
      'Customer care profit percent must be a valid number.',
    );
  }

  const rounded = Math.round(value * 100) / 100;
  if (rounded < 0 || rounded > 0.99) {
    throw new BadRequestException(
      'Customer care profit percent must be between 0.00 and 0.99.',
    );
  }

  return new Prisma.Decimal(rounded.toFixed(2));
}
