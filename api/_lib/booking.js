function cleanEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function salvageSiteUrl(value) {
  const raw = cleanEnvValue(value);
  if (!raw) return "";

  if (!raw.includes("\\") && !/^[a-zA-Z]:/.test(raw)) {
    return "";
  }

  const explicitMatch = raw.match(/https?:[\\/]+([a-z0-9.-]+\.[a-z]{2,})/i);
  if (explicitMatch) {
    return `https://${explicitMatch[1]}`;
  }

  const domainMatch = raw.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})/i);
  if (domainMatch) {
    return `https://${domainMatch[1]}`;
  }

  return "";
}

function normalizeSiteUrl(value) {
  const salvaged = salvageSiteUrl(value);
  if (salvaged) return salvaged;

  const raw = cleanEnvValue(value);
  if (!raw || raw.includes("\\") || /^[a-zA-Z]:/.test(raw)) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      url.pathname = url.pathname.replace(/\/+$/, "");
      if (url.pathname === "/") url.pathname = "";
      return `${url.origin}${url.pathname}${url.search}`;
    } catch {
      return "";
    }
  }

  const host = raw.replace(/\/+$/, "");
  if (!host || /^https?:$/i.test(host)) return "";
  return `https://${host}`;
}

function isUsableSiteUrl(value, { allowLocalhost = false } = {}) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!url.hostname || url.hostname === "." || url.hostname.includes("\\")) return false;
    if (!allowLocalhost && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function getUrlFromRequest(req) {
  if (!req?.headers) return "";

  const forwardedHost = req.headers["x-forwarded-host"];
  const host = cleanEnvValue(
    Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host || req.headers.Host
  );
  if (!host) return "";

  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = cleanEnvValue(
    Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "https"
  );

  return normalizeSiteUrl(`${proto}://${host}`);
}

function getSiteUrl(req) {
  const isVercel = process.env.VERCEL === "1";
  const allowLocalhost = !isVercel;
  const candidates = [
    normalizeSiteUrl(process.env.SITE_URL),
    normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    normalizeSiteUrl(process.env.VERCEL_URL),
    getUrlFromRequest(req),
  ];

  if (!isVercel) {
    candidates.push("http://localhost:3456");
  }

  for (const candidate of candidates) {
    if (isUsableSiteUrl(candidate, { allowLocalhost })) {
      return candidate.replace(/\/+$/, "");
    }
  }

  return "http://localhost:3456";
}

function getBookingRedirectUrls(req) {
  const siteUrl = getSiteUrl(req);
  return {
    siteUrl,
    successUrl: `${siteUrl}/?booking=success`,
    cancelUrl: `${siteUrl}/?booking=cancelled`,
  };
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
  getBookingRedirectUrls,
  isUsableSiteUrl,
  getDepositDkk,
  getDepositOre,
  getNotifyEmail,
  getMaxBookableDate,
  getMaxBookingMonths,
  parseBookingBody,
  formatBookingSummary,
  getPublicBookingConfig,
};
