/**
 * Generate all business days (Mon–Fri) between start and end dates, inclusive.
 * Returns ISO date strings: "YYYY-MM-DD"
 */
export function businessDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cur = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}
