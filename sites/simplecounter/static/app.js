const STORAGE_KEY = "simple-counter:count";
const EDIT_ICON = "✎";
const CONFIRM_ICON = "⏎";

const countField = document.querySelector("#count-field");
const resetButton = document.querySelector("#reset-button");
const editButton = document.querySelector("#edit-button");
const incrementButton = document.querySelector("#increment-button");

let count = loadCount();
let editing = false;

function loadCount() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const parsed = stored === null ? 0 : parseInt(stored, 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

function saveCount() {
  localStorage.setItem(STORAGE_KEY, String(count));
}

function render() {
  countField.value = String(count);
}

function setCount(value) {
  count = value;
  saveCount();
  render();
}

function startEditing() {
  editing = true;
  countField.readOnly = false;
  editButton.textContent = CONFIRM_ICON;
  editButton.setAttribute("aria-label", "Confirm the new count");
  countField.focus();
  const end = countField.value.length;
  countField.setSelectionRange(end, end);
}

function commitEditing() {
  if (!editing) return;
  editing = false;
  countField.readOnly = true;
  editButton.textContent = EDIT_ICON;
  editButton.setAttribute("aria-label", "Edit the count");

  const raw = countField.value.trim();
  if (/^-?\d+$/.test(raw)) {
    setCount(parseInt(raw, 10));
  } else {
    render();
  }
}

function pulse(button) {
  button.classList.remove("is-pressed");
  void button.offsetWidth;
  button.classList.add("is-pressed");
}

editButton.addEventListener("click", () => {
  if (editing) {
    commitEditing();
  } else {
    startEditing();
  }
});

countField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitEditing();
  }
});

countField.addEventListener("blur", (event) => {
  // Clicking the edit button also blurs the field first. Let that click's
  // own handler decide what happens instead of committing here too, or the
  // button's toggle logic re-enters edit mode right after this exits it.
  if (event.relatedTarget === editButton) return;
  if (editing) commitEditing();
});

resetButton.addEventListener("click", () => {
  if (editing) commitEditing();
  setCount(0);
});

incrementButton.addEventListener("click", () => {
  if (editing) commitEditing();
  setCount(count + 1);
  pulse(incrementButton);
});

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
