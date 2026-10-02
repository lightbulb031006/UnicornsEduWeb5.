export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function getMonthKeyInTimeZone(
  date: Date,
  timeZone = VIETNAM_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) {
    throw new Error('Unable to resolve month key for timezone');
  }

  return `${year}-${month}`;
}

export function getCurrentVietnamMonthKey(now = new Date()): string {
  return getMonthKeyInTimeZone(now, VIETNAM_TIME_ZONE);
}
