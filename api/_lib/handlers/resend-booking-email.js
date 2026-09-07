const { getBookingById, markBookingEmailed } = require("../booking-store");
const { sendGuestConfirmation } = require("../email");
const { requireAuth } = require("../auth");
const { sendJson, readJsonBody } = require("../http");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!requireAuth(req, res, sendJson)) return;

  try {
    const body = await readJsonBody(req);
    const id = String(body?.id || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Mangler booking-id." });
      return;
    }

    const booking = await getBookingById(id, req);
    if (!booking) {
      sendJson(res, 404, { error: "Booking ikke fundet." });
      return;
    }
    if (!booking.email) {
      sendJson(res, 400, { error: "Bookingen har ingen email." });
      return;
    }

    await sendGuestConfirmation(booking, booking.stripeSessionId || booking.id);
    await markBookingEmailed(booking.stripeSessionId || booking.id, req);

    sendJson(res, 200, { ok: true, email: booking.email });
  } catch (err) {
    console.error("Resend booking email failed:", err.message);
    sendJson(res, 500, { error: err.message || "Kunne ikke sende bekræftelse." });
  }
};
