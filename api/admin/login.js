const { createToken, verifyPassword } = require("../../lib/auth");

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { password } = req.body || {};
  if (!verifyPassword(password)) {
    res.status(401).json({ error: "Forkert adgangskode" });
    return;
  }

  res.json({ token: createToken() });
};
