function getRequestUrl(req) {
  const host = req.headers?.host || req.headers?.Host || "localhost";
  const raw = req.url || "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return new URL(raw);
  }
  return new URL(raw, `http://${host}`);
}

function getSubpath(req, segment) {
  const url = getRequestUrl(req);
  const fromQuery = url.searchParams.get("__path");
  if (fromQuery) {
    return fromQuery.replace(/^\/+|\/+$/g, "").split("/")[0] || "";
  }

  const pattern = new RegExp(`^/api/${segment}/?([^?]*)`);
  const match = url.pathname.match(pattern);
  if (match) {
    return (match[1] || "").split("/")[0] || "";
  }

  return "";
}

module.exports = { getRequestUrl, getSubpath };
