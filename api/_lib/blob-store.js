const { put, list } = require("@vercel/blob");

function isVercelRuntime() {
  return process.env.VERCEL === "1";
}

function getBlobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
    null
  );
}

function hasBlobStorage() {
  return isVercelRuntime() || Boolean(getBlobToken());
}

function blobOptions(contentType) {
  const options = {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  };

  const token = getBlobToken();
  if (token) {
    options.token = token;
  }

  return options;
}

function listOptions(prefix) {
  const options = { prefix, limit: 20 };
  const token = getBlobToken();
  if (token) {
    options.token = token;
  }
  return options;
}

async function readBlobJson(pathname) {
  const { blobs } = await list(listOptions(pathname));
  const blob = blobs.find((entry) => entry.pathname === pathname);
  if (!blob) return null;

  const response = await fetch(blob.url);
  if (!response.ok) return null;
  return response.json();
}

async function writeBlobJson(pathname, data) {
  await put(pathname, JSON.stringify(data, null, 2), blobOptions("application/json"));
}

async function writeBlobFile(pathname, buffer, contentType) {
  const blob = await put(pathname, buffer, blobOptions(contentType));
  return blob.url;
}

module.exports = {
  isVercelRuntime,
  hasBlobStorage,
  readBlobJson,
  writeBlobJson,
  writeBlobFile,
};
