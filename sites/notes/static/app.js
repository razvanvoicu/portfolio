const menuToggle = document.querySelector("#menu-toggle");
const bookNav = document.querySelector("#book-nav");
const backdrop = document.querySelector("#nav-backdrop");
const readingPane = document.querySelector("#reading-pane");
const bookToggles = [...document.querySelectorAll(".book-toggle")];
const chapterLinks = [...document.querySelectorAll(".chapter-link")];
const chapters = [...document.querySelectorAll(".chapter")];

function expandBook(activeButton) {
  bookToggles.forEach((button) => {
    const expanded = button === activeButton;
    button.setAttribute("aria-expanded", String(expanded));
    document.getElementById(button.getAttribute("aria-controls")).hidden = !expanded;
  });
}

function setMenuOpen(open) {
  bookNav.classList.toggle("is-open", open);
  backdrop.hidden = !open;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close table of contents" : "Open table of contents");
}

function showChapter(id) {
  const article = chapters.find((chapter) => chapter.dataset.chapter === id);
  const link = chapterLinks.find((item) => item.getAttribute("href") === `#${id}`);
  if (!article || !link) return;

  chapters.forEach((chapter) => { chapter.hidden = chapter !== article; });
  chapterLinks.forEach((item) => {
    const active = item === link;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  expandBook(link.closest(".book").querySelector(".book-toggle"));
  readingPane.scrollTop = 0;
  setMenuOpen(false);
}

bookToggles.forEach((button) => {
  button.addEventListener("click", () => {
    expandBook(button.getAttribute("aria-expanded") === "true" ? null : button);
  });
});

chapterLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const id = link.getAttribute("href").slice(1);
    if (location.hash === `#${id}`) showChapter(id);
    else location.hash = id;
  });
});

window.addEventListener("hashchange", () => showChapter(decodeURIComponent(location.hash.slice(1))));
menuToggle.addEventListener("click", () => setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true"));
backdrop.addEventListener("click", () => setMenuOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    setMenuOpen(false);
    menuToggle.focus();
  }
});
window.matchMedia("(min-width: 761px)").addEventListener("change", (event) => {
  if (event.matches) setMenuOpen(false);
});

if (location.hash) showChapter(decodeURIComponent(location.hash.slice(1)));
