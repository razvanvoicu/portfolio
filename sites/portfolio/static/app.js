const categories = {
  "full-stack": { eyebrow: "Connected experiences", title: "Full-stack Apps", description: "Account-based apps with secure, saved data." },
  browser: { eyebrow: "Instant tools", title: "Browser Apps", description: "Lightweight apps that run entirely in your browser." },
};

const categoryButtons = document.querySelectorAll(".category-button");
const appPanels = document.querySelectorAll(".app-list");
const eyebrow = document.querySelector("#category-eyebrow");
const title = document.querySelector("#category-title");
const description = document.querySelector("#category-description");
const aboutOpen = document.querySelector("#about-open");
const aboutDialog = document.querySelector("#about-dialog");
const aboutClose = aboutDialog.querySelector(".dialog-close");

function closeAboutDialog() {
  if (!aboutDialog.open || aboutDialog.classList.contains("is-closing")) return;
  aboutDialog.classList.add("is-closing");
  aboutDialog.addEventListener("animationend", () => {
    aboutDialog.classList.remove("is-closing");
    aboutDialog.close();
  }, { once: true });
}

aboutOpen.addEventListener("click", () => aboutDialog.showModal());
aboutClose.addEventListener("click", closeAboutDialog);
aboutDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeAboutDialog();
});
aboutDialog.addEventListener("click", (event) => {
  if (event.target === aboutDialog) closeAboutDialog();
});

function closeAllApps() {
  document.querySelectorAll(".app-toggle[aria-expanded='true']").forEach((toggle) => {
    toggle.setAttribute("aria-expanded", "false");
    document.getElementById(toggle.getAttribute("aria-controls")).hidden = true;
    const card = toggle.closest(".app-card");
    card.classList.remove("is-expanded");
    card.querySelector(".play-button").hidden = false;
  });
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const category = button.dataset.category;
    const copy = categories[category];
    categoryButtons.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });
    appPanels.forEach((panel) => { panel.hidden = panel.dataset.panel !== category; });
    closeAllApps();
    eyebrow.textContent = copy.eyebrow;
    title.textContent = copy.title;
    description.textContent = copy.description;
  });
});

document.querySelectorAll(".app-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const wasOpen = toggle.getAttribute("aria-expanded") === "true";
    closeAllApps();
    if (!wasOpen) {
      toggle.setAttribute("aria-expanded", "true");
      document.getElementById(toggle.getAttribute("aria-controls")).hidden = false;
      const card = toggle.closest(".app-card");
      card.classList.add("is-expanded");
      card.querySelector(".play-button").hidden = true;
    }
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const links = document.querySelectorAll("a.external");
  links.forEach(function (link) {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });
});