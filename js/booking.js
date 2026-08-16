const form = document.getElementById("booking-form");
const success = document.getElementById("form-success");
const cancelled = document.getElementById("form-cancelled");
const errorEl = document.getElementById("form-error");
const submitBtn = document.getElementById("booking-submit");
const depositNote = document.getElementById("booking-deposit-note");
const availabilityNote = document.getElementById("booking-availability-note");
const testBanner = document.getElementById("booking-test-banner");
const dateInput = form?.querySelector('input[name="date"]');
const guestsInput = form?.querySelector('[name="guests"]');
const timeInput = form?.querySelector('select[name="time"]');
let isTestMode = false;
let paymentsEnabled = true;
let bookingSubmitAllowed = false;
let depositPerPersonDkk = 0;

function parseGuestCount(value) {
  if (String(value || "").trim() === "7+") return 7;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
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

async function updateAvailability() {
  if (!availabilityNote || !dateInput?.value) {
    if (availabilityNote) availabilityNote.hidden = true;
    setBookingSubmitAllowed(false);
    return;
  }

  const timeSelect = timeInput;
  const previousTime = timeSelect?.value || "";
  setBookingSubmitAllowed(false);

  try {
    const res = await fetch(`/api/booking/availability?date=${encodeURIComponent(dateInput.value)}`);
    const data = await res.json();
    if (!res.ok) throw new Error();

    if (timeSelect) {
      const hours = Array.isArray(data.hours) && data.hours.length ? data.hours : [];
      timeSelect.innerHTML = '<option value="" disabled selected>Vælg tid</option>';
      hours.forEach((hour) => {
        const option = document.createElement("option");
        option.value = hour;
        option.textContent = hour;
        timeSelect.appendChild(option);
      });
      if (previousTime && hours.includes(previousTime)) {
        timeSelect.value = previousTime;
      }
      timeSelect.disabled = !hours.length;
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
    if (!paymentsEnabled) {
      setBookingSubmitAllowed(false);
    }
    updateDepositNote();
    if (config.testMode && testBanner) {
      isTestMode = true;
      testBanner.hidden = false;
      if (submitBtn) submitBtn.textContent = "Betal og book (test)";
    }
    if (dateInput) {
      dateInput.min = new Date().toISOString().split("T")[0];
      if (config.maxBookableDate) {
        dateInput.max = config.maxBookableDate;
      }
      if (dateInput.value) {
        updateAvailability();
      }
    }
  } catch {
    depositPerPersonDkk = 0;
    depositNote.textContent = "Depositum betales ved booking.";
  }
}

if (dateInput) {
  dateInput.addEventListener("change", updateAvailability);
}
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
