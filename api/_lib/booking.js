function normalizeSiteUrl(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return `https://${raw}`;
}

function isValidSiteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getSiteUrl(req) {
  const fromEnv = normalizeSiteUrl(process.env.SITE_URL);
  if (isValidSiteUrl(fromEnv)) {
    return fromEnv;
  }

  const vercelUrl = normalizeSiteUrl(process.env.VERCEL_URL);
  if (isValidSiteUrl(vercelUrl)) {
    return vercelUrl;
  }

  const host =
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.host ||
    req?.headers?.Host;
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  if (host) {
    const fromRequest = normalizeSiteUrl(`${proto}://${host}`);
    if (isValidSiteUrl(fromRequest)) {
      return fromRequest;
    }
  }

  return "http://localhost:3456";
}

function getDepositDkk() {
  const value = Number(process.env.BOOKING_DEPOSIT_DKK || 100);
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.round(value);
}

function getDepositOre() {
  return getDepositDkk() * 100;
}

function getNotifyEmail() {
  return (process.env.BOOKING_NOTIFY_EMAIL || "info@spisehusetgaarden.dk").trim();
}

function getMaxBookingMonths() {
  const value = Number(process.env.BOOKING_MAX_MONTHS_AHEAD || 12);
  if (!Number.isFinite(value) || value < 1) return 12;
  return Math.round(value);
}

function getMaxBookableDate() {
  const maxDate = new Date();
  maxDate.setHours(12, 0, 0, 0);
  maxDate.setMonth(maxDate.getMonth() + getMaxBookingMonths());
  return maxDate.toISOString().split("T")[0];
}

function parseBookingBody(body) {
  const name = String(body?.name || "").trim();
  const phone = String(body?.phone || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const date = String(body?.date || "").trim();
  const time = String(body?.time || "").trim();
  const guests = String(body?.guests || "").trim();
  const message = String(body?.message || "").trim();

  if (!name || name.length < 2) {
    return { error: "Angiv dit navn." };
  }
  if (!phone || phone.length < 6) {
    return { error: "Angiv et gyldigt telefonnummer." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Angiv en gyldig email." };
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Vælg en gyldig dato." };
  }
  if (!time) {
    return { error: "Vælg et tidspunkt." };
  }
  if (!guests) {
    return { error: "Vælg antal personer." };
  }

  const today = new Date().toISOString().split("T")[0];
  if (date < today) {
    return { error: "Datoen skal være i fremtiden." };
  }

  const maxDate = getMaxBookableDate();
  if (date > maxDate) {
    return {
      error: `Booking er kun mulig op til ${getMaxBookingMonths()} måneder frem.`,
    };
  }

  return {
    booking: { name, phone, email, date, time, guests, message },
  };
}

function formatBookingSummary(booking) {
  return [
    `Navn: ${booking.name}`,
    `Telefon: ${booking.phone}`,
    `Email: ${booking.email}`,
    `Dato: ${booking.date}`,
    `Tid: ${booking.time}`,
    `Personer: ${booking.guests}`,
    booking.message ? `Bemærkninger: ${booking.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const { isStripeConfigured, isStripeTestMode } = require("./stripe-client");

function getPublicBookingConfig() {
  return {
    depositDkk: getDepositDkk(),
    currency: "DKK",
    paymentsEnabled: isStripeConfigured(),
    testMode: isStripeTestMode(),
    maxBookableDate: getMaxBookableDate(),
    maxMonthsAhead: getMaxBookingMonths(),
  };
}

module.exports = {
  getSiteUrl,
  getDepositDkk,
  getDepositOre,
  getNotifyEmail,
  getMaxBookableDate,
  getMaxBookingMonths,
  parseBookingBody,
  formatBookingSummary,
  getPublicBookingConfig,
};
