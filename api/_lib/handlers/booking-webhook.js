const { getStripe } = require("../stripe-client");
const { fulfillPaidCheckoutSession } = require("../fulfill-booking");
const { sendJson, readRawBody } = require("../http");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      sendJson(res, 500, { error: "STRIPE_WEBHOOK_SECRET is not configured." });
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      sendJson(res, 400, { error: "Missing Stripe signature." });
      return;
    }

    const rawBody = await readRawBody(req);
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      try {
        await fulfillPaidCheckoutSession(session, req);
      } catch (storeErr) {
        console.error("Booking storage failed:", storeErr.message);
        sendJson(res, 500, { error: storeErr.message || "Booking storage failed" });
        return;
      }
    }

    sendJson(res, 200, { received: true });
  } catch (err) {
    const message = err.message || "Webhook error";
    const status = message.includes("signature") || message.includes("Stripe") ? 400 : 500;
    console.error("Stripe webhook error:", message);
    sendJson(res, status, { error: message });
  }
};
