const { writeCommunityPost } = require("../community-post-store");
const { requireAuth } = require("../auth");
const { sendJson, readJsonBody } = require("../http");

module.exports = async function handleAdminSaveCommunityPost(req, res) {
  try {
    if (req.method !== "PUT") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    if (!requireAuth(req, res, sendJson)) return;

    const body = await readJsonBody(req);
    const title = String(body?.title || "").trim();
    const text = String(body?.text || "").trim();
    const imageUrl = String(body?.imageUrl || "").trim() || null;

    if (!title && !text && !imageUrl) {
      sendJson(res, 400, { error: "Tilføj en titel, tekst eller et billede" });
      return;
    }

    const post = {
      title,
      text,
      imageUrl,
      updatedAt: Date.now(),
    };

    const saved = await writeCommunityPost(post, req);
    sendJson(res, 200, saved);
  } catch (err) {
    sendJson(res, 500, {
      error: err.message || "Kunne ikke gemme opslag",
    });
  }
};
