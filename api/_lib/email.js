const nodemailer = require("nodemailer");
const { formatBookingSummary, getNotifyEmail, getDepositDkk, parseGuestCount } = require("./booking");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDanishDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const formatted = new Date(`${iso}T12:00:00`).toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getFromAddress() {
  return (
    smtpEnv("SMTP_FROM") ||
    process.env.RESEND_FROM_EMAIL ||
    "Spisehuset Gaarden <booking@spisehusetgaarden.dk>"
  );
}

function smtpEnv(name) {
  return String(process.env[name] || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function hasSmtpConfig() {
  return Boolean(smtpEnv("SMTP_HOST") && smtpEnv("SMTP_USER") && smtpEnv("SMTP_PASS"));
}

function createSmtpTransport() {
  const port = Number(smtpEnv("SMTP_PORT") || 587);
  return nodemailer.createTransport({
    host: smtpEnv("SMTP_HOST"),
    port,
    secure: port === 465 || smtpEnv("SMTP_SECURE") === "true",
    requireTLS: port === 587,
    auth: {
      user: smtpEnv("SMTP_USER"),
      pass: smtpEnv("SMTP_PASS"),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      servername: smtpEnv("SMTP_HOST"),
      minVersion: "TLSv1.2",
    },
  });
}

function getMailboxAddress() {
  return smtpEnv("SMTP_USER").toLowerCase();
}

async function sendViaSmtp({ to, subject, text, html }) {
  const transport = createSmtpTransport();
  const mailbox = getMailboxAddress();
  const toAddress = String(Array.isArray(to) ? to[0] : to || "").trim().toLowerCase();
  const copyToMailbox = Boolean(mailbox && mailbox !== toAddress);

  try {
    const result = await transport.sendMail({
      from: getFromAddress(),
      replyTo: smtpEnv("SMTP_USER") || "booking@spisehusetgaarden.dk",
      to,
      bcc: copyToMailbox ? mailbox : undefined,
      subject,
      text,
      html,
    });

    if (!result.messageId) {
      throw new Error("SMTP accepted the connection but did not return a message id.");
    }

    console.log("Booking email sent", {
      to: toAddress,
      id: result.messageId,
      response: result.response || "",
    });
    return true;
  } catch (err) {
    throw new Error(`SMTP send failed: ${err.message || "unknown error"}`);
  } finally {
    transport.close();
  }
}

async function sendViaResend({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromAddress(),
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

async function sendEmail(message) {
  if (hasSmtpConfig()) {
    return sendViaSmtp(message);
  }
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(message);
  }
  throw new Error(
    "Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in Vercel Production."
  );
}

function bookingFromStripeSession(session) {
  const metadata = session?.metadata || {};
  return {
    name: metadata.name || "",
    phone: metadata.phone || "",
    email: metadata.email || session?.customer_email || session?.customer_details?.email || "",
    date: metadata.date || "",
    time: metadata.time || "",
    guests: metadata.guests || "",
    message: metadata.message || "",
  };
}

async function sendGuestConfirmation(booking, paymentId) {
  if (!booking?.email) {
    throw new Error("Booking email missing.");
  }

  const guestCopy = guestEmailCopy(booking, paymentId || booking.stripeSessionId || booking.id || "");
  await sendEmail({
    to: booking.email,
    subject: `Booking bekræftet — ${formatDanishDate(booking.date)} kl. ${booking.time}`,
    text: guestCopy.text,
    html: guestCopy.html,
  });
}

async function sendBookingEmails(session) {
  const booking = bookingFromStripeSession(session);

  if (!booking.email) {
    throw new Error("Booking email missing in Stripe session metadata.");
  }

  const summary = formatBookingSummary(booking);
  const paymentId = session.payment_intent || session.id;
  await sendGuestConfirmation(booking, paymentId);

  const notifyEmail = getNotifyEmail();
  if (!notifyEmail) return;

  await sendEmail({
    to: notifyEmail,
    subject: `Ny betalt booking — ${booking.name} · ${booking.date} kl. ${booking.time}`,
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

module.exports = { sendBookingEmails, sendGuestConfirmation, bookingFromStripeSession };

function guestEmailCopy(booking, paymentId) {
  const dateLabel = formatDanishDate(booking.date);
  const guests = booking.guests || "";
  const guestCount = parseGuestCount(guests);
  const deposit = guestCount ? getDepositDkk() * guestCount : null;
  const remarks = booking.message ? `Bemærkninger: ${booking.message}` : "";

  const text =
    `Hej ${booking.name},\n\n` +
    `Tak for din booking hos Spisehuset Gaarden. Vi har modtaget dit depositum, og bordet er bekræftet.\n\n` +
    `Dato: ${dateLabel}\n` +
    `Tid: ${booking.time}\n` +
    `Personer: ${guests}\n` +
    (deposit ? `Depositum betalt: ${deposit} kr.\n` : "") +
    (remarks ? `${remarks}\n` : "") +
    `\nHar du spørgsmål, kan du svare på denne mail.\n\n` +
    `Vi glæder os til at se dig.\n` +
    `Spisehuset Gaarden`;

  const html = `
    <div style="margin:0;padding:24px;background:#f3f5f1;font-family:Georgia,serif;color:#141414;">
      <div style="max-width:560px;margin:0 auto;background:#fafbf8;border:1px solid #d8e2d8;border-radius:16px;overflow:hidden;">
        <div style="padding:22px 24px;background:#2f4535;color:#fafbf8;">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.8;">Spisehuset Gaarden</p>
          <h1 style="margin:0;font-size:24px;font-weight:700;">Booking bekræftet</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 16px;">Hej ${escapeHtml(booking.name)},</p>
          <p style="margin:0 0 20px;">Tak for din booking. Vi har modtaget dit depositum, og bordet er reserveret.</p>
          <table style="width:100%;border-collapse:collapse;font-size:16px;">
            <tr><td style="padding:8px 0;color:#5e635c;width:140px;">Dato</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(dateLabel)}</td></tr>
            <tr><td style="padding:8px 0;color:#5e635c;">Tid</td><td style="padding:8px 0;font-weight:700;">kl. ${escapeHtml(booking.time)}</td></tr>
            <tr><td style="padding:8px 0;color:#5e635c;">Personer</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(String(guests))}</td></tr>
            ${deposit ? `<tr><td style="padding:8px 0;color:#5e635c;">Depositum</td><td style="padding:8px 0;font-weight:700;">${deposit} kr. betalt</td></tr>` : ""}
            ${booking.message ? `<tr><td style="padding:8px 0;color:#5e635c;vertical-align:top;">Bemærkninger</td><td style="padding:8px 0;">${escapeHtml(booking.message)}</td></tr>` : ""}
          </table>
          <p style="margin:20px 0 0;">Har du spørgsmål, kan du svare på denne mail.</p>
          <p style="margin:18px 0 0;">Vi glæder os til at se dig.<br><strong>Spisehuset Gaarden</strong></p>
        </div>
      </div>
    </div>
  `;

  return { text, html };
}
