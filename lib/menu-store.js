const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MENU_PATH = path.join(ROOT, "data", "menu.json");
const UPLOADS_DIR = path.join(ROOT, "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function getDefaultMenu() {
  return {
    mode: "text",
    title: "Frokostmenu",
    subtitle: "Café — torsdag, fredag og lørdag kl. 11–16",
    text: "",
    imageUrl: null,
  };
}

function readMenu() {
  try {
    const raw = fs.readFileSync(MENU_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return getDefaultMenu();
  }
}

function writeMenu(menu) {
  const dir = path.dirname(MENU_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(MENU_PATH, JSON.stringify(menu, null, 2), "utf8");
  return menu;
}

function saveUploadedImage(file) {
  ensureUploadsDir();
  const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  if (!allowed.includes(ext)) {
    throw new Error("Kun billedfiler (jpg, png, webp, gif) er tilladt.");
  }

  const filename = `menu-${Date.now()}${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(dest, file.buffer);
  return `/uploads/${filename}`;
}

module.exports = {
  readMenu,
  writeMenu,
  saveUploadedImage,
  UPLOADS_DIR,
};
