const communityPostForm = document.getElementById("community-post-form");
const communityPostState = {
  imageUrl: null,
  pendingFile: null,
};

function communityAuthHeaders() {
  return {
    Authorization: `Bearer ${sessionStorage.getItem("sg-admin-token")}`,
    "Content-Type": "application/json",
  };
}

function withCacheBust(url, version) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version || Date.now())}`;
}

function showCommunityPreview(url, version) {
  const preview = communityPostForm?.querySelector("[data-image-preview]");
  const img = communityPostForm?.querySelector("[data-preview-img]");
  if (!preview || !img) return;

  if (!url) {
    preview.hidden = true;
    img.removeAttribute("src");
    return;
  }

  img.src = withCacheBust(url, version);
  preview.hidden = false;
}

async function loadCommunityPost() {
  if (!communityPostForm) return;

  const res = await fetch(`/api/community-post?t=${Date.now()}`, { cache: "no-store" });
  const post = await res.json();

  communityPostForm.querySelector('[data-field="title"]').value = post.title || "";
  communityPostForm.querySelector('[data-field="text"]').value = post.text || "";
  communityPostForm.querySelector('[data-field="image-url"]').value =
    post.imageUrl && !post.imageUrl.startsWith("/api/media") ? post.imageUrl : "";
  communityPostState.imageUrl = post.imageUrl || null;
  communityPostState.pendingFile = null;
  communityPostForm.querySelector('[data-field="image-file"]').value = "";
  showCommunityPreview(communityPostState.imageUrl, post.updatedAt);
}

async function uploadCommunityImage(file) {
  return uploadAdminImage(file, "community", () => ({
    Authorization: communityAuthHeaders().Authorization,
  }));
}

function wireCommunityPostForm() {
  if (!communityPostForm) return;

  communityPostForm.querySelector('[data-field="image-file"]').addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    communityPostState.pendingFile = file || null;
    if (file) {
      communityPostForm.querySelector('[data-field="image-url"]').value = "";
      showCommunityPreview(URL.createObjectURL(file));
    }
  });

  communityPostForm.querySelector('[data-field="image-url"]').addEventListener("input", (e) => {
    const url = e.target.value.trim();
    if (url) {
      communityPostState.pendingFile = null;
      communityPostForm.querySelector('[data-field="image-file"]').value = "";
      showCommunityPreview(url);
    } else if (!communityPostState.pendingFile) {
      showCommunityPreview(communityPostState.imageUrl);
    }
  });

  communityPostForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveError = communityPostForm.querySelector("[data-save-error]");
    const saveSuccess = communityPostForm.querySelector("[data-save-success]");
    saveError.hidden = true;
    saveSuccess.hidden = true;

    let imageUrl = communityPostForm.querySelector('[data-field="image-url"]').value.trim();

    if (communityPostState.pendingFile) {
      try {
        const uploaded = await uploadCommunityImage(communityPostState.pendingFile);
        imageUrl = uploaded.imageUrl;
      } catch (err) {
        saveError.textContent = err.message || "Upload fejlede";
        saveError.hidden = false;
        return;
      }
    } else if (!imageUrl) {
      imageUrl = communityPostState.imageUrl || "";
    }

    const title = communityPostForm.querySelector('[data-field="title"]').value;
    const text = communityPostForm.querySelector('[data-field="text"]').value;

    const res = await fetch("/api/admin/community-post", {
      method: "PUT",
      headers: communityAuthHeaders(),
      body: JSON.stringify({
        title,
        text,
        imageUrl: imageUrl || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      saveError.textContent = err.error || "Kunne ikke gemme";
      saveError.hidden = false;
      return;
    }

    const saved = await res.json();
    communityPostState.imageUrl = saved.imageUrl || null;
    communityPostState.pendingFile = null;
    communityPostForm.querySelector('[data-field="image-file"]').value = "";
    if (saved.imageUrl && saved.imageUrl.startsWith("/api/media")) {
      communityPostForm.querySelector('[data-field="image-url"]').value = "";
    } else {
      communityPostForm.querySelector('[data-field="image-url"]').value = saved.imageUrl || "";
    }
    showCommunityPreview(communityPostState.imageUrl, saved.updatedAt);

    saveSuccess.hidden = false;
    setTimeout(() => {
      saveSuccess.hidden = true;
    }, 4000);
  });
}

window.loadCommunityPostAdmin = loadCommunityPost;
wireCommunityPostForm();
