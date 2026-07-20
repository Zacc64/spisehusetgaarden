const { readCommunityPost } = require("../community-post-store");
const { sendJson } = require("../http");

module.exports = async function handleCommunityPost(req, res) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const post = await readCommunityPost(req);
    sendJson(res, 200, post, {
      "Cache-Control": "no-store",
    });
  } catch {
    sendJson(res, 500, { error: "Kunne ikke hente opslag" });
  }
};
