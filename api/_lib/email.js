const { formatBookingSummary, getNotifyEmail } = require("./booking");

async function sendEmail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY missing — booking email not sent.");
    return false;
  }

  const from =
    process.env.RESEND_FROM_EMAIL ||
    "Spisehuset Gaarden <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email failed: ${detail}`);
  }

  return true;
}

async function sendBookingEmails(session) {
  const metadata = session.metadata || {};
  const booking = {
    name: metadata.name || "",
    phone: metadata.phone || "",
    email: metadata.email || session.customer_email || session.customer_details?.email || "",
    date: metadata.date || "",
    time: metadata.time || "",
    guests: metadata.guests || "",
    message: metadata.message || "",
  };

  if (!booking.email) {
    throw new Error("Booking email missing in Stripe session metadata.");
  }

  const summary = formatBookingSummary(booking);
  const paymentId = session.payment_intent || session.id;

  await sendEmail({
    to: booking.email,
    subject: "Booking bekræftet — Spisehuset Gaarden",
    text:
      `Hej ${booking.name},\n\n` +
      `Tak for din booking. Vi har modtaget dit depositum.\n\n` +
      `${summary}\n\n` +
      `Betalingsreference: ${paymentId}\n\n` +
      `Vi glæder os til at se dig.\n` +
      `Spisehuset Gaarden`,
    html:
      `<p>Hej ${escapeHtml(booking.name)},</p>` +
      `<p>Tak for din booking. Vi har modtaget dit depositum.</p>` +
      `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(summary)}</pre>` +
      `<p>Betalingsreference: ${escapeHtml(String(paymentId))}</p>` +
      `<p>Vi glæder os til at se dig.<br>Spisehuset Gaarden</p>`,
  });

  await sendEmail({
    to: getNotifyEmail(),
    subject: `Ny betalt booking — ${booking.name}`,
    text:
      `Ny betalt bordbooking:\n\n` +
      `${summary}\n\n` +
      `Stripe session: ${session.id}`,
    html:
      `<p><strong>Ny betalt bordbooking</strong></p>` +
      `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(summary)}</pre>` +
      `<p>Stripe session: ${escapeHtml(session.id)}</p>`,
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { sendBookingEmails };
