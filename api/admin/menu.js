const { writeMenu } = require("../../lib/menu-store");
const { requireAuth } = require("../../lib/auth");

module.exports = (req, res) => {
  if (req.method !== "PUT") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

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

  try {
    writeMenu(menu);
    res.json(menu);
  } catch {
    res.status(500).json({
      error: "Kunne ikke gemme menu. Kør lokalt med npm run dev for at redigere.",
    });
  }
};
