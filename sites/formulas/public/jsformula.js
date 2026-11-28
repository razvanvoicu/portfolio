"use strict";

// Parser, Hindley-Milner typechecker, Blockly JSON converter, and sandboxed
// evaluator for the Formula Builder. Pure JavaScript (no browser/Blockly deps)
// so it can be tested directly in Node and shared with the Curves site.
const JsFormula = (() => {
  const RT = typeof FormulaRuntime !== "undefined" ? FormulaRuntime : require("./runtime.js");

  class FormulaError extends Error {
    constructor(message, position = 0) {
      super(message);
      this.name = "FormulaError";
      this.position = position;
    }
  }

  // ------------------------------------------------------------------ tokens

  const OPERATORS = [
    "===", "!==", "**", "=>", "==", "!=", "<=", ">=", "&&", "||",
    "+", "-", "*", "/", "%", "<", ">", "!", "?", ":", "(", ")", ",", ".",
  ];
  const NUMBER = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
  const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;

  function readString(source, start) {
    const quote = source[start];
    let i = start + 1;
    let out = "";
    while (i < source.length) {
      const ch = source[i];
      if (ch === quote) return { value: out, end: i + 1 };
      if (ch === "\n" || ch === "\r") {
        throw new FormulaError("Unterminated string literal", start);
      }
      if (ch === "\\") {
        const next = source[i + 1];
        if (next === undefined) throw new FormulaError("Unterminated string escape", i);
        if (next === "n") { out += "\n"; i += 2; }
        else if (next === "r") { out += "\r"; i += 2; }
        else if (next === "t") { out += "\t"; i += 2; }
        else if (next === "\\") { out += "\\"; i += 2; }
        else if (next === '"') { out += '"'; i += 2; }
        else if (next === "'") { out += "'"; i += 2; }
        else if (next === "u") {
          const hex = source.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new FormulaError("Invalid unicode escape in string", i);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          // Preserve regex/sed escapes such as \1, \d, \& verbatim.
          out += "\\" + next;
          i += 2;
        }
        continue;
      }
      out += ch;
      i += 1;
    }
    throw new FormulaError("Unterminated string literal", start);
  }

  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      if (/\s/.test(source[i])) {
        i += 1;
        continue;
      }
      if (source[i] === '"' || source[i] === "'") {
        const str = readString(source, i);
        tokens.push({ type: "str", value: str.value, start: i, end: str.end });
        i = str.end;
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

  const PRECEDENCE = {
    "||": 1, "&&": 2,
    "==": 3, "!=": 3, "===": 3, "!==": 3,
    "<": 4, "<=": 4, ">": 4, ">=": 4,
    "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "**": 7,
  };

  function checkParamName(name, position) {
    if (!IDENTIFIER.test(name)) throw new FormulaError(`"${name}" is not a valid parameter name`, position);
    if (RT.RESERVED_NAMES.has(name)) throw new FormulaError(`"${name}" is reserved and cannot be a parameter name`, position);
    try {
      new Function(name, '"use strict";');
    } catch {
      throw new FormulaError(`"${name}" is a JavaScript keyword and cannot be a parameter name`, position);
    }
  }

  const BUILTIN_FN_NAMES = new Set([
    ...Object.keys(RT.MATH_FUNCTIONS),
    ...Object.keys(RT.STRING_FUNCTIONS),
    ...Object.keys(RT.DATE_FUNCTIONS),
  ]);

  function parse(source) {
    const cleaned = source.replace(/\s*;\s*$/, "");
    const tokens = tokenize(cleaned);
    let index = 0;
    const peek = (offset = 0) => tokens[index + offset] || tokens[tokens.length - 1];
    const next = () => tokens[index++];
    const isOp = (token, value) => token.type === "op" && token.value === value;

    const unexpected = (token) => (token.type === "end"
      ? new FormulaError("The formula ends too soon", token.start)
      : new FormulaError(`Unexpected "${cleaned.slice(token.start, token.end)}"`, token.start));

    function expectOp(value) {
      const token = next();
      if (!isOp(token, value)) throw token.type === "end" ? unexpected(token) : new FormulaError(`Expected "${value}"`, token.start);
    }

    // Detects arrow functions: `x => ...` or `(x, y) => ...`.
    function tryArrowParams() {
      const t0 = peek(0);
      if (t0.type === "id" && isOp(peek(1), "=>")) {
        const param = next();
        next(); // =>
        checkParamName(param.value, param.start);
        return { params: [param.value], start: param.start };
      }
      if (isOp(t0, "(")) {
        let j = 1;
        const params = [];
        const seen = new Set();
        while (true) {
          const cur = peek(j);
          if (cur.type !== "id") return null;
          params.push(cur);
          j += 1;
          if (isOp(peek(j), ",")) { j += 1; continue; }
          if (isOp(peek(j), ")") && isOp(peek(j + 1), "=>")) {
            for (const p of params) {
              checkParamName(p.value, p.start);
              if (seen.has(p.value)) throw new FormulaError(`Duplicate parameter "${p.value}"`, p.start);
              seen.add(p.value);
            }
            const start = t0.start;
            index += j + 2;
            return { params: params.map((p) => p.value), start };
          }
          return null;
        }
      }
      return null;
    }

    function parseExpr() {
      const arrow = tryArrowParams();
      if (arrow) {
        const body = parseExpr();
        return { kind: "lambda", params: arrow.params, body, start: arrow.start, end: body.end };
      }
      return parseTernary();
    }

    function parseTernary() {
      const test = parseBinary(1);
      if (!isOp(peek(), "?")) return test;
      next();
      const yes = parseExpr();
      expectOp(":");
      const no = parseExpr();
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
      return parsePostfix();
    }

    function parseArguments() {
      const args = [];
      if (isOp(peek(), ")")) {
        next();
        return { args, end: tokens[index - 1].end };
      }
      for (;;) {
        args.push(parseExpr());
        const token = next();
        if (isOp(token, ")")) return { args, end: token.end };
        if (!isOp(token, ",")) throw token.type === "end" ? unexpected(token) : new FormulaError('Expected "," or ")"', token.start);
      }
    }

    function parsePostfix() {
      let expr = parsePrimary();
      while (isOp(peek(), "(")) {
        next();
        if (expr.kind === "special" && expr.name === "lambda") {
          const params = [];
          const seen = new Set();
          for (;;) {
            // Parameter position if followed by a comma (last item before ')' is the body).
            if (peek(0).type === "id" && isOp(peek(1), ",")) {
              const p = next();
              next(); // ','
              checkParamName(p.value, p.start);
              if (seen.has(p.value)) throw new FormulaError(`Duplicate parameter "${p.value}" in lambda`, p.start);
              seen.add(p.value);
              params.push(p.value);
              continue;
            }
            if (isOp(peek(), ")")) {
              throw new FormulaError("lambda needs at least one parameter and a body, e.g. lambda(x, x + 1)", expr.start);
            }
            const body = parseExpr();
            if (isOp(peek(), ",")) {
              throw new FormulaError("lambda parameters must be variable names", body.start);
            }
            expectOp(")");
            if (!params.length) {
              throw new FormulaError("lambda needs at least one parameter and a body, e.g. lambda(x, x + 1)", expr.start);
            }
            expr = { kind: "lambda", params, body, start: expr.start, end: tokens[index - 1].end };
            break;
          }
          continue;
        }
        const { args, end } = parseArguments();
        if (expr.kind === "math") {
          expr = { kind: "builtinCall", name: expr.name, qualified: true, args, start: expr.start, end };
        } else if (expr.kind === "special" && expr.name === "mu") {
          if (args.length !== 1) {
            throw new FormulaError(`mu takes 1 function argument, not ${args.length}`, expr.start);
          }
          expr = { kind: "mu", fn: args[0], start: expr.start, end };
        } else if (expr.kind === "builtinRef") {
          expr = { kind: "builtinCall", name: expr.name, qualified: false, args, start: expr.start, end };
        } else {
          if (args.length === 0) {
            throw new FormulaError("Function calls must pass at least one argument", expr.start);
          }
          expr = { kind: "apply", callee: expr, args, start: expr.start, end };
        }
      }
      if (expr.kind === "special") {
        throw new FormulaError(`Call "${expr.name}(...)" with parentheses`, expr.start);
      }
      if (expr.kind === "builtinRef") {
        throw new FormulaError(`Call "${expr.name}(...)" with parentheses`, expr.start);
      }
      return expr;
    }

    function parsePrimary() {
      const token = next();
      if (token.type === "num") return { kind: "num", value: token.value, start: token.start, end: token.end };
      if (token.type === "str") return { kind: "str", value: token.value, start: token.start, end: token.end };
      if (token.type === "op" && token.value === "(") {
        const inner = parseExpr();
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
      if (name === "PI" || name === "E" || name === "SQRT2") {
        return { kind: "const", name, start: token.start, end: token.end };
      }
      if (name === "Math") {
        if (!isOp(peek(), ".")) throw new FormulaError('Write Math.something (or just the function name, such as sin(x) or PI)', token.start);
        next();
        const member = next();
        if (member.type !== "id") throw unexpected(member);
        return { kind: "math", name: member.value, start: token.start, end: member.end };
      }
      if (name === "NaN" || name === "undefined" || name === "null") {
        throw new FormulaError(`"${name}" is not supported in a formula`, token.start);
      }
      if (name === "lambda" || name === "mu") {
        return { kind: "special", name, start: token.start, end: token.end };
      }
      if (BUILTIN_FN_NAMES.has(name)) {
        return { kind: "builtinRef", name, start: token.start, end: token.end };
      }
      return { kind: "var", name, start: token.start, end: token.end };
    }

    const expression = parseExpr();
    if (peek().type !== "end") throw unexpected(peek());
    return expression;
  }

  // ------------------------------------------------ Hindley-Milner typecheck

  const T_NUM = Object.freeze({ tag: "prim", name: "num" });
  const T_BOOL = Object.freeze({ tag: "prim", name: "bool" });
  const T_STR = Object.freeze({ tag: "prim", name: "str" });
  const T_DATE = Object.freeze({ tag: "prim", name: "date" });
  const T_DUR = Object.freeze({ tag: "prim", name: "duration" });

  const PRIM_NAMES = {
    num: "number",
    bool: "boolean",
    str: "string",
    date: "date",
    duration: "duration",
  };

  const CONSTRAINT_LABELS = {
    orderable: "a number, string, date, or duration",
    equatable: "a number, boolean, string, date, or duration",
    dateInput: "a string or integer epoch",
    printable: "a number, boolean, string, date, or duration",
  };

  const CONSTRAINT_ALLOWS = {
    orderable: new Set(["num", "str", "date", "duration"]),
    equatable: new Set(["num", "bool", "str", "date", "duration"]),
    dateInput: new Set(["str", "num"]),
    printable: new Set(["num", "bool", "str", "date", "duration"]),
  };

  function makeFnType(params, ret) {
    return { tag: "fn", params, ret };
  }

  function formatType(t, subst = new Map()) {
    const resolved = prune(t, subst);
    if (resolved.tag === "prim") return PRIM_NAMES[resolved.name];
    if (resolved.tag === "var") {
      if (resolved.constraint === "orderable") return "orderable";
      if (resolved.constraint === "dateInput") return "string | number";
      return "any";
    }
    if (resolved.tag === "fn") {
      const left = resolved.params.length === 1
        ? (prune(resolved.params[0], subst).tag === "fn" ? `(${formatType(resolved.params[0], subst)})` : formatType(resolved.params[0], subst))
        : `(${resolved.params.map((p) => formatType(p, subst)).join(", ")})`;
      return `${left} → ${formatType(resolved.ret, subst)}`;
    }
    return "any";
  }

  function prune(t, subst) {
    if (t.tag === "var" && subst.has(t.id)) {
      const next = prune(subst.get(t.id), subst);
      subst.set(t.id, next);
      return next;
    }
    return t;
  }

  function applySubst(t, subst) {
    const r = prune(t, subst);
    if (r.tag === "fn") {
      return makeFnType(r.params.map((p) => applySubst(p, subst)), applySubst(r.ret, subst));
    }
    return r;
  }

  function occurs(varId, type, subst) {
    const t = prune(type, subst);
    if (t.tag === "var") return t.id === varId;
    if (t.tag === "fn") return t.params.some((p) => occurs(varId, p, subst)) || occurs(varId, t.ret, subst);
    return false;
  }

  function intersectConstraints(c1, c2) {
    if (!c1) return c2;
    if (!c2 || c1 === c2) return c1;
    // Narrower constraint wins: dateInput ⊂ orderable ⊂ equatable/printable.
    const order = { dateInput: 1, orderable: 2, equatable: 3, printable: 3 };
    return (order[c1] || 9) <= (order[c2] || 9) ? c1 : c2;
  }

  function typeTag(t) {
    if (!t) return "any";
    if (t.tag === "prim") return t.name;
    if (t.tag === "fn") return "fn";
    return "any";
  }

  function cloneType(t, map = new Map(), freshVar) {
    if (t.tag === "prim") return t;
    if (t.tag === "var") {
      if (!map.has(t.id)) map.set(t.id, freshVar(t.constraint));
      return map.get(t.id);
    }
    if (t.tag === "fn") {
      return makeFnType(t.params.map((p) => cloneType(p, map, freshVar)), cloneType(t.ret, map, freshVar));
    }
    return t;
  }

  // Built-in function type signatures: name -> (argCount, freshVar) => { params, ret } | { arityError }
  const BUILTIN_SIGNATURES = (() => {
    const sigs = Object.create(null);
    const fixed = (params, ret) => (argc) => (argc === params.length ? { params, ret } : { expected: String(params.length) });

    for (const name of Object.keys(RT.MATH_FUNCTIONS)) {
      const binary = ["min", "max", "hypot", "atan2", "pow"].includes(name);
      sigs[name] = fixed(binary ? [T_NUM, T_NUM] : [T_NUM], T_NUM);
    }

    // Strings
    sigs.length = fixed([T_STR], T_NUM);
    sigs.trim = fixed([T_STR], T_STR);
    sigs.substring = fixed([T_STR, T_NUM, T_NUM], T_STR);
    sigs.capitalize = fixed([T_STR], T_STR);
    sigs.toUpper = fixed([T_STR], T_STR);
    sigs.toLower = fixed([T_STR], T_STR);
    sigs.append = fixed([T_STR, T_STR], T_STR);
    sigs.times = fixed([T_STR, T_NUM], T_STR);
    sigs.find = fixed([T_STR, T_STR], T_NUM);
    sigs.replace = (argc) => (argc === 3
      ? { params: [T_STR, T_STR, T_STR], ret: T_STR }
      : argc === 4
        ? { params: [T_STR, T_STR, T_STR, T_STR], ret: T_STR }
        : { expected: "3 or 4" });
    sigs.toString = (argc, freshVar) => (argc === 1 ? { params: [freshVar("printable")], ret: T_STR } : { expected: "1" });
    sigs.toNumber = fixed([T_STR], T_NUM);

    // Dates & Durations
    sigs.from = (argc, freshVar) => (argc === 1 ? { params: [freshVar("dateInput")], ret: T_DATE } : { expected: "1" });
    sigs.now = fixed([], T_DATE);
    sigs.dateOf = fixed([T_NUM, T_NUM, T_NUM], T_DATE);
    sigs.dateTimeOf = fixed([T_NUM, T_NUM, T_NUM, T_NUM, T_NUM, T_NUM], T_DATE);
    for (const u of ["days", "hours", "minutes", "seconds", "millis"]) sigs[u] = fixed([T_NUM], T_DUR);
    sigs.duration = fixed([T_NUM, T_NUM, T_NUM, T_NUM, T_NUM], T_DUR);
    sigs.parseDuration = fixed([T_STR], T_DUR);
    sigs.dateDiff = fixed([T_DATE, T_DATE], T_DUR);
    sigs.dateAdd = fixed([T_DATE, T_DUR], T_DATE);
    sigs.dateSub = fixed([T_DATE, T_DUR], T_DATE);
    sigs.durAdd = fixed([T_DUR, T_DUR], T_DUR);
    sigs.durSub = fixed([T_DUR, T_DUR], T_DUR);
    sigs.durScale = fixed([T_DUR, T_NUM], T_DUR);
    sigs.durDiv = fixed([T_DUR, T_DUR], T_NUM);
    sigs.durNeg = fixed([T_DUR], T_DUR);
    sigs.durAbs = fixed([T_DUR], T_DUR);
    for (const f of ["year", "month", "day", "weekday", "hour", "minute", "second", "millisecond", "toEpoch"]) {
      sigs[f] = fixed([T_DATE], T_NUM);
    }
    for (const f of ["toDays", "toHours", "toMinutes", "toSeconds", "toMillis"]) {
      sigs[f] = fixed([T_DUR], T_NUM);
    }
    sigs.formatDate = (argc) => (argc === 1
      ? { params: [T_DATE], ret: T_STR }
      : argc === 2
        ? { params: [T_DATE, T_STR], ret: T_STR }
        : { expected: "1 or 2" });
    sigs.formatDuration = (argc) => (argc === 1
      ? { params: [T_DUR], ret: T_STR }
      : argc === 2
        ? { params: [T_DUR, T_STR], ret: T_STR }
        : { expected: "1 or 2" });

    return sigs;
  })();

  function typecheck(ast, source = "", varTypes = null, options = {}) {
    let nextId = 1;
    const subst = new Map();
    const freshVar = (constraint = null) => ({ tag: "var", id: nextId++, constraint });
    const freeVars = new Map(); // name -> Type (shared across all occurrences of free var)
    const snippet = (node) => source ? `"${source.slice(node.start, node.end)}"` : "this expression";

    function checkConstraint(constraint, concrete, label, pos) {
      if (!constraint) return;
      if (concrete.tag === "prim" && CONSTRAINT_ALLOWS[constraint].has(concrete.name)) return;
      throw new FormulaError(
        `${label} expects ${CONSTRAINT_LABELS[constraint]}, but got ${formatType(concrete, subst)}`,
        pos
      );
    }

    function unify(actual, expected, label, pos) {
      const a = prune(actual, subst);
      const b = prune(expected, subst);
      if (a === b) return a;
      if (a.tag === "prim" && b.tag === "prim") {
        if (a.name === b.name) return a;
        throw new FormulaError(`${label}: expected ${formatType(b, subst)}, got ${formatType(a, subst)}`, pos);
      }
      if (a.tag === "var") {
        if (b.tag === "var") {
          if (a.id === b.id) return a;
          const merged = intersectConstraints(a.constraint, b.constraint);
          b.constraint = merged;
          subst.set(a.id, b);
          return b;
        }
        if (occurs(a.id, b, subst)) {
          throw new FormulaError(`${label}: infinite recursive type (cannot unify with itself)`, pos);
        }
        checkConstraint(a.constraint, b, label, pos);
        subst.set(a.id, b);
        return b;
      }
      if (b.tag === "var") {
        if (occurs(b.id, a, subst)) {
          throw new FormulaError(`${label}: infinite recursive type (cannot unify with itself)`, pos);
        }
        checkConstraint(b.constraint, a, label, pos);
        subst.set(b.id, a);
        return a;
      }
      if (a.tag === "fn" && b.tag === "fn") {
        if (a.params.length !== b.params.length) {
          throw new FormulaError(
            `${label}: expected a function of ${b.params.length} argument${b.params.length === 1 ? "" : "s"}, got ${a.params.length}`,
            pos
          );
        }
        for (let i = 0; i < a.params.length; i += 1) {
          unify(a.params[i], b.params[i], `${label} (argument ${i + 1})`, pos);
        }
        unify(a.ret, b.ret, `${label} (return type)`, pos);
        return prune(a, subst);
      }
      throw new FormulaError(`${label}: expected ${formatType(b, subst)}, got ${formatType(a, subst)}`, pos);
    }

    function infer(node, env) {
      switch (node.kind) {
        case "num": return T_NUM;
        case "bool": return T_BOOL;
        case "str": return T_STR;
        case "const": return T_NUM;
        case "math": {
          if (!(node.name in RT.MATH_CONSTANTS)) {
            throw new FormulaError(`Math.${node.name} is not supported`, node.start);
          }
          return T_NUM;
        }
        case "var": {
          if (env.has(node.name)) return env.get(node.name);
          if (options.forbidFreeVars) {
            throw new FormulaError(`Variables like "${node.name}" are not allowed inside a variable definition`, node.start);
          }
          if (varTypes && varTypes[node.name]) {
            // Instantiate any polymorphic free type variables in a variable's type.
            return cloneType(varTypes[node.name], new Map(), freshVar);
          }
          if (!freeVars.has(node.name)) freeVars.set(node.name, freshVar());
          return freeVars.get(node.name);
        }
        case "unary": {
          const argType = infer(node.arg, env);
          if (node.op === "!") {
            unify(argType, T_BOOL, `${snippet(node.arg)} in "!"`, node.arg.start);
            return T_BOOL;
          }
          unify(argType, T_NUM, `${snippet(node.arg)} in "${node.op}"`, node.arg.start);
          return T_NUM;
        }
        case "binary": {
          const lt = infer(node.left, env);
          const rt = infer(node.right, env);
          const op = node.op;
          if (op === "&&" || op === "||") {
            unify(lt, T_BOOL, `${snippet(node.left)} in "${op}"`, node.left.start);
            unify(rt, T_BOOL, `${snippet(node.right)} in "${op}"`, node.right.start);
            return T_BOOL;
          }
          if (op === "==" || op === "===" || op === "!=" || op === "!==") {
            const tv = freshVar("equatable");
            unify(lt, tv, `Left side ${snippet(node.left)} of "${op}"`, node.left.start);
            unify(rt, prune(tv, subst), `Right side ${snippet(node.right)} of "${op}" must match left side`, node.right.start);
            return T_BOOL;
          }
          if (op === "<" || op === "<=" || op === ">" || op === ">=") {
            const tv = freshVar("orderable");
            unify(lt, tv, `Left side ${snippet(node.left)} of "${op}"`, node.left.start);
            unify(rt, prune(tv, subst), `Right side ${snippet(node.right)} of "${op}" must match left side`, node.right.start);
            return T_BOOL;
          }
          // Arithmetic: strictly numeric.
          unify(lt, T_NUM, `Left side ${snippet(node.left)} of "${op}"`, node.left.start);
          unify(rt, T_NUM, `Right side ${snippet(node.right)} of "${op}"`, node.right.start);
          return T_NUM;
        }
        case "cond": {
          const ct = infer(node.test, env);
          unify(ct, T_BOOL, `Condition ${snippet(node.test)} of if/else`, node.test.start);
          const tt = infer(node.yes, env);
          const ft = infer(node.no, env);
          return unify(ft, tt, `Else branch ${snippet(node.no)} of if/else must match then branch`, node.no.start);
        }
        case "builtinCall": {
          const display = node.qualified ? `Math.${node.name}` : node.name;
          if (node.qualified && !(node.name in RT.MATH_FUNCTIONS)) {
            throw new FormulaError(`Math.${node.name} is not supported`, node.start);
          }
          const sigFn = BUILTIN_SIGNATURES[node.name];
          if (!sigFn) throw new FormulaError(`${display} is not supported`, node.start);
          const sig = sigFn(node.args.length, freshVar);
          if (sig.expected) {
            throw new FormulaError(
              `${display} needs ${sig.expected} argument${sig.expected === "1" ? "" : "s"}, got ${node.args.length}`,
              node.start
            );
          }
          for (let i = 0; i < node.args.length; i += 1) {
            const at = infer(node.args[i], env);
            unify(at, sig.params[i], `Argument ${i + 1} (${snippet(node.args[i])}) of ${display}`, node.args[i].start);
          }
          return prune(sig.ret, subst);
        }
        case "lambda": {
          const local = new Map(env);
          const paramTypes = node.params.map((name) => {
            const tv = freshVar();
            local.set(name, tv);
            return tv;
          });
          const bodyType = infer(node.body, local);
          return makeFnType(paramTypes.map((p) => prune(p, subst)), prune(bodyType, subst));
        }
        case "mu": {
          const fnType = prune(infer(node.fn, env), subst);
          if (fnType.tag === "fn") {
            if (fnType.params.length >= 2) {
              // Uncurried: mu(lambda(f, x, ..., body))
              const [selfParam, ...restParams] = fnType.params;
              const selfType = makeFnType(restParams, fnType.ret);
              unify(selfParam, selfType, `Recursive parameter of mu(${snippet(node.fn)})`, node.fn.start);
              return applySubst(selfType, subst);
            }
            if (fnType.params.length === 1) {
              // Curried: mu(lambda(f, lambda(x, body)))
              const selfParam = fnType.params[0];
              const unified = unify(selfParam, fnType.ret, `Recursive body of mu(${snippet(node.fn)})`, node.fn.start);
              const resolved = prune(unified, subst);
              if (resolved.tag === "prim") {
                throw new FormulaError(`mu requires a function-producing body, got ${formatType(resolved, subst)}`, node.fn.start);
              }
              return applySubst(resolved, subst);
            }
            throw new FormulaError("mu requires a function with at least 1 parameter", node.fn.start);
          }
          if (fnType.tag === "var") {
            const resultFn = makeFnType([freshVar()], freshVar());
            unify(fnType, makeFnType([resultFn], resultFn), `Argument of mu`, node.fn.start);
            return applySubst(resultFn, subst);
          }
          throw new FormulaError(`mu expects a function, got ${formatType(fnType, subst)}`, node.fn.start);
        }
        case "apply": {
          const calleeType = prune(infer(node.callee, env), subst);
          const argTypes = node.args.map((arg) => infer(arg, env));
          if (calleeType.tag === "prim") {
            throw new FormulaError(`${snippet(node.callee)} has type ${formatType(calleeType, subst)} and cannot be called as a function`, node.callee.start);
          }
          if (calleeType.tag === "fn") {
            if (calleeType.params.length !== argTypes.length) {
              throw new FormulaError(
                `${snippet(node.callee)} expects ${calleeType.params.length} argument${calleeType.params.length === 1 ? "" : "s"}, got ${argTypes.length}`,
                node.start
              );
            }
            for (let i = 0; i < argTypes.length; i += 1) {
              unify(argTypes[i], calleeType.params[i], `Argument ${i + 1} (${snippet(node.args[i])}) of ${snippet(node.callee)}`, node.args[i].start);
            }
            return applySubst(calleeType.ret, subst);
          }
          // calleeType is a type variable (e.g. lambda parameter `f`): constrain it to a function.
          const ret = freshVar();
          unify(calleeType, makeFnType(argTypes, ret), `Call to ${snippet(node.callee)}`, node.start);
          return applySubst(ret, subst);
        }
        default:
          throw new FormulaError("Unsupported expression", node.start || 0);
      }
    }

    const inferred = applySubst(infer(ast, new Map()), subst);
    const resolvedFree = {};
    for (const [name, tv] of freeVars.entries()) {
      resolvedFree[name] = applySubst(tv, subst);
    }
    return {
      inferredType: inferred,
      type: typeTag(inferred),
      typeString: formatType(inferred),
      freeVarTypes: resolvedFree,
    };
  }

  // Returns true if the formula can be graphed as a number -> number function.
  function isNumberToNumberFn(inferredType) {
    if (!inferredType || inferredType.tag !== "fn" || inferredType.params.length !== 1) return false;
    const p = inferredType.params[0];
    const r = inferredType.ret;
    const numOk = (t) => (t.tag === "prim" && t.name === "num") || (t.tag === "var" && (!t.constraint || CONSTRAINT_ALLOWS[t.constraint].has("num")));
    return numOk(p) && numOk(r);
  }

  // ----------------------------------------------------------------- blocks

  const UNARY_MATH_BLOCKS = {
    sqrt: "f_sqrt", cbrt: "f_cbrt", abs: "f_abs", floor: "f_floor", ceil: "f_ceil",
    round: "f_round", trunc: "f_trunc", sign: "f_sign", exp: "f_exp",
    log: "f_ln", log10: "f_log10", log2: "f_log2",
    sin: "f_sin", cos: "f_cos", tan: "f_tan", asin: "f_asin", acos: "f_acos", atan: "f_atan",
    sinh: "f_sinh", cosh: "f_cosh", tanh: "f_tanh", asinh: "f_asinh", acosh: "f_acosh", atanh: "f_atanh",
  };
  const BINARY_MATH_BLOCKS = { min: "f_min", max: "f_max", hypot: "f_hypot", atan2: "f_atan2" };
  const ARITHMETIC_BLOCKS = { "+": "f_add", "-": "f_sub", "*": "f_mul", "/": "f_div", "%": "f_rem" };
  const COMPARISON_BLOCKS = {
    "<": "f_lt", "<=": "f_le", ">": "f_gt", ">=": "f_ge",
    "===": "f_eq", "==": "f_eq", "!==": "f_ne", "!=": "f_ne",
  };
  const RECIPROCALS = { cos: "f_sec", sin: "f_csc", tan: "f_cot" };

  // Built-in function name -> { type, args: [input names...] }
  const EXTRA_CALL_BLOCKS = {
    // Strings
    length: { type: "f_str_length", args: ["S"] },
    trim: { type: "f_str_trim", args: ["S"] },
    substring: { type: "f_str_sub", args: ["S", "OFF", "LEN"] },
    capitalize: { type: "f_str_cap", args: ["S"] },
    toUpper: { type: "f_str_upper", args: ["S"] },
    toLower: { type: "f_str_lower", args: ["S"] },
    append: { type: "f_str_append", args: ["A", "B"] },
    times: { type: "f_str_times", args: ["S", "N"] },
    find: { type: "f_str_find", args: ["S", "RE"] },
    toString: { type: "f_to_string", args: ["X"] },
    toNumber: { type: "f_to_number", args: ["S"] },
    // Dates & Durations
    from: { type: "f_date_from", args: ["X"] },
    now: { type: "f_date_now", args: [] },
    dateOf: { type: "f_date_of", args: ["Y", "M", "D"] },
    dateTimeOf: { type: "f_datetime_of", args: ["Y", "M", "D", "H", "MIN", "S"] },
    days: { type: "f_dur_days", args: ["N"] },
    hours: { type: "f_dur_hours", args: ["N"] },
    minutes: { type: "f_dur_minutes", args: ["N"] },
    seconds: { type: "f_dur_seconds", args: ["N"] },
    millis: { type: "f_dur_millis", args: ["N"] },
    duration: { type: "f_dur_make", args: ["D", "H", "MIN", "S", "MS"] },
    parseDuration: { type: "f_dur_parse", args: ["S"] },
    dateDiff: { type: "f_date_diff", args: ["A", "B"] },
    dateAdd: { type: "f_date_add", args: ["D", "DUR"] },
    dateSub: { type: "f_date_sub", args: ["D", "DUR"] },
    durAdd: { type: "f_dur_add", args: ["A", "B"] },
    durSub: { type: "f_dur_sub", args: ["A", "B"] },
    durScale: { type: "f_dur_scale", args: ["DUR", "K"] },
    durDiv: { type: "f_dur_div", args: ["A", "B"] },
    durNeg: { type: "f_dur_neg", args: ["DUR"] },
    durAbs: { type: "f_dur_abs", args: ["DUR"] },
    year: { type: "f_date_year", args: ["D"] },
    month: { type: "f_date_month", args: ["D"] },
    day: { type: "f_date_day", args: ["D"] },
    weekday: { type: "f_date_weekday", args: ["D"] },
    hour: { type: "f_date_hour", args: ["D"] },
    minute: { type: "f_date_minute", args: ["D"] },
    second: { type: "f_date_second", args: ["D"] },
    millisecond: { type: "f_date_ms", args: ["D"] },
    toEpoch: { type: "f_date_epoch", args: ["D"] },
    toDays: { type: "f_dur_to_days", args: ["DUR"] },
    toHours: { type: "f_dur_to_hours", args: ["DUR"] },
    toMinutes: { type: "f_dur_to_minutes", args: ["DUR"] },
    toSeconds: { type: "f_dur_to_seconds", args: ["DUR"] },
    toMillis: { type: "f_dur_to_millis", args: ["DUR"] },
  };

  // Recognizes PI fractions like PI/3, 2*PI/3, 3*PI/7, etc.
  const PI_FRACTIONS = {
    "1/2": "PI2", "1/3": "PI3", "2/3": "TWO_PI3", "1/4": "PI4",
    "1/5": "PI5", "2/5": "TWO_PI5", "1/6": "PI6",
    "1/7": "PI7", "2/7": "TWO_PI7", "3/7": "THREE_PI7",
    "1/8": "PI8", "3/8": "THREE_PI8",
  };

  function block(type, inputs = {}, fields = null, extraState = null) {
    const state = { type };
    if (extraState) state.extraState = extraState;
    if (fields) state.fields = fields;
    const names = Object.keys(inputs);
    if (names.length) state.inputs = Object.fromEntries(names.map((name) => [name, { block: inputs[name] }]));
    return state;
  }

  const constant = (name) => block("f_const", {}, { C: name });
  const isNumber = (node, value) => node.kind === "num" && node.value === value;
  const isPi = (node) => (node.kind === "const" && node.name === "PI") || (node.kind === "math" && node.name === "PI");
  const isBuiltinCall = (node, name, count = 1) => node.kind === "builtinCall" && node.name === name && node.args.length === count;

  function toBlocks(node, context, bound = new Set()) {
    switch (node.kind) {
      case "num": return block("f_num", {}, { NUM: node.value });
      case "bool": return block("f_bool", {}, { V: String(node.value) });
      case "str": return block("f_str", {}, { TEXT: node.value });
      case "const": return constant(node.name);
      case "math": return constant(node.name);

      case "var":
        if (bound.has(node.name)) return block("f_param", {}, { NAME: node.name });
        if (!context.names.includes(node.name)) context.names.push(node.name);
        return { type: "f_var", data: node.name, fields: { NAME: node.name } };

      case "unary":
        if (node.op === "!") return block("f_not", { A: toBlocks(node.arg, context, bound) });
        if (node.op === "+") return toBlocks(node.arg, context, bound);
        if (node.arg.kind === "num") return block("f_num", {}, { NUM: -node.arg.value });
        return block("f_neg", { X: toBlocks(node.arg, context, bound) });

      case "cond":
        return block("f_if", {
          C: toBlocks(node.test, context, bound),
          T: toBlocks(node.yes, context, bound),
          F: toBlocks(node.no, context, bound),
        });

      case "lambda": {
        const nextBound = new Set(bound);
        for (const p of node.params) nextBound.add(p);
        return block("f_lambda", { BODY: toBlocks(node.body, context, nextBound) }, { PARAMS: node.params.join(", ") });
      }

      case "mu":
        return block("f_mu", { FN: toBlocks(node.fn, context, bound) });

      case "apply": {
        const inputs = { FN: toBlocks(node.callee, context, bound) };
        node.args.forEach((arg, i) => { inputs[`A${i}`] = toBlocks(arg, context, bound); });
        return block("f_apply", inputs, null, { arity: node.args.length });
      }

      case "builtinCall": {
        const name = node.name;
        if (name === "pow") {
          return toBlocks({ kind: "binary", op: "**", left: node.args[0], right: node.args[1], start: node.start, end: node.end }, context, bound);
        }
        if (UNARY_MATH_BLOCKS[name]) {
          const [arg] = node.args;
          if (name === "sqrt" && arg.kind === "num" && [2, 3, 5].includes(arg.value)) {
            return constant(`SQRT${arg.value}`);
          }
          return block(UNARY_MATH_BLOCKS[name], { X: toBlocks(arg, context, bound) });
        }
        if (BINARY_MATH_BLOCKS[name]) {
          return block(BINARY_MATH_BLOCKS[name], {
            X: toBlocks(node.args[0], context, bound),
            Y: toBlocks(node.args[1], context, bound),
          });
        }
        if (name === "replace") {
          if (node.args.length === 3) {
            return block("f_str_replace", {
              S: toBlocks(node.args[0], context, bound),
              RE: toBlocks(node.args[1], context, bound),
              REP: toBlocks(node.args[2], context, bound),
            });
          }
          return block("f_str_replace_flags", {
            S: toBlocks(node.args[0], context, bound),
            RE: toBlocks(node.args[1], context, bound),
            REP: toBlocks(node.args[2], context, bound),
            FLAGS: toBlocks(node.args[3], context, bound),
          });
        }
        if (name === "formatDate") {
          if (node.args.length === 1) return block("f_format_date", { D: toBlocks(node.args[0], context, bound) });
          return block("f_format_date_fmt", { D: toBlocks(node.args[0], context, bound), FMT: toBlocks(node.args[1], context, bound) });
        }
        if (name === "formatDuration") {
          if (node.args.length === 1) return block("f_format_dur", { DUR: toBlocks(node.args[0], context, bound) });
          return block("f_format_dur_fmt", { DUR: toBlocks(node.args[0], context, bound), FMT: toBlocks(node.args[1], context, bound) });
        }
        const spec = EXTRA_CALL_BLOCKS[name];
        if (spec) {
          const inputs = {};
          spec.args.forEach((slot, i) => { inputs[slot] = toBlocks(node.args[i], context, bound); });
          return block(spec.type, inputs);
        }
        throw new FormulaError(`${name} is not supported`, node.start);
      }

      case "binary": {
        const { op, left, right } = node;
        if (op === "&&" || op === "||") {
          return block(op === "&&" ? "f_and" : "f_or", { A: toBlocks(left, context, bound), B: toBlocks(right, context, bound) });
        }
        if (COMPARISON_BLOCKS[op]) {
          return block(COMPARISON_BLOCKS[op], { A: toBlocks(left, context, bound), B: toBlocks(right, context, bound) });
        }
        if (op === "/" && right.kind === "num") {
          if (isPi(left) && PI_FRACTIONS[`1/${right.value}`]) {
            return constant(PI_FRACTIONS[`1/${right.value}`]);
          }
          if (left.kind === "binary" && left.op === "*" && left.left.kind === "num" && isPi(left.right)) {
            const key = `${left.left.value}/${right.value}`;
            if (PI_FRACTIONS[key]) return constant(PI_FRACTIONS[key]);
          }
        }
        if (op === "*" && isNumber(left, 2) && isPi(right)) return constant("TAU");
        if (op === "/") {
          if (isNumber(left, 1)) {
            for (const [fn, type] of Object.entries(RECIPROCALS)) {
              if (isBuiltinCall(right, fn)) return block(type, { X: toBlocks(right.args[0], context, bound) });
            }
          }
          if (isBuiltinCall(left, "log") && isBuiltinCall(right, "log")) {
            return block("f_logb", { X: toBlocks(left.args[0], context, bound), B: toBlocks(right.args[0], context, bound) });
          }
          if (left.kind === "binary" && left.op === "*" && isNumber(right, 180) && isPi(left.right)) {
            return block("f_torad", { X: toBlocks(left.left, context, bound) });
          }
          if (left.kind === "binary" && left.op === "*" && isPi(right) && isNumber(left.right, 180)) {
            return block("f_todeg", { X: toBlocks(left.left, context, bound) });
          }
        }
        if (op === "**") {
          if (right.kind === "binary" && right.op === "/" && isNumber(right.left, 1)) {
            return block("f_nroot", { X: toBlocks(left, context, bound), N: toBlocks(right.right, context, bound) });
          }
          if (isNumber(right, 2)) return block("f_sq", { X: toBlocks(left, context, bound) });
          return block("f_pow", { A: toBlocks(left, context, bound), B: toBlocks(right, context, bound) });
        }
        return block(ARITHMETIC_BLOCKS[op], { A: toBlocks(left, context, bound), B: toBlocks(right, context, bound) });
      }

      default:
        throw new FormulaError("This is not supported in a formula", node.start || 0);
    }
  }

  function countBlocks(state) {
    let total = 1;
    for (const input of Object.values(state.inputs || {})) total += countBlocks(input.block);
    return total;
  }

  // --------------------------------------------------- executable JS emitter

  function emitJs(node) {
    switch (node.kind) {
      case "num": return String(node.value);
      case "bool": return String(node.value);
      case "str": return JSON.stringify(node.value);
      case "const": return node.name === "INF" ? "Infinity" : `__rt.ENV.${node.name}`;
      case "math": return `__rt.ENV.${node.name}`;
      case "var": return node.name;
      case "unary":
        if (node.op === "+") return `+(${emitJs(node.arg)})`;
        return `(${node.op}(${emitJs(node.arg)}))`;
      case "binary": {
        const l = emitJs(node.left), r = emitJs(node.right);
        if (node.op === "===" || node.op === "==") return `__rt.eq(${l}, ${r})`;
        if (node.op === "!==" || node.op === "!=") return `(!__rt.eq(${l}, ${r}))`;
        if (node.op === "<" || node.op === "<=" || node.op === ">" || node.op === ">=") {
          return `__rt.cmp(${l}, ${r}, ${JSON.stringify(node.op)})`;
        }
        return `((${l}) ${node.op} (${r}))`;
      }
      case "cond":
        return `((${emitJs(node.test)}) ? (${emitJs(node.yes)}) : (${emitJs(node.no)}))`;
      case "builtinCall":
        return `__rt.ENV[${JSON.stringify(node.name)}](${node.args.map(emitJs).join(", ")})`;
      case "lambda":
        return `__rt.annotateFn((${node.params.join(", ")}) => (${emitJs(node.body)}), ${JSON.stringify(node.params)})`;
      case "mu":
        return `__rt.mu(${emitJs(node.fn)})`;
      case "apply":
        return `(${emitJs(node.callee)})(${node.args.map(emitJs).join(", ")})`;
      default:
        throw new FormulaError("Unsupported expression", node.start || 0);
    }
  }

  function compile(source, options = {}) {
    const ast = parse(source);
    const checked = typecheck(ast, source, options.varTypes || null, options);
    const context = { source, names: [] };
    const state = toBlocks(ast, context);
    return {
      state,
      names: context.names,
      blocks: countBlocks(state),
      type: checked.type,
      inferredType: checked.inferredType,
      typeString: checked.typeString,
      freeVarTypes: checked.freeVarTypes,
      ast,
    };
  }

  function buildEvaluator(compiled, paramNames = []) {
    const js = emitJs(compiled.ast);
    const fn = new Function("__rt", ...paramNames, `"use strict"; return (${js});`);
    return (...args) => fn(RT, ...args);
  }

  function evaluate(source, varValues = {}, varTypes = null, options = {}) {
    const compiled = compile(source, { ...options, varTypes });
    const names = Object.keys(varValues);
    const run = buildEvaluator(compiled, names);
    const value = run(...names.map((n) => varValues[n]));
    return { ...compiled, value };
  }

  return {
    compile,
    parse,
    typecheck,
    buildEvaluator,
    evaluate,
    emitJs,
    formatType,
    isNumberToNumberFn,
    FormulaError,
    TYPES: { NUM: T_NUM, BOOL: T_BOOL, STR: T_STR, DATE: T_DATE, DUR: T_DUR, fn: makeFnType },
  };
})();

if (typeof module !== "undefined") module.exports = JsFormula;
