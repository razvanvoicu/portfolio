"use strict";

// The import view: reads a JavaScript formula and turns it into blocks in the
// main formula. The parsing itself lives in jsformula.js; this file is the
// view and the step of putting the result into the editor.
(() => {
  const view = $("#import");
  const text = $("#import-text");
  const status = $("#import-status");
  const convertButton = $("#import-convert");
  const closeButton = $("#import-close");
  const opener = $("#import-open");
  const page = $("main.app");

  let compiled = null; // the result of the last successful parse of the text

  function setStatus(kind, message) {
    status.className = kind ? `overlay-status is-${kind}` : "overlay-status";
    status.textContent = message;
  }

  // Parses what is typed and says whether, and how, it can be converted.
  function check() {
    compiled = null;
    convertButton.disabled = true;
    importDraft = text.value;
    scheduleSave();

    if (!text.value.trim()) {
      setStatus("", "Supported: numbers, variables, + - * / % **, comparisons, && || !, ? :, true and false, and Math functions and constants.");
      return;
    }
    try {
      const result = JsFormula.compile(text.value);
      const fresh = result.names.filter((name) => !variables.some((variable) => variable.name === name));
      const unusable = fresh.find((name) => nameProblem({ name }));
      if (unusable) {
        setStatus("error", `"${unusable}" cannot be used as a variable name here.`);
        return;
      }
      compiled = result;
      const blocks = `${result.blocks} block${result.blocks === 1 ? "" : "s"}`;
      const added = fresh.length ? ` It adds the variable${fresh.length === 1 ? "" : "s"} ${fresh.join(", ")}.` : "";
      setStatus("ready", `Ready: ${blocks}. The main formula will be replaced.${added}`);
      convertButton.disabled = false;
    } catch (error) {
      if (!(error instanceof JsFormula.FormulaError)) throw error;
      setStatus("error", `${error.message} (character ${error.position + 1}).`);
    }
  }

  // Replaces the main formula with the converted blocks, adding the variables
  // the formula mentions that do not exist yet.
  function apply() {
    if (!compiled) return;
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
    let created = null;
    Blockly.Events.setGroup(true);
    try {
      const old = root.getInputTargetBlock("EXPR");
      if (old) old.dispose(false);
      created = Blockly.serialization.blocks.append(bind(compiled.state), workspace, { recordUndo: true });
      root.getInput("EXPR").connection.connect(created.outputConnection);
    } finally {
      Blockly.Events.setGroup(false);
    }

    const count = compiled.blocks;
    importDraft = "";
    text.value = "";
    close();
    Blockly.common.setSelected(created);
    const note = added.length ? ` Added variable${added.length === 1 ? "" : "s"} ${added.join(", ")}.` : "";
    showToast(`Formula imported: ${count} block${count === 1 ? "" : "s"}.${note}`);
  }

  function open() {
    // Start from what the user was typing, or else from the current formula.
    const current = formulaCode("import it");
    text.value = importDraft || current.code || "";
    view.hidden = false;
    page.inert = true;
    check();
    text.focus();
    text.setSelectionRange(text.value.length, text.value.length);
  }

  function close() {
    view.hidden = true;
    page.inert = false;
    opener.focus();
  }

  opener.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  convertButton.addEventListener("click", apply);
  text.addEventListener("input", check);
  text.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      apply();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !view.hidden) close();
  });
})();
