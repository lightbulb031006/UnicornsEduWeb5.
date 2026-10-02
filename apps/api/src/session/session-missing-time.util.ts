import type { Prisma } from '../../generated/client';

export const MISSING_SESSION_TIME_WHERE: Prisma.SessionWhereInput = {
  OR: [{ startTime: null }, { endTime: null }],
};

export function formatSessionDateUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMissingSessionLine(row: {
  id: string;
  date: Date;
  class: { name: string | null } | null;
}): string {
  const className = row.class?.name?.trim() || '(không tên lớp)';
  return `${row.id}\t${className}\t${formatSessionDateUtc(row.date)}`;
}
