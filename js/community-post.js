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

function renderPost(post) {
  const hasImage = Boolean(post.imageUrl);
  const image = hasImage
    ? `<div class="community-post__media"><img src="${escapeHtml(withCacheBust(post.imageUrl, post.updatedAt))}" alt="${escapeHtml(post.title || "Opslag")}" loading="lazy"></div>`
    : "";
  const title = post.title
    ? `<h3 class="community-post__title">${escapeHtml(post.title)}</h3>`
    : "";
  const text = post.text
    ? `<div class="community-post__text">${formatText(post.text)}</div>`
    : "";

  return `
    <article class="community-post__card${hasImage ? "" : " community-post__card--text-only"}">
      ${image}
      <div class="community-post__content">
        ${title}
        ${text}
      </div>
    </article>
  `;
}

function renderEmpty() {
  return `<p class="community-post__empty">Nyt opslag kommer snart.</p>`;
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

    if (!post.title && !post.text && !post.imageUrl) {
      container.innerHTML = renderEmpty();
      return;
    }

    container.innerHTML = renderPost(post);
  } catch {
    container.innerHTML = renderEmpty();
  }
}

window.initCommunityPost = initCommunityPost;
