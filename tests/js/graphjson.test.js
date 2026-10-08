"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const GraphJson = require(path.join(__dirname, "..", "..", "sites", "formulas", "static", "graphjson.js"));

const exported = {
  start: -2,
  end: 8,
  formula: "Math.sin(x) + y",
  variable_symbol: "x",
  variables: [
    { key: "x", value: 3 },
    { key: "y", value: 4 },
    { key: "flag", value: true },
    { key: "bad", value: null },
  ],
};
const text = (object) => JSON.stringify(object);

function assertFails(input, pattern) {
  assert.throws(() => GraphJson.parse(input), (error) => {
    assert.ok(error instanceof GraphJson.GraphError, `expected a GraphError, got ${error}`);
    assert.match(error.message, pattern);
    return true;
  });
}

test("reads what the graph's Share button produces", () => {
  const graph = GraphJson.parse(text(exported));
  assert.equal(graph.start, -2);
  assert.equal(graph.end, 8);
  assert.equal(graph.formula, "Math.sin(x) + y");
  assert.equal(graph.symbol, "x");
  assert.deepEqual(graph.variables, [
    { name: "x", value: 3 },
    { name: "y", value: 4 },
    { name: "flag", value: true },
    { name: "bad", value: null },
  ]);
  assert.deepEqual(graph.compiled.names, ["x", "y"]);
  assert.equal(graph.compiled.state.type, "f_add");
});

test("the minimal form works: start, end and a formula", () => {
  const graph = GraphJson.parse(text({ start: 0, end: 1, formula: "t * 2" }));
  assert.equal(graph.symbol, "t"); // taken from the formula
  assert.deepEqual(graph.variables, []);
});

test("variables may also be [key, value] pairs", () => {
  const graph = GraphJson.parse(text({ ...exported, variables: [["x", 1], ["y", 2]] }));
  assert.deepEqual(graph.variables, [{ name: "x", value: 1 }, { name: "y", value: 2 }]);
});

test("a symbol that the formula does not use is allowed", () => {
  const graph = GraphJson.parse(text({ ...exported, variable_symbol: "z" }));
  assert.equal(graph.symbol, "z");
});

test("anything that is not the expected JSON is explained", () => {
  assertFails("", /Paste the JSON/);
  assertFails("   ", /Paste the JSON/);
  assertFails("{nope", /not valid JSON/);
  assertFails("[1, 2]", /must be an object/);
  assertFails("42", /must be an object/);
  assertFails("null", /must be an object/);
});

test("the range is checked", () => {
  assertFails(text({ ...exported, start: undefined }), /"start" must be a number/);
  assertFails(text({ ...exported, end: "8" }), /"end" must be a number/);
  assertFails(text({ ...exported, start: 8, end: 8 }), /below/);
  assertFails(text({ ...exported, start: 9, end: 8 }), /below/);
});

test("the formula is checked", () => {
  assertFails(text({ ...exported, formula: undefined }), /"formula" must be/);
  assertFails(text({ ...exported, formula: "" }), /"formula" must be/);
  assertFails(text({ ...exported, formula: 3 }), /"formula" must be/);
  assertFails(text({ ...exported, formula: "x +" }), /The formula: .*ends too soon \(character 4\)/);
  assertFails(text({ ...exported, formula: "foo(1)" }), /The formula: Only Math functions/);
  assertFails(text({ start: 0, end: 1, formula: "2 + 3" }), /"variable_symbol" is missing/);
});

test("the variable symbol and variables are checked", () => {
  assertFails(text({ ...exported, variable_symbol: 5 }), /must be text/);
  assertFails(text({ ...exported, variable_symbol: "1x" }), /not a valid variable name/);
  assertFails(text({ ...exported, variable_symbol: "class" }), /keyword/);
  assertFails(text({ ...exported, variable_symbol: "Math" }), /reserved/);
  assertFails(text({ ...exported, variables: "x" }), /must be a list/);
  assertFails(text({ ...exported, variables: [{ key: "x" }] }), /needs a "key" and a "value"/);
  assertFails(text({ ...exported, variables: [{ key: "x", value: "3" }] }), /must be a number, true, false or null/);
  assertFails(text({ ...exported, variables: [{ key: "x", value: 1 }, { key: "x", value: 2 }] }), /listed twice/);
  assertFails(text({ ...exported, variables: [{ key: "a b", value: 1 }] }), /not a valid variable name/);
});
