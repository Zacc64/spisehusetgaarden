const { writeMenu } = require("../menu-store");
const { requireAuth } = require("../auth");
const { sendJson, readJsonBody } = require("../http");

const DEFAULT_TITLES = {
  cafe: "Frokostmenu",
  faellesspisning: "Månedens menu",
  arrangementer: "Oversigt over arrangementer",
};

module.exports = async function handleAdminSaveMenu(req, res, type) {
  try {
    if (req.method !== "PUT") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    if (!requireAuth(req, res, sendJson)) return;

    const body = await readJsonBody(req);
    const { title, imageUrl } = body || {};

    const menu = {
      mode: "image",
      title: String(title || DEFAULT_TITLES[type] || "Menu").trim(),
      subtitle: "",
      text: "",
      imageUrl: imageUrl || null,
      updatedAt: Date.now(),
    };

    if (!menu.imageUrl) {
      sendJson(res, 400, { error: "Upload et billede til popup" });
      return;
    }

    const saved = await writeMenu(type, menu, req);
    sendJson(res, 200, saved);
  } catch (err) {
    sendJson(res, 500, {
      error: err.message || "Kunne ikke gemme menu",
    });
  }
};
