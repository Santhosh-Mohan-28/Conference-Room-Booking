import { format, parseISO } from "date-fns";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

export const COMPANY_TIMEZONE = process.env.COMPANY_TIMEZONE || "Asia/Kolkata";

/**
 * Format a UTC Date into the company timezone string for display.
 * Example: "Oct 15, 2026 10:00 AM"
 */
export function formatCompanyTime(
  date: Date | string,
  formatStr = "MMM d, yyyy h:mm a"
): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(d, COMPANY_TIMEZONE, formatStr);
}

/**
 * Format date part only (e.g. "yyyy-MM-dd") in company timezone
 */
export function formatCompanyDate(date: Date | string, formatStr = "yyyy-MM-dd"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(d, COMPANY_TIMEZONE, formatStr);
}

/**
 * Format time part only (e.g. "h:mm a") in company timezone
 */
export function formatCompanyTimeOnly(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(d, COMPANY_TIMEZONE, "h:mm a");
}

/**
 * Parse a company-timezone date and time string into a UTC Date object.
 * E.g., date: "2026-10-15", time: "10:30" => UTC Date
 */
export function parseCompanyDateTimeToUTC(dateStr: string, timeStr: string): Date {
  // ISO-like format string without timezone: "2026-10-15T10:30:00"
  const cleanTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const localIsoString = `${dateStr}T${cleanTime}`;
  return fromZonedTime(localIsoString, COMPANY_TIMEZONE);
}

/**
 * Get the current time as a UTC Date
 */
export function getNowUTC(): Date {
  return new Date();
}

/**
 * Get current time in company timezone as formatted string
 */
export function getCompanyCurrentDateTimeString(): string {
  return formatCompanyTime(new Date(), "yyyy-MM-dd HH:mm:ss");
}
