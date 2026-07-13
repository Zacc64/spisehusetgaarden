const { readBlobFile } = require("../_lib/blob-store");
const { sendJson } = require("../_lib/http");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.searchParams.get("path");

    if (!pathname || !pathname.startsWith("menus/")) {
      sendJson(res, 400, { error: "Invalid media path" });
      return;
    }

    const result = await readBlobFile(pathname, req);
    if (!result?.buffer) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(result.buffer);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Could not load media" });
  }
};
