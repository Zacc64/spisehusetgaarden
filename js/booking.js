const form = document.getElementById("booking-form");
const success = document.getElementById("form-success");
const cancelled = document.getElementById("form-cancelled");
const errorEl = document.getElementById("form-error");
const submitBtn = document.getElementById("booking-submit") || document.getElementById("booking-submit");
const depositNote = document.getElementById("booking-deposit-note") || document.getElementById("booking-deposit-note");
const availabilityNote = document.getElementById("booking-availability-note") || document.getElementById("booking-availability-note");
const testBanner = document.getElementById("booking-test-banner") || document.getElementById("booking-test-banner");
const dateInput = document.getElementById("booking-date") || form?.querySelector('input[name="date"]');
const guestsInput = form?.querySelector('[name="guests"]');
const timeInput = form?.querySelector('select[name="time"]');
const calendarGrid = document.getElementById("booking-cal-grid");
const calendarTitle = document.getElementById("booking-cal-title");
const calendarPrev = document.getElementById("booking-cal-prev");
const calendarNext = document.getElementById("booking-cal-next");
const dayEventBox = document.getElementById("booking-day-event");
const dayEventDate = document.getElementById("booking-day-event-date");
const dayEventTitle = document.getElementById("booking-day-event-title");
const dayEventText = document.getElementById("booking-day-event-text");

const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const monthCache = new Map();

let isTestMode = false;
let paymentsEnabled = true;
let bookingSubmitAllowed = false;
let depositPerPersonDkk = 0;
let minBookableDate = new Date().toISOString().split("T")[0];
let maxBookableDate = "";
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();

function parseGuestCount(value) {
  if (String(value || "").trim() === "7+") return 7;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function updateDepositNote() {
  if (!depositNote) return;

  if (!paymentsEnabled) {
    depositNote.textContent = "Online betaling er ikke sat op endnu.";
    return;
  }

  if (!depositPerPersonDkk) {
    depositNote.textContent = "Depositum betales ved booking.";
    return;
  }

  const guestCount = parseGuestCount(guestsInput?.value);
  if (!guestCount) {
    depositNote.textContent = `Depositum: ${depositPerPersonDkk} kr. pr. person. Betales nu for at bekræfte booking.`;
    return;
  }

  const total = depositPerPersonDkk * guestCount;
  if (guestCount === 1) {
    depositNote.textContent = `Depositum: ${total} kr. Betales nu for at bekræfte booking.`;
    return;
  }

  depositNote.textContent = `Depositum: ${total} kr. (${depositPerPersonDkk} kr. × ${guestCount} personer). Betales nu for at bekræfte booking.`;
}

function setBookingSubmitAllowed(allowed) {
  bookingSubmitAllowed = Boolean(allowed);
  if (!submitBtn) return;

  const blocked = !bookingSubmitAllowed || !paymentsEnabled;
  submitBtn.disabled = blocked;
  submitBtn.classList.toggle("btn-submit--blocked", blocked);
  submitBtn.setAttribute("aria-disabled", String(blocked));
}

function showMessage(el) {
  if (!form) return;
  form.hidden = true;
  success.hidden = el !== success;
  if (cancelled) cancelled.hidden = el !== cancelled;
  document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatLongDate(iso) {
  if (!iso) return "";
  const formatted = new Date(`${iso}T12:00:00`).toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function eventForDate(iso) {
  if (!iso) return null;
  const [year, month] = iso.split("-").map(Number);
  const days = monthCache.get(monthKey(year, month - 1)) || {};
  return days[iso]?.event || null;
}

function showDayEvent(event, iso = dateInput?.value) {
  if (!dayEventBox) return;
  if (!iso) {
    dayEventBox.hidden = true;
    return;
  }

  const title = String(event?.title || "").trim();
  const text = String(event?.description || "").trim();
  const hasEvent = Boolean(title || text);

  if (dayEventDate) dayEventDate.textContent = formatLongDate(iso);
  dayEventBox.classList.toggle("booking-event--empty", !hasEvent);

  if (dayEventTitle) {
    dayEventTitle.textContent = hasEvent ? title || "Arrangement" : "Intet arrangement denne dag";
  }
  if (dayEventText) {
    dayEventText.textContent = hasEvent
      ? text
      : "Der er ikke oprettet et arrangement for den valgte dato.";
    dayEventText.hidden = hasEvent && !text;
  }

  dayEventBox.hidden = false;
}

async function loadMonth(year, month) {
  const key = monthKey(year, month);
  if (monthCache.has(key)) return monthCache.get(key);

  const res = await fetch(`/api/booking/availability?month=${encodeURIComponent(key)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Kunne ikke hente kalender");
  monthCache.set(key, data.days || {});
  return monthCache.get(key);
}

async function renderBookingCalendar() {
  if (!calendarGrid || !calendarTitle) return;

  calendarTitle.textContent = new Date(calendarYear, calendarMonth, 1).toLocaleDateString("da-DK", {
    month: "long",
    year: "numeric",
  });

  const selected = dateInput?.value || "";
  let days = {};
  try {
    days = await loadMonth(calendarYear, calendarMonth);
  } catch {
    days = {};
  }

  const firstWeekday = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const html = [];

  WEEKDAYS.forEach((label) => {
    html.push(`<div class="booking-calendar__weekday">${label}</div>`);
  });

  for (let i = 0; i < firstWeekday; i += 1) {
    html.push('<div class="booking-calendar__pad"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toIsoDate(calendarYear, calendarMonth, day);
    const info = days[iso] || {};
    const disabled = iso < minBookableDate || (maxBookableDate && iso > maxBookableDate);
    const classes = ["booking-calendar__day"];
    if (iso === selected) classes.push("is-selected");
    if (info.closed) classes.push("is-closed");
    if (info.hasEvent) classes.push("has-event");
    if (disabled) classes.push("is-disabled");

    html.push(`
      <button type="button" class="${classes.join(" ")}" data-date="${iso}" ${disabled ? "disabled" : ""}>
        <span class="booking-calendar__num">${day}</span>
        ${info.hasEvent ? '<span class="booking-calendar__dot" aria-hidden="true"></span>' : ""}
      </button>
    `);
  }

  calendarGrid.innerHTML = html.join("");

  if (selected) showDayEvent(eventForDate(selected), selected);

  if (calendarPrev) {
    const prev = new Date(calendarYear, calendarMonth, 1);
    prev.setMonth(prev.getMonth() - 1);
    const prevStart = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
    const currentStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    calendarPrev.disabled = prevStart < currentStart;
  }

  if (calendarNext && maxBookableDate) {
    const next = new Date(calendarYear, calendarMonth, 1);
    next.setMonth(next.getMonth() + 1);
    const nextStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    calendarNext.disabled = nextStart > maxBookableDate;
  }
}

async function selectBookingDate(iso) {
  if (!dateInput || !iso) return;
  dateInput.value = iso;
  showDayEvent(eventForDate(iso), iso);
  calendarGrid?.querySelectorAll(".booking-calendar__day").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.date === iso);
  });
  await updateAvailability();
}

async function updateAvailability() {
  if (!availabilityNote || !dateInput?.value) {
    if (availabilityNote) availabilityNote.hidden = true;
    setBookingSubmitAllowed(false);
    return;
  }

  const previousTime = timeInput?.value || "";
  setBookingSubmitAllowed(false);

  try {
    const res = await fetch(`/api/booking/availability?date=${encodeURIComponent(dateInput.value)}`);
    const data = await res.json();
    if (!res.ok) throw new Error();

    showDayEvent(data.event || eventForDate(dateInput.value), dateInput.value);

    const iso = dateInput.value;
    const [year, month] = iso.split("-").map(Number);
    const key = monthKey(year, month - 1);
    const days = monthCache.get(key) || {};
    days[iso] = {
      ...(days[iso] || {}),
      hasEvent: Boolean(data.event),
      event: data.event || null,
    };
    monthCache.set(key, days);

    if (timeInput) {
      const hours = Array.isArray(data.hours) && data.hours.length ? data.hours : [];
      timeInput.innerHTML = '<option value="" disabled selected>Vælg tid</option>';
      hours.forEach((hour) => {
        const option = document.createElement("option");
        option.value = hour;
        option.textContent = hour;
        timeInput.appendChild(option);
      });
      if (previousTime && hours.includes(previousTime)) {
        timeInput.value = previousTime;
      }
      timeInput.disabled = !hours.length;
    }

    availabilityNote.hidden = false;

    if (data.closed) {
      availabilityNote.textContent = `Den ${data.date} er lukket for booking. Vælg en anden dato.`;
      availabilityNote.classList.add("booking-availability--closed");
      setBookingSubmitAllowed(false);
      return;
    }

    if (!data.hours?.length) {
      availabilityNote.textContent = `Der er ingen ledige tidspunkter den ${data.date}.`;
      availabilityNote.classList.add("booking-availability--closed");
      setBookingSubmitAllowed(false);
      return;
    }

    availabilityNote.classList.remove("booking-availability--closed");
    setBookingSubmitAllowed(true);
    availabilityNote.textContent = `${data.remaining} af ${data.capacity} pladser tilbage den ${data.date}.`;
  } catch {
    availabilityNote.hidden = true;
    setBookingSubmitAllowed(false);
  }
}

async function loadBookingConfig() {
  if (!depositNote) return;
  try {
    const res = await fetch("/api/booking/config");
    const config = await res.json();
    depositPerPersonDkk = Number(config.depositPerPersonDkk || config.depositDkk) || 0;
    paymentsEnabled = Boolean(config.paymentsEnabled);
    if (!paymentsEnabled) setBookingSubmitAllowed(false);
    updateDepositNote();
    if (config.testMode && testBanner) {
      isTestMode = true;
      testBanner.hidden = false;
      if (submitBtn) submitBtn.textContent = "Betal og book (test)";
    }
    minBookableDate = new Date().toISOString().split("T")[0];
    if (config.maxBookableDate) maxBookableDate = config.maxBookableDate;
    await renderBookingCalendar();
    if (dateInput?.value) await updateAvailability();
  } catch {
    depositPerPersonDkk = 0;
    depositNote.textContent = "Depositum betales ved booking.";
    await renderBookingCalendar();
  }
}

calendarPrev?.addEventListener("click", async () => {
  calendarMonth -= 1;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear -= 1;
  }
  await renderBookingCalendar();
});

calendarNext?.addEventListener("click", async () => {
  calendarMonth += 1;
  if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear += 1;
  }
  await renderBookingCalendar();
});

calendarGrid?.addEventListener("click", async (event) => {
  const button = event.target.closest(".booking-calendar__day");
  if (!button || button.disabled) return;
  await selectBookingDate(button.dataset.date);
});

guestsInput?.addEventListener("change", () => {
  updateAvailability();
  updateDepositNote();
});

const params = new URLSearchParams(window.location.search);
if (params.get("booking") === "success") {
  showMessage(success);
  window.history.replaceState({}, "", `${window.location.pathname}#book`);
} else if (params.get("booking") === "cancelled" && cancelled) {
  cancelled.hidden = false;
  document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState({}, "", `${window.location.pathname}#book`);
} else if (window.location.hash === "#book") {
  document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  if (!dateInput?.value) {
    errorEl.textContent = "Vælg en dato i kalenderen.";
    errorEl.hidden = false;
    return;
  }

  if (!bookingSubmitAllowed || !paymentsEnabled) {
    errorEl.textContent = "Vælg en dato der er åben for booking.";
    errorEl.hidden = false;
    return;
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = Object.fromEntries(new FormData(form).entries());
  submitBtn.disabled = true;
  submitBtn.textContent = "Sender til betaling…";

  try {
    const res = await fetch("/api/booking/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.url) {
      throw new Error(data.error || "Kunne ikke starte betaling");
    }

    window.location.href = data.url;
  } catch (err) {
    errorEl.textContent = err.message || "Noget gik galt. Prøv igen.";
    errorEl.hidden = false;
    setBookingSubmitAllowed(true);
    submitBtn.textContent = isTestMode ? "Betal og book (test)" : "Betal og book";
  }
});

loadBookingConfig();
setBookingSubmitAllowed(false);
