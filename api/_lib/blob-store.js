const { put, list } = require("@vercel/blob");

function getBlobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
    null
  );
}

function hasBlobStorage() {
  return Boolean(getBlobToken());
}

function blobOptions(contentType) {
  return {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    token: getBlobToken(),
  };
}

async function readBlobJson(pathname) {
  const { blobs } = await list({
    prefix: pathname,
    limit: 20,
    token: getBlobToken(),
  });
  const blob = blobs.find((entry) => entry.pathname === pathname);
  if (!blob) return null;

  const response = await fetch(blob.url);
  if (!response.ok) return null;
  return response.json();
}

async function writeBlobJson(pathname, data) {
  await put(
    pathname,
    JSON.stringify(data, null, 2),
    blobOptions("application/json")
  );
}

async function writeBlobFile(pathname, buffer, contentType) {
  const blob = await put(pathname, buffer, blobOptions(contentType));
  return blob.url;
}

module.exports = {
  hasBlobStorage,
  readBlobJson,
  writeBlobJson,
  writeBlobFile,
};
