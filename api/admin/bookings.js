const { listBookings } = require("../_lib/booking-store");
const { requireAuth } = require("../_lib/auth");
const { sendJson } = require("../_lib/http");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!requireAuth(req, res, sendJson)) return;

  try {
    const bookings = await listBookings(req);
    sendJson(res, 200, { bookings });
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Could not load bookings" });
  }
};
