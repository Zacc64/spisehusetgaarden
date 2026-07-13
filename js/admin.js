const TOKEN_KEY = "sg-admin-token";

const loginPanel = document.getElementById("login-panel");
const editorPanel = document.getElementById("editor-panel");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const menuForm = document.getElementById("menu-form");
const textPanel = document.getElementById("text-panel");
const imagePanel = document.getElementById("image-panel");
const imagePreview = document.getElementById("image-preview");
const imagePreviewImg = document.getElementById("image-preview-img");
const saveError = document.getElementById("save-error");
const saveSuccess = document.getElementById("save-success");
const logoutBtn = document.getElementById("logout-btn");

let currentImageUrl = null;
let pendingImageFile = null;

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
  loginPanel.hidden = false;
  editorPanel.hidden = true;
}

function showEditor() {
  loginPanel.hidden = true;
  editorPanel.hidden = false;
}

function setMode(mode) {
  const isText = mode === "text";
  textPanel.hidden = !isText;
  imagePanel.hidden = isText;
  document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
}

function showPreview(url) {
  if (!url) {
    imagePreview.hidden = true;
    return;
  }
  imagePreviewImg.src = url;
  imagePreview.hidden = false;
}

async function loadMenu() {
  const res = await fetch("/api/menu");
  const menu = await res.json();
  document.getElementById("menu-title").value = menu.title || "";
  document.getElementById("menu-subtitle").value = menu.subtitle || "";
  document.getElementById("menu-text").value = menu.text || "";
  currentImageUrl = menu.imageUrl || null;
  setMode(menu.mode || "text");
  showPreview(currentImageUrl);
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
    loginError.textContent = "Forkert adgangskode";
    loginError.hidden = false;
    return;
  }

  const { token } = await res.json();
  setToken(token);
  await loadMenu();
  showEditor();
});

logoutBtn.addEventListener("click", () => {
  setToken(null);
  pendingImageFile = null;
  showLogin();
});

document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener("change", () => setMode(input.value));
});

document.getElementById("menu-image-file").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  pendingImageFile = file || null;
  if (file) {
    showPreview(URL.createObjectURL(file));
  }
});

menuForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveError.hidden = true;
  saveSuccess.hidden = true;

  const mode = document.querySelector('input[name="mode"]:checked').value;
  let imageUrl = currentImageUrl;

  if (mode === "image" && pendingImageFile) {
    const formData = new FormData();
    formData.append("image", pendingImageFile);

    const uploadRes = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      saveError.textContent = err.error || "Upload fejlede";
      saveError.hidden = false;
      return;
    }

    const uploaded = await uploadRes.json();
    imageUrl = uploaded.imageUrl;
    currentImageUrl = imageUrl;
    pendingImageFile = null;
  }

  const payload = {
    mode,
    title: document.getElementById("menu-title").value,
    subtitle: document.getElementById("menu-subtitle").value,
    text: document.getElementById("menu-text").value,
    imageUrl,
  };

  const res = await fetch("/api/admin/menu", {
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

  saveSuccess.hidden = false;
  setTimeout(() => {
    saveSuccess.hidden = true;
  }, 4000);
});

if (getToken()) {
  loadMenu().then(showEditor).catch(showLogin);
} else {
  showLogin();
}
