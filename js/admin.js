const TOKEN_KEY = "sg-admin-token";
const TAB_KEY = "sg-admin-tab";

const MENU_CONFIG = {
  cafe: {
    formId: "cafe-menu-form",
    publicApi: "/api/menu",
    saveApi: "/api/admin/menu",
    uploadKind: "menu",
    defaultTitle: "Frokostmenu",
  },
  faellesspisning: {
    formId: "faellesspisning-menu-form",
    publicApi: "/api/faellesspisning-menu",
    saveApi: "/api/admin/faellesspisning-menu",
    uploadKind: "faellesspisning",
    defaultTitle: "Månedens menu",
  },
  arrangementer: {
    formId: "arrangementer-menu-form",
    publicApi: "/api/arrangementer-menu",
    saveApi: "/api/admin/arrangementer-menu",
    uploadKind: "arrangementer",
    defaultTitle: "Oversigt over arrangementer",
  },
};

const loginPanel = document.getElementById("login-panel");
const editorPanel = document.getElementById("editor-panel");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const navItems = document.querySelectorAll(".admin-nav__item");
let activeTab = null;

const menuState = {
  cafe: { imageUrl: null, pendingFile: null },
  faellesspisning: { imageUrl: null, pendingFile: null },
  arrangementer: { imageUrl: null, pendingFile: null },
};

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}

function showLogin() {
  document.body.classList.remove("admin--editor");
  loginPanel.hidden = false;
  editorPanel.hidden = true;
  activeTab = null;
  sessionStorage.removeItem(TAB_KEY);
}

function showEditor() {
  document.body.classList.add("admin--editor");
  loginPanel.hidden = true;
  editorPanel.hidden = false;
  window.scrollTo(0, 0);
}

function switchTab(tabId, { scroll = true } = {}) {
  if (!tabId) return;

  const tabChanged = tabId !== activeTab;
  activeTab = tabId;
  sessionStorage.setItem(TAB_KEY, tabId);

  navItems.forEach((item) => {
    item.classList.toggle("admin-nav__item--active", item.dataset.tab === tabId);
  });

  Object.entries(MENU_CONFIG).forEach(([key, config]) => {
    const panel = document.getElementById(config.formId);
    const isActive = key === tabId;
    panel.hidden = !isActive;
    panel.classList.toggle("admin-panel--active", isActive);
  });

  const bookingsPanel = document.getElementById("bookings-panel");
  if (bookingsPanel) {
    const isBookings = tabId === "bookings";
    bookingsPanel.hidden = !isBookings;
    bookingsPanel.classList.toggle("admin-panel--active", isBookings);
    if (isBookings && typeof window.loadBookingsAdmin === "function") {
      window.loadBookingsAdmin();
    }
  }

  const communityPanel = document.getElementById("community-post-form");
  if (communityPanel) {
    const isCommunity = tabId === "faellesskab";
    communityPanel.hidden = !isCommunity;
    communityPanel.classList.toggle("admin-panel--active", isCommunity);
    if (isCommunity && typeof window.loadCommunityPostAdmin === "function") {
      window.loadCommunityPostAdmin();
    }
  }

  if (scroll && tabChanged) {
    window.scrollTo(0, 0);
  }
}

function getForm(type) {
  return document.getElementById(MENU_CONFIG[type].formId);
}

function withCacheBust(url, version) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version || Date.now())}`;
}

function showPreview(type, url, version) {
  const form = getForm(type);
  const preview = form.querySelector("[data-image-preview]");
  const img = form.querySelector("[data-preview-img]");
  if (!url) {
    preview.hidden = true;
    img.removeAttribute("src");
    return;
  }
  img.src = withCacheBust(url, version);
  preview.hidden = false;
}

async function loadMenu(type) {
  const config = MENU_CONFIG[type];
  const form = getForm(type);
  const res = await fetch(`${config.publicApi}?t=${Date.now()}`, { cache: "no-store" });
  const menu = await res.json();

  menuState[type].imageUrl = menu.imageUrl || null;
  menuState[type].pendingFile = null;
  form.querySelector('[data-field="image-file"]').value = "";
  showPreview(type, menuState[type].imageUrl, menu.updatedAt);
}

async function loadAllMenus() {
  await Promise.all(Object.keys(MENU_CONFIG).map((type) => loadMenu(type)));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(String(result).split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImageFile(file, kind) {
  const data = await fileToBase64(file);
  const res = await fetch(`/api/admin/upload?kind=${kind}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ data, filename: file.name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Upload fejlede");
  }
  return res.json();
}

function wireForm(type) {
  const config = MENU_CONFIG[type];
  const form = getForm(type);

  form.querySelector('[data-field="image-file"]').addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    menuState[type].pendingFile = file || null;
    if (file) showPreview(type, URL.createObjectURL(file));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveError = form.querySelector("[data-save-error]");
    const saveSuccess = form.querySelector("[data-save-success]");
    saveError.hidden = true;
    saveSuccess.hidden = true;

    let imageUrl = menuState[type].imageUrl;

    if (menuState[type].pendingFile) {
      try {
        const uploaded = await uploadImageFile(
          menuState[type].pendingFile,
          config.uploadKind
        );
        imageUrl = uploaded.imageUrl;
      } catch (err) {
        saveError.textContent = err.message || "Upload fejlede";
        saveError.hidden = false;
        return;
      }
    }

    if (!imageUrl) {
      saveError.textContent = "Vælg et billede før du gemmer.";
      saveError.hidden = false;
      return;
    }

    const payload = {
      title: config.defaultTitle,
      imageUrl,
    };

    const res = await fetch(config.saveApi, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      saveError.textContent = err.error || "Kunne ikke gemme";
      saveError.hidden = false;
      return;
    }

    const saved = await res.json();
    menuState[type].imageUrl = saved.imageUrl || imageUrl;
    menuState[type].pendingFile = null;
    form.querySelector('[data-field="image-file"]').value = "";
    showPreview(type, menuState[type].imageUrl, saved.updatedAt);

    saveSuccess.hidden = false;
    setTimeout(() => {
      saveSuccess.hidden = true;
    }, 4000);
  });
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const password = document.getElementById("login-password").value;
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    loginError.textContent =
      err.error ||
      (res.status === 401 ? "Forkert adgangskode" : "Kunne ikke logge ind — prøv igen");
    loginError.hidden = false;
    return;
  }

  const { token } = await res.json();
  setToken(token);
  showEditor();
  try {
    await loadAllMenus();
  } catch {
    // Open editor even if menu fetch fails.
  }
  switchTab("cafe");
});

logoutBtn.addEventListener("click", () => {
  setToken(null);
  Object.keys(menuState).forEach((key) => {
    menuState[key].pendingFile = null;
  });
  showLogin();
});

editorPanel?.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.closest("#bookings-panel")) {
    event.preventDefault();
  }
});

navItems.forEach((item) => {
  item.addEventListener("click", () => switchTab(item.dataset.tab));
});

Object.keys(MENU_CONFIG).forEach(wireForm);

function restoreEditorTab() {
  const savedTab = sessionStorage.getItem(TAB_KEY);
  const validTabs = [...Object.keys(MENU_CONFIG), "faellesskab", "bookings"];
  switchTab(validTabs.includes(savedTab) ? savedTab : "cafe", { scroll: false });
}

if (getToken()) {
  showEditor();
  loadAllMenus()
    .then(restoreEditorTab)
    .catch(showLogin);
} else {
  showLogin();
}
