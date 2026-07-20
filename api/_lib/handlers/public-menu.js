const { readMenu } = require("../menu-store");
const { sendJson } = require("../http");

const VALID_TYPES = new Set(["cafe", "faellesspisning", "arrangementer"]);

module.exports = async function handlePublicMenu(req, res, type) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    if (!VALID_TYPES.has(type)) {
      sendJson(res, 404, { error: "Menu not found" });
      return;
    }

    const menu = await readMenu(type, req);
    sendJson(res, 200, menu, {
      "Cache-Control": "no-store",
    });
  } catch {
    sendJson(res, 500, { error: "Kunne ikke hente menu" });
  }
};
