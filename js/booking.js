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
let isTestMode = false;

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
    return;
  }

  try {
    const res = await fetch(`/api/booking/availability?date=${encodeURIComponent(dateInput.value)}`);
    const data = await res.json();
    if (!res.ok) throw new Error();
    if (data.closed) {
      availabilityNote.textContent = `Den ${data.date} er lukket for booking.`;
      availabilityNote.classList.add("booking-availability--closed");
      if (submitBtn) submitBtn.disabled = true;
      return;
    }
    availabilityNote.classList.remove("booking-availability--closed");
    if (submitBtn) submitBtn.disabled = false;
    availabilityNote.textContent = `${data.remaining} af ${data.capacity} pladser tilbage den ${data.date}.`;
    availabilityNote.hidden = false;
  } catch {
    availabilityNote.hidden = true;
  }
}

async function loadBookingConfig() {
  if (!depositNote) return;
  try {
    const res = await fetch("/api/booking/config");
    const config = await res.json();
    if (config.depositDkk) {
      depositNote.textContent = `Depositum: ${config.depositDkk} kr. Betales nu for at bekræfte booking.`;
    }
    if (!config.paymentsEnabled && submitBtn) {
      submitBtn.disabled = true;
      depositNote.textContent = "Online betaling er ikke sat op endnu.";
    }
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
    }
  } catch {
    depositNote.textContent = "Depositum betales ved booking.";
  }
}

if (dateInput) {
  dateInput.addEventListener("change", updateAvailability);
}
guestsInput?.addEventListener("change", updateAvailability);

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
    submitBtn.disabled = false;
    submitBtn.textContent = isTestMode ? "Betal og book (test)" : "Betal og book";
  }
});

loadBookingConfig();
