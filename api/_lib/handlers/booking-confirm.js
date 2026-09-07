const { getStripe } = require("../stripe-client");
const { fulfillPaidCheckoutSession } = require("../fulfill-booking");
const { sendJson, readJsonBody } = require("../http");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = await readJsonBody(req);
    const sessionId = String(body?.session_id || "").trim();
    if (!sessionId || !sessionId.startsWith("cs_")) {
      sendJson(res, 400, { error: "Mangler betalingssession." });
      return;
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      sendJson(res, 409, { error: "Betalingen er ikke gennemført." });
      return;
    }

    const result = await fulfillPaidCheckoutSession(session, req);
    sendJson(res, 200, { ok: true, emailed: Boolean(result.emailed) });
  } catch (err) {
    console.error("Booking confirm failed:", err.message);
    sendJson(res, 500, { error: err.message || "Kunne ikke bekræfte bookingen." });
  }
};
