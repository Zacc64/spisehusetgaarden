const DEFAULT_BOOKING_HOURS = [
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
];

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeHoursArray(hours) {
  if (!Array.isArray(hours)) return [...DEFAULT_BOOKING_HOURS];

  const normalized = [
    ...new Set(
      hours
        .map((value) => String(value || "").trim())
        .filter((value) => TIME_PATTERN.test(value))
    ),
  ].sort();

  return normalized.length ? normalized : [...DEFAULT_BOOKING_HOURS];
}

function hoursEqual(a, b) {
  const left = normalizeHoursArray(a);
  const right = normalizeHoursArray(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getDefaultBookingHours(store) {
  return normalizeHoursArray(store?.defaultBookingHours);
}

function getHoursForDate(store, date) {
  const override = store?.hoursByDate?.[date];
  if (override) return normalizeHoursArray(override);
  return getDefaultBookingHours(store);
}

function isTimeAllowed(store, date, time) {
  const normalizedTime = String(time || "").trim();
  if (!TIME_PATTERN.test(normalizedTime)) return false;
  return getHoursForDate(store, date).includes(normalizedTime);
}

function normalizeHoursByDate(hoursByDate) {
  if (!hoursByDate || typeof hoursByDate !== "object") return {};

  const result = {};
  for (const [date, hours] of Object.entries(hoursByDate)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const normalized = normalizeHoursArray(hours);
    if (normalized.length) {
      result[date] = normalized;
    }
  }
  return result;
}

module.exports = {
  DEFAULT_BOOKING_HOURS,
  TIME_PATTERN,
  normalizeHoursArray,
  hoursEqual,
  getDefaultBookingHours,
  getHoursForDate,
  isTimeAllowed,
  normalizeHoursByDate,
};
