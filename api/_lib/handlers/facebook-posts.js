const { sendJson } = require("../http");

const DEFAULT_PAGE_ID = "61585327136722";
const DEFAULT_PROFILE_URL = `https://www.facebook.com/profile.php?id=${DEFAULT_PAGE_ID}`;
const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = { expiresAt: 0, payload: null };

function getConfig() {
  const pageId = String(process.env.FACEBOOK_PAGE_ID || DEFAULT_PAGE_ID).trim();
  const accessToken = String(process.env.FACEBOOK_ACCESS_TOKEN || "").trim();
  const profileUrl = String(process.env.FACEBOOK_PAGE_URL || DEFAULT_PROFILE_URL).trim();

  return { pageId, accessToken, profileUrl };
}

function pickImage(post) {
  if (post.full_picture) return post.full_picture;

  const attachment = post.attachments?.data?.[0];
  if (!attachment) return null;

  if (attachment.media?.image?.src) return attachment.media.image.src;

  const subAttachment = attachment.subattachments?.data?.[0];
  if (subAttachment?.media?.image?.src) return subAttachment.media.image.src;

  return null;
}

function normalizePost(post) {
  return {
    id: post.id,
    message: post.message || "",
    imageUrl: pickImage(post),
    permalinkUrl: post.permalink_url || null,
    createdAt: post.created_time || null,
  };
}

async function fetchFacebookPosts() {
  const { pageId, accessToken, profileUrl } = getConfig();

  if (!accessToken) {
    return {
      configured: false,
      profileUrl,
      posts: [],
      message: "Facebook-feed er ikke konfigureret endnu.",
    };
  }

  const fields = [
    "message",
    "full_picture",
    "permalink_url",
    "created_time",
    "attachments{media_type,media,subattachments}",
  ].join(",");

  const url = new URL(`https://graph.facebook.com/v22.0/${pageId}/published_posts`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "4");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    const error = payload?.error?.message || "Kunne ikke hente Facebook-opslag.";
    throw new Error(error);
  }

  const posts = (payload.data || [])
    .map(normalizePost)
    .filter((post) => post.message || post.imageUrl);

  return {
    configured: true,
    profileUrl,
    posts,
  };
}

module.exports = async function handleFacebookPosts(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const now = Date.now();
  if (cache.payload && cache.expiresAt > now) {
    sendJson(res, 200, cache.payload, {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    });
    return;
  }

  try {
    const payload = await fetchFacebookPosts();
    cache = {
      payload,
      expiresAt: now + CACHE_TTL_MS,
    };

    sendJson(res, 200, payload, {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    });
  } catch (err) {
    sendJson(res, 502, {
      configured: Boolean(getConfig().accessToken),
      profileUrl: getConfig().profileUrl,
      posts: [],
      error: err.message || "Kunne ikke hente Facebook-opslag.",
    });
  }
};
