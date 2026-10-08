"use strict";

// The graph view: plots the formula against one chosen variable over a range.
// It builds on app.js (loaded first), which owns the formula and the variables.
(() => {
  const view = $("#graph");
  const stage = $("#graph-stage");
  const canvas = $("#graph-canvas");
  const status = $("#graph-status");
  const formulaLine = $("#graph-formula");
  const varSelect = $("#graph-var");
  const fromInput = $("#graph-from");
  const toInput = $("#graph-to");
  const closeButton = $("#graph-close");
  const shareButton = $("#graph-share");
  const importSheet = $("#graph-import-sheet");
  const importText = $("#graph-import-text");
  const importStatus = $("#graph-import-status");
  const importApply = $("#graph-import-apply");
  const opener = $("#graph-open");
  const importOpener = $("#graph-import-open");
  const page = $("main.app");

  const MIN_SAMPLES = 200;
  const MAX_SAMPLES = 1600;

  let plot = null; // the samples currently drawn, or null when there is nothing to draw
  let cursorX = null; // pointer position inside the canvas, in CSS pixels

  // ---------------------------------------------------------------- opening

  function usedVariableIds() {
    const body = getRoot().getInputTargetBlock("EXPR");
    return new Set(body ? variableBlocksIn(body).map((block) => block.data) : []);
  }

  // Lists the variables that can be plotted and picks one: the last choice if
  // it still exists, otherwise the first variable the formula uses.
  function fillVariableSelect() {
    const options = variables.filter((variable) => !nameProblem(variable));
    const used = usedVariableIds();
    const chosen = options.find((variable) => variable.id === graphSettings.varId)
      || options.find((variable) => used.has(variable.id))
      || options[0];
    varSelect.replaceChildren(...options.map((variable) => new Option(variable.name, variable.id)));
    varSelect.disabled = options.length === 0;
    if (chosen) varSelect.value = chosen.id;
    graphSettings.varId = chosen ? chosen.id : null;
  }

  function open() {
    fillVariableSelect();
    fromInput.value = graphSettings.from;
    toInput.value = graphSettings.to;
    view.hidden = false;
    page.inert = true;
    closeButton.focus();
    scheduleSave();
    redraw();
  }

  function close() {
    view.hidden = true;
    page.inert = false;
    cursorX = null;
    plot = null;
    opener.focus();
  }

  // ---------------------------------------------------------------- sampling

  function parseNumber(text) {
    const trimmed = text.trim();
    const number = trimmed === "" ? NaN : Number(trimmed);
    return Number.isFinite(number) ? number : NaN;
  }

  // Evaluates the formula at evenly spaced values of the chosen variable. The
  // variable's own value is ignored; the others keep their current values.
  function buildPlot() {
    const variable = variableById(varSelect.value);
    if (!variable) return { error: "Add a variable to graph the formula." };

    const from = parseNumber(fromInput.value);
    const to = parseNumber(toInput.value);
    fromInput.classList.toggle("is-invalid", Number.isNaN(from));
    toInput.classList.toggle("is-invalid", Number.isNaN(to));
    if (Number.isNaN(from) || Number.isNaN(to)) return { error: "Enter the range as two numbers." };
    if (from >= to) return { error: "The lower end of the range must be below the upper end." };

    const analysis = analyze(variable.id);
    if (analysis.state !== "ok") return { error: messageFor(analysis, "graph it") };

    const others = variables.filter(
      (other) => other !== variable && !nameProblem(other) && parseValue(other.text).ok
    );
    const fixed = others.map((other) => parseValue(other.text).value);
    // The other variables the formula uses, so the graph can be read on its own.
    const held = others.filter((other) => analysis.used.has(other.id));
    const compute = new Function(variable.name, ...others.map((other) => other.name),
      `"use strict"; return (${analysis.code});`);
    const f = (x) => {
      try {
        const y = Number(compute(x, ...fixed)); // a truth value plots as 1 or 0
        return Number.isFinite(y) ? y : NaN;
      } catch {
        return NaN;
      }
    };

    const dpr = window.devicePixelRatio || 1;
    const count = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.round((stage.clientWidth * dpr) / 2)));
    const xs = [];
    const ys = [];
    for (let i = 0; i < count; i += 1) {
      const x = from + ((to - from) * i) / (count - 1);
      xs.push(x);
      ys.push(f(x));
    }

    const finite = ys.filter(Number.isFinite).sort((p, q) => p - q);
    if (!finite.length) return { error: "The formula has no real values on this range." };

    // Poles (such as tan) would flatten everything else, so ignore the extremes.
    let lo = finite[0];
    let hi = finite[finite.length - 1];
    if (finite.length > 40) {
      lo = finite[Math.floor(finite.length * 0.01)];
      hi = finite[Math.ceil(finite.length * 0.99) - 1];
    }
    if (hi - lo < 1e-12) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    return {
      a: from, b: to, lo: lo - pad, hi: hi + pad, xs, ys, f,
      name: variable.name, code: analysis.code,
      held: held.map((other) => `${other.name} = ${formatValue(parseValue(other.text).value)}`),
    };
  }

  // ----------------------------------------------------------------- drawing

  function niceStep(range, targetTicks) {
    const raw = range / Math.max(1, targetTicks);
    const power = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw / power;
    return power * (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10);
  }

  function format(value) {
    return String(Number(value.toPrecision(7)));
  }

  function layout() {
    const u = unitPixels();
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const margin = { left: u * 11, right: u * 3, top: u * 2.5, bottom: u * 7 };
    return { u, w, h, margin, pw: w - margin.left - margin.right, ph: h - margin.top - margin.bottom };
  }

  function draw() {
    const { u, w, h, margin, pw, ph } = layout();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!plot || pw < 10 || ph < 10) return;

    const style = getComputedStyle(document.documentElement);
    const color = (name) => style.getPropertyValue(name).trim();
    const { a, b, lo, hi, xs, ys } = plot;
    const xOf = (x) => margin.left + ((x - a) / (b - a)) * pw;
    const yOf = (y) => margin.top + ((hi - y) / (hi - lo)) * ph;

    ctx.font = `${u * 3.4}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(1, u * 0.25);

    // Grid and tick labels.
    ctx.fillStyle = color("--muted");
    ctx.strokeStyle = color("--line");
    const xStep = niceStep(b - a, pw / (u * 18));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let t = Math.ceil(a / xStep); t * xStep <= b + xStep * 1e-9; t += 1) {
      const x = xOf(t * xStep);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + ph);
      ctx.stroke();
      ctx.fillText(format(t * xStep), x, margin.top + ph + u * 1.5);
    }
    const yStep = niceStep(hi - lo, ph / (u * 12));
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let t = Math.ceil(lo / yStep); t * yStep <= hi + yStep * 1e-9; t += 1) {
      const y = yOf(t * yStep);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + pw, y);
      ctx.stroke();
      ctx.fillText(format(t * yStep), margin.left - u * 1.5, y);
    }

    // The axes through zero, where they fall inside the view.
    ctx.strokeStyle = color("--muted");
    ctx.lineWidth = Math.max(1, u * 0.4);
    if (a <= 0 && b >= 0) {
      ctx.beginPath();
      ctx.moveTo(xOf(0), margin.top);
      ctx.lineTo(xOf(0), margin.top + ph);
      ctx.stroke();
    }
    if (lo <= 0 && hi >= 0) {
      ctx.beginPath();
      ctx.moveTo(margin.left, yOf(0));
      ctx.lineTo(margin.left + pw, yOf(0));
      ctx.stroke();
    }

    // The curve, broken at gaps and at jumps taller than the whole plot.
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, pw, ph);
    ctx.clip();
    ctx.strokeStyle = color("--accent");
    ctx.lineWidth = Math.max(1.5, u * 0.7);
    ctx.lineJoin = "round";
    ctx.beginPath();
    let previous = null;
    for (let i = 0; i < xs.length; i += 1) {
      if (!Number.isFinite(ys[i])) {
        previous = null;
        continue;
      }
      const x = xOf(xs[i]);
      const y = yOf(ys[i]);
      if (previous === null || Math.abs(y - previous) > ph) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      previous = y;
    }
    ctx.stroke();
    ctx.restore();

    // The reading under the pointer.
    if (cursorX !== null) {
      const x = a + ((cursorX - margin.left) / pw) * (b - a);
      const y = plot.f(x);
      ctx.strokeStyle = color("--text");
      ctx.lineWidth = Math.max(1, u * 0.3);
      ctx.setLineDash([u, u]);
      ctx.beginPath();
      ctx.moveTo(cursorX, margin.top);
      ctx.lineTo(cursorX, margin.top + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      if (Number.isFinite(y) && y >= lo && y <= hi) {
        ctx.fillStyle = color("--accent");
        ctx.beginPath();
        ctx.arc(cursorX, yOf(y), u * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // A label with the values, kept inside the plot and out of the pointer's way.
      const label = `${plot.name} = ${format(x)}    f = ${Number.isFinite(y) ? format(y) : "undefined"}`;
      ctx.font = `600 ${u * 3.8}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
      const padding = u * 1.6;
      const boxWidth = ctx.measureText(label).width + 2 * padding;
      const boxHeight = u * 3.8 + 2 * padding;
      const left = cursorX + u * 2 + boxWidth <= margin.left + pw ? cursorX + u * 2 : cursorX - u * 2 - boxWidth;
      const top = margin.top + u * 1.5;
      ctx.fillStyle = "rgba(21, 28, 40, 0.94)";
      ctx.strokeStyle = color("--accent");
      ctx.lineWidth = Math.max(1, u * 0.3);
      ctx.beginPath();
      ctx.roundRect(Math.max(margin.left, left), top, boxWidth, boxHeight, u * 1.4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color("--accent");
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, Math.max(margin.left, left) + padding, top + boxHeight / 2);
    }
  }

  // The formula behind the graph, always on screen, followed by the fixed
  // values it was drawn with. (The reading under the pointer is drawn on the plot.)
  function showFormula() {
    const formula = document.createElement("span");
    formula.textContent = `f(${plot.name}) = ${plot.code}`;
    const parts = [formula];
    if (plot.held.length) {
      const values = document.createElement("span");
      values.className = "graph-formula-values";
      values.textContent = `   with ${plot.held.join(", ")}`;
      parts.push(values);
    }
    formulaLine.replaceChildren(...parts);
  }

  function redraw() {
    if (view.hidden) return;
    const result = buildPlot();
    if (result.error) {
      plot = null;
      formulaLine.replaceChildren();
      status.className = "overlay-status is-error";
      status.textContent = result.error;
    } else {
      plot = result;
      showFormula();
      status.className = "overlay-status";
      status.textContent = "";
    }
    draw();
  }

  // Copies the graph as JSON: the range, the formula, the variable on the X
  // axis, and the value of every defined variable (null when the text typed
  // for it is not a number or true/false).
  async function share() {
    if (!plot) {
      showToast(status.textContent || "There is no graph to share yet.", true);
      return;
    }
    const json = JSON.stringify({
      start: plot.a,
      end: plot.b,
      formula: plot.code,
      variable_symbol: plot.name,
      variables: variables
        .filter((variable) => !nameProblem(variable))
        .map((variable) => {
          const parsed = parseValue(variable.text);
          return { key: variable.name, value: parsed.ok ? parsed.value : null };
        }),
    });
    try {
      await copyText(json);
      showToast("Graph copied to the clipboard");
    } catch {
      showToast("Could not copy the graph", true);
    }
  }

  // ------------------------------------------------------------ graph import

  let parsedGraph = null; // the typed JSON, once it has passed every check

  function setImportStatus(kind, message) {
    importStatus.className = kind ? `overlay-status is-${kind}` : "overlay-status";
    importStatus.textContent = message;
  }

  // Checks what is typed and says whether, and how, it can be imported.
  function checkGraphImport() {
    parsedGraph = null;
    importApply.disabled = true;
    graphImportDraft = importText.value;
    scheduleSave();
    if (!importText.value.trim()) {
      setImportStatus("", "Paste the JSON that a graph's Share button copied.");
      return;
    }
    try {
      const graph = GraphJson.parse(importText.value);
      const known = new Set(variables.map((variable) => variable.name));
      const wanted = [
        ...graph.variables.filter((variable) => variable.value !== null).map((variable) => variable.name),
        graph.symbol,
        ...graph.compiled.names,
      ];
      const fresh = [...new Set(wanted)].filter((name) => !known.has(name));
      const hasFormula = Boolean(getRoot().getInputTargetBlock("EXPR"));
      const parts = [
        `Ready: ${graph.symbol} from ${graph.start} to ${graph.end}.`,
        hasFormula ? "The current formula goes to the stash." : "",
        "Variables are merged, none are removed.",
        fresh.length ? `New: ${fresh.join(", ")}.` : "",
      ];
      parsedGraph = graph;
      importApply.disabled = false;
      setImportStatus("ready", parts.filter(Boolean).join(" "));
    } catch (error) {
      if (!(error instanceof GraphJson.GraphError)) throw error;
      setImportStatus("error", error.message);
    }
  }

  function openGraphImport() {
    importText.value = graphImportDraft;
    importSheet.hidden = false;
    view.inert = true;
    checkGraphImport();
    importText.focus();
    importText.setSelectionRange(importText.value.length, importText.value.length);
  }

  function closeGraphImport() {
    importSheet.hidden = true;
    view.inert = false;
    importOpener.focus();
  }

  // Sets the editor and the graph to what the JSON describes. The formula it
  // replaces goes to the stash, variables are merged (the imported value wins
  // for a name that already exists), and no variable is removed.
  function applyGraphImport() {
    const graph = parsedGraph;
    if (!graph) return;

    const added = [];
    for (const { name, value } of graph.variables) {
      const existing = variables.find((variable) => variable.name === name);
      if (existing) {
        if (value !== null) existing.text = String(value);
      } else if (value !== null) {
        addVariable(name, String(value));
        added.push(name);
      }
    }

    const installed = installFormula(graph.compiled, { stashPrevious: true });
    added.push(...installed.added);

    let symbol = variables.find((variable) => variable.name === graph.symbol);
    if (!symbol) {
      symbol = addVariable(graph.symbol, "1");
      added.push(graph.symbol);
      renderVariables();
      variablesChanged();
    }

    graphSettings.varId = symbol.id;
    graphSettings.from = String(graph.start);
    graphSettings.to = String(graph.end);
    graphImportDraft = "";
    importText.value = "";
    closeGraphImport();
    Blockly.common.setSelected(installed.block);

    fillVariableSelect();
    fromInput.value = graphSettings.from;
    toInput.value = graphSettings.to;
    scheduleSave();
    redraw();

    const notes = [
      installed.stashed ? "The previous formula is in the stash." : "",
      added.length ? `Added ${added.join(", ")}.` : "",
    ].filter(Boolean);
    showToast(["Graph imported.", ...notes].join(" "));
  }

  // ------------------------------------------------------------------ events

  function track(event) {
    if (!plot) return;
    const box = canvas.getBoundingClientRect();
    const { margin, pw } = layout();
    const x = event.clientX - box.left;
    cursorX = x >= margin.left && x <= margin.left + pw ? x : null;
    draw();
  }

  canvas.addEventListener("pointerdown", track);
  canvas.addEventListener("pointermove", track);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return; // a finger keeps its reading when lifted
    cursorX = null;
    draw();
  });

  varSelect.addEventListener("change", () => {
    graphSettings.varId = varSelect.value;
    scheduleSave();
    redraw();
  });
  for (const [input, key] of [[fromInput, "from"], [toInput, "to"]]) {
    input.addEventListener("input", () => {
      graphSettings[key] = input.value;
      scheduleSave();
      redraw();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });
  }

  opener.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  shareButton.addEventListener("click", share);
  importOpener.addEventListener("click", openGraphImport);
  $("#graph-import-close").addEventListener("click", closeGraphImport);
  importApply.addEventListener("click", applyGraphImport);
  importText.addEventListener("input", checkGraphImport);
  importText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      applyGraphImport();
    }
  });
  importSheet.addEventListener("click", (event) => {
    if (event.target === importSheet) closeGraphImport(); // the dimmed area around the sheet
  });
  // Escape closes the sheet first, without also closing the graph behind it.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || importSheet.hidden) return;
    event.stopPropagation();
    closeGraphImport();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !view.hidden) close();
  });
  new ResizeObserver(redraw).observe(stage);
})();
