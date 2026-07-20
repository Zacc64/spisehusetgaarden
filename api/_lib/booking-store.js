const fs = require("fs");
const path = require("path");
const {
  isVercelRuntime,
  hasBlobStorage,
  readBlobJson,
  writeBlobJson,
} = require("./blob-store");
const { getDepositDkk } = require("./booking");

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

async function readStore(req) {
  if (hasBlobStorage(req)) {
    try {
      const blobStore = await readBlobJson(BLOB_PATH, req);
      if (blobStore) return normalizeStore(blobStore);
    } catch {
      // fall back
    }
  }

  if (isVercelRuntime()) {
    return defaultStore();
  }

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

  if (isVercelRuntime()) {
    throw new Error("Booking storage is not configured on Vercel.");
  }

  writeStoreToFs(normalized);
  return normalized;
}

function normalizeStore(store) {
  const closedDates = Array.isArray(store?.closedDates)
    ? [...new Set(store.closedDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
    : [];

  return {
    defaultCapacity: clampCapacity(store?.defaultCapacity ?? DEFAULT_CAPACITY),
    capacityByDate: store?.capacityByDate && typeof store.capacityByDate === "object"
      ? store.capacityByDate
      : {},
    closedDates,
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

function parseGuestCount(guests) {
  if (String(guests).trim() === "7+") return 7;
  const n = Number.parseInt(String(guests), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
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

  if (isDateClosed(store, date)) {
    return {
      date,
      closed: true,
      capacity: 0,
      booked: 0,
      remaining: 0,
    };
  }

  const capacity = getCapacityForDate(store, date);
  const booked = getBookedGuestsForDate(store, date);
  const remaining = Math.max(0, capacity - booked);

  return { date, closed: false, capacity, booked, remaining };
}

async function assertAvailability(booking, req) {
  const guestCount = parseGuestCount(booking.guests);
  if (!guestCount) {
    return { error: "Vælg antal personer." };
  }

  const availability = await getAvailability(booking.date, req);
  if (availability.closed) {
    return { error: "Denne dag er lukket for booking." };
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
    amountDkk: getDepositDkk(),
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
  };
}

async function updateCapacitySettings(payload, req) {
  const store = await readStore(req);

  if (payload.defaultCapacity !== undefined) {
    store.defaultCapacity = clampCapacity(payload.defaultCapacity);
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

  await writeStore(store, req);
  return {
    defaultCapacity: store.defaultCapacity,
    capacityByDate: store.capacityByDate,
    closedDates: store.closedDates,
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
};
