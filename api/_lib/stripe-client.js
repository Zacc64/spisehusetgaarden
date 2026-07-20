const Stripe = require("stripe");

let stripeClient = null;

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function isStripeTestMode() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  return key.startsWith("sk_test_");
}

module.exports = { getStripe, isStripeConfigured, isStripeTestMode };
