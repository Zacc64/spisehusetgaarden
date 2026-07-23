let capacityState = {
  defaultCapacity: 40,
  capacityByDate: {},
  closedDates: [],
};

let allBookings = [];
let bookingsView = {
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  selectedDate: null,
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
}

function renderOverrides() {
  const container = document.getElementById("capacity-overrides");
  const entries = Object.entries(capacityState.capacityByDate || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML = '<p class="admin-muted">Ingen særregler endnu.</p>';
    return;
  }

  entries.forEach(([date, capacity]) => {
    const row = document.createElement("div");
    row.className = "admin-list-item";
    row.innerHTML = `
      <div>
        <strong>${formatDateLabel(date)}</strong>
        <span class="admin-muted">${capacity} personer</span>
      </div>
      <button type="button" class="admin-list-item__remove">Fjern</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      await saveSettings({ removeCapacityDate: date }, "Særregel fjernet.");
    });
    container.appendChild(row);
  });
}

function renderClosedDates() {
  const container = document.getElementById("closed-dates-list");
  const dates = [...(capacityState.closedDates || [])].sort();
  container.innerHTML = "";

  if (!dates.length) {
    container.innerHTML = '<p class="admin-muted">Ingen lukkede dage.</p>';
    return;
  }

  dates.forEach((date) => {
    const row = document.createElement("div");
    row.className = "admin-list-item admin-list-item--closed";
    row.innerHTML = `
      <div>
        <strong>${formatDateLabel(date)}</strong>
        <span class="admin-muted">Lukket for booking</span>
      </div>
      <button type="button" class="admin-list-item__remove">Åbn igen</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      await saveSettings({ removeClosedDate: date }, "Dagen er åben igen.");
    });
    container.appendChild(row);
  });
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

  const { calendarYear, calendarMonth, selectedDate } = bookingsView;
  const monthDate = new Date(calendarYear, calendarMonth, 1);
  title.textContent = monthDate.toLocaleDateString("da-DK", { month: "long", year: "numeric" });

  const counts = getBookingCountsByDate();
  const todayIso = getTodayIso();
  const closedDates = new Set(capacityState.closedDates || []);
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

    const count = counts[iso] || 0;
    button.innerHTML = `
      <span>${day}</span>
      ${count ? `<span class="admin-bookings-calendar__count">${count}</span>` : ""}
    `;

    button.addEventListener("click", () => {
      bookingsView.selectedDate = iso;
      bookingsView.dateFilter = iso;
      bookingsView.page = 1;
      const filter = document.getElementById("bookings-date-filter");
      if (filter) filter.value = iso;
      refreshBookingsView();
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

  const dayBookings = getBookingsForDate(selectedDate);
  title.textContent = `Bookinger ${formatDateLabel(selectedDate)}`;
  list.innerHTML = "";

  if (!dayBookings.length) {
    list.innerHTML = '<p class="admin-muted">Ingen bookinger denne dag.</p>';
    panel.hidden = false;
    return;
  }

  dayBookings.forEach((booking) => {
    const item = document.createElement("article");
    item.className = "admin-bookings-day-item";
    item.innerHTML = `
      <div class="admin-bookings-day-item__time">${escapeHtml(booking.time || "—")}</div>
      <div>
        <strong>${escapeHtml(booking.name || "—")}</strong>
        <div class="admin-bookings-day-item__meta">
          ${escapeHtml(booking.guests || booking.guestCount || "—")} personer
          ${booking.phone ? ` · ${escapeHtml(booking.phone)}` : ""}
        </div>
      </div>
      <div class="admin-bookings-day-item__meta">${escapeHtml(booking.email || "")}</div>
    `;
    if (booking.message) item.title = booking.message;
    list.appendChild(item);
  });

  panel.hidden = false;
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

function refreshBookingsView() {
  renderDateFilterOptions();
  renderCalendar();
  renderDayPanel();
  renderBookingsList();
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
  };

  document.getElementById("default-capacity").value = capacityState.defaultCapacity;
  renderOverrides();
  renderClosedDates();
  renderCalendar();
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

async function saveCapacityOverride() {
  const date = document.getElementById("override-date").value;
  const capacity = Number(document.getElementById("override-capacity").value);
  if (!date) {
    setStatus("Vælg en dato for særreglen.", "error");
    return;
  }
  if (!Number.isFinite(capacity) || capacity < 0) {
    setStatus("Angiv et gyldigt antal personer.", "error");
    return;
  }

  await saveSettings(
    { capacityByDate: { [date]: capacity } },
    `Særregel gemt for ${formatDateLabel(date)}.`
  );

  document.getElementById("override-date").value = "";
  document.getElementById("override-capacity").value = "";
}

async function saveClosedDate() {
  const date = document.getElementById("closed-date").value;
  if (!date) {
    setStatus("Vælg en dato der skal lukkes.", "error");
    return;
  }

  await saveSettings({ addClosedDate: date }, `${formatDateLabel(date)} er nu lukket.`);
  document.getElementById("closed-date").value = "";
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

  document.getElementById("bookings-cal-prev")?.addEventListener("click", () => {
    bookingsView.calendarMonth -= 1;
    if (bookingsView.calendarMonth < 0) {
      bookingsView.calendarMonth = 11;
      bookingsView.calendarYear -= 1;
    }
    renderCalendar();
  });

  document.getElementById("bookings-cal-next")?.addEventListener("click", () => {
    bookingsView.calendarMonth += 1;
    if (bookingsView.calendarMonth > 11) {
      bookingsView.calendarMonth = 0;
      bookingsView.calendarYear += 1;
    }
    renderCalendar();
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
    if (action === "override") saveCapacityOverride();
    if (action === "closed-date") saveClosedDate();
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
    if (action === "override") saveCapacityOverride();
    if (action === "closed-date") saveClosedDate();
  });
}

document.getElementById("refresh-bookings-btn")?.addEventListener("click", () => {
  loadBookingsAdmin();
});

document.getElementById("sync-bookings-btn")?.addEventListener("click", () => {
  syncBookingsFromStripe();
});

wireBookingsPanel();
window.loadBookingsAdmin = loadBookingsAdmin;
