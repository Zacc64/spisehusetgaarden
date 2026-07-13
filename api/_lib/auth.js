const crypto = require("crypto");

const ADMIN_PASSWORD = "shg2650";

function getAdminPassword() {
  return ADMIN_PASSWORD;
}

function createToken() {
  return crypto
    .createHmac("sha256", getAdminPassword())
    .update("spisehuset-admin")
    .digest("hex");
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return false;
  const expected = createToken();
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

function verifyPassword(password) {
  const expected = getAdminPassword();
  if (!password || typeof password !== "string") return false;
  if (password.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(password, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

function requireAuth(req, res, sendJson) {
  const token = getBearerToken(req);
  if (!verifyToken(token)) {
    if (typeof sendJson === "function") {
      sendJson(res, 401, { error: "Unauthorized" });
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
    return false;
  }
  return true;
}

module.exports = {
  createToken,
  verifyPassword,
  requireAuth,
};
