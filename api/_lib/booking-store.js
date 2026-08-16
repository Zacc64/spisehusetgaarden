const fs = require("fs");
const path = require("path");
const {
  isVercelRuntime,
  hasBlobStorage,
  getBlobSetupHint,
  readBlobJson,
  writeBlobJson,
} = require("./blob-store");
const { getDepositDkk, parseGuestCount } = require("./booking");
const {
  DEFAULT_BOOKING_HOURS,
  normalizeHoursArray,
  hoursEqual,
  getDefaultBookingHours,
  getBookableSlotsForDate,
  isTimeAllowed,
  normalizeHoursByDate,
} = require("./booking-hours");

const BLOB_PATH = "bookings/store.json";
const DEFAULT_CAPACITY = 40;

function getStorePath() {
  return path.join(process.cwd(), "data", "booking-store.json");
}

function defaultStore() {
  return {
    defaultCapacity: DEFAULT_CAPACITY,
    capacityByDate: {},
    closedDates: [],
    defaultBookingHours: [...DEFAULT_BOOKING_HOURS],
    hoursByDate: {},
    bookings: [],
  };
}

function readStoreFromFs() {
  const storePath = getStorePath();
  try {
    if (fs.existsSync(storePath)) {
      return JSON.parse(fs.readFileSync(storePath, "utf8"));
    }
  } catch {
    // fall through
  }
  return defaultStore();
}

function writeStoreToFs(store) {
  const storePath = getStorePath();
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function getStorageError(req) {
  if (!isVercelRuntime()) return null;
  if (hasBlobStorage(req)) return null;
  return (
    getBlobSetupHint(req) ||
    "Booking-lager er ikke konfigureret. Tilslut Vercel Blob og tilføj BLOB_READ_WRITE_TOKEN i Vercel."
  );
}

function assertBookingStorage(req) {
  const error = getStorageError(req);
  if (error) {
    throw new Error(error);
  }
}

async function readStore(req) {
  if (hasBlobStorage(req)) {
    try {
      const blobStore = await readBlobJson(BLOB_PATH, req);
      if (blobStore) return normalizeStore(blobStore);
      return defaultStore();
    } catch (err) {
      throw new Error(`Kunne ikke læse booking-lager. ${err.message || err}`);
    }
  }

  assertBookingStorage(req);
  return normalizeStore(readStoreFromFs());
}

async function writeStore(store, req) {
  let normalized = normalizeStore(store);

  if (hasBlobStorage(req)) {
    try {
      const existing = await readBlobJson(BLOB_PATH, req);
      if (existing) {
        const existingNorm = normalizeStore(existing);
        if (normalized.bookings.length < existingNorm.bookings.length) {
          normalized = {
            ...normalized,
            bookings: existingNorm.bookings,
          };
        }
      }
    } catch {
      // Continue with normalized store.
    }

    await writeBlobJson(BLOB_PATH, normalized, req);
    if (!isVercelRuntime()) {
      try {
        writeStoreToFs(normalized);
      } catch {
        // optional mirror
      }
    }
    return normalized;
  }

  assertBookingStorage(req);

  writeStoreToFs(normalized);
  return normalized;
}

function normalizeStore(store) {
  const closedDates = Array.isArray(store?.closedDates)
    ? [...new Set(store.closedDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
    : [];

  const defaultBookingHours = getDefaultBookingHours(store);

  return {
    defaultCapacity: clampCapacity(store?.defaultCapacity ?? DEFAULT_CAPACITY),
    capacityByDate: store?.capacityByDate && typeof store.capacityByDate === "object"
      ? store.capacityByDate
      : {},
    closedDates,
    defaultBookingHours,
    hoursByDate: normalizeHoursByDate(store?.hoursByDate),
    bookings: Array.isArray(store?.bookings) ? store.bookings : [],
  };
}

function isDateClosed(store, date) {
  return store.closedDates.includes(date);
}

function clampCapacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CAPACITY;
  return Math.round(n);
}

function getPaidAmountDkk(session, guests) {
  if (session.amount_total) {
    return Math.round(session.amount_total / 100);
  }
  return getDepositDkk() * parseGuestCount(guests);
}

function getCapacityForDate(store, date) {
  if (store.capacityByDate[date] !== undefined) {
    return clampCapacity(store.capacityByDate[date]);
  }
  return clampCapacity(store.defaultCapacity);
}

function getBookedGuestsForDate(store, date) {
  return store.bookings
    .filter((b) => b.status === "paid" && b.date === date)
    .reduce((sum, b) => sum + (b.guestCount || parseGuestCount(b.guests)), 0);
}

async function getAvailability(date, req) {
  const store = await readStore(req);

  const hours = getBookableSlotsForDate(store, date);

  if (isDateClosed(store, date)) {
    return {
      date,
      closed: true,
      capacity: 0,
      booked: 0,
      remaining: 0,
      hours: [],
      hasCustomHours: Boolean(store.hoursByDate?.[date]),
    };
  }

  const capacity = getCapacityForDate(store, date);
  const booked = getBookedGuestsForDate(store, date);
  const remaining = Math.max(0, capacity - booked);

  return {
    date,
    closed: false,
    capacity,
    booked,
    remaining,
    hours,
    hasCustomHours: Boolean(store.hoursByDate?.[date]),
  };
}

async function assertAvailability(booking, req) {
  const guestCount = parseGuestCount(booking.guests);
  if (!guestCount) {
    return { error: "Vælg antal personer." };
  }

  const store = await readStore(req);
  const availability = await getAvailability(booking.date, req);
  if (availability.closed) {
    return { error: "Denne dag er lukket for booking." };
  }
  if (!isTimeAllowed(store, booking.date, booking.time)) {
    return { error: "Det valgte tidspunkt er ikke tilgængeligt på denne dato." };
  }
  if (guestCount > availability.remaining) {
    return {
      error: `Der er kun ${availability.remaining} pladser tilbage den ${booking.date}.`,
    };
  }

  return { guestCount, availability };
}

function bookingFromSession(session) {
  const metadata = session.metadata || {};
  const guests = metadata.guests || "";
  return {
    id: session.id,
    stripeSessionId: session.id,
    name: metadata.name || "",
    phone: metadata.phone || "",
    email: metadata.email || session.customer_email || session.customer_details?.email || "",
    date: metadata.date || "",
    time: metadata.time || "",
    guests,
    guestCount: parseGuestCount(guests),
    message: metadata.message || "",
    amountDkk: getPaidAmountDkk(session, guests),
    paidAt: new Date().toISOString(),
    status: "paid",
  };
}

async function addBookingFromSession(session, req) {
  const store = await readStore(req);
  if (store.bookings.some((b) => b.stripeSessionId === session.id)) {
    return store.bookings.find((b) => b.stripeSessionId === session.id);
  }

  const booking = bookingFromSession(session);
  store.bookings.unshift(booking);
  await writeStore(store, req);
  return booking;
}

async function listBookings(req) {
  const store = await readStore(req);
  return store.bookings.slice().sort((a, b) => {
    const aKey = `${a.date || ""}T${a.time || ""}`;
    const bKey = `${b.date || ""}T${b.time || ""}`;
    return bKey.localeCompare(aKey);
  });
}

async function getCapacitySettings(req) {
  const store = await readStore(req);
  return {
    defaultCapacity: store.defaultCapacity,
    capacityByDate: store.capacityByDate,
    closedDates: store.closedDates,
    defaultBookingHours: store.defaultBookingHours,
    hoursByDate: store.hoursByDate,
  };
}

function applyDateSettings(store, date, settings = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  if (settings.closed === true) {
    store.closedDates = [...new Set([...store.closedDates, date])].sort();
  } else if (settings.closed === false) {
    store.closedDates = store.closedDates.filter((d) => d !== date);
  }

  if (settings.clearCapacity) {
    delete store.capacityByDate[date];
  } else if (settings.capacity !== undefined && settings.capacity !== "") {
    store.capacityByDate[date] = clampCapacity(settings.capacity);
  }

  if (settings.clearHours) {
    delete store.hoursByDate[date];
  } else if (settings.hours !== undefined) {
    const hours = normalizeHoursArray(settings.hours);
    if (hoursEqual(hours, store.defaultBookingHours)) {
      delete store.hoursByDate[date];
    } else {
      store.hoursByDate[date] = hours;
    }
  }
}

async function updateCapacitySettings(payload, req) {
  const store = await readStore(req);

  if (payload.defaultCapacity !== undefined) {
    store.defaultCapacity = clampCapacity(payload.defaultCapacity);
  }

  if (payload.defaultBookingHours !== undefined) {
    store.defaultBookingHours = normalizeHoursArray(payload.defaultBookingHours);
  }

  if (payload.capacityByDate && typeof payload.capacityByDate === "object") {
    for (const [date, value] of Object.entries(payload.capacityByDate)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (value === null || value === "") {
        delete store.capacityByDate[date];
      } else {
        store.capacityByDate[date] = clampCapacity(value);
      }
    }
  }

  if (payload.removeCapacityDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.removeCapacityDate)) {
    delete store.capacityByDate[payload.removeCapacityDate];
  }

  if (payload.hoursByDate && typeof payload.hoursByDate === "object") {
    for (const [date, hours] of Object.entries(payload.hoursByDate)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (hours === null) {
        delete store.hoursByDate[date];
      } else {
        const normalized = normalizeHoursArray(hours);
        if (hoursEqual(normalized, store.defaultBookingHours)) {
          delete store.hoursByDate[date];
        } else {
          store.hoursByDate[date] = normalized;
        }
      }
    }
  }

  if (payload.removeHoursDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.removeHoursDate)) {
    delete store.hoursByDate[payload.removeHoursDate];
  }

  if (payload.addClosedDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.addClosedDate)) {
    store.closedDates = [...new Set([...store.closedDates, payload.addClosedDate])].sort();
  }

  if (payload.removeClosedDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.removeClosedDate)) {
    store.closedDates = store.closedDates.filter((d) => d !== payload.removeClosedDate);
  }

  if (payload.closedDates !== undefined && Array.isArray(payload.closedDates)) {
    store.closedDates = [
      ...new Set(
        payload.closedDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
      ),
    ].sort();
  }

  if (payload.dateSettings && typeof payload.dateSettings === "object") {
    const { date, ...settings } = payload.dateSettings;
    applyDateSettings(store, date, settings);
  }

  if (Array.isArray(payload.bulkDates) && payload.bulkDates.length) {
    const dates = [
      ...new Set(
        payload.bulkDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
      ),
    ];

    if (payload.bulkClosed === true) {
      store.closedDates = [...new Set([...store.closedDates, ...dates])].sort();
    } else if (payload.bulkClosed === false) {
      store.closedDates = store.closedDates.filter((d) => !dates.includes(d));
    }

    if (payload.bulkClearCapacity) {
      dates.forEach((date) => {
        delete store.capacityByDate[date];
      });
    } else if (payload.bulkCapacity !== undefined && payload.bulkCapacity !== "") {
      const capacity = clampCapacity(payload.bulkCapacity);
      dates.forEach((date) => {
        store.capacityByDate[date] = capacity;
      });
    }

    if (payload.bulkClearHours) {
      dates.forEach((date) => {
        delete store.hoursByDate[date];
      });
    } else if (payload.bulkHours !== undefined) {
      const hours = normalizeHoursArray(payload.bulkHours);
      dates.forEach((date) => {
        if (hoursEqual(hours, store.defaultBookingHours)) {
          delete store.hoursByDate[date];
        } else {
          store.hoursByDate[date] = hours;
        }
      });
    }
  }

  await writeStore(store, req);
  return {
    defaultCapacity: store.defaultCapacity,
    capacityByDate: store.capacityByDate,
    closedDates: store.closedDates,
    defaultBookingHours: store.defaultBookingHours,
    hoursByDate: store.hoursByDate,
  };
}

module.exports = {
  parseGuestCount,
  getAvailability,
  assertAvailability,
  addBookingFromSession,
  listBookings,
  getCapacitySettings,
  updateCapacitySettings,
  readStore,
  getStorageError,
  assertBookingStorage,
};
