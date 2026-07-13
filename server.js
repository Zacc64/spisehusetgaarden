require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const { readMenu, writeMenu, saveUploadedImage } = require("./lib/menu-store");
const { createToken, verifyPassword, requireAuth } = require("./lib/auth");

const app = express();
const PORT = process.env.PORT || 3456;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.use(express.json({ limit: "1mb" }));

app.get("/api/menu", (_req, res) => {
  res.json(readMenu());
});

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (!verifyPassword(password)) {
    res.status(401).json({ error: "Forkert adgangskode" });
    return;
  }
  res.json({ token: createToken() });
});

app.put("/api/admin/menu", (req, res) => {
  if (!requireAuth(req, res)) return;

  const { mode, title, subtitle, text, imageUrl } = req.body || {};
  if (mode !== "text" && mode !== "image") {
    res.status(400).json({ error: "mode skal være 'text' eller 'image'" });
    return;
  }

  const menu = {
    mode,
    title: String(title || "Frokostmenu").trim(),
    subtitle: String(subtitle || "").trim(),
    text: String(text || ""),
    imageUrl: mode === "image" ? imageUrl || null : null,
  };

  if (mode === "image" && !menu.imageUrl) {
    res.status(400).json({ error: "Upload et billede til billed-popup" });
    return;
  }

  writeMenu(menu);
  res.json(menu);
});

app.post("/api/admin/upload", upload.single("image"), (req, res) => {
  if (!requireAuth(req, res)) return;

  if (!req.file) {
    res.status(400).json({ error: "Ingen fil modtaget" });
    return;
  }

  try {
    const imageUrl = saveUploadedImage(req.file);
    res.json({ imageUrl });
  } catch (err) {
    res.status(400).json({ error: err.message || "Upload fejlede" });
  }
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(__dirname));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Spisehuset Gaarden kører på http://localhost:${PORT}`);
});
