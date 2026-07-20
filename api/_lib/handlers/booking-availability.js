const { getAvailability } = require("../booking-store");
const { sendJson } = require("../http");
const { getRequestUrl } = require("../router");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const url = getRequestUrl(req);
    const date = url.searchParams.get("date");

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      sendJson(res, 400, { error: "Invalid date" });
      return;
    }

    const availability = await getAvailability(date, req);
    sendJson(res, 200, availability, {
      "Cache-Control": "no-store",
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Could not load availability" });
  }
};
