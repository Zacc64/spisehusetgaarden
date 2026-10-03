const { getBookingById, markBookingCancelled } = require("../booking-store");
const { refundBookingDeposit } = require("../refund-booking");
const { sendCancellationEmail } = require("../email");
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

    if (booking.status === "cancelled" && (booking.refundId || booking.refundedAt)) {
      sendJson(res, 200, { ok: true, already: true, booking, emailSent: false });
      return;
    }

    const refund = await refundBookingDeposit(booking);
    const updated = await markBookingCancelled(booking.stripeSessionId || booking.id, refund, req);

    let emailSent = false;
    let emailError = null;
    try {
      emailSent = Boolean(await sendCancellationEmail(updated));
    } catch (err) {
      emailError = err.message || "Aflysningsmailen blev ikke sendt.";
      console.error("Cancellation email failed:", emailError);
    }

    sendJson(res, 200, {
      ok: true,
      booking: updated,
      refundDkk: updated?.refundDkk || refund.amountDkk || 0,
      emailSent,
      emailError,
    });
  } catch (err) {
    console.error("Cancel booking failed:", err.message);
    sendJson(res, 500, { error: err.message || "Kunne ikke aflyse bookingen." });
  }
};
