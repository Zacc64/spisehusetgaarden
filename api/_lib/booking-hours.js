const DEFAULT_BOOKING_HOURS = [
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
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

function timeToMinutes(time) {
  const match = String(time).trim().match(TIME_PATTERN);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function expandHoursToHalfHourSlots(hours) {
  const normalized = normalizeHoursArray(hours);
  if (!normalized.length) return [];

  const minuteMarks = normalized
    .map(timeToMinutes)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);

  if (!minuteMarks.length) return [];

  const hourAnchors = minuteMarks.filter((minutes) => minutes % 60 === 0);
  const anchors = hourAnchors.length ? hourAnchors : minuteMarks;
  const slots = new Set(normalized);

  const runs = [];
  let runStart = anchors[0];
  let runEnd = anchors[0];

  for (let i = 1; i < anchors.length; i += 1) {
    if (anchors[i] - anchors[i - 1] === 60) {
      runEnd = anchors[i];
    } else {
      runs.push([runStart, runEnd]);
      runStart = anchors[i];
      runEnd = anchors[i];
    }
  }
  runs.push([runStart, runEnd]);

  for (const [start, end] of runs) {
    for (let minutes = start; minutes <= end; minutes += 30) {
      slots.add(minutesToTime(minutes));
    }
  }

  return [...slots].sort();
}

function getHoursForDate(store, date) {
  const override = store?.hoursByDate?.[date];
  if (override) return normalizeHoursArray(override);
  return getDefaultBookingHours(store);
}

function getBookableSlotsForDate(store, date) {
  return expandHoursToHalfHourSlots(getHoursForDate(store, date));
}

function isTimeAllowed(store, date, time) {
  const normalizedTime = String(time || "").trim();
  if (!TIME_PATTERN.test(normalizedTime)) return false;
  return getBookableSlotsForDate(store, date).includes(normalizedTime);
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
  getBookableSlotsForDate,
  expandHoursToHalfHourSlots,
  isTimeAllowed,
  normalizeHoursByDate,
};
