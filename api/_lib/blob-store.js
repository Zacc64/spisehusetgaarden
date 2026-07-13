const { put, list } = require("@vercel/blob");

function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlobJson(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 20 });
  const blob = blobs.find((entry) => entry.pathname === pathname);
  if (!blob) return null;

  const response = await fetch(blob.url);
  if (!response.ok) return null;
  return response.json();
}

async function writeBlobJson(pathname, data) {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

async function writeBlobFile(pathname, buffer, contentType) {
  const blob = await put(pathname, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  return blob.url;
}

module.exports = {
  hasBlobStorage,
  readBlobJson,
  writeBlobJson,
  writeBlobFile,
};
