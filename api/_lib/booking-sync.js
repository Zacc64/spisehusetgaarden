const { getStripe } = require("./stripe-client");
const { addBookingFromSession, readStore } = require("./booking-store");

function isBookingSession(session) {
  const metadata = session?.metadata || {};
  return Boolean(metadata.date && metadata.time && (metadata.name || metadata.email));
}

async function syncBookingsFromStripe(req, { limit = 100 } = {}) {
  const stripe = getStripe();
  const store = await readStore(req);
  const existingIds = new Set(store.bookings.map((b) => b.stripeSessionId));

  let added = 0;
  let checked = 0;
  let paid = 0;
  let bookingLike = 0;
  let hasMore = true;
  let startingAfter;

  while (hasMore && checked < limit) {
    const page = await stripe.checkout.sessions.list({
      limit: Math.min(100, limit - checked),
      status: "complete",
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const session of page.data) {
      checked += 1;
      if (session.payment_status !== "paid") continue;
      paid += 1;

      let fullSession = session;
      if (!isBookingSession(fullSession)) {
        try {
          fullSession = await stripe.checkout.sessions.retrieve(session.id);
        } catch {
          continue;
        }
      }

      if (!isBookingSession(fullSession)) continue;
      bookingLike += 1;
      if (existingIds.has(fullSession.id)) continue;

      await addBookingFromSession(fullSession, req);
      existingIds.add(fullSession.id);
      added += 1;
    }

    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return { added, checked, paid, bookingLike, totalBookings: store.bookings.length + added };
}

module.exports = { syncBookingsFromStripe };
