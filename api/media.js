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
    if (!result?.stream) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", result.blob?.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");

    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Could not load media" });
  }
};
