const {
  getCapacitySettings,
  updateCapacitySettings,
} = require("../booking-store");
const { requireAuth } = require("../auth");
const { sendJson, readJsonBody } = require("../http");

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      if (!requireAuth(req, res, sendJson)) return;
      const settings = await getCapacitySettings(req);
      sendJson(res, 200, settings);
      return;
    }

    if (req.method === "PUT") {
      if (!requireAuth(req, res, sendJson)) return;
      const body = await readJsonBody(req);
      const settings = await updateCapacitySettings(body || {}, req);
      sendJson(res, 200, settings);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Could not update capacity" });
  }
};
