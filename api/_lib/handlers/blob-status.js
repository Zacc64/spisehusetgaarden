const { requireAuth } = require("../auth");
const { sendJson } = require("../http");
const { getBlobStatus } = require("../blob-store");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!requireAuth(req, res, sendJson)) return;

  sendJson(res, 200, getBlobStatus(req));
};
