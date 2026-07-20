function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withCacheBust(url, version) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version || Date.now())}`;
}

function renderPost(post) {
  const image = post.imageUrl
    ? `<div class="community-post__media"><img src="${escapeHtml(withCacheBust(post.imageUrl, post.updatedAt))}" alt="" loading="lazy"></div>`
    : "";
  const text = post.text
    ? `<div class="community-post__text">${escapeHtml(post.text).replace(/\n/g, "<br>")}</div>`
    : "";

  return `
    <article class="community-post__card">
      ${image}
      <div class="community-post__body">${text}</div>
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

    if (!post.text && !post.imageUrl) {
      container.innerHTML = renderEmpty();
      return;
    }

    container.innerHTML = renderPost(post);
  } catch {
    container.innerHTML = renderEmpty();
  }
}

window.initCommunityPost = initCommunityPost;
