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

function getBlobStoreId() {
  return process.env.BLOB_STORE_ID || null;
}

function getOidcToken() {
  return process.env.VERCEL_OIDC_TOKEN || null;
}

function hasBlobCredentials() {
  if (getBlobToken()) return true;
  if (isVercelRuntime() && getBlobStoreId() && getOidcToken()) return true;
  return false;
}

function hasBlobStorage() {
  return hasBlobCredentials();
}

function getBlobSetupHint() {
  if (hasBlobCredentials()) return null;

  if (!isVercelRuntime()) {
    return "Sæt BLOB_READ_WRITE_TOKEN i .env for at bruge Blob lokalt.";
  }

  if (!getBlobStoreId()) {
    return "Forbind Vercel Blob til projektet under Storage → Connect Project.";
  }

  if (!getBlobToken()) {
    return "Aktivér «Add a read-write token env var» under Blob-forbindelsen, eller vent på redeploy efter forbindelse.";
  }

  return "Tjek Vercel Blob-forbindelsen og redeploy projektet.";
}

function blobCommandOptions() {
  const options = {};
  const token = getBlobToken();

  if (token) {
    options.token = token;
    return options;
  }

  const storeId = getBlobStoreId();
  const oidcToken = getOidcToken();
  if (storeId) options.storeId = storeId;
  if (oidcToken) options.oidcToken = oidcToken;

  return options;
}

function blobOptions(contentType) {
  return {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    ...blobCommandOptions(),
  };
}

function listOptions(prefix) {
  return {
    prefix,
    limit: 20,
    ...blobCommandOptions(),
  };
}

function formatBlobError(err) {
  const hint = getBlobSetupHint();
  const detail = err?.message ? String(err.message) : "Ukendt fejl";
  if (hint) {
    return `${hint} (${detail})`;
  }
  return detail;
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

function getBlobStatus() {
  return {
    runtime: isVercelRuntime() ? "vercel" : "local",
    ready: hasBlobCredentials(),
    hasReadWriteToken: Boolean(getBlobToken()),
    hasStoreId: Boolean(getBlobStoreId()),
    hasOidcToken: Boolean(getOidcToken()),
    hint: getBlobSetupHint(),
  };
}

module.exports = {
  isVercelRuntime,
  hasBlobStorage,
  hasBlobCredentials,
  getBlobSetupHint,
  formatBlobError,
  getBlobStatus,
  readBlobJson,
  writeBlobJson,
  writeBlobFile,
};
