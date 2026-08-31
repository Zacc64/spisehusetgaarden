const { readBlobFile } = require("./_lib/blob-store");

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

    const file = await readBlobFile(pathname, req);
    if (!file) {
      res.statusCode = 404;
      res.end("File not found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.end(file.buffer);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(err?.stack || err?.message || "Media proxy failed");
  }
};
