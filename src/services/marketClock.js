// Exchange session helpers. NSE trades 09:15 - 15:30 IST, Monday to Friday.
// Holidays are intentionally not modelled here.

const IST_OFFSET_MINUTES = 330;
const SESSION_OPEN = 9 * 60 + 15;
const SESSION_CLOSE = 15 * 60 + 30;
const SESSION_LENGTH = SESSION_CLOSE - SESSION_OPEN;
const DAY_MS = 24 * 60 * 60 * 1000;

// Returns a Date whose UTC fields read as IST wall-clock time.
function toIstWallClock(date) {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

function dateKeyOf(wallClock) {
  return wallClock.toISOString().slice(0, 10);
}

function isWeekend(wallClock) {
  const day = wallClock.getUTCDay();
  return day === 0 || day === 6;
}

function previousTradingDay(wallClock) {
  let cursor = new Date(wallClock.getTime() - DAY_MS);
  while (isWeekend(cursor)) cursor = new Date(cursor.getTime() - DAY_MS);
  return cursor;
}

/**
 * Resolves the trading session the "now" timestamp belongs to. Outside market
 * hours we report the most recent completed session at its closing minute.
 */
function getSession(now = new Date()) {
  const wall = toIstWallClock(now);
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();

  if (!isWeekend(wall) && minutes >= SESSION_OPEN) {
    const isOpen = minutes <= SESSION_CLOSE;
    return {
      dateKey: dateKeyOf(wall),
      minute: Math.min(minutes, SESSION_CLOSE),
      isOpen,
    };
  }

  let sessionDay = wall;
  if (isWeekend(wall) || minutes < SESSION_OPEN) sessionDay = previousTradingDay(wall);
  return { dateKey: dateKeyOf(sessionDay), minute: SESSION_CLOSE, isOpen: false };
}

function progressAt(minute) {
  return Math.min(Math.max((minute - SESSION_OPEN) / SESSION_LENGTH, 0), 1);
}

function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Math.min(Math.max(minutes, SESSION_OPEN), SESSION_CLOSE);
}

function formatClock(minute) {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0');
  const mins = String(minute % 60).padStart(2, '0');
  return `${hours}:${mins}`;
}

/** Calendar trading days (weekdays) ending at `dateKey`, oldest first. */
function tradingDaysUntil(dateKey, count) {
  const days = [];
  let cursor = new Date(`${dateKey}T00:00:00Z`);
  while (days.length < count) {
    if (!isWeekend(cursor)) days.push(dateKeyOf(cursor));
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return days.reverse();
}

/** Fraction of a year until 15:30 IST on the expiry date. */
function yearsUntilExpiry(expiryDateKey, now = new Date()) {
  const expiryCloseUtc = Date.parse(`${expiryDateKey}T10:00:00Z`); // 15:30 IST
  const days = (expiryCloseUtc - now.getTime()) / DAY_MS;
  return Math.max(days, 0) / 365;
}

module.exports = {
  DAY_MS,
  SESSION_OPEN,
  SESSION_CLOSE,
  toIstWallClock,
  dateKeyOf,
  isWeekend,
  getSession,
  progressAt,
  parseClock,
  formatClock,
  tradingDaysUntil,
  yearsUntilExpiry,
};
