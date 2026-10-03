const { getStripe } = require("./stripe-client");

async function refundBookingDeposit(booking) {
  const stripe = getStripe();
  const sessionId = String(booking?.stripeSessionId || booking?.id || "");
  if (!sessionId.startsWith("cs_")) {
    throw new Error("Bookingen har ingen Stripe-betaling, så depositummet kan ikke refunderes.");
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  const paymentIntent = session.payment_intent;
  const paymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
  if (!paymentIntentId) {
    throw new Error("Stripe-betalingen blev ikke fundet.");
  }

  const intent =
    paymentIntent && typeof paymentIntent === "object" && paymentIntent.amount_received != null
      ? paymentIntent
      : await stripe.paymentIntents.retrieve(paymentIntentId);

  const received = Number(intent.amount_received || 0);
  const already = Number(intent.amount_refunded || 0);
  const refundable = received - already;

  if (refundable <= 0) {
    return {
      id: booking.refundId || "",
      amountDkk: Math.round(already / 100) || Number(booking.amountDkk) || 0,
      paymentIntentId,
      alreadyRefunded: true,
    };
  }

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount: refundable,
    },
    { idempotencyKey: `booking-cancel-${sessionId}-${refundable}` }
  );

  if (refund.status === "failed") {
    throw new Error("Stripe afviste refunderingen.");
  }

  return {
    id: refund.id,
    amountDkk: Math.round((refund.amount || refundable) / 100),
    paymentIntentId,
    alreadyRefunded: false,
  };
}

module.exports = { refundBookingDeposit };
