export type ReminderUnit = 'days' | 'months';

export const isValidReminder = (value: string, unit: ReminderUnit) =>
  value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= (unit === 'months' ? 1200 : 36500);

export function reminderDatePreview(expiryDate: string, value: string, unit: ReminderUnit): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || !isValidReminder(value, unit)) return null;
  const date = new Date(`${expiryDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== expiryDate) return null;

  if (unit === 'months') {
    // Match the server schedule when the target month has fewer days.
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - Number(value));
    const lastDay = new Date(date.getTime());
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  } else {
    date.setUTCDate(date.getUTCDate() - Number(value));
  }
  const result = date.toISOString();
  return /^\d{4}-/.test(result) ? result.slice(0, 10) : null;
}
