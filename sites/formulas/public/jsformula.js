"use strict";

// Reads a JavaScript expression and turns it into the block tree the editor
// uses (Blockly's JSON state). It is the reverse of the generators in
// blocks.js, so the block types and input names below must match those.
// It has no browser or Blockly dependencies, so it can be tested in Node.
const JsFormula = (() => {
  class FormulaError extends Error {
    constructor(message, position) {
      super(message);
      this.name = "FormulaError";
      this.position = position;
    }
  }

  const NUM = "num";
  const BOOL = "bool";
  const ANY = "any"; // a variable: it may hold either

  // ------------------------------------------------------------------ tokens

  const OPERATORS = [
    "===", "!==", "**", "==", "!=", "<=", ">=", "&&", "||",
    "+", "-", "*", "/", "%", "<", ">", "!", "?", ":", "(", ")", ",", ".",
  ];
  const NUMBER = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
  const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;

  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      if (/\s/.test(source[i])) {
        i += 1;
        continue;
      }
      const rest = source.slice(i);
      let match = NUMBER.exec(rest);
      if (match) {
        const after = rest[match[0].length];
        if (after !== undefined && /[A-Za-z0-9_$.]/.test(after)) {
          throw new FormulaError(`Unexpected "${after}" after a number`, i + match[0].length);
        }
        const value = Number(match[0]);
        if (!Number.isFinite(value)) throw new FormulaError("This number is too large", i);
        tokens.push({ type: "num", value, start: i, end: i + match[0].length });
        i += match[0].length;
        continue;
      }
      match = IDENTIFIER.exec(rest);
      if (match) {
        tokens.push({ type: "id", value: match[0], start: i, end: i + match[0].length });
        i += match[0].length;
        continue;
      }
      const operator = OPERATORS.find((candidate) => rest.startsWith(candidate));
      if (operator) {
        tokens.push({ type: "op", value: operator, start: i, end: i + operator.length });
        i += operator.length;
        continue;
      }
      throw new FormulaError(`"${source[i]}" is not supported in a formula`, i);
    }
    tokens.push({ type: "end", start: source.length, end: source.length });
    return tokens;
  }

  // ------------------------------------------------------------------ parser

  // Binding strength of the binary operators, as in JavaScript.
  const PRECEDENCE = {
    "||": 1, "&&": 2,
    "==": 3, "!=": 3, "===": 3, "!==": 3,
    "<": 4, "<=": 4, ">": 4, ">=": 4,
    "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "**": 7,
  };

  function parse(source) {
    // A trailing semicolon is harmless, so allow it.
    const tokens = tokenize(source.replace(/\s*;\s*$/, ""));
    let index = 0;
    const peek = () => tokens[index];
    const next = () => tokens[index++];
    const isOp = (token, value) => token.type === "op" && token.value === value;

    const unexpected = (token) => (token.type === "end"
      ? new FormulaError("The formula ends too soon", token.start)
      : new FormulaError(`Unexpected "${source.slice(token.start, token.end)}"`, token.start));

    function expectOp(value) {
      const token = next();
      if (!isOp(token, value)) throw token.type === "end" ? unexpected(token) : new FormulaError(`Expected "${value}"`, token.start);
    }

    function parseTernary() {
      const test = parseBinary(1);
      if (!isOp(peek(), "?")) return test;
      next();
      const yes = parseTernary();
      expectOp(":");
      const no = parseTernary();
      return { kind: "cond", test, yes, no, start: test.start, end: no.end };
    }

    function parseBinary(minimum) {
      let left = parseUnary();
      for (;;) {
        const token = peek();
        const precedence = token.type === "op" ? PRECEDENCE[token.value] : undefined;
        if (precedence === undefined || precedence < minimum) return left;
        next();
        if (token.value === "**" && left.kind === "unary" && !left.paren) {
          throw new FormulaError("Put parentheses around the base, as in (-2) ** 2", left.start);
        }
        // ** groups from the right; every other operator from the left.
        const right = parseBinary(token.value === "**" ? precedence : precedence + 1);
        left = { kind: "binary", op: token.value, left, right, start: left.start, end: right.end };
      }
    }

    function parseUnary() {
      const token = peek();
      if (token.type === "op" && (token.value === "-" || token.value === "+" || token.value === "!")) {
        next();
        const arg = parseUnary();
        return { kind: "unary", op: token.value, arg, start: token.start, end: arg.end };
      }
      return parsePrimary();
    }

    function parseArguments() {
      const args = [];
      if (isOp(peek(), ")")) {
        next();
        return { args, end: tokens[index - 1].end };
      }
      for (;;) {
        args.push(parseTernary());
        const token = next();
        if (isOp(token, ")")) return { args, end: token.end };
        if (!isOp(token, ",")) throw token.type === "end" ? unexpected(token) : new FormulaError('Expected "," or ")"', token.start);
      }
    }

    function parsePrimary() {
      const token = next();
      if (token.type === "num") return { kind: "num", value: token.value, start: token.start, end: token.end };
      if (token.type === "op" && token.value === "(") {
        const inner = parseTernary();
        expectOp(")");
        inner.paren = true;
        return inner;
      }
      if (token.type !== "id") throw unexpected(token);

      const name = token.value;
      if (name === "true" || name === "false") {
        return { kind: "bool", value: name === "true", start: token.start, end: token.end };
      }
      if (name === "Infinity") return { kind: "const", name: "INF", start: token.start, end: token.end };
      if (name === "Math") {
        if (!isOp(peek(), ".")) throw new FormulaError('Write Math.something, such as Math.sin(x) or Math.PI', token.start);
        next();
        const member = next();
        if (member.type !== "id") throw unexpected(member);
        if (isOp(peek(), "(")) {
          next();
          const { args, end } = parseArguments();
          return { kind: "call", name: member.value, args, start: token.start, end };
        }
        return { kind: "math", name: member.value, start: token.start, end: member.end };
      }
      if (name === "NaN" || name === "undefined" || name === "null") {
        throw new FormulaError(`"${name}" is not supported in a formula`, token.start);
      }
      if (isOp(peek(), "(")) {
        throw new FormulaError(`Only Math functions can be called, not "${name}"`, token.start);
      }
      return { kind: "var", name, start: token.start, end: token.end };
    }

    const expression = parseTernary();
    if (peek().type !== "end") throw unexpected(peek());
    return expression;
  }

  // ----------------------------------------------------------------- blocks

  // Math functions of one number that have a block of their own.
  const UNARY_FUNCTIONS = {
    sqrt: "f_sqrt", cbrt: "f_cbrt", abs: "f_abs", floor: "f_floor", ceil: "f_ceil",
    round: "f_round", trunc: "f_trunc", sign: "f_sign", exp: "f_exp",
    log: "f_ln", log10: "f_log10", log2: "f_log2",
    sin: "f_sin", cos: "f_cos", tan: "f_tan", asin: "f_asin", acos: "f_acos", atan: "f_atan",
    sinh: "f_sinh", cosh: "f_cosh", tanh: "f_tanh", asinh: "f_asinh", acosh: "f_acosh", atanh: "f_atanh",
  };
  const BINARY_FUNCTIONS = { min: "f_min", max: "f_max", hypot: "f_hypot", atan2: "f_atan2" };
  const ARITHMETIC = { "+": "f_add", "-": "f_sub", "*": "f_mul", "/": "f_div", "%": "f_rem" };
  const COMPARISON = {
    "<": "f_lt", "<=": "f_le", ">": "f_gt", ">=": "f_ge",
    "===": "f_eq", "==": "f_eq", "!==": "f_ne", "!=": "f_ne",
  };
  const RECIPROCALS = { cos: "f_sec", sin: "f_csc", tan: "f_cot" };
  const MATH_CONSTANTS = { PI: "PI", E: "E", SQRT2: "SQRT2" };

  function block(type, inputs = {}, fields = null) {
    const state = { type };
    if (fields) state.fields = fields;
    const names = Object.keys(inputs);
    if (names.length) state.inputs = Object.fromEntries(names.map((name) => [name, { block: inputs[name] }]));
    return state;
  }

  const constant = (name) => block("f_const", {}, { C: name });
  const isNumber = (node, value) => node.kind === "num" && node.value === value;
  const isMath = (node, name) => node.kind === "math" && node.name === name;
  const isCall = (node, name, count = 1) => node.kind === "call" && node.name === name && node.args.length === count;

  function convert(node, context) {
    const text = (n) => context.source.slice(n.start, n.end);
    const fail = (message, n = node) => new FormulaError(message, n.start);
    const typeName = (type) => (type === BOOL ? "a true/false value" : "a number");

    // Converts a child that must be a number (or a true/false value).
    const need = (child, wanted, what) => {
      const result = convert(child, context);
      if (result.type !== ANY && result.type !== wanted) {
        throw fail(`"${text(child)}" is ${typeName(result.type)}, but ${what} needs ${typeName(wanted)}`, child);
      }
      return result.state;
    };
    const number = (child, what) => need(child, NUM, what);
    const result = (state, type) => ({ state, type });

    switch (node.kind) {
      case "num": return result(block("f_num", {}, { NUM: node.value }), NUM);
      case "bool": return result(block("f_bool", {}, { V: String(node.value) }), BOOL);
      case "const": return result(constant(node.name), NUM);

      case "var":
        if (!context.names.includes(node.name)) context.names.push(node.name);
        return result({ type: "f_var", data: node.name, fields: { NAME: node.name } }, ANY);

      case "math":
        if (!MATH_CONSTANTS[node.name]) throw fail(`Math.${node.name} is not supported`);
        return result(constant(MATH_CONSTANTS[node.name]), NUM);

      case "unary": {
        if (node.op === "!") return result(block("f_not", { A: need(node.arg, BOOL, '"!"') }), BOOL);
        if (node.op === "+") return result(number(node.arg, '"+"'), NUM);
        // A minus in front of a plain number is a negative number.
        if (node.arg.kind === "num") return result(block("f_num", {}, { NUM: -node.arg.value }), NUM);
        return result(block("f_neg", { X: number(node.arg, '"-"') }), NUM);
      }

      case "cond": {
        const yes = convert(node.yes, context);
        const no = convert(node.no, context);
        const state = block("f_if", { C: need(node.test, BOOL, "the condition of ? :"), T: yes.state, F: no.state });
        return result(state, yes.type === no.type ? yes.type : ANY);
      }

      case "call": return convertCall(node, context, fail, number, result);

      case "binary": return convertBinary(node, context, fail, number, need, result);

      default: throw fail("This is not supported in a formula");
    }
  }

  function convertCall(node, context, fail, number, result) {
    const name = node.name;
    const arity = (count) => {
      if (node.args.length !== count) {
        throw fail(`Math.${name} needs ${count} value${count === 1 ? "" : "s"}, not ${node.args.length}`);
      }
    };
    if (name === "pow") {
      arity(2);
      return convert({ kind: "binary", op: "**", left: node.args[0], right: node.args[1], start: node.start, end: node.end }, context);
    }
    if (UNARY_FUNCTIONS[name]) {
      arity(1);
      const [arg] = node.args;
      if (name === "sqrt" && arg.kind === "num" && [2, 3, 5].includes(arg.value)) {
        return result(constant(`SQRT${arg.value}`), NUM);
      }
      return result(block(UNARY_FUNCTIONS[name], { X: number(arg, `Math.${name}`) }), NUM);
    }
    if (BINARY_FUNCTIONS[name]) {
      arity(2);
      const [first, second] = node.args;
      return result(block(BINARY_FUNCTIONS[name], {
        X: number(first, `Math.${name}`),
        Y: number(second, `Math.${name}`),
      }), NUM);
    }
    throw fail(`Math.${name} is not supported`);
  }

  function convertBinary(node, context, fail, number, need, result) {
    const { op, left, right } = node;

    if (op === "&&" || op === "||") {
      const type = op === "&&" ? "f_and" : "f_or";
      return result(block(type, { A: need(left, BOOL, `"${op}"`), B: need(right, BOOL, `"${op}"`) }), BOOL);
    }
    if (COMPARISON[op]) {
      const a = convert(left, context).state;
      const b = convert(right, context).state;
      return result(block(COMPARISON[op], { A: a, B: b }), BOOL);
    }

    // Shapes that the blocks print for their own constants and shortcuts.
    if (op === "/" && isMath(left, "PI") && (isNumber(right, 2) || isNumber(right, 4))) {
      return result(constant(`PI${right.value}`), NUM);
    }
    if (op === "*" && isNumber(left, 2) && isMath(right, "PI")) return result(constant("TAU"), NUM);
    if (op === "/") {
      if (isNumber(left, 1)) {
        for (const [fn, type] of Object.entries(RECIPROCALS)) {
          if (isCall(right, fn)) return result(block(type, { X: number(right.args[0], `Math.${fn}`) }), NUM);
        }
      }
      if (isCall(left, "log") && isCall(right, "log")) {
        return result(block("f_logb", { X: number(left.args[0], "Math.log"), B: number(right.args[0], "Math.log") }), NUM);
      }
      if (left.kind === "binary" && left.op === "*" && isNumber(right, 180) && isMath(left.right, "PI")) {
        return result(block("f_torad", { X: number(left.left, '"*"') }), NUM);
      }
      if (left.kind === "binary" && left.op === "*" && isMath(right, "PI") && isNumber(left.right, 180)) {
        return result(block("f_todeg", { X: number(left.left, '"*"') }), NUM);
      }
    }
    if (op === "**") {
      if (right.kind === "binary" && right.op === "/" && isNumber(right.left, 1)) {
        return result(block("f_nroot", { X: number(left, '"**"'), N: number(right.right, '"/"') }), NUM);
      }
      if (isNumber(right, 2)) return result(block("f_sq", { X: number(left, '"**"') }), NUM);
      return result(block("f_pow", { A: number(left, '"**"'), B: number(right, '"**"') }), NUM);
    }

    return result(block(ARITHMETIC[op], { A: number(left, `"${op}"`), B: number(right, `"${op}"`) }), NUM);
  }

  function countBlocks(state) {
    let total = 1;
    for (const input of Object.values(state.inputs || {})) total += countBlocks(input.block);
    return total;
  }

  // Parses `source` and returns { state, names, blocks, type }: the block tree,
  // the variable names it uses (in order of appearance, each with its name as
  // the block's `data` until the caller binds real variable ids), the number of
  // blocks, and whether the formula gives a number, a true/false value or either.
  // Throws FormulaError, with the offending position, when it cannot.
  function compile(source) {
    const context = { source, names: [] };
    const ast = parse(source);
    const { state, type } = convert(ast, context);
    return { state, names: context.names, blocks: countBlocks(state), type };
  }

  return { compile, FormulaError };
})();

if (typeof module !== "undefined") module.exports = JsFormula;
