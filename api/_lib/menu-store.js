const fs = require("fs");
const path = require("path");

const DEFAULT_MENU = {
  mode: "text",
  title: "Frokostmenu",
  subtitle: "Café — torsdag, fredag og lørdag kl. 11–16",
  text:
    "Dagens ret\nHjemmelavet suppe eller salat\n\nBrød & smør inkluderet\n\nSpørg os om dagens dessert og drikkevarer.",
  imageUrl: null,
};

function getMenuPaths() {
  return [
    path.join(process.cwd(), "data", "menu.json"),
    path.join(__dirname, "..", "..", "data", "menu.json"),
    path.join(__dirname, "..", "data", "menu.json"),
  ];
}

function getUploadsDir() {
  const candidates = [
    path.join(process.cwd(), "uploads"),
    path.join(__dirname, "..", "..", "uploads"),
  ];
  return candidates[0];
}

function readMenu() {
  for (const menuPath of getMenuPaths()) {
    try {
      if (fs.existsSync(menuPath)) {
        return JSON.parse(fs.readFileSync(menuPath, "utf8"));
      }
    } catch {
      // try next path
    }
  }
  return { ...DEFAULT_MENU };
}

function writeMenu(menu) {
  const menuPath = getMenuPaths()[0];
  const dir = path.dirname(menuPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(menuPath, JSON.stringify(menu, null, 2), "utf8");
  return menu;
}

function saveUploadedImage(file) {
  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  if (!allowed.includes(ext)) {
    throw new Error("Kun billedfiler (jpg, png, webp, gif) er tilladt.");
  }

  const filename = `menu-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
}

module.exports = {
  readMenu,
  writeMenu,
  saveUploadedImage,
  DEFAULT_MENU,
};
