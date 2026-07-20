require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const { saveUploadedImage } = require("./api/_lib/menu-store");
const { requireAuth } = require("./api/_lib/auth");

const app = express();
const PORT = process.env.PORT || 3456;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.post(
  "/api/booking/webhook",
  express.raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      await require("./api/_lib/handlers/booking-webhook")(req, res);
    } catch (err) {
      next(err);
    }
  }
);

app.use(express.json({ limit: "12mb" }));

app.get("/api/menu", async (req, res) => {
  await require("./api/_lib/handlers/public-menu")(req, res, "cafe");
});

app.get("/api/faellesspisning-menu", async (req, res) => {
  await require("./api/_lib/handlers/public-menu")(req, res, "faellesspisning");
});

app.get("/api/arrangementer-menu", async (req, res) => {
  await require("./api/_lib/handlers/public-menu")(req, res, "arrangementer");
});

app.get("/api/booking/config", async (req, res) => {
  await require("./api/_lib/handlers/booking-config")(req, res);
});

app.post("/api/booking/checkout", async (req, res) => {
  await require("./api/_lib/handlers/booking-checkout")(req, res);
});

app.get("/api/booking/availability", async (req, res) => {
  await require("./api/_lib/handlers/booking-availability")(req, res);
});

app.get("/api/admin/bookings", async (req, res) => {
  await require("./api/_lib/handlers/bookings")(req, res);
});

app.route("/api/admin/capacity")
  .get(async (req, res) => {
    await require("./api/_lib/handlers/capacity")(req, res);
  })
  .put(async (req, res) => {
    await require("./api/_lib/handlers/capacity")(req, res);
  });

app.post("/api/admin/login", async (req, res) => {
  await require("./api/_lib/handlers/login")(req, res);
});

app.put("/api/admin/menu", async (req, res) => {
  await require("./api/_lib/handlers/admin-save-menu")(req, res, "cafe");
});

app.put("/api/admin/faellesspisning-menu", async (req, res) => {
  await require("./api/_lib/handlers/admin-save-menu")(req, res, "faellesspisning");
});

app.put("/api/admin/arrangementer-menu", async (req, res) => {
  await require("./api/_lib/handlers/admin-save-menu")(req, res, "arrangementer");
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
