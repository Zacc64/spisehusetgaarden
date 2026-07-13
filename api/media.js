const { list } = require("@vercel/blob");

function getRequestHeader(req, name) {
  if (!req?.headers) return null;
  const target = name.toLowerCase();
  const key = Object.keys(req.headers).find((header) => header.toLowerCase() === target);
  return key ? req.headers[key] : null;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end("Method not allowed");
      return;
    }

    const query = String(req.url || "").split("?")[1] || "";
    const pathname = new URLSearchParams(query).get("path");

    if (!pathname || !pathname.startsWith("menus/")) {
      res.statusCode = 400;
      res.end("Invalid media path");
      return;
    }

    const oidcToken =
      getRequestHeader(req, "x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || null;
    const storeId = process.env.BLOB_STORE_ID || null;
    const listOptions = { prefix: pathname, limit: 5 };

    if (storeId) listOptions.storeId = storeId;
    if (oidcToken) listOptions.oidcToken = oidcToken;

    const { blobs } = await list(listOptions);
    const blob = blobs.find((entry) => entry.pathname === pathname);
    if (!blob) {
      res.statusCode = 404;
      res.end("File not found");
      return;
    }

    const headers = {};
    if (oidcToken) headers.Authorization = `Bearer ${oidcToken}`;

    const response = await fetch(blob.url, Object.keys(headers).length ? { headers } : undefined);
    if (!response.ok) {
      res.statusCode = 502;
      res.end(`Upstream blob fetch failed (${response.status})`);
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buffer);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(err?.stack || err?.message || "Media proxy failed");
  }
};
