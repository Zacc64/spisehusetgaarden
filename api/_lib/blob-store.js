const { put, list, get } = require("@vercel/blob");

let resolvedAccess = process.env.BLOB_ACCESS === "private" ? "private" : null;

function isVercelRuntime() {
  return process.env.VERCEL === "1";
}

function getRequestHeader(req, name) {
  if (!req?.headers) return null;
  const target = name.toLowerCase();

  if (typeof req.headers.get === "function") {
    return req.headers.get(name) || req.headers.get(target);
  }

  const key = Object.keys(req.headers).find((header) => header.toLowerCase() === target);
  return key ? req.headers[key] : null;
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

function getOidcToken(req) {
  return getRequestHeader(req, "x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || null;
}

function hasBlobCredentials(req) {
  if (getBlobToken()) return true;
  if (isVercelRuntime() && getBlobStoreId() && getOidcToken(req)) return true;
  return false;
}

function hasBlobStorage(req) {
  return hasBlobCredentials(req);
}

function getBlobAccess() {
  return resolvedAccess || "public";
}

function isPrivateStore() {
  return getBlobAccess() === "private";
}

function markPrivateStore() {
  resolvedAccess = "private";
}

function getBlobSetupHint(req) {
  if (hasBlobCredentials(req)) return null;

  if (!isVercelRuntime()) {
    return "Set BLOB_READ_WRITE_TOKEN in .env to use Blob locally.";
  }

  if (!getBlobStoreId()) {
    return "Connect Vercel Blob to this project under Storage.";
  }

  if (!getBlobToken() && !getOidcToken(req)) {
    return "Add BLOB_READ_WRITE_TOKEN in Vercel (Storage → connect with read-write token), or enable OIDC in project settings.";
  }

  return "Check the Vercel Blob connection and redeploy.";
}

function blobCommandOptions(req) {
  const token = getBlobToken();
  if (token) {
    return { token };
  }

  const options = {};
  const storeId = getBlobStoreId();
  const oidcToken = getOidcToken(req);
  if (storeId) options.storeId = storeId;
  if (oidcToken) options.oidcToken = oidcToken;
  return options;
}

function blobOptions(contentType, req, access = getBlobAccess()) {
  return {
    access,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    ...blobCommandOptions(req),
  };
}

function listOptions(prefix, req) {
  return {
    prefix,
    limit: 20,
    ...blobCommandOptions(req),
  };
}

function formatBlobError(err, req) {
  const hint = getBlobSetupHint(req);
  const detail = err?.message ? String(err.message) : "Unknown error";
  if (hint) {
    return `${hint} (${detail})`;
  }
  return detail;
}

function mediaUrlForPathname(pathname) {
  return `/api/media?path=${encodeURIComponent(pathname)}`;
}

function isPrivateStoreError(err) {
  const message = String(err?.message || "");
  return message.includes("private store") || message.includes("private access");
}

async function putBlob(pathname, body, contentType, req) {
  try {
    return await put(pathname, body, blobOptions(contentType, req, "public"));
  } catch (err) {
    if (!isPrivateStoreError(err)) throw err;
    markPrivateStore();
    return put(pathname, body, blobOptions(contentType, req, "private"));
  }
}

async function readBlobJson(pathname, req) {
  const { blobs } = await list(listOptions(pathname, req));
  const blob = blobs.find((entry) => entry.pathname === pathname);
  if (!blob) return null;

  if (blob.url.includes(".private.blob.")) {
    markPrivateStore();
  }

  if (isPrivateStore()) {
    const result = await get(pathname, {
      access: "private",
      ...blobCommandOptions(req),
    });
    if (!result?.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  }

  const response = await fetch(blob.url);
  if (!response.ok) return null;
  return response.json();
}

async function writeBlobJson(pathname, data, req) {
  await putBlob(pathname, JSON.stringify(data, null, 2), "application/json", req);
}

async function writeBlobFile(pathname, buffer, contentType, req) {
  const blob = await putBlob(pathname, buffer, contentType, req);
  if (isPrivateStore()) {
    return mediaUrlForPathname(pathname);
  }
  return blob.url;
}

async function readBlobFile(pathname, req) {
  if (!pathname.startsWith("menus/")) {
    throw new Error("Invalid media path");
  }

  const result = await get(pathname, {
    access: "private",
    ...blobCommandOptions(req),
  });

  return result;
}

function getBlobStatus(req) {
  const oidcFromHeader = Boolean(getRequestHeader(req, "x-vercel-oidc-token"));
  return {
    runtime: isVercelRuntime() ? "vercel" : "local",
    ready: hasBlobCredentials(req),
    hasReadWriteToken: Boolean(getBlobToken()),
    hasStoreId: Boolean(getBlobStoreId()),
    hasOidcToken: Boolean(getOidcToken(req)),
    hasOidcHeader: oidcFromHeader,
    blobAccess: getBlobAccess(),
    hint: getBlobSetupHint(req),
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
  readBlobFile,
  mediaUrlForPathname,
};
