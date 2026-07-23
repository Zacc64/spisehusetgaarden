const MAX_EDGE_PX = 2000;
const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024;
const INITIAL_JPEG_QUALITY = 0.86;

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Kunne ikke komprimere billedet"));
        else resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function prepareImageForUpload(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Vælg en billedfil (JPG, PNG eller WebP).");
  }

  if (file.type === "image/gif") {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("GIF er for stor. Brug JPG/PNG eller et mindre billede.");
    }
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const longestEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longestEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longestEdge : 1;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const shouldReencode = scale < 1 || file.size > MAX_UPLOAD_BYTES;

  if (!shouldReencode) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = INITIAL_JPEG_QUALITY;
  let blob = await canvasToJpegBlob(canvas, quality);

  while (blob.size > MAX_UPLOAD_BYTES && quality > 0.52) {
    quality -= 0.08;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("Billedet er stadig for stort. Prøv et mindre billede.");
  }

  const baseName = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

async function uploadAdminImage(file, kind, getAuthHeaders) {
  const prepared = await prepareImageForUpload(file);
  const auth = getAuthHeaders();

  const body = new FormData();
  body.append("image", prepared, prepared.name);

  const res = await fetch(`/api/admin/upload?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    headers: {
      Authorization: auth.Authorization,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Upload fejlede");
  }

  return res.json();
}

window.uploadAdminImage = uploadAdminImage;
window.prepareImageForUpload = prepareImageForUpload;
