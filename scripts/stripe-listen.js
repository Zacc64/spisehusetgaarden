require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { spawn } = require("child_process");

const secretKey = process.env.STRIPE_SECRET_KEY;
const port = process.env.PORT || 3456;
const forwardTo = `localhost:${port}/api/booking/webhook`;

if (!secretKey) {
  console.error("\nMissing STRIPE_SECRET_KEY in .env");
  console.error("Add your Stripe test key, then run: npm run stripe:listen\n");
  process.exit(1);
}

if (!secretKey.startsWith("sk_test_")) {
  console.warn("\nWarning: STRIPE_SECRET_KEY does not look like a test key (sk_test_...)\n");
}

console.log(`Forwarding Stripe webhooks to http://${forwardTo}`);
console.log("Copy the whsec_... secret into .env as STRIPE_WEBHOOK_SECRET\n");

const child = spawn(
  "stripe",
  [
    "listen",
    "--forward-to",
    forwardTo,
    "--events",
    "checkout.session.completed",
    "--api-key",
    secretKey,
  ],
  { stdio: "inherit", shell: true }
);

child.on("exit", (code) => {
  if (code !== 0) {
    console.error(
      "\nStripe CLI failed. Install it with: winget install Stripe.StripeCli\n" +
        "Then close and reopen your terminal, or run: npm run stripe:listen\n"
    );
  }
  process.exit(code ?? 1);
});
