"use strict";

// The graph view: plots the formula against one chosen variable over a range.
// It builds on app.js (loaded first), which owns the formula and the variables.
(() => {
  const view = $("#graph");
  const stage = $("#graph-stage");
  const canvas = $("#graph-canvas");
  const status = $("#graph-status");
  const varSelect = $("#graph-var");
  const fromInput = $("#graph-from");
  const toInput = $("#graph-to");
  const closeButton = $("#graph-close");
  const shareButton = $("#graph-share");
  const opener = $("#graph-open");
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
    return { a: from, b: to, lo: lo - pad, hi: hi + pad, xs, ys, f, name: variable.name, code: analysis.code };
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
    }
  }

  function describeCursor() {
    if (!plot) return;
    if (cursorX === null) {
      status.className = "overlay-status";
      status.textContent = `f(${plot.name}) = ${plot.code}`;
      return;
    }
    const { margin, pw } = layout();
    const x = plot.a + ((cursorX - margin.left) / pw) * (plot.b - plot.a);
    const y = plot.f(x);
    status.className = "overlay-status is-reading";
    status.textContent = `${plot.name} = ${format(x)}    f = ${Number.isFinite(y) ? format(y) : "undefined"}`;
  }

  function redraw() {
    if (view.hidden) return;
    const result = buildPlot();
    if (result.error) {
      plot = null;
      status.className = "overlay-status is-error";
      status.textContent = result.error;
    } else {
      plot = result;
      describeCursor();
    }
    draw();
  }

  // Copies the plotted range and formula as JSON: {"start", "end", "formula"}.
  // The formula is the expression as shown, so it still names the variable.
  async function share() {
    if (!plot) {
      showToast(status.textContent || "There is no graph to share yet.", true);
      return;
    }
    const json = JSON.stringify({ start: plot.a, end: plot.b, formula: plot.code });
    try {
      await copyText(json);
      showToast("Graph range and formula copied to the clipboard");
    } catch {
      showToast("Could not copy the graph", true);
    }
  }

  // ------------------------------------------------------------------ events

  function track(event) {
    if (!plot) return;
    const box = canvas.getBoundingClientRect();
    const { margin, pw } = layout();
    const x = event.clientX - box.left;
    cursorX = x >= margin.left && x <= margin.left + pw ? x : null;
    describeCursor();
    draw();
  }

  canvas.addEventListener("pointerdown", track);
  canvas.addEventListener("pointermove", track);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return; // a finger keeps its reading when lifted
    cursorX = null;
    describeCursor();
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !view.hidden) close();
  });
  new ResizeObserver(redraw).observe(stage);
})();
