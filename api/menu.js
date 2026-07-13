const { readMenu } = require("./_lib/menu-store");
const { sendJson } = require("./_lib/http");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    sendJson(res, 200, readMenu(), {
      "Cache-Control": "s-maxage=60, stale-while-revalidate",
    });
  } catch {
    sendJson(res, 500, { error: "Kunne ikke hente menu" });
  }
};
