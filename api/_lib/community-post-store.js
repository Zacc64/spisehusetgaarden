const fs = require("fs");
const path = require("path");
const { hasBlobStorage, readBlobJson, writeBlobJson } = require("./blob-store");

const BLOB_PATH = "content/community-post.json";
const DEFAULT_POST = {
  text: "",
  imageUrl: null,
  updatedAt: null,
};

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
  return { ...DEFAULT_POST };
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
      if (blobPost) return blobPost;
    } catch {
      // fall back to filesystem
    }
  }

  return readPostFromFs();
}

async function writeCommunityPost(post, req) {
  if (hasBlobStorage(req)) {
    await writeBlobJson(BLOB_PATH, post, req);
    try {
      writePostToFs(post);
    } catch {
      // optional local mirror
    }
    return post;
  }

  return writePostToFs(post);
}

module.exports = {
  readCommunityPost,
  writeCommunityPost,
  DEFAULT_POST,
};
