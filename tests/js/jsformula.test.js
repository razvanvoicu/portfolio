"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const JsFormula = require(path.join(__dirname, "..", "..", "sites", "formulas", "static", "jsformula.js"));

// Compact text for a block tree, e.g. f_add(x, 2).
function show(state) {
  if (state.type === "f_num") return String(state.fields.NUM);
  if (state.type === "f_var") return state.fields.NAME;
  if (state.type === "f_bool") return state.fields.V;
  if (state.type === "f_const") return state.fields.C;
  const inputs = Object.values(state.inputs || {}).map((input) => show(input.block));
  return `${state.type}(${inputs.join(", ")})`;
}

const shape = (source) => show(JsFormula.compile(source).state);

function assertFails(source, pattern) {
  assert.throws(() => JsFormula.compile(source), (error) => {
    assert.ok(error instanceof JsFormula.FormulaError, `expected a FormulaError for ${source}`);
    assert.match(error.message, pattern);
    assert.equal(typeof error.position, "number");
    return true;
  });
}

test("arithmetic keeps JavaScript precedence and associativity", () => {
  assert.equal(shape("x + 2 * y"), "f_add(x, f_mul(2, y))");
  assert.equal(shape("(x + 2) * y"), "f_mul(f_add(x, 2), y)");
  assert.equal(shape("10 - 5 - 2"), "f_sub(f_sub(10, 5), 2)");
  assert.equal(shape("12 / 2 / 3"), "f_div(f_div(12, 2), 3)");
  assert.equal(shape("10 - (5 - 2)"), "f_sub(10, f_sub(5, 2))");
  assert.equal(shape("5 * 3 % 4"), "f_rem(f_mul(5, 3), 4)");
  assert.equal(shape("2 ** 3 ** 3"), "f_pow(2, f_pow(3, 3))");
  assert.equal(shape("2 ** 3 ** 2"), "f_pow(2, f_sq(3))");
  assert.equal(shape("(2 ** 3) ** 2"), "f_sq(f_pow(2, 3))");
});

test("numbers and signs", () => {
  assert.equal(shape("-3"), "-3");
  assert.equal(shape("-x"), "f_neg(x)");
  assert.equal(shape("- -x"), "f_neg(f_neg(x))");
  assert.equal(shape("+x"), "x");
  assert.equal(shape("2 ** -1"), "f_pow(2, -1)");
  assert.equal(shape("1.5e3 + .5 + 2."), "f_add(f_add(1500, 0.5), 2)");
  assert.equal(shape("(-2) ** 2"), "f_sq(-2)");
});

test("a negative base needs parentheses, as in JavaScript", () => {
  assertFails("-2 ** 2", /parentheses/);
  assertFails("-x ** 2", /parentheses/);
});

test("constants, including the ones the blocks print for themselves", () => {
  assert.equal(shape("Math.PI"), "PI");
  assert.equal(shape("Math.PI / 2"), "PI2");
  assert.equal(shape("Math.PI / 4"), "PI4");
  assert.equal(shape("Math.PI / 3"), "f_div(PI, 3)");
  assert.equal(shape("Math.E"), "E");
  assert.equal(shape("2 * Math.PI"), "TAU");
  assert.equal(shape("x * 2 * Math.PI"), "f_mul(f_mul(x, 2), PI)");
  assert.equal(shape("Math.SQRT2"), "SQRT2");
  assert.equal(shape("Math.sqrt(2)"), "SQRT2");
  assert.equal(shape("Math.sqrt(3)"), "SQRT3");
  assert.equal(shape("Math.sqrt(5)"), "SQRT5");
  assert.equal(shape("Math.sqrt(7)"), "f_sqrt(7)");
  assert.equal(shape("Math.sqrt(x)"), "f_sqrt(x)");
  assert.equal(shape("Infinity"), "INF");
  assert.equal(shape("-Infinity"), "f_neg(INF)");
});

test("Math functions", () => {
  assert.equal(shape("Math.sin(x)"), "f_sin(x)");
  assert.equal(shape("Math.log(x)"), "f_ln(x)");
  assert.equal(shape("Math.log10(x) + Math.log2(y)"), "f_add(f_log10(x), f_log2(y))");
  assert.equal(shape("Math.min(x, 3)"), "f_min(x, 3)");
  assert.equal(shape("Math.atan2(y, x)"), "f_atan2(y, x)");
  assert.equal(shape("Math.pow(x, 3)"), "f_pow(x, 3)");
  assert.equal(shape("Math.pow(x, 2)"), "f_sq(x)");
  assert.equal(shape("Math.hypot(3, 4)"), "f_hypot(3, 4)");
});

test("shapes the blocks print for their own shortcuts are recognised", () => {
  assert.equal(shape("x ** 2"), "f_sq(x)");
  assert.equal(shape("1 / Math.cos(x)"), "f_sec(x)");
  assert.equal(shape("1 / Math.sin(x)"), "f_csc(x)");
  assert.equal(shape("1 / Math.tan(x)"), "f_cot(x)");
  assert.equal(shape("Math.log(x) / Math.log(2)"), "f_logb(x, 2)");
  assert.equal(shape("x ** (1 / 3)"), "f_nroot(x, 3)");
  assert.equal(shape("x * Math.PI / 180"), "f_torad(x)");
  assert.equal(shape("x * 180 / Math.PI"), "f_todeg(x)");
  assert.equal(shape("1 / Math.sqrt(x)"), "f_div(1, f_sqrt(x))");
});

test("logic, comparison and if-then-else", () => {
  assert.equal(shape("x > 1 ? x * 2 : -x"), "f_if(f_gt(x, 1), f_mul(x, 2), f_neg(x))");
  assert.equal(shape("a ? 1 : b ? 2 : 3"), "f_if(a, 1, f_if(b, 2, 3))");
  assert.equal(shape("a && b || c"), "f_or(f_and(a, b), c)");
  assert.equal(shape("a || b && c"), "f_or(a, f_and(b, c))");
  assert.equal(shape("!(x < 2)"), "f_not(f_lt(x, 2))");
  assert.equal(shape("x === 1"), "f_eq(x, 1)");
  assert.equal(shape("x == 1"), "f_eq(x, 1)");
  assert.equal(shape("x !== 1"), "f_ne(x, 1)");
  assert.equal(shape("x != 1"), "f_ne(x, 1)");
  assert.equal(shape("x <= 1 && x >= 0"), "f_and(f_le(x, 1), f_ge(x, 0))");
  assert.equal(shape("true"), "true");
  assert.equal(shape("x + 1 > 2 === true"), "f_eq(f_gt(f_add(x, 1), 2), true)");
});

test("variables are collected in order of first use", () => {
  const result = JsFormula.compile("y * x + y - z");
  assert.deepEqual(result.names, ["y", "x", "z"]);
  assert.equal(result.blocks, 7);
  const variables = [];
  (function walk(state) {
    if (state.type === "f_var") variables.push(state.data);
    for (const input of Object.values(state.inputs || {})) walk(input.block);
  })(result.state);
  assert.deepEqual(variables, ["y", "x", "y", "z"]);
});

test("the kind of value the formula gives", () => {
  assert.equal(JsFormula.compile("x + 1").type, "num");
  assert.equal(JsFormula.compile("x < 1").type, "bool");
  assert.equal(JsFormula.compile("x").type, "any");
  assert.equal(JsFormula.compile("c ? 1 : 2").type, "num");
});

test("numbers and true/false values are not mixed up", () => {
  assertFails("1 + (x < 2)", /true\/false value, but "\+" needs a number/);
  assertFails("!3", /a number, but "!" needs a true\/false value/);
  assertFails("3 ? 1 : 2", /condition/);
  assertFails("(x < 2) && 5", /a number, but "&&" needs a true\/false/);
  assertFails("Math.sin(x > 1)", /Math\.sin/);
  // A variable may hold either, so it is accepted anywhere.
  assert.equal(shape("!a && a + 1 > 2"), "f_and(f_not(a), f_gt(f_add(a, 1), 2))");
});

test("syntax errors say what is wrong and where", () => {
  assertFails("", /ends too soon/);
  assertFails("1 +", /ends too soon/);
  assertFails("(1 + 2", /ends too soon/);
  assertFails("1 + 2)", /Unexpected "\)"/);
  assertFails("1 2", /Unexpected "2"/);
  assertFails("x = 2", /"=" is not supported/);
  assertFails('"a"', /is not supported/);
  assertFails("x[0]", /"\[" is not supported/);
  assertFails("a & b", /"&" is not supported/);
  assertFails("2x", /Unexpected "x" after a number/);
  assertFails("1.2.3", /after a number/);
  assertFails("a ? 1", /ends too soon/);
  assertFails("foo(2)", /Only Math functions/);
  assertFails("Math.foo(2)", /Math\.foo is not supported/);
  assertFails("Math.LN2", /Math\.LN2 is not supported/);
  assertFails("Math.sin()", /needs 1 value/);
  assertFails("Math.min(1)", /needs 2 values/);
  assertFails("Math", /Math\.something/);
  assertFails("NaN", /not supported/);
  assertFails("1e999", /too large/);
});

test("errors point at the right character", () => {
  const position = (source) => {
    try {
      JsFormula.compile(source);
    } catch (error) {
      return error.position;
    }
    return null;
  };
  assert.equal(position("1 + * 2"), 4);
  assert.equal(position("x = 2"), 2);
  assert.equal(position("1 + (x < 2)"), 5); // the offending value, inside the parentheses
});

test("a trailing semicolon and surrounding whitespace are fine", () => {
  assert.equal(shape("  x + 1 ;  "), "f_add(x, 1)");
  assert.equal(shape("x + 1;"), "f_add(x, 1)");
});
