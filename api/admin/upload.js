const { saveUploadedImage } = require("../../lib/menu-store");
const { requireAuth } = require("../../lib/auth");

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!requireAuth(req, res)) return;

  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    res.status(400).json({ error: "Forventet multipart upload" });
    return;
  }

  try {
    const body = await parseMultipart(req);
    const boundary = contentType.split("boundary=")[1];
    if (!boundary) {
      res.status(400).json({ error: "Ugyldig upload" });
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
      res.status(400).json({ error: "Ingen fil modtaget" });
      return;
    }

    const imageUrl = saveUploadedImage({ buffer: fileBuffer, originalname });
    res.json({ imageUrl });
  } catch (err) {
    res.status(400).json({ error: err.message || "Upload fejlede" });
  }
};
