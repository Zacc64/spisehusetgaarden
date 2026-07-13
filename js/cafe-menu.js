const cafeLink = document.getElementById("cafe-link");
const modal = document.getElementById("cafe-modal");
const modalBackdrop = document.getElementById("cafe-modal-backdrop");
const modalClose = document.getElementById("cafe-modal-close");
const modalTitle = document.getElementById("cafe-modal-title");
const modalSubtitle = document.getElementById("cafe-modal-subtitle");
const modalText = document.getElementById("cafe-modal-text");
const modalImageWrap = document.getElementById("cafe-modal-image-wrap");
const modalImage = document.getElementById("cafe-modal-image");
const modalTextWrap = document.getElementById("cafe-modal-text-wrap");
const modalLabel = document.querySelector(".cafe-modal__label");

let menuData = null;
let lastFocus = null;

function renderMenu(menu) {
  menuData = menu;

  if (menu.mode === "image" && menu.imageUrl) {
    modal.classList.add("cafe-modal--image");
    modalTextWrap.hidden = true;
    modalImageWrap.hidden = false;
    modalTitle.hidden = true;
    modalSubtitle.hidden = true;
    modalLabel.hidden = true;
    modalImage.src = menu.imageUrl;
    modalImage.alt = menu.title || "Frokostmenu";
  } else {
    modal.classList.remove("cafe-modal--image");
    modalImageWrap.hidden = true;
    modalTextWrap.hidden = false;
    modalTitle.hidden = false;
    modalLabel.hidden = false;
    modalTitle.textContent = menu.title || "Frokostmenu";
    modalSubtitle.textContent = menu.subtitle || "";
    modalSubtitle.hidden = !menu.subtitle;
    modalText.textContent = menu.text || "Menu kommer snart.";
  }
}

async function loadMenu() {
  try {
    const res = await fetch("/api/menu");
    renderMenu(await res.json());
  } catch {
    renderMenu({
      mode: "text",
      title: "Frokostmenu",
      subtitle: "Café — tors–lør kl. 11–16",
      text: "Menu kunne ikke hentes lige nu.",
    });
  }
}

function openModal() {
  lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modalClose.focus();
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  if (lastFocus) lastFocus.focus();
}

cafeLink.addEventListener("click", (e) => {
  e.preventDefault();
  openModal();
});

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) {
    closeModal();
  }
});

loadMenu();
