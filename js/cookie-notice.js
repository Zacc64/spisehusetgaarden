const notice = document.getElementById("cookie-notice");
const okButton = document.getElementById("cookie-notice-ok");
const storageKey = "sg-cookie-notice";

if (notice && !localStorage.getItem(storageKey)) {
  notice.hidden = false;
}

okButton?.addEventListener("click", () => {
  localStorage.setItem(storageKey, "1");
  if (notice) notice.hidden = true;
});
