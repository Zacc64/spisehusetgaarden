const { writeCommunityPost, normalizeCommunityPost, createSlideId } = require("../community-post-store");
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
    const incoming = Array.isArray(body?.slides)
      ? body
      : {
          slides: [
            {
              id: createSlideId(),
              title: body?.title,
              text: body?.text,
              imageUrl: body?.imageUrl,
            },
          ],
        };

    const post = normalizeCommunityPost({
      ...incoming,
      updatedAt: Date.now(),
    });

    if (!post.slides.length) {
      sendJson(res, 400, { error: "Tilføj mindst ét slide med titel, tekst eller billede" });
      return;
    }

    const saved = await writeCommunityPost(post, req);
    sendJson(res, 200, saved);
  } catch (err) {
    sendJson(res, 500, {
      error: err.message || "Kunne ikke gemme opslag",
    });
  }
};
