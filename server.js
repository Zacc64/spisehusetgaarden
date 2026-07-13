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

app.use(express.json({ limit: "12mb" }));

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

app.get("/api/menu", async (req, res) => {
  res.json(await readMenu("cafe", req));
});

app.get("/api/faellesspisning-menu", async (req, res) => {
  res.json(await readMenu("faellesspisning", req));
});

app.get("/api/arrangementer-menu", async (req, res) => {
  res.json(await readMenu("arrangementer", req));
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
  res.json(await writeMenu("cafe", result.menu, req));
});

app.put("/api/admin/faellesspisning-menu", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const result = buildMenuPayload(req.body, "Månedens menu");
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(await writeMenu("faellesspisning", result.menu, req));
});

app.put("/api/admin/arrangementer-menu", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const result = buildMenuPayload(req.body, "Oversigt over arrangementer");
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(await writeMenu("arrangementer", result.menu, req));
});

app.post("/api/admin/upload", (req, res, next) => {
  if (req.is("application/json")) return next();
  upload.single("image")(req, res, next);
}, async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const prefix = String(req.query.kind || "menu").replace(/[^a-z0-9-]/gi, "") || "menu";
    let file;

    if (req.is("application/json")) {
      const { data, filename } = req.body || {};
      if (!data) {
        res.status(400).json({ error: "Ingen fil modtaget" });
        return;
      }
      file = {
        buffer: Buffer.from(data, "base64"),
        originalname: filename || "menu.jpg",
      };
    } else if (req.file) {
      file = req.file;
    } else {
      res.status(400).json({ error: "Ingen fil modtaget" });
      return;
    }

    const imageUrl = await saveUploadedImage(file, prefix, req);
    res.json({ imageUrl });
  } catch (err) {
    res.status(400).json({ error: err.message || "Upload fejlede" });
  }
});

app.get("/api/media", async (req, res, next) => {
  const mediaHandler = require("./api/media");
  mediaHandler(req, res).catch(next);
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(__dirname));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Spisehuset Gaarden kører på http://localhost:${PORT}`);
});
