const TOKEN_KEY = "sg-admin-token";

let capacityState = {
  defaultCapacity: 40,
  capacityByDate: {},
  closedDates: [],
};

let statusTimer = null;

function authHeaders() {
  return {
    Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}`,
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

function renderBookings(bookings) {
  const wrap = document.getElementById("bookings-table-wrap");
  const body = document.getElementById("bookings-body");
  const empty = document.getElementById("bookings-empty");

  body.innerHTML = "";
  updateStats(bookings.length);

  if (!bookings.length) {
    wrap.hidden = true;
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  wrap.hidden = false;

  bookings.forEach((booking) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDateLabel(booking.date)}</td>
      <td>${booking.time || "—"}</td>
      <td>${booking.name || "—"}</td>
      <td>${booking.guests || booking.guestCount || "—"}</td>
      <td>
        <div class="admin-table__stack">
          <a href="mailto:${booking.email || ""}">${booking.email || "—"}</a>
          <span>${booking.phone || ""}</span>
        </div>
      </td>
      <td>${formatDateTime(booking.paidAt)}</td>
    `;
    if (booking.message) {
      row.title = booking.message;
    }
    body.appendChild(row);
  });
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
  updateStats(document.getElementById("bookings-body").children.length);
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
    await loadBookingsAdmin({ quiet: true });
    return data;
  } catch (err) {
    setStatus(err.message || "Kunne ikke gemme", "error");
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

  if (!quiet) {
    loading.hidden = false;
    empty.hidden = true;
    wrap.hidden = true;
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
      const errBody = await bookingsRes.json().catch(() => ({}));
      throw new Error(errBody.error || "Kunne ikke hente booking-data. Prøv at opdatere siden.");
    }

    const bookingsData = await bookingsRes.json();
    const capacityData = await capacityRes.json();

    applyCapacityState(capacityData);
    renderBookings(bookingsData.bookings || []);
    empty.textContent = "Ingen betalte bookinger endnu.";
  } catch (err) {
    if (!quiet) {
      setStatus(err.message || "Kunne ikke indlæse bookinger", "error");
    }
    empty.hidden = false;
    empty.textContent = err.message || "Kunne ikke indlæse bookinger.";
    wrap.hidden = true;
  } finally {
    loading.hidden = true;
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

wireBookingsPanel();
window.loadBookingsAdmin = loadBookingsAdmin;
