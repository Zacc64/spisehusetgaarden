const { syncBookingsFromStripe } = require("../booking-sync");
const { requireAuth } = require("../auth");
const { sendJson } = require("../http");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!requireAuth(req, res, sendJson)) return;

  try {
    const result = await syncBookingsFromStripe(req);
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Could not sync bookings from Stripe" });
  }
};
