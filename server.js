require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const { readMenu, writeMenu, saveUploadedImage } = require("./api/_lib/menu-store");
const { createToken, verifyPassword, requireAuth } = require("./api/_lib/auth");

const app = express();
const PORT = process.env.PORT || 3456;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.use(express.json({ limit: "1mb" }));

function buildMenuPayload(body, defaultTitle) {
  const { mode, title, subtitle, text, imageUrl } = body || {};
  if (mode !== "text" && mode !== "image") {
    return { error: "mode skal være 'text' eller 'image'" };
  }

  const menu = {
    mode,
    title: String(title || defaultTitle).trim(),
    subtitle: String(subtitle || "").trim(),
    text: String(text || ""),
    imageUrl: mode === "image" ? imageUrl || null : null,
  };

  if (mode === "image" && !menu.imageUrl) {
    return { error: "Upload et billede til billed-popup" };
  }

  return { menu };
}

app.get("/api/menu", async (_req, res) => {
  res.json(await readMenu("cafe"));
});

app.get("/api/faellesspisning-menu", async (_req, res) => {
  res.json(await readMenu("faellesspisning"));
});

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (!verifyPassword(password)) {
    res.status(401).json({ error: "Forkert adgangskode" });
    return;
  }
  res.json({ token: createToken() });
});

app.put("/api/admin/menu", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const result = buildMenuPayload(req.body, "Frokostmenu");
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(await writeMenu("cafe", result.menu));
});

app.put("/api/admin/faellesspisning-menu", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const result = buildMenuPayload(req.body, "Månedens menu");
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(await writeMenu("faellesspisning", result.menu));
});

app.post("/api/admin/upload", upload.single("image"), async (req, res) => {
  if (!requireAuth(req, res)) return;

  if (!req.file) {
    res.status(400).json({ error: "Ingen fil modtaget" });
    return;
  }

  try {
    const prefix = String(req.query.kind || "menu").replace(/[^a-z0-9-]/gi, "") || "menu";
    const imageUrl = await saveUploadedImage(req.file, prefix);
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
