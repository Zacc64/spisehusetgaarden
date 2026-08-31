const { put, get } = require("@vercel/blob");

let resolvedAccess = process.env.BLOB_ACCESS === "private" ? "private" : null;

const JSON_CACHE_MS = 20_000;
const jsonCache = new Map();
const urlCache = new Map();
const inflightReads = new Map();

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

function isNotFoundError(err) {
  const message = String(err?.message || "");
  return message.includes("404") || message.includes("not found");
}

function getCachedJson(pathname) {
  const entry = jsonCache.get(pathname);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return undefined;
}

function setCachedJson(pathname, data) {
  jsonCache.set(pathname, { data, expiresAt: Date.now() + JSON_CACHE_MS });
}

function rememberBlobUrl(pathname, url) {
  if (url) urlCache.set(pathname, url);
}

function authHeaders(req) {
  const headers = {};
  const oidcToken = getOidcToken(req);
  const token = getBlobToken();
  if (isPrivateStore()) {
    if (oidcToken) headers.Authorization = `Bearer ${oidcToken}`;
    else if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function putBlob(pathname, body, contentType, req) {
  const preferred = getBlobAccess();
  try {
    const blob = await put(pathname, body, blobOptions(contentType, req, preferred));
    rememberBlobUrl(pathname, blob?.url);
    return blob;
  } catch (err) {
    if (preferred === "private" || !isPrivateStoreError(err)) throw err;
    markPrivateStore();
    const blob = await put(pathname, body, blobOptions(contentType, req, "private"));
    rememberBlobUrl(pathname, blob?.url);
    return blob;
  }
}

async function fetchBlobJson(url, req) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      ...authHeaders(req),
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function getBlobByPathname(pathname, req) {
  const accessOrder = isPrivateStore() ? ["private"] : ["public", "private"];
  let lastError = null;

  for (const access of accessOrder) {
    try {
      const result = await get(pathname, {
        access,
        ...blobCommandOptions(req),
      });
      if (!result) continue;
      if (access === "private") markPrivateStore();
      rememberBlobUrl(pathname, result.url);
      return result;
    } catch (err) {
      lastError = err;
      if (isNotFoundError(err)) continue;
      if (isPrivateStoreError(err)) {
        markPrivateStore();
        continue;
      }
      throw err;
    }
  }

  if (lastError && !isNotFoundError(lastError) && !isPrivateStoreError(lastError)) {
    throw lastError;
  }
  return null;
}

async function readBlobJsonUncached(pathname, req) {
  const knownUrl = urlCache.get(pathname);
  if (knownUrl) {
    const fromUrl = await fetchBlobJson(knownUrl, req);
    if (fromUrl != null) return fromUrl;
  }

  const result = await getBlobByPathname(pathname, req);
  if (!result?.stream) return null;
  const text = await new Response(result.stream).text();
  return text ? JSON.parse(text) : null;
}

async function readBlobJson(pathname, req) {
  const cached = getCachedJson(pathname);
  if (cached !== undefined) return cached;

  const pending = inflightReads.get(pathname);
  if (pending) return pending;

  const task = readBlobJsonUncached(pathname, req)
    .then((data) => {
      setCachedJson(pathname, data);
      return data;
    })
    .finally(() => {
      inflightReads.delete(pathname);
    });

  inflightReads.set(pathname, task);
  return task;
}

async function writeBlobJson(pathname, data, req) {
  setCachedJson(pathname, data);
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

  const knownUrl = urlCache.get(pathname);
  if (knownUrl) {
    const response = await fetch(knownUrl, {
      cache: "no-store",
      headers: authHeaders(req),
    });
    if (response.ok) {
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") || "application/octet-stream",
      };
    }
  }

  const result = await getBlobByPathname(pathname, req);
  if (!result?.stream) return null;

  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return {
    buffer,
    contentType: result.contentType || "application/octet-stream",
  };
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
  getCachedJson,
  readBlobJson,
  writeBlobJson,
  writeBlobFile,
  readBlobFile,
  mediaUrlForPathname,
};
