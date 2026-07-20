const { createToken, verifyPassword } = require("../auth");
const { sendJson, readJsonBody } = require("../http");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = await readJsonBody(req);
    const { password } = body || {};

    if (!verifyPassword(password)) {
      sendJson(res, 401, { error: "Forkert adgangskode" });
      return;
    }

    sendJson(res, 200, { token: createToken() });
  } catch {
    sendJson(res, 500, { error: "Login fejlede" });
  }
};
