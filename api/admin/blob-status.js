const { requireAuth } = require("../_lib/auth");
const { sendJson } = require("../_lib/http");
const { getBlobStatus } = require("../_lib/blob-store");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!requireAuth(req, res, sendJson)) return;

  sendJson(res, 200, getBlobStatus());
};
