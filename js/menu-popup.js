/**
 * Shared fullscreen menu popup for café, fællesspisning and arrangementer.
 */
function initMenuModals(modalSelector, entries) {
  const modalEl = document.querySelector(modalSelector);
  if (!modalEl) return;

  const backdrop = modalEl.querySelector(".menu-modal__backdrop");
  const closeBtn = modalEl.querySelector(".menu-modal__close");
  const titleEl = modalEl.querySelector(".menu-modal__title");
  const subtitleEl = modalEl.querySelector(".menu-modal__subtitle");
  const textEl = modalEl.querySelector(".menu-modal__text");
  const textWrap = modalEl.querySelector(".menu-modal__text-wrap");
  const imageWrap = modalEl.querySelector(".menu-modal__image-wrap");
  const imageEl = modalEl.querySelector(".menu-modal__image");
  const labelEl = modalEl.querySelector(".menu-modal__label");

  let lastFocus = null;

  const defaultTitles = {
    Café: "Frokostmenu",
    Fællesspisning: "Månedens menu",
    Arrangementer: "Oversigt over arrangementer",
  };

  function withCacheBust(url, version) {
    if (!url) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${encodeURIComponent(version || Date.now())}`;
  }

  function renderMenu(menu, label) {
    const defaultTitle = defaultTitles[label] || "Menu";
    const imageUrl = menu.imageUrl || null;

    if (imageUrl) {
      modalEl.classList.add("menu-modal--image");
      textWrap.hidden = true;
      imageWrap.hidden = false;
      titleEl.hidden = true;
      subtitleEl.hidden = true;
      labelEl.hidden = true;
      imageEl.src = withCacheBust(imageUrl, menu.updatedAt);
      imageEl.alt = menu.title || defaultTitle;
      return;
    }

    modalEl.classList.remove("menu-modal--image");
    imageWrap.hidden = true;
    textWrap.hidden = false;
    titleEl.hidden = false;
    labelEl.hidden = false;
    labelEl.textContent = label;
    titleEl.textContent = menu.title || defaultTitle;
    subtitleEl.textContent = "";
    subtitleEl.hidden = true;
    textEl.textContent = "Billedet er ikke tilgængeligt lige nu.";
  }

  async function openModal(apiUrl, label) {
    lastFocus = document.activeElement;

    try {
      const res = await fetch(`${apiUrl}?t=${Date.now()}`, { cache: "no-store" });
      renderMenu(await res.json(), label);
    } catch {
      renderMenu(
        {
          title: defaultTitles[label] || "Menu",
          imageUrl: null,
        },
        label
      );
    }

    modalEl.hidden = false;
    document.body.classList.add("modal-open");
    closeBtn.focus();
  }

  function closeModal() {
    modalEl.hidden = true;
    document.body.classList.remove("modal-open");
    imageEl.removeAttribute("src");
    if (lastFocus) lastFocus.focus();
  }

  entries.forEach(({ trigger, apiUrl, label }) => {
    const triggerEl = document.querySelector(trigger);
    if (!triggerEl) return;
    triggerEl.addEventListener("click", (e) => {
      e.preventDefault();
      openModal(apiUrl, label);
    });
  });

  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalEl.hidden) {
      closeModal();
    }
  });
}

window.initMenuModals = initMenuModals;
