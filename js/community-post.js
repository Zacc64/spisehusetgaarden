function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inlineFormat(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function withCacheBust(url, version) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version || Date.now())}`;
}

function formatText(text) {
  const raw = String(text).trim();
  if (!raw) return "";

  return raw
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const isBulletList = lines.length > 1 && lines.every((line) => /^[-•*–]\s/.test(line));

      if (isBulletList) {
        return `<ul class="community-post__list">${lines
          .map((line) => `<li>${inlineFormat(line.replace(/^[-•*–]\s*/, ""))}</li>`)
          .join("")}</ul>`;
      }

      return `<p class="community-post__paragraph">${inlineFormat(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function getSlides(post) {
  if (Array.isArray(post?.slides) && post.slides.length) {
    return post.slides.filter((slide) => slide.title || slide.text || slide.imageUrl);
  }

  if (post?.title || post?.text || post?.imageUrl) {
    return [
      {
        id: "slide-1",
        title: post.title || "",
        text: post.text || "",
        imageUrl: post.imageUrl || null,
      },
    ];
  }

  return [];
}

function renderSlide(slide, version, index) {
  const hasImage = Boolean(slide.imageUrl);
  const image = hasImage
    ? `<div class="community-post__media"><img src="${escapeHtml(withCacheBust(slide.imageUrl, version))}" alt="${escapeHtml(slide.title || `Opslag ${index + 1}`)}"></div>`
    : "";
  const title = slide.title
    ? `<h3 class="community-post__title">${escapeHtml(slide.title)}</h3>`
    : "";
  const text = slide.text
    ? `<div class="community-post__text">${formatText(slide.text)}</div>`
    : "";

  return `
    <article class="community-post__card community-slideshow__slide${hasImage ? "" : " community-post__card--text-only"}" data-slide-index="${index}" ${index === 0 ? "" : "hidden"}>
      ${image}
      <div class="community-post__content">
        ${title}
        ${text}
      </div>
    </article>
  `;
}

function renderSlideshow(slides, version) {
  const cards = slides.map((slide, index) => renderSlide(slide, version, index)).join("");
  const showControls = slides.length > 1;
  const dots = showControls
    ? `<div class="community-slideshow__dots" role="tablist" aria-label="Vælg opslag">${slides
        .map(
          (_, index) =>
            `<button type="button" class="community-slideshow__dot${index === 0 ? " is-active" : ""}" data-slide-to="${index}" role="tab" aria-selected="${index === 0 ? "true" : "false"}" aria-label="Opslag ${index + 1}"></button>`
        )
        .join("")}</div>`
    : "";
  const controls = showControls
    ? `
      <div class="community-slideshow__nav">
        <button type="button" class="community-slideshow__arrow" data-slideshow-prev aria-label="Forrige opslag">‹</button>
        ${dots}
        <button type="button" class="community-slideshow__arrow" data-slideshow-next aria-label="Næste opslag">›</button>
      </div>
    `
    : "";

  return `
    <div class="community-slideshow" ${showControls ? 'tabindex="0"' : ""}>
      <div class="community-slideshow__viewport">
        ${cards}
      </div>
      ${controls}
    </div>
  `;
}

function renderEmpty() {
  return `<p class="community-post__empty">Nyt opslag kommer snart.</p>`;
}

function wireSlideshow(root) {
  const slideshow = root.querySelector(".community-slideshow");
  if (!slideshow) return;

  const slides = [...slideshow.querySelectorAll(".community-slideshow__slide")];
  const dots = [...slideshow.querySelectorAll("[data-slide-to]")];
  if (slides.length < 2) return;

  let current = 0;
  let touchStartX = null;

  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.hidden = i !== current;
    });
    dots.forEach((dot, i) => {
      const active = i === current;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", String(active));
    });
  }

  slideshow.querySelector("[data-slideshow-prev]")?.addEventListener("click", () => show(current - 1));
  slideshow.querySelector("[data-slideshow-next]")?.addEventListener("click", () => show(current + 1));
  dots.forEach((dot) => {
    dot.addEventListener("click", () => show(Number(dot.dataset.slideTo)));
  });

  slideshow.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(current - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      show(current + 1);
    }
  });

  slideshow.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    touchStartX = event.clientX;
  });

  slideshow.addEventListener("pointerup", (event) => {
    if (touchStartX == null) return;
    const delta = event.clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) < 40) return;
    show(delta < 0 ? current + 1 : current - 1);
  });
}

async function initCommunityPost(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.innerHTML = '<p class="community-post__loading">Henter opslag…</p>';

  try {
    const response = await fetch(`/api/community-post?t=${Date.now()}`, { cache: "no-store" });
    const post = await response.json();

    if (!response.ok) {
      container.innerHTML = renderEmpty();
      return;
    }

    const slides = getSlides(post);
    if (!slides.length) {
      container.innerHTML = renderEmpty();
      return;
    }

    container.innerHTML = renderSlideshow(slides, post.updatedAt);
    wireSlideshow(container);
  } catch {
    container.innerHTML = renderEmpty();
  }
}

window.initCommunityPost = initCommunityPost;
