function formatFacebookDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(isoDate));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPost(post) {
  const date = formatFacebookDate(post.createdAt);
  const message = post.message
    ? `<p class="facebook-feed__text">${escapeHtml(post.message).replace(/\n/g, "<br>")}</p>`
    : "";
  const image = post.imageUrl
    ? `<div class="facebook-feed__media"><img src="${escapeHtml(post.imageUrl)}" alt="" loading="lazy"></div>`
    : "";

  return `
    <article class="facebook-feed__card">
      <a class="facebook-feed__card-link" href="${escapeHtml(post.permalinkUrl || "#")}" target="_blank" rel="noopener noreferrer">
        ${image}
        <div class="facebook-feed__card-body">
          ${date ? `<time class="facebook-feed__date" datetime="${escapeHtml(post.createdAt)}">${escapeHtml(date)}</time>` : ""}
          ${message}
          <span class="facebook-feed__read-more">Se på Facebook</span>
        </div>
      </a>
    </article>
  `;
}

function renderEmptyState(profileUrl, message) {
  return `
    <div class="facebook-feed__empty">
      <p>${escapeHtml(message || "Seneste opslag kunne ikke vises lige nu.")}</p>
      <a class="facebook-feed__empty-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">
        Gå til vores Facebook-side
      </a>
    </div>
  `;
}

async function initFacebookFeed(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.innerHTML = '<p class="facebook-feed__loading">Henter seneste opslag…</p>';

  try {
    const response = await fetch("/api/facebook-posts");
    const data = await response.json();
    const profileUrl = data.profileUrl || "https://www.facebook.com/profile.php?id=61585327136722";

    if (!response.ok) {
      container.innerHTML = renderEmptyState(profileUrl, data.error);
      return;
    }

    if (!data.posts?.length) {
      const message = data.configured
        ? "Der er ingen opslag at vise lige nu."
        : "Facebook-feed skal konfigureres, før opslag kan vises her.";
      container.innerHTML = renderEmptyState(profileUrl, message);
      return;
    }

    container.innerHTML = `<div class="facebook-feed__grid">${data.posts.map(renderPost).join("")}</div>`;
  } catch {
    container.innerHTML = renderEmptyState(
      "https://www.facebook.com/profile.php?id=61585327136722",
      "Seneste opslag kunne ikke hentes lige nu."
    );
  }
}

window.initFacebookFeed = initFacebookFeed;
