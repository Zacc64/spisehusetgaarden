const fs = require("fs");
const path = require("path");
const {
  isVercelRuntime,
  hasBlobStorage,
  getBlobSetupHint,
  formatBlobError,
  readBlobJson,
  writeBlobJson,
  writeBlobFile,
} = require("./blob-store");

const MENU_TYPES = {
  cafe: {
    filename: "menu.json",
    blobPath: "menus/cafe.json",
    default: {
      mode: "image",
      title: "Frokostmenu",
      subtitle: "",
      text: "",
      imageUrl: null,
      updatedAt: null,
    },
  },
  faellesspisning: {
    filename: "faellesspisning-menu.json",
    blobPath: "menus/faellesspisning.json",
    default: {
      mode: "image",
      title: "Månedens menu",
      subtitle: "Fællesspisning & Social Dining",
      text: "",
      imageUrl: null,
      updatedAt: null,
    },
  },
  arrangementer: {
    filename: "arrangementer-menu.json",
    blobPath: "menus/arrangementer.json",
    default: {
      mode: "image",
      title: "Åbningstider",
      subtitle: "",
      text: "",
      imageUrl: null,
      updatedAt: null,
    },
  },
};

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function getMenuConfig(type = "cafe") {
  return MENU_TYPES[type] || MENU_TYPES.cafe;
}

function getMenuPaths(type) {
  const filename = getMenuConfig(type).filename;
  return [
    path.join(process.cwd(), "data", filename),
    path.join(__dirname, "..", "..", "data", filename),
    path.join(__dirname, "..", "data", filename),
  ];
}

function getUploadsDir() {
  return path.join(process.cwd(), "uploads");
}

function readMenuFromFs(type) {
  const config = getMenuConfig(type);
  for (const menuPath of getMenuPaths(type)) {
    try {
      if (fs.existsSync(menuPath)) {
        return JSON.parse(fs.readFileSync(menuPath, "utf8"));
      }
    } catch {
      // try next path
    }
  }
  return { ...config.default };
}

function writeMenuToFs(type, menu) {
  const menuPath = getMenuPaths(type)[0];
  const dir = path.dirname(menuPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(menuPath, JSON.stringify(menu, null, 2), "utf8");
  return menu;
}

function validateImageFile(file) {
  const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
  const allowed = Object.keys(MIME_TYPES);
  if (!allowed.includes(ext)) {
    throw new Error("Kun billedfiler (jpg, png, webp, gif) er tilladt.");
  }
  return { ext, contentType: MIME_TYPES[ext] };
}

function saveUploadedImageToFs(file, prefix) {
  const { ext } = validateImageFile(file);
  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filename = `${prefix}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
}

async function readMenu(type = "cafe", req) {
  const config = getMenuConfig(type);

  if (hasBlobStorage(req)) {
    try {
      const blobMenu = await readBlobJson(config.blobPath, req);
      if (blobMenu) return blobMenu;
    } catch {
      // fall back to bundled defaults / filesystem
    }
  }

  return readMenuFromFs(type);
}

async function writeMenu(type, menu, req) {
  if (hasBlobStorage(req)) {
    await writeBlobJson(getMenuConfig(type).blobPath, menu, req);
    if (!isVercelRuntime()) {
      try {
        writeMenuToFs(type, menu);
      } catch {
        // optional local mirror
      }
    }
    return menu;
  }

  if (isVercelRuntime()) {
    throw new Error(getBlobSetupHint(req) || "Blob storage is not configured.");
  }

  return writeMenuToFs(type, menu);
}

async function saveUploadedImage(file, prefix = "menu", req) {
  const { ext, contentType } = validateImageFile(file);

  if (hasBlobStorage(req)) {
    const pathname = `menus/images/${prefix}-${Date.now()}${ext}`;
    try {
      return await writeBlobFile(pathname, file.buffer, contentType, req);
    } catch (err) {
      throw new Error(`Could not upload image. ${formatBlobError(err, req)}`);
    }
  }

  if (isVercelRuntime()) {
    throw new Error(getBlobSetupHint(req) || "Blob storage is not configured.");
  }

  return saveUploadedImageToFs(file, prefix);
}

module.exports = {
  readMenu,
  writeMenu,
  saveUploadedImage,
  MENU_TYPES,
  hasBlobStorage,
};
