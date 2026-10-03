const communityPostForm = document.getElementById("community-post-form");
const communitySlidesEl = document.getElementById("community-slides");
const communityRailEl = document.getElementById("community-rail");
const pendingFiles = new Map();
const previewUrls = new Map();

let slidesModel = [];
let activeSlideId = null;

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

function createSlideId() {
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptySlide() {
  return { id: createSlideId(), title: "", text: "", imageUrl: null };
}

function getSlidesFromPost(post) {
  if (Array.isArray(post?.slides) && post.slides.length) {
    return post.slides.map((slide, index) => ({
      id: slide.id || `slide-${index + 1}`,
      title: slide.title || "",
      text: slide.text || "",
      imageUrl: slide.imageUrl || null,
    }));
  }

  if (post?.title || post?.text || post?.imageUrl) {
    return [
      {
        id: createSlideId(),
        title: post.title || "",
        text: post.text || "",
        imageUrl: post.imageUrl || null,
      },
    ];
  }

  return [emptySlide()];
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

function activeSlide() {
  return slidesModel.find((slide) => slide.id === activeSlideId) || slidesModel[0] || null;
}

function syncEditor() {
  const editor = communitySlidesEl?.querySelector("[data-slide-editor]");
  const slide = slidesModel.find((item) => item.id === editor?.dataset.slideId);
  if (!editor || !slide) return;

  slide.title = editor.querySelector('[data-field="title"]')?.value || "";
  slide.text = editor.querySelector('[data-field="text"]')?.value || "";

  const urlValue = editor.querySelector('[data-field="image-url"]')?.value.trim() || "";
  if (urlValue) slide.imageUrl = urlValue;
  else if (!pendingFiles.has(slide.id)) slide.imageUrl = editor.dataset.imageUrl || null;
}

function slidePreviewUrl(slide, version) {
  if (previewUrls.has(slide.id)) return previewUrls.get(slide.id);
  return slide.imageUrl ? withCacheBust(slide.imageUrl, version) : "";
}

function renderRail(version) {
  if (!communityRailEl) return;
  communityRailEl.innerHTML = slidesModel
    .map((slide, index) => {
      const preview = slidePreviewUrl(slide, version);
      const title = slide.title.trim() || "Uden titel";
      return `
        <button type="button" class="admin-rail__item${slide.id === activeSlideId ? " admin-rail__item--active" : ""}" data-select-slide="${escapeAttr(slide.id)}">
          ${
            preview
              ? `<img class="admin-rail__thumb" src="${escapeAttr(preview)}" alt="">`
              : `<span class="admin-rail__placeholder" aria-hidden="true"></span>`
          }
          <span class="admin-rail__copy">
            <span class="admin-rail__index">Slide ${index + 1}</span>
            <span class="admin-rail__title" data-rail-title>${escapeText(title)}</span>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderEditor(version) {
  if (!communitySlidesEl) return;
  const slide = activeSlide();
  if (!slide) {
    communitySlidesEl.innerHTML = "";
    return;
  }

  const index = slidesModel.findIndex((item) => item.id === slide.id);
  const total = slidesModel.length;
  const preview = slidePreviewUrl(slide, version);
  const externalUrl = slide.imageUrl && !String(slide.imageUrl).startsWith("/api/media") ? slide.imageUrl : "";

  communitySlidesEl.innerHTML = `
    <article class="admin-slide" data-slide-editor data-slide-id="${escapeAttr(slide.id)}" data-image-url="${slide.imageUrl ? escapeAttr(slide.imageUrl) : ""}">
      <div class="admin-slide__head">
        <strong>Slide ${index + 1}</strong>
        <div class="admin-slide__actions">
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-move="up" ${index === 0 ? "disabled" : ""}>Op</button>
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-move="down" ${index === total - 1 ? "disabled" : ""}>Ned</button>
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-remove ${total === 1 ? "disabled" : ""}>Fjern</button>
        </div>
      </div>

      <div class="admin-preview" data-image-preview ${preview ? "" : "hidden"}>
        <img data-preview-img alt="Forhåndsvisning" ${preview ? `src="${escapeAttr(preview)}"` : ""}>
      </div>

      <div class="admin-slide__toolbar">
        <label class="admin-field">
          <span>Udskift billede</span>
          <input type="file" data-field="image-file" accept="image/jpeg,image/png,image/webp,image/gif">
        </label>
        <button type="button" class="admin-btn admin-btn--ghost" data-download-slide ${preview ? "" : "hidden"}>Download billede</button>
      </div>

      <label class="admin-field">
        <span>Titel</span>
        <input type="text" data-field="title" value="${escapeAttr(slide.title || "")}" placeholder="F.eks. Brunch hos Spisehuset Gaarden">
      </label>

      <label class="admin-field">
        <span>Tekst</span>
        <textarea data-field="text" rows="6" placeholder="Beskriv menu, priser og praktisk info. Brug tom linje mellem afsnit, **fed tekst** til fremhævning, og - foran menupunkter.">${escapeText(slide.text || "")}</textarea>
      </label>

      <label class="admin-field">
        <span>Billede-URL <em>(valgfrit, hvis billedet allerede ligger online)</em></span>
        <input type="url" data-field="image-url" value="${escapeAttr(externalUrl)}" placeholder="https://...">
      </label>
    </article>
  `;
}

function renderStudio(version) {
  if (!slidesModel.length) slidesModel = [emptySlide()];
  if (!slidesModel.some((slide) => slide.id === activeSlideId)) {
    activeSlideId = slidesModel[0].id;
  }
  renderRail(version);
  renderEditor(version);
}

function selectSlide(id) {
  if (!id || id === activeSlideId) return;
  syncEditor();
  activeSlideId = id;
  renderStudio();
}

function addSlide() {
  syncEditor();
  const next = emptySlide();
  slidesModel.push(next);
  activeSlideId = next.id;
  renderStudio();
  communitySlidesEl?.querySelector('[data-field="title"]')?.focus();
}

async function loadCommunityPost() {
  if (!communityPostForm) return;

  const res = await fetch(`/api/community-post?t=${Date.now()}`, { cache: "no-store" });
  const post = await res.json();
  pendingFiles.clear();
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls.clear();
  slidesModel = getSlidesFromPost(post);
  activeSlideId = slidesModel[0]?.id || null;
  renderStudio(post.updatedAt);
}

async function uploadCommunityImage(file) {
  return window.uploadAdminImage(file, "community", () => ({
    Authorization: communityAuthHeaders().Authorization,
  }));
}

function wireCommunityPostForm() {
  if (!communityPostForm || !communitySlidesEl) return;

  communityPostForm.addEventListener("click", (event) => {
    if (event.target.closest("#community-add-slide")) {
      event.preventDefault();
      addSlide();
      return;
    }

    const selectId = event.target.closest("[data-select-slide]")?.dataset.selectSlide;
    if (selectId) {
      event.preventDefault();
      selectSlide(selectId);
      return;
    }

    if (event.target.closest("[data-download-slide]")) {
      event.preventDefault();
      syncEditor();
      const slide = activeSlide();
      if (!slide) return;
      const pending = pendingFiles.get(slide.id);
      const url = pending ? URL.createObjectURL(pending) : slide.imageUrl;
      if (url && typeof window.downloadAdminImage === "function") {
        window.downloadAdminImage(url, pending?.name || `slide-${slidesModel.findIndex((item) => item.id === slide.id) + 1}.jpg`);
      }
      return;
    }

    if (event.target.closest("[data-remove]")) {
      if (slidesModel.length === 1) return;
      syncEditor();
      const id = activeSlideId;
      pendingFiles.delete(id);
      const preview = previewUrls.get(id);
      if (preview) URL.revokeObjectURL(preview);
      previewUrls.delete(id);
      const index = slidesModel.findIndex((slide) => slide.id === id);
      slidesModel = slidesModel.filter((slide) => slide.id !== id);
      activeSlideId = slidesModel[Math.max(0, index - 1)]?.id || slidesModel[0]?.id || null;
      renderStudio();
      return;
    }

    const move = event.target.closest("[data-move]")?.dataset.move;
    if (!move) return;
    syncEditor();
    const index = slidesModel.findIndex((slide) => slide.id === activeSlideId);
    const target = move === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= slidesModel.length) return;
    [slidesModel[index], slidesModel[target]] = [slidesModel[target], slidesModel[index]];
    renderStudio();
  });

  communitySlidesEl.addEventListener("change", (event) => {
    const input = event.target.closest('[data-field="image-file"]');
    if (!input) return;
    const slide = activeSlide();
    const file = input.files?.[0];
    if (!slide) return;
    if (!file) {
      pendingFiles.delete(slide.id);
      return;
    }

    const previous = previewUrls.get(slide.id);
    if (previous) URL.revokeObjectURL(previous);
    const objectUrl = URL.createObjectURL(file);
    previewUrls.set(slide.id, objectUrl);
    pendingFiles.set(slide.id, file);
    const urlInput = communitySlidesEl.querySelector('[data-field="image-url"]');
    if (urlInput) urlInput.value = "";
    renderStudio();
  });

  communitySlidesEl.addEventListener("input", (event) => {
    syncEditor();
    const titleInput = event.target.closest('[data-field="title"]');
    if (titleInput) {
      const label = communityRailEl?.querySelector(`[data-select-slide="${activeSlideId}"] [data-rail-title]`);
      if (label) label.textContent = titleInput.value.trim() || "Uden titel";
    }

    const urlInput = event.target.closest('[data-field="image-url"]');
    if (!urlInput) return;
    const slide = activeSlide();
    if (!slide) return;
    const url = urlInput.value.trim();
    if (!url) return;
    pendingFiles.delete(slide.id);
    const preview = previewUrls.get(slide.id);
    if (preview) URL.revokeObjectURL(preview);
    previewUrls.delete(slide.id);
    const fileInput = communitySlidesEl.querySelector('[data-field="image-file"]');
    if (fileInput) fileInput.value = "";
    slide.imageUrl = url;
    renderStudio();
  });

  communityPostForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncEditor();
    const saveError = communityPostForm.querySelector("[data-save-error]");
    const saveSuccess = communityPostForm.querySelector("[data-save-success]");
    saveError.hidden = true;
    saveSuccess.hidden = true;

    try {
      for (const slide of slidesModel) {
        const file = pendingFiles.get(slide.id);
        if (!file) continue;
        const uploaded = await uploadCommunityImage(file);
        slide.imageUrl = uploaded.imageUrl;
        pendingFiles.delete(slide.id);
        const preview = previewUrls.get(slide.id);
        if (preview) URL.revokeObjectURL(preview);
        previewUrls.delete(slide.id);
      }
    } catch (err) {
      saveError.textContent = err.message || "Upload fejlede";
      saveError.hidden = false;
      return;
    }

    const payloadSlides = slidesModel
      .map((slide) => ({
        id: slide.id,
        title: slide.title.trim(),
        text: slide.text.trim(),
        imageUrl: slide.imageUrl || null,
      }))
      .filter((slide) => slide.title || slide.text || slide.imageUrl);

    if (!payloadSlides.length) {
      saveError.textContent = "Tilføj mindst ét slide med titel, tekst eller billede.";
      saveError.hidden = false;
      return;
    }

    const res = await fetch("/api/admin/community-post", {
      method: "PUT",
      headers: communityAuthHeaders(),
      body: JSON.stringify({ slides: payloadSlides }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      saveError.textContent = err.error || "Kunne ikke gemme";
      saveError.hidden = false;
      return;
    }

    const saved = await res.json();
    pendingFiles.clear();
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.clear();
    slidesModel = getSlidesFromPost(saved);
    if (!slidesModel.some((slide) => slide.id === activeSlideId)) {
      activeSlideId = slidesModel[0]?.id || null;
    }
    renderStudio(saved.updatedAt);
    saveSuccess.hidden = false;
    setTimeout(() => {
      saveSuccess.hidden = true;
    }, 4000);
  });
}

window.loadCommunityPostAdmin = loadCommunityPost;
wireCommunityPostForm();
