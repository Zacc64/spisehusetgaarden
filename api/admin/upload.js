const { saveUploadedImage } = require("../_lib/menu-store");
const { requireAuth } = require("../_lib/auth");
const { sendJson } = require("../_lib/http");

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    if (!requireAuth(req, res, sendJson)) return;

    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      sendJson(res, 400, { error: "Forventet multipart upload" });
      return;
    }

    const body = await parseMultipart(req);
    const boundary = contentType.split("boundary=")[1];
    if (!boundary) {
      sendJson(res, 400, { error: "Ugyldig upload" });
      return;
    }

    const parts = body.toString("binary").split(`--${boundary}`);
    let fileBuffer = null;
    let originalname = "menu.jpg";

    for (const part of parts) {
      if (!part.includes("filename=")) continue;
      const nameMatch = part.match(/filename="([^"]+)"/);
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd === -1) continue;
      const data = part.slice(headerEnd + 4);
      const trimmed = data.endsWith("\r\n") ? data.slice(0, -2) : data;
      fileBuffer = Buffer.from(trimmed, "binary");
      if (nameMatch) originalname = nameMatch[1];
      break;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      sendJson(res, 400, { error: "Ingen fil modtaget" });
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const prefix = (url.searchParams.get("kind") || "menu").replace(/[^a-z0-9-]/gi, "") || "menu";
    const imageUrl = await saveUploadedImage({ buffer: fileBuffer, originalname }, prefix);
    sendJson(res, 200, { imageUrl });
  } catch (err) {
    sendJson(res, 400, {
      error: err.message || "Upload fejlede",
    });
  }
};
