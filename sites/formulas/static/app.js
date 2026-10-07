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

let variables = [];
let nextVarId = 1;
let stash = [];
let nextStashId = 1;
let workspace = null;
let activeTab = "num";
// What the user last chose in the graph view: the variable's id and the range,
// kept as typed so a half-edited value is not rewritten under the cursor.
let graphSettings = { varId: null, from: "-10", to: "10" };
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

function renderVariables() {
  const rows = variables.map((variable) => {
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
  varsList.replaceChildren(...rows);
  refreshValidity();
}

function refreshValidity() {
  for (const row of varsList.children) {
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
// needed (the graph substitutes its own), so a bad value there is not an error.
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
    } else if (variable.id !== ignoreValueOf && !parseValue(variable.text).ok) {
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
    const expression = document.createElement("span");
    expression.className = "result-expression";
    expression.textContent = result.code;
    const equals = document.createElement("span");
    equals.className = "result-equals";
    equals.textContent = " = ";
    const value = document.createElement("span");
    value.className = "result-value";
    value.textContent = formatValue(result.value);
    resultLine.replaceChildren(expression, equals, value);
    return;
  }
  resultLine.classList.add(result.state === "error" ? "is-error" : "is-muted");
  resultLine.textContent = messageFor(result, "see the result");
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

function deleteSelected() {
  const block = selectedBlock();
  if (!block) {
    flashNote("Select a block to delete.");
    return;
  }
  block.checkAndDelete();
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

function stashBlock(block) {
  const state = Blockly.serialization.blocks.save(block, { addCoordinates: false, addNextBlocks: false });
  stash.push({ id: `s${nextStashId}`, state: stripIds(state) });
  nextStashId += 1;
  renderStash();
  scheduleSave();
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
  scheduleSave();
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
  // Typing Enter or Space on a focused item adds the block loose in the editor.
  element.addEventListener("click", (event) => {
    if (event.detail === 0) spawnLoose(getState());
    else flashNote("Drag it into the editor, onto the spot you want.");
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

function createBlock(state, clientX, clientY) {
  const at = clientToWorkspace(clientX, clientY);
  Blockly.Events.setGroup(true);
  try {
    const block = Blockly.serialization.blocks.append({ ...state, x: at.x, y: at.y }, workspace, { recordUndo: true });
    Blockly.renderManagement.triggerQueuedRenders(workspace);
    const size = block.getHeightWidth();
    const grip = Math.min(size.width / 2, 14 / workspace.getScale());
    block.moveTo(new Blockly.utils.Coordinate(at.x - grip, at.y - size.height / 2));
    spawnedIds.add(block.id);
    return block;
  } finally {
    Blockly.Events.setGroup(false);
  }
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

// Keyboard route: the block appears loose in the middle of the editor view.
function spawnLoose(state) {
  const rect = editorRect();
  const block = createBlock(state, rect.left + rect.width / 2, rect.top + rect.height / 2);
  Blockly.common.setSelected(block);
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

// Shrinks the view, down to a legible floor, so everything in the editor is
// visible. Only runs after a change, so it never fights the user's panning, and
// never while something is being dragged.
function fitView() {
  if (!workspace || paletteDrag || workspace.isDragging() || Blockly.WidgetDiv.isVisible()) return;
  const box = workspace.getBlocksBoundingBox();
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width <= 0 || height <= 0) return;

  const metrics = workspace.getMetrics();
  const pad = unitPixels() * 2;
  const available = Math.min(
    (metrics.viewWidth - 2 * pad) / width,
    (metrics.viewHeight - 2 * pad) / height
  );
  // Never shrink below a legible size; anything wider is panned.
  const scale = Math.max(baseScale() * 0.55, Math.min(baseScale(), available));
  if (Math.abs(scale - workspace.getScale()) > 0.005) workspace.setScale(scale);
  const top = Math.max(pad, (metrics.viewHeight - height * scale) / 2);
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
    const g = saved.graphSettings;
    if (g && typeof g.from === "string" && typeof g.to === "string") {
      graphSettings = { varId: typeof g.varId === "string" ? g.varId : null, from: g.from, to: g.to };
    }
  } else {
    addVariable("x", "3");
    addVariable("y", "4");
  }

  createWorkspace(saved);
  renderVariables();
  renderPalette();
  renderStash();

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

  $("#add-var").addEventListener("click", () => {
    addVariable();
    renderVariables();
    variablesChanged();
    const rows = varsList.children;
    const last = rows[rows.length - 1];
    last.scrollIntoView({ block: "nearest" });
    last.querySelector(".var-name").select();
  });
  $("#undo").addEventListener("click", () => workspace.undo(false));
  $("#redo").addEventListener("click", () => workspace.undo(true));
  $("#delete").addEventListener("click", deleteSelected);
  $("#clear").addEventListener("click", clearEditor);
  // Keep the editor's selection when one of these buttons is pressed.
  for (const id of ["#undo", "#redo", "#delete", "#clear", "#add-var"]) {
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
