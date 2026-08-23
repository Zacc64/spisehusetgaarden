const communityPostForm = document.getElementById("community-post-form");
const communitySlidesEl = document.getElementById("community-slides");
const pendingFiles = new Map();

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

function collectSlidesFromDom() {
  return [...(communitySlidesEl?.querySelectorAll(".admin-slide") || [])].map((card) => {
    const id = card.dataset.slideId;
    const urlValue = card.querySelector('[data-field="image-url"]')?.value.trim() || "";
    return {
      id,
      title: card.querySelector('[data-field="title"]')?.value || "",
      text: card.querySelector('[data-field="text"]')?.value || "",
      imageUrl: urlValue || card.dataset.imageUrl || null,
      previewUrl: pendingFiles.has(id)
        ? card.querySelector("[data-preview-img]")?.src
        : "",
    };
  });
}

function renderSlideCard(slide, index, total, version) {
  const previewUrl = slide.previewUrl || slide.imageUrl;
  return `
    <article class="admin-card-block admin-slide" data-slide-id="${slide.id}" data-image-url="${slide.imageUrl ? escapeAttr(slide.imageUrl) : ""}">
      <div class="admin-slide__head">
        <strong>Slide ${index + 1}</strong>
        <div class="admin-slide__actions">
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-move="up" ${index === 0 ? "disabled" : ""}>Op</button>
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-move="down" ${index === total - 1 ? "disabled" : ""}>Ned</button>
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-remove ${total === 1 ? "disabled" : ""}>Fjern</button>
        </div>
      </div>

      <label class="admin-field">
        <span>Titel</span>
        <input type="text" data-field="title" value="${escapeAttr(slide.title || "")}" placeholder="F.eks. Brunch hos Spisehuset Gaarden">
      </label>

      <label class="admin-field">
        <span>Tekst</span>
        <textarea data-field="text" rows="5" placeholder="Beskriv menu, priser og praktisk info. Brug tom linje mellem afsnit, **fed tekst** til fremhævning, og - foran menupunkter.">${escapeText(slide.text || "")}</textarea>
      </label>

      <div class="admin-slide__media">
        <label class="admin-field">
          <span>Billede-URL <em>(valgfrit)</em></span>
          <input type="url" data-field="image-url" value="${slide.imageUrl && !String(slide.imageUrl).startsWith("/api/media") ? escapeAttr(slide.imageUrl) : ""}" placeholder="https://...">
        </label>

        <label class="admin-field">
          <span>Eller upload billede</span>
          <input type="file" data-field="image-file" accept="image/jpeg,image/png,image/webp,image/gif">
          <p class="admin-muted">Store billeder komprimeres automatisk.</p>
        </label>
      </div>

      <div class="admin-preview" data-image-preview ${previewUrl ? "" : "hidden"}>
        <img data-preview-img alt="Forhåndsvisning" ${previewUrl ? `src="${escapeAttr(withCacheBust(previewUrl, version))}"` : ""}>
      </div>
    </article>
  `;
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

function renderSlides(slides, version) {
  if (!communitySlidesEl) return;
  const list = slides.length ? slides : [emptySlide()];
  communitySlidesEl.innerHTML = list.map((slide, index) => renderSlideCard(slide, index, list.length, version)).join("");
  const countEl = document.getElementById("community-slide-count");
  if (countEl) {
    countEl.textContent = list.length === 1 ? "1 slide" : `${list.length} slides`;
  }
}

function addSlide() {
  const slides = collectSlidesFromDom();
  const next = emptySlide();
  slides.push(next);
  renderSlides(slides);
  const card = communitySlidesEl?.querySelector(`[data-slide-id="${next.id}"]`);
  card?.scrollIntoView({ behavior: "smooth", block: "start" });
  card?.querySelector('[data-field="title"]')?.focus();
}

function showCardPreview(card, url) {
  const preview = card.querySelector("[data-image-preview]");
  const img = card.querySelector("[data-preview-img]");
  if (!preview || !img) return;
  if (!url) {
    preview.hidden = true;
    img.removeAttribute("src");
    return;
  }
  img.src = url;
  preview.hidden = false;
}

async function loadCommunityPost() {
  if (!communityPostForm) return;

  const res = await fetch(`/api/community-post?t=${Date.now()}`, { cache: "no-store" });
  const post = await res.json();
  pendingFiles.clear();
  renderSlides(getSlidesFromPost(post), post.updatedAt);
}

async function uploadCommunityImage(file) {
  return window.uploadAdminImage(file, "community", () => ({
    Authorization: communityAuthHeaders().Authorization,
  }));
}

function wireCommunityPostForm() {
  if (!communityPostForm || !communitySlidesEl) return;

  communityPostForm.addEventListener("click", (event) => {
    if (event.target.closest("[data-add-slide], #community-add-slide")) {
      event.preventDefault();
      addSlide();
    }
  });

  communitySlidesEl.addEventListener("click", (event) => {
    const card = event.target.closest(".admin-slide");
    if (!card) return;

    if (event.target.closest("[data-remove]")) {
      if (communitySlidesEl.querySelectorAll(".admin-slide").length === 1) return;
      pendingFiles.delete(card.dataset.slideId);
      const slides = collectSlidesFromDom().filter((slide) => slide.id !== card.dataset.slideId);
      renderSlides(slides);
      return;
    }

    const move = event.target.closest("[data-move]")?.dataset.move;
    if (!move) return;
    const slides = collectSlidesFromDom();
    const index = slides.findIndex((slide) => slide.id === card.dataset.slideId);
    const target = move === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= slides.length) return;
    [slides[index], slides[target]] = [slides[target], slides[index]];
    renderSlides(slides);
  });

  communitySlidesEl.addEventListener("change", (event) => {
    const input = event.target.closest('[data-field="image-file"]');
    if (!input) return;
    const card = input.closest(".admin-slide");
    const file = input.files?.[0];
    if (!card) return;
    if (file) {
      pendingFiles.set(card.dataset.slideId, file);
      card.querySelector('[data-field="image-url"]').value = "";
      showCardPreview(card, URL.createObjectURL(file));
    } else {
      pendingFiles.delete(card.dataset.slideId);
    }
  });

  communitySlidesEl.addEventListener("input", (event) => {
    const input = event.target.closest('[data-field="image-url"]');
    if (!input) return;
    const card = input.closest(".admin-slide");
    if (!card) return;
    const url = input.value.trim();
    if (url) {
      pendingFiles.delete(card.dataset.slideId);
      card.querySelector('[data-field="image-file"]').value = "";
      card.dataset.imageUrl = url;
      showCardPreview(card, url);
    }
  });

  communityPostForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saveError = communityPostForm.querySelector("[data-save-error]");
    const saveSuccess = communityPostForm.querySelector("[data-save-success]");
    saveError.hidden = true;
    saveSuccess.hidden = true;

    const slides = collectSlidesFromDom();

    try {
      for (const slide of slides) {
        const file = pendingFiles.get(slide.id);
        if (!file) continue;
        const uploaded = await uploadCommunityImage(file);
        slide.imageUrl = uploaded.imageUrl;
        pendingFiles.delete(slide.id);
      }
    } catch (err) {
      saveError.textContent = err.message || "Upload fejlede";
      saveError.hidden = false;
      return;
    }

    const payloadSlides = slides
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
    renderSlides(getSlidesFromPost(saved), saved.updatedAt);
    saveSuccess.hidden = false;
    setTimeout(() => {
      saveSuccess.hidden = true;
    }, 4000);
  });
}

window.loadCommunityPostAdmin = loadCommunityPost;
wireCommunityPostForm();
