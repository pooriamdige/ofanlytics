import { utcToZonedTime, formatInTimeZone } from 'date-fns-tz';

const TEHRAN_TIMEZONE = 'Asia/Tehran';
const RESET_HOUR = 1;
const RESET_MINUTE = 30;

/**
 * Get current date in Asia/Tehran timezone
 * Note: utcToZonedTime converts a UTC date to the specified timezone
 * For date-fns-tz v2.0.0, we use utcToZonedTime
 */
export function getTehranDate(date: Date = new Date()): Date {
  try {
    return utcToZonedTime(date, TEHRAN_TIMEZONE);
  } catch (error) {
    console.error('Error in utcToZonedTime:', error);
    // Fallback: return date as-is if timezone conversion fails
    return date;
  }
}

/**
 * Get current date string (YYYY-MM-DD) in Asia/Tehran timezone
 */
export function getTehranDateString(date: Date = new Date()): string {
  return formatInTimeZone(date, TEHRAN_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Get reset time (01:30 Asia/Tehran) for a given date
 */
export function getResetTime(date: Date = new Date()): Date {
  const tehranDate = getTehranDate(date);
  const resetTime = new Date(tehranDate);
  resetTime.setHours(RESET_HOUR, RESET_MINUTE, 0, 0);
  return resetTime;
}

/**
 * Get next reset time (01:30 Asia/Tehran)
 */
export function getNextResetTime(date: Date = new Date()): Date {
  const resetTime = getResetTime(date);
  if (resetTime <= date) {
    // If reset time has passed today, get tomorrow's reset
    resetTime.setDate(resetTime.getDate() + 1);
  }
  return resetTime;
}

/**
 * Get seconds until next reset
 */
export function getSecondsUntilReset(date: Date = new Date()): number {
  const nextReset = getNextResetTime(date);
  return Math.floor((nextReset.getTime() - date.getTime()) / 1000);
}

/**
 * Check if current time is within reset window (01:30-01:35 Asia/Tehran)
 */
export function isResetWindow(date: Date = new Date()): boolean {
  const tehranDate = getTehranDate(date);
  const resetTime = getResetTime(date);
  const windowEnd = new Date(resetTime);
  windowEnd.setMinutes(windowEnd.getMinutes() + 5);
  
  return tehranDate >= resetTime && tehranDate <= windowEnd;
}

