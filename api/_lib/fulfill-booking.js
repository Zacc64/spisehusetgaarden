const { addBookingFromSession, markBookingEmailed } = require("./booking-store");
const { sendBookingEmails, sendGuestConfirmation } = require("./email");

const RECENT_MS = 48 * 60 * 60 * 1000;

function isRecentBooking(booking) {
  const paidAt = booking?.paidAt ? new Date(booking.paidAt).getTime() : 0;
  if (!paidAt) return false;
  return Date.now() - paidAt < RECENT_MS;
}

async function fulfillPaidCheckoutSession(session, req) {
  if (!session || session.payment_status !== "paid") {
    return { booking: null, emailed: false };
  }

  const booking = await addBookingFromSession(session, req);
  if (!booking) {
    return { booking: null, emailed: false };
  }

  if (booking.emailSentAt || !booking.email) {
    return { booking, emailed: false };
  }

  try {
    await sendBookingEmails(session);
    await markBookingEmailed(session.id, req);
    return { booking, emailed: true };
  } catch (err) {
    console.error("Booking emails failed:", err.message);
    return { booking, emailed: false, emailError: err.message };
  }
}

async function emailRecentBookingIfNeeded(booking, req) {
  if (!booking?.email || booking.emailSentAt || !isRecentBooking(booking)) {
    return "skipped";
  }

  try {
    await sendGuestConfirmation(booking, booking.stripeSessionId || booking.id);
    await markBookingEmailed(booking.stripeSessionId || booking.id, req);
    return "sent";
  } catch (err) {
    console.error("Booking email failed:", err.message);
    return "failed";
  }
}

module.exports = {
  fulfillPaidCheckoutSession,
  emailRecentBookingIfNeeded,
  isRecentBooking,
};
