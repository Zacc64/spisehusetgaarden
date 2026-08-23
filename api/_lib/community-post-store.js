const fs = require("fs");
const path = require("path");
const { hasBlobStorage, readBlobJson, writeBlobJson } = require("./blob-store");

const BLOB_PATH = "content/community-post.json";
const DEFAULT_POST = {
  slides: [],
  title: "",
  text: "",
  imageUrl: null,
  updatedAt: null,
};

function createSlideId() {
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSlide(slide, index = 0) {
  const source = slide && typeof slide === "object" ? slide : {};
  return {
    id: String(source.id || `slide-${index + 1}`),
    title: String(source.title || "").trim(),
    text: String(source.text || "").trim(),
    imageUrl: String(source.imageUrl || "").trim() || null,
  };
}

function slideHasContent(slide) {
  return Boolean(slide?.title || slide?.text || slide?.imageUrl);
}

function normalizeCommunityPost(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  let slides = [];

  if (Array.isArray(source.slides)) {
    slides = source.slides.map(normalizeSlide).filter(slideHasContent);
  } else if (slideHasContent(source)) {
    slides = [normalizeSlide(source)];
  }

  const first = slides[0] || { title: "", text: "", imageUrl: null };

  return {
    slides,
    title: first.title || "",
    text: first.text || "",
    imageUrl: first.imageUrl || null,
    updatedAt: source.updatedAt || null,
  };
}

function getPostPaths() {
  return [
    path.join(process.cwd(), "data", "community-post.json"),
    path.join(__dirname, "..", "..", "data", "community-post.json"),
    path.join(__dirname, "..", "data", "community-post.json"),
  ];
}

function readPostFromFs() {
  for (const postPath of getPostPaths()) {
    try {
      if (fs.existsSync(postPath)) {
        return JSON.parse(fs.readFileSync(postPath, "utf8"));
      }
    } catch {
      // try next path
    }
  }
  return normalizeCommunityPost(DEFAULT_POST);
}

function writePostToFs(post) {
  const postPath = getPostPaths()[0];
  const dir = path.dirname(postPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(postPath, JSON.stringify(post, null, 2), "utf8");
  return post;
}

async function readCommunityPost(req) {
  if (hasBlobStorage(req)) {
    try {
      const blobPost = await readBlobJson(BLOB_PATH, req);
      if (blobPost) return normalizeCommunityPost(blobPost);
    } catch {
      // fall back to filesystem
    }
  }

  return normalizeCommunityPost(readPostFromFs());
}

async function writeCommunityPost(post, req) {
  const normalized = normalizeCommunityPost(post);
  if (hasBlobStorage(req)) {
    await writeBlobJson(BLOB_PATH, normalized, req);
    try {
      writePostToFs(normalized);
    } catch {
      // optional local mirror
    }
    return normalized;
  }

  return writePostToFs(normalized);
}

module.exports = {
  readCommunityPost,
  writeCommunityPost,
  normalizeCommunityPost,
  normalizeSlide,
  createSlideId,
  DEFAULT_POST,
};
