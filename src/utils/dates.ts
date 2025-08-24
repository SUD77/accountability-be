import { httpError } from "./httpError";

/**
 * Ensure a member's local calendar date is within the group's inclusive date window.
 * Compare canonical YYYY-MM-DD strings derived from DATE columns (timezone-safe).
 */
export function assertLocalDateInGroupWindow(opts: {
  localDate: string;      // "YYYY-MM-DD"
  groupStartDate: Date;   // DB DATE
  groupEndDate: Date;     // DB DATE
}) {
  const { localDate, groupStartDate, groupEndDate } = opts;

  const pad = (n: number) => `${n}`.padStart(2, "0");
  const toYMD = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

  const start = toYMD(groupStartDate);
  const end = toYMD(groupEndDate);

  if (localDate < start || localDate > end) {
    throw httpError(400, `local_date ${localDate} is outside group window ${start}..${end}`);
  }
}
