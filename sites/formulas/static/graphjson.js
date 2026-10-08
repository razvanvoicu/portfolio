"use strict";

// Reads the JSON that the graph view's Share button produces:
//   { "start": n, "end": n, "formula": "<JS>",
//     "variable_symbol": "x", "variables": [ { "key": "x", "value": 3 }, ... ] }
// and checks every part of it. It has no browser dependencies, so it can be
// tested in Node; in the browser JsFormula comes from jsformula.js.
const GraphJson = (() => {
  const formulaParser = typeof JsFormula !== "undefined" ? JsFormula : require("./jsformula.js");

  class GraphError extends Error {
    constructor(message) {
      super(message);
      this.name = "GraphError";
    }
  }

  const RESERVED = new Set(["Math", "Infinity", "NaN", "undefined"]);

  function nameProblem(name) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return "is not a valid variable name";
    if (RESERVED.has(name)) return "is reserved";
    try {
      new Function(name, '"use strict";');
    } catch {
      return "is a JavaScript keyword";
    }
    return "";
  }

  function checkName(name, where) {
    if (typeof name !== "string") throw new GraphError(`${where} must be text.`);
    const problem = nameProblem(name);
    if (problem) throw new GraphError(`${where} "${name}" ${problem}.`);
  }

  function readVariables(list) {
    if (!Array.isArray(list)) throw new GraphError('"variables" must be a list.');
    const seen = new Set();
    return list.map((entry, index) => {
      // Normally { key, value }; a [key, value] pair is accepted too.
      const pair = Array.isArray(entry) ? { key: entry[0], value: entry[1] } : entry;
      if (!pair || typeof pair !== "object" || !("key" in pair) || !("value" in pair)) {
        throw new GraphError(`Variable ${index + 1} needs a "key" and a "value".`);
      }
      checkName(pair.key, `Variable ${index + 1}: the name`);
      if (seen.has(pair.key)) throw new GraphError(`The variable "${pair.key}" is listed twice.`);
      seen.add(pair.key);
      const { value } = pair;
      const fine = value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
      if (!fine) throw new GraphError(`The value of "${pair.key}" must be a number, true, false or null.`);
      return { name: pair.key, value };
    });
  }

  // Returns { start, end, formula, symbol, variables, compiled }, where
  // `compiled` is the formula as blocks (see jsformula.js) and `variables` are
  // { name, value } with value a number, a boolean, or null when unknown.
  // Throws GraphError saying what is wrong.
  function parse(text) {
    if (!text.trim()) throw new GraphError("Paste the JSON that a graph's Share button copied.");
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new GraphError(`This is not valid JSON (${error.message}).`);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new GraphError("The JSON must be an object with start, end and formula.");
    }

    for (const key of ["start", "end"]) {
      if (typeof data[key] !== "number" || !Number.isFinite(data[key])) {
        throw new GraphError(`"${key}" must be a number.`);
      }
    }
    if (data.start >= data.end) throw new GraphError('"start" must be below "end".');

    if (typeof data.formula !== "string" || !data.formula.trim()) {
      throw new GraphError('"formula" must be a JavaScript expression, as text.');
    }
    let compiled;
    try {
      compiled = formulaParser.compile(data.formula);
    } catch (error) {
      if (!(error instanceof formulaParser.FormulaError)) throw error;
      throw new GraphError(`The formula: ${error.message} (character ${error.position + 1}).`);
    }

    const variables = "variables" in data ? readVariables(data.variables) : [];

    let symbol = data.variable_symbol;
    if (symbol === undefined || symbol === null) {
      // Older exports have no symbol: take the formula's first variable.
      if (!compiled.names.length) {
        throw new GraphError('"variable_symbol" is missing and the formula uses no variable.');
      }
      symbol = compiled.names[0];
    }
    checkName(symbol, '"variable_symbol"');

    return { start: data.start, end: data.end, formula: data.formula, symbol, variables, compiled };
  }

  return { parse, GraphError };
})();

if (typeof module !== "undefined") module.exports = GraphJson;
