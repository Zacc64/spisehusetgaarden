const ALL_BOOKING_HOURS = [
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

let capacityState = {
  defaultCapacity: 40,
  capacityByDate: {},
  closedDates: [],
  defaultBookingHours: [...ALL_BOOKING_HOURS],
  hoursByDate: {},
  eventsByDate: {},
};

let allBookings = [];
let bookingsView = {
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  selectedDate: null,
  bulkSelectMode: false,
  bulkSelectedDates: [],
  modalDate: null,
  sort: "date-desc",
  pageSize: 20,
  page: 1,
  dateFilter: "all",
};

let statusTimer = null;

const WEEKDAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function authHeaders() {
  return {
    Authorization: `Bearer ${sessionStorage.getItem("sg-admin-token")}`,
    "Content-Type": "application/json",
  };
}

function formatDateLabel(isoDate) {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeHours(hours) {
  if (!Array.isArray(hours) || !hours.length) return [...ALL_BOOKING_HOURS];
  const normalized = [...new Set(hours.map((value) => String(value).trim()).filter(Boolean))].sort();
  return normalized.length ? normalized : [...ALL_BOOKING_HOURS];
}

function hoursEqual(left, right) {
  const a = normalizeHours(left);
  const b = normalizeHours(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function getDefaultHours() {
  return normalizeHours(capacityState.defaultBookingHours);
}

function getHoursForDate(date) {
  if (capacityState.hoursByDate?.[date]) {
    return normalizeHours(capacityState.hoursByDate[date]);
  }
  return getDefaultHours();
}

function hasCustomHours(date) {
  return Boolean(capacityState.hoursByDate?.[date]);
}

function getCapacityForDate(date) {
  if (capacityState.capacityByDate?.[date] !== undefined) {
    return capacityState.capacityByDate[date];
  }
  return capacityState.defaultCapacity ?? 40;
}

function setStorageWarning(message) {
  const banner = document.getElementById("bookings-storage-warning");
  const text = document.getElementById("bookings-storage-warning-text");
  if (!banner || !text) return;

  if (!message) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  text.textContent = message;
}

async function checkBookingStorage() {
  try {
    const res = await fetch("/api/admin/blob-status", { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return;
    const status = await res.json();
    if (!status.ready) {
      setStorageWarning(
        status.hint ||
          "Booking-lager er ikke konfigureret. Tilslut Vercel Blob og tilføj BLOB_READ_WRITE_TOKEN, så bookinger og lukkede dage kan gemmes."
      );
      return;
    }
    setStorageWarning("");
    setActionFeedback("Booking-lager er klar.", "success");
  } catch {
    // ignore
  }
}

function setActionFeedback(message, type = "info") {
  const el = document.getElementById("bookings-action-feedback");
  if (!el) return;

  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.className = "admin-bookings-action";
    return;
  }

  el.hidden = false;
  el.textContent = message;
  el.className = `admin-bookings-action admin-bookings-action--${type}`;
}

function buildSyncMessage(data) {
  if (data.added > 0) {
    return {
      type: "success",
      message: `${data.added} booking${data.added === 1 ? "" : "er"} hentet fra Stripe.`,
    };
  }

  if (data.paid === 0) {
    return {
      type: "info",
      message:
        "Ingen gennemførte Stripe-betalinger fundet. Tjek at STRIPE_SECRET_KEY i Vercel er live (sk_live_...), hvis betalingen blev lavet i live mode.",
    };
  }

  if (data.bookingLike === 0) {
    return {
      type: "info",
      message:
        "Stripe-betalinger blev fundet, men ingen med booking-data. Betalingen kan være fra en anden Stripe-konto eller test mode.",
    };
  }

  return {
    type: "info",
    message: "Ingen nye bookinger at hente. De fundne betalinger ligger allerede i listen.",
  };
}

async function syncBookingsFromStripe() {
  const button = document.getElementById("sync-bookings-btn");
  if (!button) return;

  const defaultLabel = button.dataset.defaultLabel || button.textContent;
  button.dataset.defaultLabel = defaultLabel;
  button.disabled = true;
  button.textContent = "Henter…";
  setActionFeedback("Henter betalinger fra Stripe…", "info");

  try {
    const res = await fetch("/api/admin/sync-bookings", {
      method: "POST",
      headers: authHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Kunne ikke hente bookinger fra Stripe");
    }

    await loadBookingsAdmin({ quiet: true });
    const feedback = buildSyncMessage(data);
    setActionFeedback(feedback.message, feedback.type);
    setStatus(feedback.message, feedback.type === "error" ? "error" : "success");
  } catch (err) {
    const message = err.message || "Kunne ikke synkronisere med Stripe";
    setActionFeedback(message, "error");
    setStatus(message, "error");
  } finally {
    button.disabled = false;
    button.textContent = defaultLabel;
  }
}

function setStatus(message, type = "success") {
  const banner = document.getElementById("bookings-status");
  const text = document.getElementById("bookings-status-text");
  if (!banner || !text) return;

  banner.hidden = false;
  banner.classList.remove("admin-bookings-status--error", "admin-bookings-status--success");
  banner.classList.add(type === "error" ? "admin-bookings-status--error" : "admin-bookings-status--success");
  text.textContent = message;
  banner.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    banner.hidden = true;
  }, 6000);
}

function setSaving(isSaving) {
  document.querySelectorAll("#bookings-panel [data-save-btn]").forEach((btn) => {
    if (!btn.dataset.defaultLabel) {
      btn.dataset.defaultLabel = btn.textContent;
    }
    btn.disabled = isSaving;
    btn.textContent = isSaving ? "Gemmer…" : btn.dataset.defaultLabel;
  });
}

function updateStats(bookingsCount) {
  document.getElementById("bookings-count").textContent = String(bookingsCount);
  document.getElementById("bookings-capacity-display").textContent = String(
    capacityState.defaultCapacity ?? 40
  );
  document.getElementById("closed-count").textContent = String(
    (capacityState.closedDates || []).length
  );

  const toggleCount = document.getElementById("bookings-list-toggle-count");
  if (toggleCount) {
    toggleCount.textContent = String(bookingsCount);
  }
}

function renderHoursGrid(container, selectedHours, { namePrefix = "hour" } = {}) {
  if (!container) return;
  const selected = new Set(normalizeHours(selectedHours));
  container.innerHTML = "";

  ALL_BOOKING_HOURS.forEach((hour) => {
    const label = document.createElement("label");
    label.className = "admin-hours-option";
    label.innerHTML = `
      <input type="checkbox" name="${namePrefix}" value="${hour}" ${selected.has(hour) ? "checked" : ""}>
      <span>${hour}</span>
    `;
    container.appendChild(label);
  });
}

function getCheckedHoursFromGrid(container) {
  if (!container) return [];
  return normalizeHours(
    [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value)
  );
}

function renderDefaultHoursForm() {
  renderHoursGrid(document.getElementById("default-hours-grid"), getDefaultHours(), {
    namePrefix: "default-hour",
  });
  renderHoursGrid(document.getElementById("bulk-hours-grid"), getDefaultHours(), {
    namePrefix: "bulk-hour",
  });
}

function updateBulkUi() {
  const count = bookingsView.bulkSelectedDates.length;
  const hasSelection = count > 0;
  const countEl = document.getElementById("bulk-selected-count");
  if (countEl) {
    countEl.textContent = count === 1 ? "1 dag valgt" : `${count} dage valgt`;
  }

  [
    "bulk-open-days",
    "bulk-close-days",
    "bulk-apply-capacity",
    "bulk-clear-capacity",
    "bulk-apply-hours",
    "bulk-reset-hours",
    "bulk-clear-selection",
  ].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = !hasSelection;
  });
}

function toggleBulkDate(date) {
  const selected = new Set(bookingsView.bulkSelectedDates);
  if (selected.has(date)) {
    selected.delete(date);
  } else {
    selected.add(date);
  }
  bookingsView.bulkSelectedDates = [...selected].sort();
  updateBulkUi();
  renderCalendar();
}

function clearBulkSelection() {
  bookingsView.bulkSelectedDates = [];
  updateBulkUi();
  renderCalendar();
}

function selectDayForList(date) {
  bookingsView.selectedDate = date;
  bookingsView.dateFilter = date;
  bookingsView.page = 1;
  const filter = document.getElementById("bookings-date-filter");
  if (filter) filter.value = date;
  refreshBookingsView();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTodayIso() {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

function getBookingCountsByDate() {
  const counts = {};
  allBookings.forEach((booking) => {
    if (!booking.date) return;
    counts[booking.date] = (counts[booking.date] || 0) + 1;
  });
  return counts;
}

function sortBookings(bookings, sortKey) {
  const sorted = [...bookings];
  sorted.sort((a, b) => {
    if (sortKey === "paid-desc") {
      return String(b.paidAt || "").localeCompare(String(a.paidAt || ""));
    }

    const aKey = `${a.date || ""}T${a.time || ""}`;
    const bKey = `${b.date || ""}T${b.time || ""}`;
    if (sortKey === "date-asc") return aKey.localeCompare(bKey);
    return bKey.localeCompare(aKey);
  });
  return sorted;
}

function getFilteredBookings() {
  let bookings = [...allBookings];
  if (bookingsView.dateFilter !== "all") {
    bookings = bookings.filter((booking) => booking.date === bookingsView.dateFilter);
  }
  return sortBookings(bookings, bookingsView.sort);
}

function getBookingsForDate(date) {
  return sortBookings(
    allBookings.filter((booking) => booking.date === date),
    "date-asc"
  );
}

function parseBookingGuestCount(booking) {
  if (typeof booking?.guestCount === "number" && Number.isFinite(booking.guestCount)) {
    return booking.guestCount;
  }
  const raw = String(booking?.guests || "").trim();
  if (raw === "7+") return 7;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function formatGuestLabel(booking) {
  const raw = String(booking?.guests || booking?.guestCount || "").trim();
  if (!raw) return "—";
  if (raw === "7+") return "7+ personer";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return raw;
  return n === 1 ? "1 person" : `${n} personer`;
}

function getPaidAmountDkk(booking) {
  const n = Number(booking?.amountDkk);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatPaidAmount(booking) {
  const amount = getPaidAmountDkk(booking);
  return amount ? `${amount.toLocaleString("da-DK")} kr.` : "—";
}

function formatArrivalTime(booking) {
  return booking?.time ? `kl. ${booking.time}` : "—";
}

function formatPrintDateLabel(isoDate) {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function printGuestList(date) {
  if (!date) {
    setStatus("Vælg en dag i kalenderen for at printe gæstelisten.", "error");
    return;
  }

  const bookings = getBookingsForDate(date);
  const event = capacityState.eventsByDate?.[date] || {};
  const dateLabel = formatPrintDateLabel(date);
  const printedAt = new Date().toLocaleString("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const totalGuests = bookings.reduce((sum, booking) => sum + parseBookingGuestCount(booking), 0);
  const totalPaid = bookings.reduce((sum, booking) => sum + getPaidAmountDkk(booking), 0);
  const hasSevenPlus = bookings.some((booking) => String(booking.guests || "").trim() === "7+");
  const guestTotalLabel = `${totalGuests} gæst${totalGuests === 1 ? "" : "er"}${
    hasSevenPlus ? " (7+ tælles som 7)" : ""
  }`;
  const paidTotalLabel = totalPaid
    ? `${totalPaid.toLocaleString("da-DK")} kr. betalt i depositum`
    : "Ingen beløb registreret";

  const rows = bookings.length
    ? bookings
        .map(
          (booking) => `
            <tr>
              <td>${escapeHtml(formatArrivalTime(booking))}</td>
              <td>${escapeHtml(booking.name || "—")}</td>
              <td>${escapeHtml(formatGuestLabel(booking))}</td>
              <td>${escapeHtml(formatPaidAmount(booking))}</td>
              <td>${escapeHtml(booking.phone || "—")}</td>
              <td>${escapeHtml(booking.email || "—")}</td>
              <td>${escapeHtml(booking.message || "")}</td>
            </tr>`
        )
        .join("")
    : `<tr><td colspan="7">Ingen bookinger denne dag.</td></tr>`;

  const eventBlock =
    event.title || event.description
      ? `<p class="event"><strong>${escapeHtml(event.title || "Arrangement")}</strong>${
          event.description ? `<br>${escapeHtml(event.description)}` : ""
        }</p>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <title>Gæsteliste ${escapeHtml(dateLabel)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "DM Sans", "Segoe UI", system-ui, sans-serif; color: #141414; margin: 24px; }
    h1 { font-size: 1.35rem; margin: 0 0 0.2rem; }
    .meta, .event, .totals { color: #5e635c; margin: 0 0 0.75rem; }
    .event { margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { border: 1px solid #d8e2d8; padding: 0.45rem 0.55rem; text-align: left; vertical-align: top; }
    th { background: #f3f5f1; }
    tfoot td { font-weight: 600; background: #f3f5f1; }
    .actions { margin: 1rem 0 1.25rem; }
    .actions button { font: inherit; padding: 0.55rem 1rem; cursor: pointer; }
    @media print {
      .actions { display: none; }
      body { margin: 12mm; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Print</button></div>
  <h1>Spisehuset Gaarden — gæsteliste</h1>
  <p class="meta">${escapeHtml(dateLabel)}</p>
  <p class="totals">${bookings.length} booking${bookings.length === 1 ? "" : "er"} · ${escapeHtml(guestTotalLabel)} · ${escapeHtml(paidTotalLabel)}</p>
  ${eventBlock}
  <table>
    <thead>
      <tr>
        <th>Kommer</th>
        <th>Navn</th>
        <th>Personer</th>
        <th>Depositum</th>
        <th>Telefon</th>
        <th>Email</th>
        <th>Bemærkninger</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">${bookings.length} booking${bookings.length === 1 ? "" : "er"}</td>
        <td>${escapeHtml(guestTotalLabel)}</td>
        <td colspan="4">${escapeHtml(paidTotalLabel)}</td>
      </tr>
    </tfoot>
  </table>
  <p class="meta">Printet ${escapeHtml(printedAt)}</p>
  <script>
    window.addEventListener("load", function () {
      window.focus();
      window.print();
    });
  <\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=980,height=720");
  if (!win) {
    setStatus("Tillad pop-up-vinduer for at printe gæstelisten.", "error");
    return;
  }
  win.opener = null;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function renderBookingCards(container, bookings) {
  if (!container) return;
  container.innerHTML = "";

  if (!bookings.length) {
    container.innerHTML = '<p class="admin-muted">Ingen bookinger denne dag.</p>';
    return;
  }

  bookings.forEach((booking) => {
    const item = document.createElement("article");
    item.className = "admin-bookings-day-item";
    item.innerHTML = `
      <div class="admin-bookings-day-item__time">${escapeHtml(formatArrivalTime(booking))}</div>
      <div>
        <strong>${escapeHtml(booking.name || "—")}</strong>
        <div class="admin-bookings-day-item__meta">
          ${escapeHtml(formatGuestLabel(booking))}
          ${getPaidAmountDkk(booking) ? ` · ${escapeHtml(formatPaidAmount(booking))} betalt` : ""}
        </div>
        <div class="admin-bookings-day-item__meta">
          ${escapeHtml(booking.phone || "—")}${booking.email ? ` · ${escapeHtml(booking.email)}` : ""}
        </div>
      </div>
    `;
    if (booking.message) item.title = booking.message;
    container.appendChild(item);
  });
}

function renderBookingRow(booking) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${escapeHtml(formatDateLabel(booking.date))}</td>
    <td>${escapeHtml(booking.time || "—")}</td>
    <td>${escapeHtml(booking.name || "—")}</td>
    <td>${escapeHtml(booking.guests || booking.guestCount || "—")}</td>
    <td>
      <div class="admin-table__stack">
        <a href="mailto:${escapeHtml(booking.email || "")}">${escapeHtml(booking.email || "—")}</a>
        <span>${escapeHtml(booking.phone || "")}</span>
      </div>
    </td>
    <td>${escapeHtml(formatDateTime(booking.paidAt))}</td>
  `;
  if (booking.message) {
    row.title = booking.message;
  }
  return row;
}

function renderDateFilterOptions() {
  const select = document.getElementById("bookings-date-filter");
  if (!select) return;

  const current = bookingsView.dateFilter;
  const dates = [...new Set(allBookings.map((b) => b.date).filter(Boolean))].sort((a, b) =>
    b.localeCompare(a)
  );

  select.innerHTML = '<option value="all">Alle datoer</option>';
  dates.forEach((date) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = formatDateLabel(date);
    select.appendChild(option);
  });

  select.value = dates.includes(current) || current === "all" ? current : "all";
  if (select.value !== current) {
    bookingsView.dateFilter = select.value;
  }
}

function renderCalendar() {
  const container = document.getElementById("bookings-calendar");
  const title = document.getElementById("bookings-cal-title");
  if (!container || !title) return;

  const { calendarYear, calendarMonth, selectedDate, bulkSelectMode, bulkSelectedDates } = bookingsView;
  const monthDate = new Date(calendarYear, calendarMonth, 1);
  title.textContent = monthDate.toLocaleDateString("da-DK", { month: "long", year: "numeric" });

  const counts = getBookingCountsByDate();
  const todayIso = getTodayIso();
  const closedDates = new Set(capacityState.closedDates || []);
  const bulkSelected = new Set(bulkSelectedDates);
  const firstWeekday = (monthDate.getDay() + 6) % 7;
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  container.innerHTML = "";

  WEEKDAY_LABELS.forEach((label) => {
    const weekday = document.createElement("div");
    weekday.className = "admin-bookings-calendar__weekday";
    weekday.textContent = label;
    container.appendChild(weekday);
  });

  for (let i = 0; i < firstWeekday; i += 1) {
    const pad = document.createElement("div");
    pad.className = "admin-bookings-calendar__pad";
    pad.setAttribute("aria-hidden", "true");
    container.appendChild(pad);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toIsoDate(calendarYear, calendarMonth, day);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-bookings-calendar__day";
    button.dataset.date = iso;

    if (iso === todayIso) button.classList.add("admin-bookings-calendar__day--today");
    if (iso === selectedDate) button.classList.add("admin-bookings-calendar__day--selected");
    if (closedDates.has(iso)) button.classList.add("admin-bookings-calendar__day--closed");
    if (bulkSelected.has(iso)) button.classList.add("admin-bookings-calendar__day--bulk-selected");

    const count = counts[iso] || 0;
    const closed = closedDates.has(iso);
    const customHours = hasCustomHours(iso);
    const capacity = getCapacityForDate(iso);
    const badges = [];

    if (closed) {
      badges.push('<span class="admin-bookings-calendar__badge admin-bookings-calendar__badge--closed">Lukket</span>');
    } else if (count) {
      badges.push(`<span class="admin-bookings-calendar__badge">${count} booking${count === 1 ? "" : "er"}</span>`);
    }

    if (customHours && !closed) {
      badges.push('<span class="admin-bookings-calendar__badge admin-bookings-calendar__badge--hours">Egne timer</span>');
    }

    const event = capacityState.eventsByDate?.[iso];
    if (event) {
      badges.push(`<span class="admin-bookings-calendar__badge admin-bookings-calendar__badge--event">${escapeHtml(event.title || "Event")}</span>`);
    }

    button.innerHTML = `
      <div class="admin-bookings-calendar__day-top">
        <span class="admin-bookings-calendar__day-num">${day}</span>
        ${count ? `<span class="admin-bookings-calendar__count">${count}</span>` : ""}
      </div>
      <div class="admin-bookings-calendar__meta">
        ${badges.join("")}
        ${!closed ? `<span class="admin-bookings-calendar__capacity">Max ${capacity}</span>` : ""}
      </div>
    `;

    button.addEventListener("click", () => {
      if (bulkSelectMode) {
        toggleBulkDate(iso);
        return;
      }
      openDayModal(iso);
      selectDayForList(iso);
    });

    container.appendChild(button);
  }
}

function renderDayPanel() {
  const panel = document.getElementById("bookings-day-panel");
  const title = document.getElementById("bookings-day-title");
  const list = document.getElementById("bookings-day-list");
  if (!panel || !title || !list) return;

  const { selectedDate } = bookingsView;
  if (!selectedDate) {
    panel.hidden = true;
    list.innerHTML = "";
    return;
  }

  title.textContent = `Bookinger ${formatDateLabel(selectedDate)}`;
  renderBookingCards(list, getBookingsForDate(selectedDate));
  panel.hidden = false;
}

function openDayModal(date) {
  const modal = document.getElementById("day-settings-modal");
  if (!modal) return;

  bookingsView.modalDate = date;
  document.getElementById("day-modal-title").textContent = formatDateLabel(date);
  document.getElementById("day-modal-closed").checked = (capacityState.closedDates || []).includes(date);

  const capacityInput = document.getElementById("day-modal-capacity");
  const hasOverride = capacityState.capacityByDate?.[date] !== undefined;
  capacityInput.value = hasOverride ? String(capacityState.capacityByDate[date]) : "";
  document.getElementById("day-modal-capacity-hint").textContent = hasOverride
    ? `Standard er ${capacityState.defaultCapacity} personer.`
    : `Bruger standard på ${capacityState.defaultCapacity} personer.`;

  renderHoursGrid(document.getElementById("day-modal-hours-grid"), getHoursForDate(date), {
    namePrefix: "day-hour",
  });

  const event = capacityState.eventsByDate?.[date] || {};
  const eventTitleInput = document.getElementById("day-modal-event-title");
  const eventTextInput = document.getElementById("day-modal-event-text");
  if (eventTitleInput) eventTitleInput.value = event.title || "";
  if (eventTextInput) eventTextInput.value = event.description || "";

  document.getElementById("day-modal-bookings-title").textContent = `Bookinger ${formatDateLabel(date)}`;
  renderBookingCards(
    document.getElementById("day-modal-bookings-list"),
    getBookingsForDate(date)
  );

  if (typeof modal.showModal === "function") {
    modal.showModal();
  } else {
    modal.setAttribute("open", "open");
  }
}

function closeDayModal() {
  const modal = document.getElementById("day-settings-modal");
  if (!modal) return;
  bookingsView.modalDate = null;
  if (typeof modal.close === "function") {
    modal.close();
  } else {
    modal.removeAttribute("open");
  }
}

async function saveDayModal() {
  const date = bookingsView.modalDate;
  if (!date) return;

  const closed = document.getElementById("day-modal-closed").checked;
  const capacityValue = document.getElementById("day-modal-capacity").value.trim();
  const hours = getCheckedHoursFromGrid(document.getElementById("day-modal-hours-grid"));

  if (!hours.length) {
    setStatus("Vælg mindst ét tidspunkt.", "error");
    return;
  }

  const settings = {
    date,
    closed,
    hours,
  };

  if (capacityValue === "") {
    settings.clearCapacity = true;
  } else {
    const capacity = Number(capacityValue);
    if (!Number.isFinite(capacity) || capacity < 0) {
      setStatus("Angiv et gyldigt antal personer.", "error");
      return;
    }
    settings.capacity = capacity;
  }

  if (hoursEqual(hours, getDefaultHours())) {
    settings.clearHours = true;
    delete settings.hours;
  }

  const eventTitle = document.getElementById("day-modal-event-title")?.value.trim() || "";
  const eventDescription = document.getElementById("day-modal-event-text")?.value.trim() || "";
  if (eventTitle || eventDescription) {
    settings.event = {
      title: eventTitle,
      description: eventDescription,
    };
  } else {
    settings.clearEvent = true;
  }

  const result = await saveSettings(
    { dateSettings: settings },
    `${formatDateLabel(date)} er opdateret.`
  );

  if (result) {
    closeDayModal();
  }
}

async function applyBulkAction(action) {
  const dates = [...bookingsView.bulkSelectedDates];
  if (!dates.length) return;

  let payload = { bulkDates: dates };
  let message = "Valgte dage er opdateret.";

  if (action === "open") {
    payload.bulkClosed = false;
    message = `${dates.length} dag${dates.length === 1 ? "" : "e"} er åbnet.`;
  } else if (action === "close") {
    payload.bulkClosed = true;
    message = `${dates.length} dag${dates.length === 1 ? "" : "e"} er lukket.`;
  } else if (action === "capacity") {
    const capacity = Number(document.getElementById("bulk-capacity").value);
    if (!Number.isFinite(capacity) || capacity < 0) {
      setStatus("Angiv en gyldig kapacitet til masseændring.", "error");
      return;
    }
    payload.bulkCapacity = capacity;
    message = `Kapacitet sat til ${capacity} for ${dates.length} dag${dates.length === 1 ? "" : "e"}.`;
  } else if (action === "clear-capacity") {
    payload.bulkClearCapacity = true;
    message = `Kapacitetssærregler fjernet for ${dates.length} dag${dates.length === 1 ? "" : "e"}.`;
  } else if (action === "hours") {
    const hours = getCheckedHoursFromGrid(document.getElementById("bulk-hours-grid"));
    if (!hours.length) {
      setStatus("Vælg mindst ét tidspunkt til masseændring.", "error");
      return;
    }
    payload.bulkHours = hours;
    message = `Timer opdateret for ${dates.length} dag${dates.length === 1 ? "" : "e"}.`;
  } else if (action === "reset-hours") {
    payload.bulkClearHours = true;
    message = `Standardtider gendannet for ${dates.length} dag${dates.length === 1 ? "" : "e"}.`;
  }

  const result = await saveSettings(payload, message);
  if (result) {
    clearBulkSelection();
  }
}

function renderBookingsList() {
  const wrap = document.getElementById("bookings-table-wrap");
  const body = document.getElementById("bookings-body");
  const empty = document.getElementById("bookings-empty");
  const pagination = document.getElementById("bookings-pagination");
  const pageInfo = document.getElementById("bookings-page-info");
  const prevBtn = document.getElementById("bookings-page-prev");
  const nextBtn = document.getElementById("bookings-page-next");

  if (!wrap || !body || !empty) return;

  const filtered = getFilteredBookings();
  const total = filtered.length;
  const pageSize = bookingsView.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (bookingsView.page > totalPages) {
    bookingsView.page = totalPages;
  }

  const start = (bookingsView.page - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  body.innerHTML = "";
  updateStats(allBookings.length);

  if (!allBookings.length) {
    wrap.hidden = true;
    empty.hidden = false;
    if (pagination) pagination.hidden = true;
    empty.textContent = "Ingen betalte bookinger endnu.";
    return;
  }

  if (!total) {
    wrap.hidden = true;
    empty.hidden = false;
    if (pagination) pagination.hidden = true;
    empty.textContent =
      bookingsView.dateFilter === "all"
        ? "Ingen bookinger matcher filteret."
        : `Ingen bookinger for ${formatDateLabel(bookingsView.dateFilter)}.`;
    return;
  }

  empty.hidden = true;
  wrap.hidden = false;
  pageItems.forEach((booking) => body.appendChild(renderBookingRow(booking)));

  if (pagination && pageInfo && prevBtn && nextBtn) {
    pagination.hidden = total <= pageSize;
    pageInfo.textContent = `Side ${bookingsView.page} af ${totalPages} · ${total} booking${total === 1 ? "" : "er"}`;
    prevBtn.disabled = bookingsView.page <= 1;
    nextBtn.disabled = bookingsView.page >= totalPages;
  }
}

function getBookingsForMonth(year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  return sortBookings(
    allBookings.filter((booking) => booking.date && booking.date.startsWith(`${monthKey}-`)),
    "date-asc"
  );
}

function renderMonthBookingsList() {
  const container = document.getElementById("bookings-month-list");
  const title = document.getElementById("bookings-month-list-title");
  if (!container || !title) return;

  const { calendarYear, calendarMonth } = bookingsView;
  const monthDate = new Date(calendarYear, calendarMonth, 1);
  const monthBookings = getBookingsForMonth(calendarYear, calendarMonth);

  title.textContent = `Bookinger i ${monthDate.toLocaleDateString("da-DK", {
    month: "long",
    year: "numeric",
  })}`;

  container.innerHTML = "";

  if (!monthBookings.length) {
    container.innerHTML = '<p class="admin-muted">Ingen bookinger denne måned.</p>';
    return;
  }

  const list = document.createElement("ul");
  list.className = "admin-bookings-month-list__items";

  const byDate = new Map();
  monthBookings.forEach((booking) => {
    if (!byDate.has(booking.date)) {
      byDate.set(booking.date, []);
    }
    byDate.get(booking.date).push(booking);
  });

  [...byDate.keys()].sort().forEach((date) => {
    byDate.get(date).forEach((booking) => {
      const item = document.createElement("li");
      item.className = "admin-bookings-month-list__item";
      item.innerHTML = `
        <span class="admin-bookings-month-list__date">${escapeHtml(formatDateLabel(date))}</span>
        <span class="admin-bookings-month-list__time">${escapeHtml(booking.time || "—")}</span>
        <span class="admin-bookings-month-list__name">${escapeHtml(booking.name || "—")}</span>
        <span class="admin-bookings-month-list__guests">${escapeHtml(booking.guests || booking.guestCount || "—")} pers.</span>
      `;
      item.addEventListener("click", () => {
        openDayModal(date);
        selectDayForList(date);
      });
      if (booking.message) item.title = booking.message;
      list.appendChild(item);
    });
  });

  container.appendChild(list);
}

function refreshBookingsView() {
  renderDateFilterOptions();
  renderCalendar();
  renderMonthBookingsList();
  renderDayPanel();
  renderBookingsList();
  updateBulkUi();
}

function setAllBookings(bookings) {
  allBookings = Array.isArray(bookings) ? bookings : [];
  refreshBookingsView();
}

function applyCapacityState(data) {
  capacityState = {
    defaultCapacity: data.defaultCapacity ?? 40,
    capacityByDate: data.capacityByDate || {},
    closedDates: data.closedDates || [],
    defaultBookingHours: normalizeHours(data.defaultBookingHours),
    hoursByDate: data.hoursByDate || {},
    eventsByDate: data.eventsByDate || {},
  };

  document.getElementById("default-capacity").value = capacityState.defaultCapacity;
  renderDefaultHoursForm();
  renderCalendar();
  renderMonthBookingsList();
  updateStats(allBookings.length);
}

async function saveSettings(payload, successMessage) {
  setSaving(true);
  try {
    const res = await fetch("/api/admin/capacity", {
      method: "PUT",
      headers: authHeaders(),
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Kunne ikke gemme ændringerne");
    }

    applyCapacityState(data);
    setStatus(successMessage || "Ændringerne er gemt og live på siden.");
    setActionFeedback(successMessage || "Ændringerne er gemt og live på siden.", "success");
    await loadBookingsAdmin({ quiet: true });
    return data;
  } catch (err) {
    const message = err.message || "Kunne ikke gemme";
    setStatus(message, "error");
    setActionFeedback(message, "error");
    return null;
  } finally {
    setSaving(false);
  }
}

async function saveDefaultCapacity() {
  const defaultCapacity = Number(document.getElementById("default-capacity").value);
  if (!Number.isFinite(defaultCapacity) || defaultCapacity < 0) {
    setStatus("Angiv et gyldigt antal personer.", "error");
    return;
  }
  await saveSettings(
    { defaultCapacity },
    `Standard kapacitet sat til ${defaultCapacity} personer.`
  );
}

async function saveDefaultHours() {
  const hours = getCheckedHoursFromGrid(document.getElementById("default-hours-grid"));
  if (!hours.length) {
    setStatus("Vælg mindst ét standardtidspunkt.", "error");
    return;
  }
  await saveSettings({ defaultBookingHours: hours }, "Standard bookingstider er gemt.");
}

async function loadBookingsAdmin(options = {}) {
  const { quiet = false } = options;
  const loading = document.getElementById("bookings-loading");
  const empty = document.getElementById("bookings-empty");
  const wrap = document.getElementById("bookings-table-wrap");
  const refreshBtn = document.getElementById("refresh-bookings-btn");

  if (!quiet) {
    await checkBookingStorage();
    setActionFeedback("");
  }

  if (!quiet) {
    loading.hidden = false;
    empty.hidden = true;
    wrap.hidden = true;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Opdaterer…";
    }
  }

  try {
    const fetchOptions = { headers: authHeaders(), cache: "no-store" };
    const [bookingsRes, capacityRes] = await Promise.all([
      fetch("/api/admin/bookings", fetchOptions),
      fetch("/api/admin/capacity", fetchOptions),
    ]);

    if (bookingsRes.status === 401 || capacityRes.status === 401) {
      throw new Error("Du er logget ud. Log ind igen.");
    }
    if (!bookingsRes.ok || !capacityRes.ok) {
      const errBody = await (bookingsRes.ok ? capacityRes : bookingsRes).json().catch(() => ({}));
      throw new Error(errBody.error || "Kunne ikke hente booking-data. Prøv at opdatere siden.");
    }

    const bookingsData = await bookingsRes.json();
    const capacityData = await capacityRes.json();

    applyCapacityState(capacityData);
    setAllBookings(bookingsData.bookings || []);
    empty.textContent = "Ingen betalte bookinger endnu.";

    if (!quiet && !(bookingsData.bookings || []).length) {
      setActionFeedback("Listen er opdateret. Der er ingen betalte bookinger endnu.", "info");
    }
  } catch (err) {
    const message = err.message || "Kunne ikke indlæse bookinger.";
    setActionFeedback(message, "error");
    if (!quiet) {
      setStatus(message, "error");
    }
    empty.hidden = false;
    empty.textContent = message;
    wrap.hidden = true;
  } finally {
    loading.hidden = true;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Opdater liste";
    }
  }
}

function wireBookingsPanel() {
  const panel = document.getElementById("bookings-panel");
  if (!panel) return;

  panel.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  });

  document.getElementById("bulk-select-mode")?.addEventListener("change", (event) => {
    bookingsView.bulkSelectMode = event.target.checked;
    document
      .getElementById("bookings-calendar")
      ?.classList.toggle("admin-bookings-calendar--bulk-mode", bookingsView.bulkSelectMode);
    document
      .getElementById("calendar-bulk-bar")
      ?.classList.toggle("admin-calendar-bulk--active", bookingsView.bulkSelectMode);
    if (!bookingsView.bulkSelectMode) {
      clearBulkSelection();
    } else {
      renderCalendar();
    }
  });

  document.getElementById("bulk-open-days")?.addEventListener("click", () => applyBulkAction("open"));
  document.getElementById("bulk-close-days")?.addEventListener("click", () => applyBulkAction("close"));
  document.getElementById("bulk-apply-capacity")?.addEventListener("click", () => applyBulkAction("capacity"));
  document.getElementById("bulk-clear-capacity")?.addEventListener("click", () => applyBulkAction("clear-capacity"));
  document.getElementById("bulk-apply-hours")?.addEventListener("click", () => applyBulkAction("hours"));
  document.getElementById("bulk-reset-hours")?.addEventListener("click", () => applyBulkAction("reset-hours"));
  document.getElementById("bulk-clear-selection")?.addEventListener("click", clearBulkSelection);

  document.getElementById("bookings-list-toggle")?.addEventListener("click", () => {
    const body = document.getElementById("bookings-list-body");
    const toggle = document.getElementById("bookings-list-toggle");
    if (!body || !toggle) return;

    const isOpen = !body.hidden;
    body.hidden = isOpen;
    toggle.setAttribute("aria-expanded", String(!isOpen));
    toggle.querySelector("span").textContent = isOpen ? "Vis alle bookinger" : "Skjul bookingliste";
  });

  document.getElementById("day-modal-close")?.addEventListener("click", closeDayModal);
  document.getElementById("day-modal-cancel")?.addEventListener("click", closeDayModal);
  document.getElementById("day-modal-print")?.addEventListener("click", () => {
    printGuestList(bookingsView.modalDate);
  });
  document.getElementById("bookings-day-print")?.addEventListener("click", () => {
    printGuestList(bookingsView.selectedDate);
  });
  document.getElementById("day-modal-save")?.addEventListener("click", (event) => {
    event.preventDefault();
    saveDayModal();
  });
  document.getElementById("day-settings-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDayModal();
  });
  document.getElementById("day-modal-reset-hours")?.addEventListener("click", () => {
    renderHoursGrid(document.getElementById("day-modal-hours-grid"), getDefaultHours(), {
      namePrefix: "day-hour",
    });
  });
  document.getElementById("day-settings-modal")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDayModal();
  });

  document.getElementById("bookings-cal-prev")?.addEventListener("click", () => {
    bookingsView.calendarMonth -= 1;
    if (bookingsView.calendarMonth < 0) {
      bookingsView.calendarMonth = 11;
      bookingsView.calendarYear -= 1;
    }
    renderCalendar();
    renderMonthBookingsList();
  });

  document.getElementById("bookings-cal-next")?.addEventListener("click", () => {
    bookingsView.calendarMonth += 1;
    if (bookingsView.calendarMonth > 11) {
      bookingsView.calendarMonth = 0;
      bookingsView.calendarYear += 1;
    }
    renderCalendar();
    renderMonthBookingsList();
  });

  document.getElementById("bookings-day-clear")?.addEventListener("click", () => {
    bookingsView.selectedDate = null;
    bookingsView.dateFilter = "all";
    bookingsView.page = 1;
    const filter = document.getElementById("bookings-date-filter");
    if (filter) filter.value = "all";
    refreshBookingsView();
  });

  document.getElementById("bookings-sort")?.addEventListener("change", (e) => {
    bookingsView.sort = e.target.value;
    bookingsView.page = 1;
    renderBookingsList();
  });

  document.getElementById("bookings-page-size")?.addEventListener("change", (e) => {
    bookingsView.pageSize = Number(e.target.value) || 20;
    bookingsView.page = 1;
    renderBookingsList();
  });

  document.getElementById("bookings-date-filter")?.addEventListener("change", (e) => {
    bookingsView.dateFilter = e.target.value;
    bookingsView.page = 1;
    if (bookingsView.dateFilter === "all") {
      bookingsView.selectedDate = null;
    } else {
      bookingsView.selectedDate = bookingsView.dateFilter;
      const [year, month] = bookingsView.dateFilter.split("-").map(Number);
      bookingsView.calendarYear = year;
      bookingsView.calendarMonth = month - 1;
    }
    refreshBookingsView();
  });

  document.getElementById("bookings-page-prev")?.addEventListener("click", () => {
    if (bookingsView.page > 1) {
      bookingsView.page -= 1;
      renderBookingsList();
    }
  });

  document.getElementById("bookings-page-next")?.addEventListener("click", () => {
    bookingsView.page += 1;
    renderBookingsList();
  });

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-save-action]");
    if (!button || button.disabled) return;

    const action = button.dataset.saveAction;
    if (action === "default-capacity") saveDefaultCapacity();
    if (action === "default-hours") saveDefaultHours();
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    const form = field.closest("form");
    if (!form || !panel.contains(form)) return;

    event.preventDefault();
    const action = form.querySelector("[data-save-action]")?.dataset.saveAction;
    if (action === "default-capacity") saveDefaultCapacity();
    if (action === "default-hours") saveDefaultHours();
  });

  renderDefaultHoursForm();
  updateBulkUi();
}

document.getElementById("refresh-bookings-btn")?.addEventListener("click", () => {
  loadBookingsAdmin();
});

document.getElementById("sync-bookings-btn")?.addEventListener("click", () => {
  syncBookingsFromStripe();
});

wireBookingsPanel();
window.loadBookingsAdmin = loadBookingsAdmin;
