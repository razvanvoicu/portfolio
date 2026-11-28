"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const RT = require(path.join(__dirname, "..", "..", "sites", "formulas", "static", "runtime.js"));
const JsFormula = require(path.join(__dirname, "..", "..", "sites", "formulas", "static", "jsformula.js"));

const evalVal = (source, vars = {}, varTypes = null, options = {}) => JsFormula.evaluate(source, vars, varTypes, options).value;

test("unqualified Math constants and functions evaluate and are reserved", () => {
  assert.ok(Math.abs(evalVal("cos(PI / 3)") - 0.5) < 1e-12);
  assert.ok(Math.abs(evalVal("sin(2 * PI / 3) - sqrt(3) / 2")) < 1e-12);
  assert.ok(Math.abs(evalVal("sin(PI / 6)") - 0.5) < 1e-12);
  assert.ok(Math.abs(evalVal("PI / 5 + 2 * PI / 5 - 3 * Math.PI / 5")) < 1e-12);
  assert.ok(Math.abs(evalVal("PI / 7 + 2 * PI / 7 - 3 * PI / 7")) < 1e-12);
  assert.ok(Math.abs(evalVal("PI / 8 + 3 * PI / 8 - PI / 2")) < 1e-12);
  for (const name of ["cos", "sin", "PI", "E", "SQRT2", "lambda", "mu", "from", "replace", "length", "dateAdd"]) {
    assert.ok(RT.RESERVED_NAMES.has(name), `${name} should be reserved`);
  }
  assert.throws(() => JsFormula.compile("lambda(cos, cos + 1)"), /reserved/);
  assert.throws(() => JsFormula.compile("lambda(mu, mu)"), /reserved/);
  assert.throws(() => JsFormula.compile("lambda(lambda, 1)"), /reserved/);
});

test("string functions including sed-style replace backreferences", () => {
  assert.equal(evalVal('length("hello")'), 5);
  assert.equal(evalVal('trim("  hi  ")'), "hi");
  assert.equal(evalVal('substring("abcdef", 2, 3)'), "cde");
  assert.equal(evalVal('capitalize("hello world")'), "Hello world");
  assert.equal(evalVal('capitalize("")'), "");
  assert.equal(evalVal('toUpper("aBc")'), "ABC");
  assert.equal(evalVal('toLower("aBc")'), "abc");
  assert.equal(evalVal('append("foo", "bar")'), "foobar");
  assert.equal(evalVal('times("ab", 3)'), "ababab");
  assert.equal(evalVal('find("hello 123", "[0-9]+")'), 6);
  assert.equal(evalVal('find("hello", "[0-9]+")'), -1);
  // sed-style \1..\9 and & backreferences + optional flags
  assert.equal(evalVal('replace("foo-123", "([a-z]+)-([0-9]+)", "\\2:\\1")'), "123:foo");
  assert.equal(evalVal('replace("cat bat", "[cb]at", "[&]", "g")'), "[cat] [bat]");
  assert.equal(evalVal('replace("Hello hello", "hello", "hi", "gi")'), "hi hi");
  assert.equal(evalVal('replace("a+b", "\\+", "\\&")'), "a&b");
  assert.equal(evalVal('toString(42)'), "42");
  assert.equal(evalVal('toNumber("3.5")'), 3.5);
  assert.throws(() => evalVal('times("a", -1)'), /non-negative integer/);
  assert.throws(() => evalVal('find("abc", "[invalid")'), /invalid regular expression/);
});

test("dates and durations: parsing, validation, arithmetic, extractors, and formatting", () => {
  // from(): ISO, common formats, integer epoch ms (string & number)
  assert.equal(evalVal('formatDate(from("2024-05-01"))'), "2024-05-01T00:00:00.000Z");
  assert.equal(evalVal('formatDate(from("2024-05-01 13:45:09.25"))'), "2024-05-01T13:45:09.250Z");
  assert.equal(evalVal('formatDate(from("May 1, 2024"))'), "2024-05-01T00:00:00.000Z");
  assert.equal(evalVal('formatDate(from("01 May 2024 08:00:00 GMT"))'), "2024-05-01T08:00:00.000Z");
  assert.equal(evalVal('formatDate(from("0"))'), "1970-01-01T00:00:00.000Z");
  assert.equal(evalVal('formatDate(from(0))'), "1970-01-01T00:00:00.000Z");
  assert.equal(evalVal('toEpoch(from("1700000000000"))'), 1700000000000);
  // Invalid dates throw (preventing invalid return)
  assert.throws(() => evalVal('from("2024-02-30")'), /invalid|out of range|day/i);
  assert.throws(() => evalVal('from("not a date")'), /could not parse/);
  assert.throws(() => evalVal('from(1.5)'), /integer/);

  // Date & duration arithmetic and default/custom formatting (Luxon Unicode tokens)
  assert.equal(evalVal('formatDuration(dateDiff(from("2024-05-03"), from("2024-05-01")))'), "2:00:00:00:000");
  assert.equal(evalVal('formatDuration(dateDiff(from("2024-05-01"), from("2024-05-03")))'), "-2:00:00:00:000");
  assert.equal(evalVal('formatDate(dateAdd(from("2024-05-01"), duration(1, 2, 3, 4, 5)))'), "2024-05-02T02:03:04.005Z");
  assert.equal(evalVal('formatDate(dateSub(from("2024-05-02"), days(1)))'), "2024-05-01T00:00:00.000Z");
  assert.equal(evalVal('formatDate(from("2024-05-01T09:05:03.007Z"), "yyyy/MM/dd HH:mm:ss.SSS")'), "2024/05/01 09:05:03.007");
  assert.equal(evalVal('formatDate(from("2026-11-29"), "cccc, LLLL d, yyyy")'), "Sunday, November 29, 2026");
  assert.equal(evalVal('formatDuration(duration(2, 3, 4, 5, 6), "d\'d\' hh:mm:ss")'), "2d 03:04:05");
  assert.equal(evalVal('formatDuration(durNeg(duration(2, 3, 0, 0, 0)), "d\'d\' hh:mm:ss")'), "-2d 03:00:00");
  assert.equal(evalVal('formatDuration(parseDuration("P2DT3H4M5S"))'), "2:03:04:05:000");
  assert.equal(evalVal('formatDuration(parseDuration("-1:02:03:04:005"))'), "-1:02:03:04:005");
  assert.equal(evalVal('toHours(durScale(hours(3), 2))'), 6);
  assert.equal(evalVal('durDiv(days(1), hours(6))'), 4);
  assert.equal(evalVal('year(dateOf(2025, 11, 29))'), 2025);
  assert.equal(evalVal('month(dateOf(2025, 11, 29))'), 11);
  assert.equal(evalVal('day(dateOf(2025, 11, 29))'), 29);
  assert.equal(evalVal('weekday(dateOf(2026, 11, 29))'), 0);

  // Value equality & ordering on dates and durations
  assert.equal(evalVal('from("2024-05-01") === dateOf(2024, 5, 1)'), true);
  assert.equal(evalVal('from("2024-05-01") < from("2024-05-02")'), true);
  assert.equal(evalVal('days(1) === hours(24)'), true);
  assert.equal(evalVal('hours(2) > minutes(90)'), true);
});

test("lambda and mu work for numbers, strings, and dates (both uncurried and curried)", () => {
  // Uncurried factorial: \mu \lambda f x -> if x == 0 then 1 else f(x - 1) * x
  const factUncurried = "mu(lambda(f, x, x === 0 ? 1 : f(x - 1) * x))";
  assert.equal(JsFormula.compile(factUncurried).typeString, "number → number");
  assert.equal(evalVal(`${factUncurried}(6)`), 720);

  // Curried factorial: mu(lambda(f, lambda(x, ...)))
  const factCurried = "mu(lambda(f, lambda(x, x === 0 ? 1 : f(x - 1) * x)))";
  assert.equal(JsFormula.compile(factCurried).typeString, "number → number");
  assert.equal(evalVal(`${factCurried}(5)`), 120);

  // Multi-arg recursive GCD
  const gcd = "mu(lambda(f, a, b, b === 0 ? a : f(b, a % b)))";
  assert.equal(JsFormula.compile(gcd).typeString, "(number, number) → number");
  assert.equal(evalVal(`${gcd}(48, 18)`), 6);

  // Recursive string reverse
  const rev = 'mu(lambda(f, s, length(s) === 0 ? "" : append(f(substring(s, 1, length(s) - 1)), substring(s, 0, 1))))';
  assert.equal(JsFormula.compile(rev).typeString, "string → string");
  assert.equal(evalVal(`${rev}("hello")`), "olleh");

  // Recursive date stepping (add n days recursively)
  const addDays = "mu(lambda(f, d, n, n <= 0 ? d : f(dateAdd(d, days(1)), n - 1)))";
  assert.equal(JsFormula.compile(addDays).typeString, "(date, number) → date");
  assert.equal(evalVal(`formatDate(${addDays}(from("2024-01-01"), 5))`), "2024-01-06T00:00:00.000Z");

  // Recursion depth guard catches infinite recursion cleanly
  assert.throws(() => evalVal("mu(lambda(f, x, f(x)))(1)"), /Maximum recursion depth/);

  // Lambda parameters are bound (f_param), NOT added to global variable names
  assert.deepEqual(JsFormula.compile(factUncurried).names, []);
});

test("thorough Hindley-Milner typechecking catches mismatches with clear errors", () => {
  // Arithmetic is strictly numeric
  assert.throws(() => JsFormula.compile('"a" + "b"'), /expected number, got string/);
  assert.throws(() => JsFormula.compile('from("2024-01-01") + days(1)'), /expected number, got date/);
  // Comparisons require matching types and orderable/equatable types
  assert.throws(() => JsFormula.compile('1 === "1"'), /expected number, got string/);
  assert.throws(() => JsFormula.compile('true < false'), /orderable|number, string, date, or duration/);
  assert.throws(() => JsFormula.compile('lambda(x, x) === lambda(y, y)'), /equatable|number, boolean, string, date, or duration/);
  // if/else branches must unify
  assert.throws(() => JsFormula.compile('true ? 1 : "no"'), /expected number, got string/);
  // Wrong function argument type and arity
  assert.throws(() => JsFormula.compile('lambda(x, x + 1)("hi")'), /expected number, got string/);
  assert.throws(() => JsFormula.compile('lambda(x, x + 1)(1, 2)'), /expects 1 argument, got 2/);
  assert.throws(() => JsFormula.compile('5(1)'), /cannot be called as a function/);
  // Variable definitions forbid free variables
  assert.throws(() => JsFormula.compile("x + 1", { forbidFreeVars: true }), /not allowed inside a variable definition/);
  assert.doesNotThrow(() => JsFormula.compile("lambda(x, x + 1)", { forbidFreeVars: true }));
});

test("graphability check allows only number -> number functions", () => {
  assert.equal(JsFormula.isNumberToNumberFn(JsFormula.compile("lambda(x, sin(x))").inferredType), true);
  assert.equal(JsFormula.isNumberToNumberFn(JsFormula.compile("mu(lambda(f, x, x === 0 ? 1 : f(x - 1) * x))").inferredType), true);
  assert.equal(JsFormula.isNumberToNumberFn(JsFormula.compile('lambda(s, length(s))').inferredType), false);
  assert.equal(JsFormula.isNumberToNumberFn(JsFormula.compile('lambda(x, toString(x))').inferredType), false);
  assert.equal(JsFormula.isNumberToNumberFn(JsFormula.compile("lambda(x, y, x + y)").inferredType), false);
  assert.equal(JsFormula.isNumberToNumberFn(JsFormula.compile("42").inferredType), false);
});

test("blog showcase formulas: factorial, isPrime, and Singapore count change", () => {
  const fact = "mu(lambda(f, x, x <= 0 ? 1 : x * f(x - 1)))";
  assert.equal(evalVal(`(${fact})(0)`), 1);
  assert.equal(evalVal(`(${fact})(6)`), 720);
  assert.equal(evalVal(`(${fact})(10)`), 3628800);

  const isPrime = "lambda(n, n < 2 || n !== floor(n) ? false : n === 2 ? true : n % 2 === 0 ? false : mu(lambda(check, d, d * d > n ? true : n % d === 0 ? false : check(d + 2)))(3))";
  assert.equal(JsFormula.compile(isPrime).typeString, "number → boolean");
  assert.equal(evalVal(`(${isPrime})(1)`), false);
  assert.equal(evalVal(`(${isPrime})(2)`), true);
  assert.equal(evalVal(`(${isPrime})(97)`), true);
  assert.equal(evalVal(`(${isPrime})(99)`), false);
  assert.equal(evalVal(`(${isPrime})(997)`), true);
  assert.equal(evalVal(`(${isPrime})(2.5)`), false);

  const cc = 'mu(lambda(cc, amount, coins, amount === 0 ? 1 : amount < 0 || length(coins) === 0 ? 0 : lambda(comma, cc(amount - toNumber(comma === -1 ? coins : substring(coins, 0, comma)), coins) + cc(amount, comma === -1 ? "" : substring(coins, comma + 1, length(coins) - comma - 1)))(find(coins, ","))))';
  assert.equal(JsFormula.compile(cc).typeString, "(number, string) → number");
  assert.equal(evalVal(`(${cc})(10, "50,20,10,5")`), 2);
  assert.equal(evalVal(`(${cc})(20, "50,20,10,5")`), 4);
  assert.equal(evalVal(`(${cc})(50, "50,20,10,5")`), 13);
  assert.equal(evalVal(`(${cc})(100, "50,20,10,5")`), 49);
  assert.equal(evalVal(`(${cc})(200, "50,20,10,5")`), 242);
});
