import type { Prisma } from '../../generated/client';

/** Lọc nhân sự theo tối đa 5 token họ/tên, không phân biệt hoa thường. */
export function buildNameSearchWhere(
  search?: string,
): Prisma.StaffInfoWhereInput {
  const tokens = (search ?? '')
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (tokens.length === 0) {
    return {};
  }

  return {
    AND: tokens.map((token) => ({
      OR: [
        {
          user: {
            first_name: {
              contains: token,
              mode: 'insensitive',
            },
          },
        },
        {
          user: {
            last_name: {
              contains: token,
              mode: 'insensitive',
            },
          },
        },
      ],
    })),
  };
}
