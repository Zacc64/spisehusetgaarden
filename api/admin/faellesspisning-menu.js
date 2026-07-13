const { writeMenu } = require("../_lib/menu-store");
const { requireAuth } = require("../_lib/auth");
const { sendJson, readJsonBody } = require("../_lib/http");

module.exports = async (req, res) => {
  try {
    if (req.method !== "PUT") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    if (!requireAuth(req, res, sendJson)) return;

    const body = await readJsonBody(req);
    const { mode, title, subtitle, text, imageUrl } = body || {};

    if (mode !== "text" && mode !== "image") {
      sendJson(res, 400, { error: "mode skal vaere 'text' eller 'image'" });
      return;
    }

    const menu = {
      mode,
      title: String(title || "Månedens menu").trim(),
      subtitle: String(subtitle || "").trim(),
      text: String(text || ""),
      imageUrl: mode === "image" ? imageUrl || null : null,
    };

    if (mode === "image" && !menu.imageUrl) {
      sendJson(res, 400, { error: "Upload et billede til billed-popup" });
      return;
    }

    const saved = await writeMenu("faellesspisning", menu, req);
    sendJson(res, 200, saved);
  } catch (err) {
    sendJson(res, 500, {
      error: err.message || "Kunne ikke gemme menu",
    });
  }
};
