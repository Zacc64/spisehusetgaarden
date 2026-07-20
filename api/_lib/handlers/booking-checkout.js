const { getStripe } = require("../stripe-client");
const {
  getDepositOre,
  getDepositDkk,
  parseBookingBody,
  getBookingRedirectUrls,
  isUsableSiteUrl,
} = require("../booking");
const { assertAvailability } = require("../booking-store");
const { sendJson, readJsonBody } = require("../http");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = await readJsonBody(req);
    const parsed = parseBookingBody(body);
    if (parsed.error) {
      sendJson(res, 400, { error: parsed.error });
      return;
    }

    const { booking } = parsed;
    const availabilityCheck = await assertAvailability(booking, req);
    if (availabilityCheck.error) {
      sendJson(res, 400, { error: availabilityCheck.error });
      return;
    }

    const { successUrl, cancelUrl } = getBookingRedirectUrls(req);
    if (!isUsableSiteUrl(successUrl, { allowLocalhost: process.env.VERCEL !== "1" })) {
      sendJson(res, 500, {
        error: "Booking redirect URL is not configured. Set SITE_URL in Vercel to https://spisehusetgaarden.vercel.app",
      });
      return;
    }

    const stripe = getStripe();
    const depositDkk = getDepositDkk();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: booking.email,
      locale: "da",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "dkk",
            unit_amount: getDepositOre(),
            product_data: {
              name: "Bordbooking — depositum",
              description: `${booking.date} kl. ${booking.time}, ${booking.guests} personer`,
            },
          },
        },
      ],
      metadata: {
        name: booking.name,
        phone: booking.phone,
        email: booking.email,
        date: booking.date,
        time: booking.time,
        guests: booking.guests,
        message: booking.message,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    sendJson(res, 200, {
      url: session.url,
      depositDkk,
    });
  } catch (err) {
    const redirects = getBookingRedirectUrls(req);
    sendJson(res, 500, {
      error: err.message || "Kunne ikke starte betaling",
      redirectUrls: {
        success: redirects.successUrl,
        cancel: redirects.cancelUrl,
      },
    });
  }
};
