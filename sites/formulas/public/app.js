"use strict";

const STORAGE_KEY = "formulas:state:v1";
const RESERVED_NAMES = new Set(["Math", "Infinity", "NaN", "undefined"]);
const NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SUGGESTED_NAMES = ["x", "y", "z", "a", "b", "c", "d", "n", "m", "k", "t", "u", "v", "w"];
const INPUT_VALUE = Blockly.ConnectionType.INPUT_VALUE;
const DRAG_THRESHOLD = 8; // pixels before a press on a palette item becomes a drag
const O = javascript.Order;
const generator = javascript.javascriptGenerator;

const $ = (selector) => document.querySelector(selector);
const varsList = $("#vars-list");
const resultLine = $("#result-line");
const resultNote = $("#result-note");
const paletteTabs = $("#palette-tabs");
const paletteItems = $("#palette-items");
const stashChips = $("#stash-chips");
const stashMenu = $("#stash-menu");
const varsSection = $(".vars");
const varsSheet = $("#vars-sheet");
const varsSheetList = $("#vars-sheet-list");

let variables = [];
let nextVarId = 1;
let stash = [];
let nextStashId = 1;
let workspace = null;
let activeTab = "num";
// What the user last chose in the graph view: the variable's id and the range,
// kept as typed so a half-edited value is not rewritten under the cursor.
let graphSettings = { varId: null, from: "-10", to: "10" };
// Text typed into the import view and not yet converted.
let importDraft = "";
// The same for the graph import pop-up.
let graphImportDraft = "";
let noteTimer = 0;
let updateQueued = false;
let saveTimer = 0;
let paletteDrag = null;
let lastPointer = { x: 0, y: 0 };
const spawnedIds = new Set();

// ---------------------------------------------------------------- variables

function nameProblem(variable) {
  const name = variable.name;
  if (!name) return "Enter a name";
  if (!NAME_PATTERN.test(name)) return "Use letters, digits, _ or $, not starting with a digit";
  if (RESERVED_NAMES.has(name)) return `"${name}" is reserved`;
  try {
    new Function(name, '"use strict";');
  } catch {
    return `"${name}" is a JavaScript keyword`;
  }
  if (variables.some((other) => other !== variable && other.name === name)) {
    return `"${name}" is used twice`;
  }
  return "";
}

function parseValue(text) {
  const trimmed = text.trim();
  if (trimmed === "true") return { ok: true, value: true };
  if (trimmed === "false") return { ok: true, value: false };
  const number = trimmed === "" ? NaN : Number(trimmed);
  return Number.isFinite(number) ? { ok: true, value: number } : { ok: false };
}

function variableById(id) {
  return variables.find((variable) => variable.id === id);
}

function newVariableName() {
  const used = new Set(variables.map((variable) => variable.name));
  const free = SUGGESTED_NAMES.find((name) => !used.has(name));
  if (free) return free;
  let n = 1;
  while (used.has(`v${n}`)) n += 1;
  return `v${n}`;
}

function addVariable(name = newVariableName(), text = "1") {
  const variable = { id: `v${nextVarId}`, name, text };
  nextVarId += 1;
  variables.push(variable);
  return variable;
}

function makeInput(className, value, label, mode) {
  const input = document.createElement("input");
  input.className = className;
  input.type = "text";
  input.value = value;
  input.setAttribute("aria-label", label);
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.enterKeyHint = "done";
  input.inputMode = mode;
  return input;
}

// One row per variable. The same rows are built for the strip on the page and
// for the pop-up sheet that opens when the strip is too small to show them all.
function buildVariableRows() {
  return variables.map((variable) => {
    const row = document.createElement("div");
    row.className = "var-row";

    const name = makeInput("var-input var-name", variable.name, "Variable name", "text");
    name.addEventListener("input", () => {
      variable.name = name.value.trim();
      variablesChanged();
    });

    const equals = document.createElement("span");
    equals.className = "var-equals";
    equals.textContent = "=";
    equals.setAttribute("aria-hidden", "true");

    const value = makeInput("var-input var-value", variable.text, "Variable value", "text");
    value.addEventListener("input", () => {
      variable.text = value.value;
      variablesChanged();
    });

    for (const input of [name, value]) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") input.blur();
      });
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "var-delete";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", `Delete variable ${variable.name}`);
    remove.addEventListener("click", () => {
      variables = variables.filter((other) => other !== variable);
      renderVariables();
      variablesChanged();
    });

    row.append(name, equals, value, remove);
    row.dataset.id = variable.id;
    return row;
  });
}

function renderVariables() {
  varsList.replaceChildren(...buildVariableRows());
  if (!varsSheet.hidden) varsSheetList.replaceChildren(...buildVariableRows());
  refreshValidity();
  updateCrowded();
}

function refreshValidity() {
  for (const row of [...varsList.children, ...varsSheetList.children]) {
    const variable = variableById(row.dataset.id);
    if (!variable) continue;
    const problem = nameProblem(variable);
    const value = parseValue(variable.text);
    const [name, , valueInput] = row.children;
    name.classList.toggle("is-invalid", Boolean(problem));
    name.setAttribute("aria-invalid", problem ? "true" : "false");
    name.title = problem;
    valueInput.classList.toggle("is-invalid", !value.ok);
    valueInput.setAttribute("aria-invalid", value.ok ? "false" : "true");
    valueInput.title = value.ok ? "" : "Enter a number, true or false";
  }
}

// The variables strip keeps room for at least one variable. When it cannot
// show them all, pressing it opens a sheet where they are all in full view.
function isCrowded() {
  return varsList.scrollHeight > varsList.clientHeight + 1;
}

function updateCrowded() {
  varsSection.classList.toggle("is-crowded", isCrowded());
}

function openVarsSheet(focusId) {
  varsSheetList.replaceChildren(...buildVariableRows());
  refreshValidity();
  varsSheet.hidden = false;
  $("main.app").inert = true;
  const row = [...varsSheetList.children].find((candidate) => candidate.dataset.id === focusId);
  const target = row ? row.querySelector(".var-name") : $("#vars-sheet-close");
  target.focus();
  if (row) {
    row.scrollIntoView({ block: "nearest" });
    target.select();
  }
}

function closeVarsSheet() {
  if (varsSheet.hidden) return;
  varsSheet.hidden = true;
  $("main.app").inert = false;
  renderVariables(); // the strip catches up with what was edited in the sheet
  $("#add-var").focus();
}

// Adds a variable and puts the cursor in its name, wherever it is shown.
function addVariableFromUser() {
  const variable = addVariable();
  renderVariables();
  variablesChanged();
  if (!varsSheet.hidden) {
    const row = [...varsSheetList.children].find((candidate) => candidate.dataset.id === variable.id);
    row.scrollIntoView({ block: "nearest" });
    row.querySelector(".var-name").select();
  } else if (isCrowded()) {
    openVarsSheet(variable.id);
  } else {
    const row = varsList.lastElementChild;
    row.scrollIntoView({ block: "nearest" });
    row.querySelector(".var-name").select();
  }
}

function bindVarsSheet() {
  // While the strip is crowded its inputs ignore the pointer (see the style
  // sheet), so a press lands on the strip itself and opens the sheet.
  varsSection.addEventListener("click", (event) => {
    if (!varsSection.classList.contains("is-crowded") || event.target.closest("#add-var")) return;
    openVarsSheet(null);
  });
  // Tabbing into a hidden-away variable opens the sheet too.
  varsList.addEventListener("focusin", (event) => {
    if (!varsSection.classList.contains("is-crowded")) return;
    const row = event.target.closest(".var-row");
    event.target.blur();
    openVarsSheet(row && row.dataset.id);
  });
  $("#vars-sheet-add").addEventListener("click", addVariableFromUser);
  $("#vars-sheet-close").addEventListener("click", closeVarsSheet);
  varsSheet.addEventListener("click", (event) => {
    if (event.target === varsSheet) closeVarsSheet(); // a press on the dimmed page behind
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !varsSheet.hidden) closeVarsSheet();
  });
  new ResizeObserver(updateCrowded).observe(varsList);
}

function variablesChanged() {
  refreshValidity();
  renderPalette();
  renderStash();
  scheduleUpdate();
  scheduleSave();
}

// Keep variable blocks in step with the variable list: names follow renames,
// and blocks whose variable has been deleted are painted red.
function syncVariableBlocks() {
  Blockly.Events.disable();
  try {
    for (const block of workspace.getAllBlocks(false)) {
      if (block.type !== "f_var") continue;
      let variable = variableById(block.data);
      if (!variable) {
        // A deleted variable that is added back under the same name re-links.
        variable = variables.find((other) => other.name === block.getFieldValue("NAME") && !nameProblem(other));
        if (variable) block.data = variable.id;
      }
      const label = variable ? variable.name || "?" : block.getFieldValue("NAME");
      if (block.getFieldValue("NAME") !== label) block.setFieldValue(label, "NAME");
      block.setColour(variable ? FormulaBlocks.COLOR.vars : "#b3413f");
    }
  } finally {
    Blockly.Events.enable();
  }
}

// ---------------------------------------------------------------- evaluation

function emptyInputs(block, found = []) {
  for (const input of block.inputList) {
    const connection = input.connection;
    if (!connection || connection.type !== INPUT_VALUE) continue;
    const child = connection.targetBlock();
    if (child) emptyInputs(child, found);
    else found.push(connection);
  }
  return found;
}

function variableBlocksIn(block, found = []) {
  if (block.type === "f_var") found.push(block);
  for (const child of block.getChildren(false)) variableBlocksIn(child, found);
  return found;
}

function formatValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Number(value.toPrecision(15))) : String(value);
  }
  return String(value);
}

function getRoot() {
  return workspace.getTopBlocks(false).find((block) => block.type === "f_root");
}

// Checks that the editor holds exactly one complete, valid formula and returns
// its JavaScript expression. `ignoreValueOf` is a variable id whose value is not
// needed (the graph substitutes its own), so a bad value there is not an error;
// `true` ignores every variable's value (the expression alone is wanted).
function analyze(ignoreValueOf = null) {
  const root = getRoot();
  const body = root.getInputTargetBlock("EXPR");
  const loose = workspace.getTopBlocks(false).filter((block) => block !== root).length;

  // A result only makes sense when the editor holds exactly one formula.
  const formulas = (body ? 1 : 0) + loose;
  if (formulas > 1) return { state: "multiple", count: formulas };
  if (!body) return { state: loose ? "loose" : "empty" };

  const missing = emptyInputs(body).length;
  if (missing) return { state: "incomplete", missing };

  const problems = [];
  const used = new Set();
  for (const block of variableBlocksIn(body)) {
    const variable = variableById(block.data);
    if (!variable) {
      problems.push(`"${block.getFieldValue("NAME")}" is not defined`);
      continue;
    }
    used.add(variable.id);
    if (nameProblem(variable)) {
      problems.push(`Fix the name of variable "${variable.name}"`);
    } else if (ignoreValueOf !== true && variable.id !== ignoreValueOf && !parseValue(variable.text).ok) {
      problems.push(`Variable ${variable.name} needs a number, true or false`);
    }
  }
  if (problems.length) return { state: "error", message: [...new Set(problems)][0] };

  generator.init(workspace);
  return { state: "ok", code: generator.valueToCode(root, "EXPR", O.NONE), used };
}

function evaluate() {
  const analysis = analyze();
  if (analysis.state !== "ok") return analysis;
  const usable = variables.filter((variable) => !nameProblem(variable) && parseValue(variable.text).ok);
  try {
    const compute = new Function(...usable.map((variable) => variable.name), `"use strict"; return (${analysis.code});`);
    const value = compute(...usable.map((variable) => parseValue(variable.text).value));
    if (typeof value !== "number" && typeof value !== "boolean") {
      return { state: "error", message: "The formula does not produce a number or a truth value" };
    }
    return { state: "ok", code: analysis.code, value };
  } catch (error) {
    return { state: "error", message: String(error.message || error) };
  }
}

// The main formula as JavaScript text, without evaluating it. Returns
// { code } or, when there is nothing usable, { message } saying what to fix.
function formulaCode(goal) {
  const analysis = analyze(true);
  return analysis.state === "ok" ? { code: analysis.code } : { message: messageFor(analysis, goal) };
}

// What to tell the user when the editor does not hold a usable formula.
function messageFor(result, goal) {
  switch (result.state) {
    case "empty": return "Drag a block from above into the editor to start a formula.";
    case "loose": return `Drag the loose formula into the main formula block to ${goal}.`;
    case "multiple": return `There are ${result.count} formulas in the editor. Keep only one to ${goal}.`;
    case "incomplete":
      return `Fill the ${result.missing === 1 ? "empty slot" : `${result.missing} empty slots`} to ${goal}.`;
    default: return result.message;
  }
}

function renderResult(result) {
  resultLine.className = "result-line";
  if (result.state === "ok") {
    const equals = document.createElement("span");
    equals.className = "result-equals";
    equals.textContent = "= ";
    const value = document.createElement("span");
    value.className = "result-value";
    value.textContent = formatValue(result.value);
    resultLine.classList.add("is-value");
    resultLine.replaceChildren(equals, value);
    return;
  }
  resultLine.classList.add(result.state === "error" ? "is-error" : "is-muted");
  resultLine.textContent = messageFor(result, "see the result");
}

let toastTimers = [];

// A pop-up that stays for 3 seconds and then fades out.
function showToast(text, isError = false) {
  const toast = $("#toast");
  for (const timer of toastTimers) clearTimeout(timer);
  toast.textContent = text;
  toast.className = isError ? "toast is-error" : "toast";
  toast.hidden = false;
  toastTimers = [
    setTimeout(() => toast.classList.add("is-fading"), 3000),
    setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove("is-fading");
    }, 3600),
  ];
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Refused (for example, the page lost focus): try the older way below.
    }
  }
  // Older browsers and plain-http pages have no async clipboard.
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy failed");
}

async function shareFormula() {
  const result = formulaCode("share it");
  if (!result.code) {
    showToast(result.message, true);
    return;
  }
  try {
    await copyText(result.code);
    showToast("Formula copied to the clipboard");
  } catch {
    showToast("Could not copy the formula", true);
  }
}

function flashNote(text) {
  resultNote.textContent = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    resultNote.textContent = "";
  }, 3500);
}

function scheduleUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  setTimeout(() => {
    updateQueued = false;
    syncVariableBlocks();
    renderResult(evaluate());
  }, 0);
}

// ---------------------------------------------------------------- persistence

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 300);
}

// Saves at once, for when the page is about to go away.
function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveState();
}

function saveState() {
  saveTimer = 0;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      variables,
      nextVarId,
      stash,
      nextStashId,
      activeTab,
      graphSettings,
      importDraft,
      graphImportDraft,
      workspace: Blockly.serialization.workspaces.save(workspace),
    }));
  } catch {
    // Storage unavailable (private browsing, quota): the app still works.
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.variables)) return null;
    return saved;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------- blocks

// The block the user last selected, other than the permanent main block.
function selectedBlock() {
  const block = Blockly.common.getSelected();
  return block instanceof Blockly.BlockSvg && block.type !== "f_root" ? block : null;
}

// Whether two block trees are the same formula: same blocks, fields and
// variables, however they were produced.
function sameFormula(a, b) {
  if (a.type !== b.type || a.data !== b.data) return false;
  if (JSON.stringify(a.fields || {}) !== JSON.stringify(b.fields || {})) return false;
  const left = a.inputs || {};
  const right = b.inputs || {};
  const names = Object.keys(left);
  if (names.length !== Object.keys(right).length) return false;
  return names.every((name) => right[name] && sameFormula(left[name].block, right[name].block));
}

// Replaces the main formula with a formula read from JavaScript (see
// jsformula.js), adding any variable it uses that does not exist yet, with the
// value 1. With `stashPrevious`, the formula being replaced is kept in the
// stash instead of being thrown away. Returns the block that now holds the
// formula, the names added, and whether the previous formula was stashed.
function installFormula(compiled, { stashPrevious = false } = {}) {
  const added = [];
  for (const name of compiled.names) {
    if (!variables.some((variable) => variable.name === name)) {
      addVariable(name, "1");
      added.push(name);
    }
  }
  const idByName = new Map(variables.map((variable) => [variable.name, variable.id]));
  const bind = (state) => {
    const copy = { ...state };
    if (state.type === "f_var") copy.data = idByName.get(state.fields.NAME);
    if (state.inputs) {
      copy.inputs = Object.fromEntries(
        Object.entries(state.inputs).map(([name, input]) => [name, { block: bind(input.block) }])
      );
    }
    return copy;
  };

  renderVariables();
  variablesChanged();

  const root = getRoot();
  const old = root.getInputTargetBlock("EXPR");
  const incoming = bind(compiled.state);
  // A formula identical to the one coming in is not worth keeping a copy of.
  const unchanged = old && sameFormula(Blockly.serialization.blocks.save(old), incoming);
  const stashed = Boolean(old && stashPrevious && !unchanged && stashBlock(old));
  let block = null;
  Blockly.Events.setGroup(true);
  try {
    if (old) old.dispose(false);
    block = Blockly.serialization.blocks.append(incoming, workspace, { recordUndo: true });
    root.getInput("EXPR").connection.connect(block.outputConnection);
  } finally {
    Blockly.Events.setGroup(false);
  }
  return { block, added, stashed, hadPrevious: Boolean(old) };
}

function clearEditor() {
  const root = getRoot();
  Blockly.Events.setGroup(true);
  try {
    for (const block of workspace.getTopBlocks(false)) {
      if (block !== root) block.dispose(false);
    }
    const body = root.getInputTargetBlock("EXPR");
    if (body) body.dispose(false);
  } finally {
    Blockly.Events.setGroup(false);
  }
}

// ------------------------------------------------------------------- palette

function paletteCategories() {
  const named = variables.filter((variable) => variable.name && !nameProblem(variable));
  return [
    ...FormulaBlocks.PALETTE,
    {
      id: "vars", label: "Vars",
      items: named.map((variable) => ({
        label: variable.name, title: `Variable ${variable.name}`,
        type: "f_var", varId: variable.id, name: variable.name,
      })),
      emptyText: "Add a variable below to use it here.",
    },
  ];
}

function stateFor(item) {
  if (item.type === "f_var") return { type: "f_var", data: item.varId, fields: { NAME: item.name } };
  const state = { type: item.type };
  if (item.fields) state.fields = { ...item.fields };
  return state;
}

function renderPalette() {
  const categories = paletteCategories();
  const active = categories.find((category) => category.id === activeTab) || categories[0];

  paletteTabs.replaceChildren(...categories.map((category) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.textContent = category.label;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(category === active));
    tab.addEventListener("click", () => {
      activeTab = category.id;
      renderPalette();
      scheduleSave();
    });
    return tab;
  }));

  paletteItems.style.setProperty("--c", FormulaBlocks.COLOR[active.id] || FormulaBlocks.COLOR.vars);
  if (!active.items.length) {
    const empty = document.createElement("p");
    empty.className = "palette-empty";
    empty.textContent = active.emptyText || "";
    paletteItems.replaceChildren(empty);
    return;
  }
  paletteItems.replaceChildren(...active.items.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "item";
    button.textContent = item.label;
    button.title = item.title;
    button.setAttribute("aria-label", item.title);
    bindDragSource(button, () => stateFor(item), item.label);
    return button;
  }));
}

// --------------------------------------------------------------------- stash

function stripIds(state) {
  return JSON.parse(JSON.stringify(state, (key, value) => (key === "id" ? undefined : value)));
}

function stashLabel(entry) {
  return FormulaBlocks.describe(entry.state, (state) => {
    const variable = variableById(state.data);
    return variable ? variable.name : (state.fields && state.fields.NAME) || "?";
  });
}

// Keeps a copy of a block, and everything attached to it, in the stash. Any
// formula can be stashed, complete or not. A formula that is already in the
// stash is not added a second time. Returns whether something was added.
function stashBlock(block) {
  const state = stripIds(Blockly.serialization.blocks.save(block, { addCoordinates: false, addNextBlocks: false }));
  const text = JSON.stringify(state);
  if (stash.some((entry) => JSON.stringify(entry.state) === text)) return false;
  stash.push({ id: `s${nextStashId}`, state });
  nextStashId += 1;
  renderStash();
  scheduleSave();
  return true;
}

function renderStash() {
  stashChips.replaceChildren(...stash.map((entry) => {
    const label = stashLabel(entry);
    const chip = document.createElement("div");
    chip.className = "chip";

    const body = document.createElement("span");
    body.className = "chip-body";
    body.textContent = label;
    body.title = label;
    bindDragSource(body, () => structuredClone(entry.state), label, { stashId: entry.id });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-remove";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", `Remove ${label} from the stash`);
    remove.addEventListener("click", () => removeFromStash(entry.id));

    chip.append(body, remove);
    return chip;
  }));
}

function removeFromStash(id) {
  stash = stash.filter((entry) => entry.id !== id);
  renderStash();
  if (!stashMenu.hidden) renderStashMenu();
  scheduleSave();
}

// The strip shows only as many chips as fit. When some are cut off, pressing
// the stash lists every stashed formula, one per row, in a pop-up menu.
function stashOverflows() {
  return stashChips.scrollWidth > stashChips.clientWidth + 1;
}

function renderStashMenu() {
  if (!stash.length) {
    const empty = document.createElement("p");
    empty.className = "menu-empty";
    empty.textContent = "Nothing is stashed yet.";
    stashMenu.replaceChildren(empty);
    return;
  }
  stashMenu.replaceChildren(...stash.map((entry) => {
    const label = stashLabel(entry);
    const row = document.createElement("div");
    row.className = "menu-row";
    row.setAttribute("role", "none");

    const item = document.createElement("button");
    item.type = "button";
    item.className = "menu-item";
    item.setAttribute("role", "menuitem");
    item.textContent = label;
    item.title = label;
    item.addEventListener("click", () => recallFromStash(entry.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "menu-remove";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", `Remove ${label} from the stash`);
    remove.addEventListener("click", () => removeFromStash(entry.id));

    row.append(item, remove);
    return row;
  }));
}

function openStashMenu() {
  renderStashMenu();
  const anchor = $("#stash").getBoundingClientRect();
  stashMenu.hidden = false;
  // Opens upward from the stash, which sits near the bottom of the screen.
  stashMenu.style.left = `${anchor.left}px`;
  stashMenu.style.width = `${anchor.width}px`;
  stashMenu.style.bottom = `${window.innerHeight - anchor.top + unitPixels()}px`;
  stashMenu.style.maxHeight = `${Math.max(anchor.top - unitPixels() * 4, unitPixels() * 20)}px`;
  const first = stashMenu.querySelector(".menu-item");
  if (first) first.focus();
}

function closeStashMenu() {
  stashMenu.hidden = true;
}

function bindStashMenu() {
  const stashArea = $("#stash");
  // Capture phase: with cut-off chips, a press anywhere on the stash opens the
  // list instead of acting on the chip underneath.
  stashArea.addEventListener("click", (event) => {
    if (event.target.closest(".chip-remove")) return;
    if (!stashOverflows()) return;
    event.stopPropagation();
    if (stashMenu.hidden) openStashMenu();
    else closeStashMenu();
  }, true);
  stashArea.addEventListener("keydown", (event) => {
    if (event.target !== stashArea || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (stashMenu.hidden) openStashMenu();
    else closeStashMenu();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!stashMenu.hidden && !stashMenu.contains(event.target) && !stashArea.contains(event.target)) closeStashMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !stashMenu.hidden) closeStashMenu();
  });
  window.addEventListener("resize", closeStashMenu);
}

// ------------------------------------------------------- dragging into editor

function insideRect(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function editorRect() {
  return $("#editor").getBoundingClientRect();
}

function clientToWorkspace(x, y) {
  const box = workspace.getParentSvg().getBoundingClientRect();
  const origin = workspace.getOriginOffsetInPixels();
  const scale = workspace.getScale();
  return new Blockly.utils.Coordinate((x - box.left - origin.x) / scale, (y - box.top - origin.y) / scale);
}

// Palette items and stash chips are plain HTML, outside Blockly, so a press on
// one is turned into a drag by hand: a ghost follows the pointer until it
// reaches the editor, where the block is created under it and Blockly takes
// over the gesture (snapping, preview, trash and stash drops).
function bindDragSource(element, getState, label, source = {}) {
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    cancelPaletteDrag(); // a lost pointerup must never leave the palette dead
    paletteDrag = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      state: getState(),
      label,
      source,
      moved: false,
      spawned: false,
      ghost: null,
    };
  });
  element.addEventListener("click", (event) => {
    if (source.stashId) {
      recallFromStash(source.stashId); // a stash chip: a tap brings the formula back
    } else if (event.detail === 0) {
      addSecondary(getState()); // Enter or Space on a focused palette item
    } else {
      flashNote("Drag it into the editor, onto the spot you want.");
    }
  });
}

function onPaletteDragMove(event) {
  const drag = paletteDrag;
  if (!drag || drag.spawned || event.pointerId !== drag.pointerId) return;

  if (!drag.moved) {
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    // A touch that moves sideways is the browser scrolling the strip.
    const started = drag.pointerType === "touch"
      ? Math.abs(dy) > DRAG_THRESHOLD && Math.abs(dy) > Math.abs(dx)
      : Math.hypot(dx, dy) > DRAG_THRESHOLD;
    if (!started) return;
    drag.moved = true;
    drag.ghost = document.createElement("div");
    drag.ghost.className = "ghost";
    drag.ghost.textContent = drag.label;
    document.body.append(drag.ghost);
  }

  drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -140%)`;
  if (insideRect(editorRect(), event.clientX, event.clientY)) spawnUnderPointer(drag, event);
}

function cancelPaletteDrag() {
  if (paletteDrag && paletteDrag.ghost) paletteDrag.ghost.remove();
  paletteDrag = null;
  document.body.classList.remove("is-dragging");
}

function endPaletteDrag(event) {
  const drag = paletteDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  cancelPaletteDrag();

  // A stash chip released on the trash is removed from the stash.
  if (!drag.spawned && drag.moved && drag.source.stashId) {
    if (insideRect($("#trash").getBoundingClientRect(), event.clientX, event.clientY)) {
      removeFromStash(drag.source.stashId);
    }
  }
  setTimeout(fitView, 150);
}

function createBlockAt(state, x, y) {
  Blockly.Events.setGroup(true);
  try {
    const block = Blockly.serialization.blocks.append({ ...state, x, y }, workspace, { recordUndo: true });
    Blockly.renderManagement.triggerQueuedRenders(workspace);
    return block;
  } finally {
    Blockly.Events.setGroup(false);
  }
}

// A new block with the pointer resting on its left part.
function createBlock(state, clientX, clientY) {
  const at = clientToWorkspace(clientX, clientY);
  const block = createBlockAt(state, at.x, at.y);
  const size = block.getHeightWidth();
  const grip = Math.min(size.width / 2, 14 / workspace.getScale());
  block.moveTo(new Blockly.utils.Coordinate(at.x - grip, at.y - size.height / 2));
  spawnedIds.add(block.id);
  return block;
}

function spawnUnderPointer(drag, event) {
  drag.spawned = true;
  drag.ghost.remove();
  document.body.classList.add("is-dragging");
  const block = createBlock(drag.state, event.clientX, event.clientY);
  Blockly.common.setSelected(block);

  // Hand the pointer to Blockly as if the user had pressed on the new block.
  block.getSvgRoot().dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: event.clientX,
    clientY: event.clientY,
  }));
}

// Adds a block or formula to the editor as a secondary formula: loose, just
// below everything already there, with nothing to drag.
function addSecondary(state) {
  const box = workspace.getBlocksBoundingBox();
  const gap = (unitPixels() * 3) / workspace.getScale();
  const block = createBlockAt(state, box.left, box.bottom + gap);
  Blockly.common.setSelected(block);
  return block;
}

function recallFromStash(id) {
  const entry = stash.find((candidate) => candidate.id === id);
  if (!entry) return;
  addSecondary(structuredClone(entry.state));
  closeStashMenu();
}

// A block released outside the editor, and not on the trash, stash or palette,
// would be stranded out of view: new blocks are discarded, others brought back.
function afterDrop(blockId) {
  const block = workspace.getBlockById(blockId);
  if (!block || block.getParent()) return;
  const rect = editorRect();
  if (insideRect(rect, lastPointer.x, lastPointer.y)) return;
  if (spawnedIds.has(blockId)) {
    block.dispose(false);
  } else {
    block.moveTo(clientToWorkspace(rect.left + 24, rect.top + 24));
  }
}

// ------------------------------------------------------------ trash and stash

function makeDropTarget(id, element, { deletes, onDrop }) {
  return {
    id,
    getClientRect: () => Blockly.utils.Rect.from(element.getBoundingClientRect()),
    onDragEnter: () => element.classList.add("is-over"),
    onDragOver: () => {},
    onDragExit: () => element.classList.remove("is-over"),
    onDrop: (draggable) => {
      element.classList.remove("is-over");
      if (onDrop) onDrop(draggable);
    },
    shouldPreventMove: () => false,
    wouldDelete: () => deletes,
  };
}

function registerDropTargets() {
  const manager = workspace.getComponentManager();
  const { DRAG_TARGET, DELETE_AREA } = Blockly.ComponentManager.Capability;
  const weight = Blockly.ComponentManager.ComponentWeight.TRASHCAN_WEIGHT;

  // Dropping a block on the trash, or back on the palette, deletes it.
  for (const [id, element] of [["formulas-trash", $("#trash")], ["formulas-palette", $("#palette")]]) {
    manager.addComponent({
      component: makeDropTarget(id, element, { deletes: true }),
      weight,
      capabilities: [DRAG_TARGET, DELETE_AREA],
    });
  }

  // Dropping a block on the stash keeps a copy there and takes it off the editor.
  manager.addComponent({
    component: makeDropTarget("formulas-stash", $("#stash"), {
      deletes: false,
      onDrop: (draggable) => {
        if (!(draggable instanceof Blockly.BlockSvg)) return;
        stashBlock(draggable);
        setTimeout(() => {
          if (draggable.disposed) return;
          Blockly.Events.setGroup(true);
          try {
            draggable.dispose(false);
          } finally {
            Blockly.Events.setGroup(false);
          }
        }, 0);
      },
    }),
    weight,
    capabilities: [DRAG_TARGET],
  });
}

// ----------------------------------------------------------------- workspace

function unitPixels() {
  return $("#unit-probe").getBoundingClientRect().width || 4;
}

function baseScale() {
  return Math.max(0.5, unitPixels() / 4);
}

const MIN_EDITOR_UNITS = 40; // the editor is never shorter than this, in layout units
let editorUnits = 0;

// Frames everything in the editor. The scale is chosen so the width fits (down
// to a legible floor; anything wider is panned), and the editor itself grows to
// hold the full height plus a little room for panning. Only runs after a
// change, so it never fights the user's panning, and never during a drag.
function fitView() {
  if (!workspace || paletteDrag || workspace.isDragging() || Blockly.WidgetDiv.isVisible()) return;
  const box = workspace.getBlocksBoundingBox();
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width <= 0 || height <= 0) return;

  const unit = unitPixels();
  const pad = unit * 2;
  const room = unit * 8;
  let metrics = workspace.getMetrics();
  const scale = Math.max(baseScale() * 0.55, Math.min(baseScale(), (metrics.viewWidth - 2 * pad) / width));
  if (Math.abs(scale - workspace.getScale()) > 0.005) workspace.setScale(scale);

  const units = Math.max(MIN_EDITOR_UNITS, Math.ceil((height * scale + 2 * room) / unit));
  if (units !== editorUnits) {
    editorUnits = units;
    $("#editor").style.setProperty("--editor-need", `calc(var(--u) * ${units})`);
    Blockly.svgResize(workspace);
    metrics = workspace.getMetrics();
  }
  const top = Math.max(room, (metrics.viewHeight - height * scale) / 2);
  workspace.scroll(pad - box.left * scale, top - box.top * scale);

  // Content wider than the view: keep the block being edited in sight.
  const selected = selectedBlock();
  if (selected) {
    const block = selected.getSvgRoot().getBoundingClientRect();
    const view = workspace.getParentSvg().getBoundingClientRect();
    if (block.left < view.left || block.right > view.right || block.top < view.top || block.bottom > view.bottom) {
      workspace.centerOnBlock(selected.id, true);
    }
  }
}

function onWorkspaceEvent(event) {
  if (event.type === Blockly.Events.BLOCK_DRAG) {
    if (!event.isStart) {
      setTimeout(() => afterDrop(event.blockId), 0);
      setTimeout(fitView, 50);
    }
    return;
  }
  if (event.isUiEvent || event.type === Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE) return;
  scheduleUpdate();
  scheduleSave();
  setTimeout(fitView, 0);
}

function createWorkspace(saved) {
  const theme = Blockly.Theme.defineTheme("formulas", {
    name: "formulas",
    base: Blockly.Themes.Zelos,
    fontStyle: { family: "system-ui, 'Segoe UI', sans-serif", weight: "600", size: 12 },
    componentStyles: {
      workspaceBackgroundColour: "#0e131c",
      scrollbarColour: "#4a5a73",
      scrollbarOpacity: 0.55,
      insertionMarkerColour: "#ffffff",
      insertionMarkerOpacity: 0.3,
      cursorColour: "#74e1c1",
    },
  });

  workspace = Blockly.inject("blockly", {
    renderer: "zelos",
    theme,
    sounds: false,
    trashcan: false, // replaced by the trash and stash in the dock below the editor
    collapse: false,
    disable: false,
    zoom: { controls: false, wheel: true, pinch: true, startScale: baseScale(), minScale: 0.3, maxScale: 2.5, scaleSpeed: 1.1 },
    move: { scrollbars: true, drag: true, wheel: false },
  });

  if (saved && saved.workspace) {
    try {
      Blockly.serialization.workspaces.load(saved.workspace, workspace);
    } catch {
      workspace.clear();
    }
  }
  if (!getRoot()) {
    workspace.clear();
    Blockly.serialization.blocks.append({ type: "f_root", x: 0, y: 0 }, workspace);
  }

  registerDropTargets();
  workspace.addChangeListener(onWorkspaceEvent);
  new ResizeObserver(() => {
    Blockly.svgResize(workspace);
    fitView();
  }).observe($("#blockly"));
}

// ---------------------------------------------------------------------- init

function init() {
  const saved = loadState();
  if (saved) {
    variables = saved.variables
      .filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.text === "string")
      .map((v) => ({ id: v.id, name: v.name, text: v.text }));
    nextVarId = Number.isInteger(saved.nextVarId) ? saved.nextVarId : variables.length + 1;
    if (Array.isArray(saved.stash)) {
      stash = saved.stash.filter((entry) => entry && typeof entry.id === "string" && entry.state && entry.state.type);
      nextStashId = Number.isInteger(saved.nextStashId) ? saved.nextStashId : stash.length + 1;
    }
    if (typeof saved.activeTab === "string") activeTab = saved.activeTab;
    if (typeof saved.importDraft === "string") importDraft = saved.importDraft;
    if (typeof saved.graphImportDraft === "string") graphImportDraft = saved.graphImportDraft;
    const g = saved.graphSettings;
    if (g && typeof g.from === "string" && typeof g.to === "string") {
      graphSettings = { varId: typeof g.varId === "string" ? g.varId : null, from: g.from, to: g.to };
    }
  }
  // A first visit starts with no variables at all.

  createWorkspace(saved);
  renderVariables();
  renderPalette();
  renderStash();
  bindStashMenu();

  window.addEventListener("pointermove", (event) => {
    lastPointer = { x: event.clientX, y: event.clientY };
    onPaletteDragMove(event);
  }, true);
  window.addEventListener("pointerup", endPaletteDrag);
  window.addEventListener("pointercancel", endPaletteDrag);
  window.addEventListener("blur", cancelPaletteDrag);
  // Nothing the user entered may be lost when the page is closed or backgrounded.
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });

  $("#add-var").addEventListener("click", addVariableFromUser);
  bindVarsSheet();
  $("#undo").addEventListener("click", () => workspace.undo(false));
  $("#redo").addEventListener("click", () => workspace.undo(true));
  $("#clear").addEventListener("click", clearEditor);
  $("#share").addEventListener("click", shareFormula);
  // Keep the editor's selection when one of these buttons is pressed.
  for (const id of ["#undo", "#redo", "#clear", "#share", "#add-var", "#vars-sheet-add"]) {
    $(id).addEventListener("pointerdown", (event) => event.preventDefault());
  }
  $("#trash").addEventListener("click", () => flashNote("Drag a block onto the trash to delete it."));

  scheduleUpdate();
  setTimeout(fitView, 0);
}

init();

// Best-effort visit tracking, via the shared backend proxied at /stats/.
// Runs once per page load; never blocks or breaks the page on failure.
(function () {
  const STORAGE_KEY = "stats-key";
  let key = null;
  try {
    key = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (e.g. private browsing); proceed keyless.
  }

  fetch("/stats/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(key ? { key } : {}),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data || !data.key) return;
      try {
        localStorage.setItem(STORAGE_KEY, data.key);
      } catch {
        // ignore
      }
    })
    .catch(() => {});
})();
