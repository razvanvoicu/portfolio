"use strict";

// Runtime values and unqualified built-in functions for the Formula Builder.
// Pure JavaScript (no DOM or Blockly dependencies) so it works in both the
// browser and Node tests.
const FormulaRuntime = (() => {
  const MAX_RECURSION = 2000;

  const Luxon = (() => {
    if (typeof luxon !== "undefined") return luxon;
    if (typeof require === "function") {
      const fs = require("node:fs");
      const path = require("node:path");
      const code = fs.readFileSync(path.join(__dirname, "vendor", "luxon.min.js"), "utf8");
      return new Function(`${code}\nreturn luxon;`)();
    }
    throw new Error("Luxon is required for date and duration functions");
  })();
  const { DateTime, Duration } = Luxon;

  const isDate = (v) => DateTime.isDateTime(v);
  const isDuration = (v) => Duration.isDuration(v);

  function requireType(value, check, expected, fnName) {
    if (!check(value)) throw new Error(`${fnName}: expected ${expected}`);
    return value;
  }
  const reqNum = (v, fn) => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${fn}: expected a finite number`);
    return v;
  };
  const reqStr = (v, fn) => requireType(v, (x) => typeof x === "string", "a string", fn);
  const reqDate = (v, fn) => requireType(v, isDate, "a date", fn);
  const reqDur = (v, fn) => requireType(v, isDuration, "a duration", fn);

  // ----------------------------------------------------------------- strings

  function length(s) { return reqStr(s, "length").length; }
  function trim(s) { return reqStr(s, "trim").trim(); }
  function substring(s, offset, len) {
    reqStr(s, "substring");
    const start = Math.trunc(reqNum(offset, "substring"));
    const count = Math.trunc(reqNum(len, "substring"));
    if (start < 0) throw new Error("substring: offset cannot be negative");
    if (count < 0) throw new Error("substring: length cannot be negative");
    return s.slice(start, start + count);
  }
  function capitalize(s) {
    reqStr(s, "capitalize");
    return s.length ? s[0].toUpperCase() + s.slice(1) : "";
  }
  function toUpper(s) { return reqStr(s, "toUpper").toUpperCase(); }
  function toLower(s) { return reqStr(s, "toLower").toLowerCase(); }
  function append(a, b) { return reqStr(a, "append") + reqStr(b, "append"); }
  function times(s, count) {
    reqStr(s, "times");
    const n = reqNum(count, "times");
    if (!Number.isInteger(n) || n < 0) throw new Error("times: count must be a non-negative integer");
    if (s.length * n > 1e6) throw new Error("times: resulting string is too long");
    return s.repeat(n);
  }
  function compileRegex(pattern, flags, fnName) {
    reqStr(pattern, fnName);
    if (flags !== undefined) reqStr(flags, fnName);
    try {
      return new RegExp(pattern, flags || "");
    } catch (error) {
      throw new Error(`${fnName}: invalid regular expression (${error.message})`);
    }
  }
  function find(s, pattern) {
    reqStr(s, "find");
    const re = compileRegex(pattern, "", "find");
    return s.search(re);
  }
  // Converts sed-style replacement escapes (\1..\9, &, \&, \\) into a JS
  // String.prototype.replace replacement string (escaping literal $ as $$).
  function sedReplacementToJs(replacement) {
    let out = "";
    for (let i = 0; i < replacement.length; i += 1) {
      const ch = replacement[i];
      if (ch === "\\") {
        const next = replacement[i + 1];
        if (next === undefined) {
          out += "\\";
        } else if (next >= "1" && next <= "9") {
          out += `$${next}`;
          i += 1;
        } else if (next === "&" || next === "\\") {
          out += next;
          i += 1;
        } else if (next === "n") {
          out += "\n";
          i += 1;
        } else if (next === "t") {
          out += "\t";
          i += 1;
        } else if (next === "r") {
          out += "\r";
          i += 1;
        } else {
          out += next;
          i += 1;
        }
      } else if (ch === "&") {
        out += "$&";
      } else if (ch === "$") {
        out += "$$";
      } else {
        out += ch;
      }
    }
    return out;
  }
  function replace(s, pattern, replacement, flags = "") {
    reqStr(s, "replace");
    reqStr(replacement, "replace");
    const re = compileRegex(pattern, flags, "replace");
    return s.replace(re, sedReplacementToJs(replacement));
  }
  function toStringVal(v) {
    if (typeof v === "function") throw new Error("toString: cannot convert a function to a string");
    if (typeof v === "number") return Number.isFinite(v) ? String(Number(v.toPrecision(15))) : String(v);
    if (isDate(v)) return formatDate(v);
    if (isDuration(v)) return formatDuration(v);
    return String(v);
  }
  function toNumber(s) {
    reqStr(s, "toNumber");
    const trimmed = s.trim();
    const n = trimmed === "" ? NaN : Number(trimmed);
    if (!Number.isFinite(n)) throw new Error(`toNumber: "${s}" is not a valid number`);
    return n;
  }

  // ------------------------------------------------------- dates & durations

  const UTC = { zone: "utc" };
  const EXTRA_DATE_FORMATS = [
    "LLL d, yyyy", "LLLL d, yyyy", "LLL d yyyy", "LLLL d yyyy",
    "LLL d, yyyy H:mm", "LLLL d, yyyy H:mm", "LLL d, yyyy H:mm:ss", "LLLL d, yyyy H:mm:ss",
    "d LLL yyyy", "d LLLL yyyy", "d-LLL-yyyy", "d-LLLL-yyyy",
    "d LLL yyyy H:mm", "d LLLL yyyy H:mm", "d LLL yyyy H:mm:ss", "d LLLL yyyy H:mm:ss",
    "yyyy/M/d", "yyyy/M/d H:mm", "yyyy/M/d H:mm:ss", "yyyy/M/d H:mm:ss.SSS",
    "M/d/yyyy", "M/d/yyyy H:mm", "M/d/yyyy H:mm:ss",
  ];

  function ensureValidDate(dt, fnName) {
    if (!dt.isValid) throw new Error(`${fnName}: ${dt.invalidExplanation || dt.invalidReason || "invalid date"}`);
    return dt.toUTC();
  }

  function ensureValidDuration(dur, fnName) {
    if (!dur.isValid || !Number.isFinite(dur.as("milliseconds"))) {
      throw new Error(`${fnName}: ${dur.invalidExplanation || dur.invalidReason || "invalid duration"}`);
    }
    return dur;
  }

  function from(input) {
    if (typeof input === "number") {
      if (!Number.isInteger(input)) throw new Error(`from: epoch must be an integer, got ${input}`);
      return ensureValidDate(DateTime.fromMillis(input, UTC), "from");
    }
    if (typeof input !== "string") {
      throw new Error("from: expected a date string or integer epoch");
    }
    const text = input.trim();
    if (!text) throw new Error("from: date string cannot be empty");

    if (/^[+-]?\d+$/.test(text)) {
      const epoch = Number(text);
      if (!Number.isSafeInteger(epoch)) throw new Error(`from: epoch "${text}" is out of range`);
      return ensureValidDate(DateTime.fromMillis(epoch, UTC), "from");
    }

    for (const candidate of [
      DateTime.fromISO(text, UTC),
      DateTime.fromSQL(text, UTC),
      DateTime.fromRFC2822(text, UTC),
      DateTime.fromHTTP(text, UTC),
    ]) {
      if (candidate.isValid) return candidate.toUTC();
      if (candidate.invalidReason === "unit out of range") {
        throw new Error(`from: ${candidate.invalidExplanation}`);
      }
    }

    for (const fmt of EXTRA_DATE_FORMATS) {
      const candidate = DateTime.fromFormat(text, fmt, UTC);
      if (candidate.isValid) return candidate.toUTC();
      if (candidate.invalidReason === "unit out of range") {
        throw new Error(`from: ${candidate.invalidExplanation}`);
      }
    }

    throw new Error(`from: could not parse "${input}" as a valid date`);
  }

  function now() { return DateTime.utc(); }
  function dateOf(y, m, d) {
    return ensureValidDate(DateTime.utc(reqNum(y, "dateOf"), reqNum(m, "dateOf"), reqNum(d, "dateOf")), "dateOf");
  }
  function dateTimeOf(y, m, d, h, min, s) {
    return ensureValidDate(DateTime.utc(
      reqNum(y, "dateTimeOf"), reqNum(m, "dateTimeOf"), reqNum(d, "dateTimeOf"),
      reqNum(h, "dateTimeOf"), reqNum(min, "dateTimeOf"), reqNum(s, "dateTimeOf")
    ), "dateTimeOf");
  }

  function days(n) { return ensureValidDuration(Duration.fromObject({ days: reqNum(n, "days") }), "days"); }
  function hours(n) { return ensureValidDuration(Duration.fromObject({ hours: reqNum(n, "hours") }), "hours"); }
  function minutes(n) { return ensureValidDuration(Duration.fromObject({ minutes: reqNum(n, "minutes") }), "minutes"); }
  function seconds(n) { return ensureValidDuration(Duration.fromObject({ seconds: reqNum(n, "seconds") }), "seconds"); }
  function millis(n) { return ensureValidDuration(Duration.fromMillis(reqNum(n, "millis")), "millis"); }
  function duration(d, h, m, s, ms) {
    return ensureValidDuration(Duration.fromObject({
      days: reqNum(d, "duration"),
      hours: reqNum(h, "duration"),
      minutes: reqNum(m, "duration"),
      seconds: reqNum(s, "duration"),
      milliseconds: reqNum(ms, "duration"),
    }), "duration");
  }
  function parseDuration(input) {
    reqStr(input, "parseDuration");
    const text = input.trim();
    const iso = Duration.fromISO(text);
    if (iso.isValid) return iso;
    const m = /^([+-])?(?:(\d+):)?(\d+):(\d{1,2}):(\d{1,2})(?:[:.](\d{1,3}))?$/.exec(text);
    if (!m) throw new Error(`parseDuration: could not parse "${input}" (use ISO-8601 duration or d:hh:mm:ss:SSS)`);
    const sign = m[1] === "-" ? -1 : 1;
    const dur = Duration.fromObject({
      days: Number(m[2] || 0),
      hours: Number(m[3]),
      minutes: Number(m[4]),
      seconds: Number(m[5]),
      milliseconds: m[6] ? Number(m[6].padEnd(3, "0")) : 0,
    });
    return ensureValidDuration(sign < 0 ? dur.negate() : dur, "parseDuration");
  }

  function dateDiff(a, b) { return reqDate(a, "dateDiff").diff(reqDate(b, "dateDiff")); }
  function dateAdd(d, dur) { return ensureValidDate(reqDate(d, "dateAdd").plus(reqDur(dur, "dateAdd")), "dateAdd"); }
  function dateSub(d, dur) { return ensureValidDate(reqDate(d, "dateSub").minus(reqDur(dur, "dateSub")), "dateSub"); }
  function durAdd(a, b) { return ensureValidDuration(reqDur(a, "durAdd").plus(reqDur(b, "durAdd")), "durAdd"); }
  function durSub(a, b) { return ensureValidDuration(reqDur(a, "durSub").minus(reqDur(b, "durSub")), "durSub"); }
  function durScale(dur, factor) {
    const k = reqNum(factor, "durScale");
    return ensureValidDuration(Duration.fromMillis(reqDur(dur, "durScale").as("milliseconds") * k), "durScale");
  }
  function durDiv(a, b) { return reqDur(a, "durDiv").as("milliseconds") / reqDur(b, "durDiv").as("milliseconds"); }
  function durNeg(dur) { return reqDur(dur, "durNeg").negate(); }
  function durAbs(dur) { return Duration.fromMillis(Math.abs(reqDur(dur, "durAbs").as("milliseconds"))); }

  function year(d) { return reqDate(d, "year").toUTC().year; }
  function month(d) { return reqDate(d, "month").toUTC().month; }
  function day(d) { return reqDate(d, "day").toUTC().day; }
  function weekday(d) { return reqDate(d, "weekday").toUTC().weekday % 7; }
  function hour(d) { return reqDate(d, "hour").toUTC().hour; }
  function minute(d) { return reqDate(d, "minute").toUTC().minute; }
  function second(d) { return reqDate(d, "second").toUTC().second; }
  function millisecond(d) { return reqDate(d, "millisecond").toUTC().millisecond; }
  function toEpoch(d) { return reqDate(d, "toEpoch").toMillis(); }

  function toDays(dur) { return reqDur(dur, "toDays").as("days"); }
  function toHours(dur) { return reqDur(dur, "toHours").as("hours"); }
  function toMinutes(dur) { return reqDur(dur, "toMinutes").as("minutes"); }
  function toSeconds(dur) { return reqDur(dur, "toSeconds").as("seconds"); }
  function toMillis(dur) { return reqDur(dur, "toMillis").as("milliseconds"); }

  function formatDate(d, fmt) {
    const dt = reqDate(d, "formatDate").toUTC();
    if (fmt === undefined || fmt === "") return dt.toISO();
    reqStr(fmt, "formatDate");
    return dt.toFormat(fmt);
  }

  function formatDuration(dur, fmt) {
    const raw = reqDur(dur, "formatDuration");
    const ms = raw.as("milliseconds");
    const sign = ms < 0 ? "-" : "";
    const absDur = Duration.fromMillis(Math.abs(ms));
    if (fmt === undefined || fmt === "") {
      return sign + absDur.toFormat("d:hh:mm:ss:SSS");
    }
    reqStr(fmt, "formatDuration");
    return sign + absDur.toFormat(fmt);
  }

  // --------------------------------------------------------------- functions

  function annotateFn(fn, params) {
    fn.__formulaFn = true;
    fn.__params = params;
    fn.__arity = params.length;
    return fn;
  }

  // Fixed-point combinator with recursion-depth guard.
  // Supports both:
  //   - uncurried: mu(lambda(f, x, ...))  (arity >= 2, returns fn of rest params)
  //   - curried:   mu(lambda(f, lambda(x, ...))) (arity === 1, returns fn)
  function mu(fn) {
    if (typeof fn !== "function") throw new Error("mu: argument must be a function");
    const arity = fn.__arity ?? fn.length;
    if (arity >= 2) {
      let depth = 0;
      const self = (...args) => {
        if (++depth > MAX_RECURSION) throw new Error(`Maximum recursion depth (${MAX_RECURSION}) exceeded`);
        try {
          return fn(self, ...args);
        } finally {
          depth -= 1;
        }
      };
      return annotateFn(self, (fn.__params || []).slice(1));
    }
    if (arity === 1) {
      let depth = 0;
      let inner = null;
      const self = (...args) => {
        if (++depth > MAX_RECURSION) throw new Error(`Maximum recursion depth (${MAX_RECURSION}) exceeded`);
        try {
          if (!inner) {
            inner = fn(self);
            if (typeof inner !== "function") throw new Error("mu: body must return a function");
          }
          return inner(...args);
        } finally {
          depth -= 1;
        }
      };
      // Eagerly resolve inner to discover parameter metadata when possible.
      try {
        const probe = fn(self);
        if (typeof probe === "function") {
          inner = probe;
          return annotateFn(self, probe.__params || ["x"]);
        }
      } catch {
        // Defer resolution until called.
      }
      return annotateFn(self, ["x"]);
    }
    throw new Error("mu: function must take at least one parameter");
  }

  function numericValue(v) {
    if (isDate(v)) return v.toMillis();
    if (isDuration(v)) return v.as("milliseconds");
    return v;
  }

  function eq(a, b) {
    if (isDate(a) && isDate(b)) return a.toMillis() === b.toMillis();
    if (isDuration(a) && isDuration(b)) return a.as("milliseconds") === b.as("milliseconds");
    return a === b;
  }

  function cmp(a, b, op) {
    const lv = numericValue(a);
    const rv = numericValue(b);
    switch (op) {
      case "<": return lv < rv;
      case "<=": return lv <= rv;
      case ">": return lv > rv;
      case ">=": return lv >= rv;
      default: throw new Error(`Unknown comparison operator: ${op}`);
    }
  }

  function formatDisplay(value, typeLabel = "") {
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(Number(value.toPrecision(15))) : String(value);
    }
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "boolean") return String(value);
    if (isDate(value)) return formatDate(value);
    if (isDuration(value)) return formatDuration(value);
    if (typeof value === "function") {
      const params = value.__params ? value.__params.join(", ") : "…";
      return typeLabel ? `λ(${params}) : ${typeLabel}` : `λ(${params})`;
    }
    return String(value);
  }

  // ------------------------------------------------------------- environment

  const MATH_CONSTANTS = {
    PI: Math.PI,
    E: Math.E,
    SQRT2: Math.SQRT2,
  };

  const MATH_FUNCTIONS = {
    abs: Math.abs, acos: Math.acos, acosh: Math.acosh, asin: Math.asin, asinh: Math.asinh,
    atan: Math.atan, atan2: Math.atan2, atanh: Math.atanh, cbrt: Math.cbrt, ceil: Math.ceil,
    cos: Math.cos, cosh: Math.cosh, exp: Math.exp, floor: Math.floor, hypot: Math.hypot,
    log: Math.log, log10: Math.log10, log2: Math.log2, max: Math.max, min: Math.min,
    pow: Math.pow, round: Math.round, sign: Math.sign, sin: Math.sin, sinh: Math.sinh,
    sqrt: Math.sqrt, tan: Math.tan, tanh: Math.tanh, trunc: Math.trunc,
  };

  const STRING_FUNCTIONS = {
    length, trim, substring, capitalize, toUpper, toLower,
    append, times, find, replace, toString: toStringVal, toNumber,
  };

  const DATE_FUNCTIONS = {
    from, now, dateOf, dateTimeOf,
    days, hours, minutes, seconds, millis, duration, parseDuration,
    dateDiff, dateAdd, dateSub,
    durAdd, durSub, durScale, durDiv, durNeg, durAbs,
    year, month, day, weekday, hour, minute, second, millisecond, toEpoch,
    toDays, toHours, toMinutes, toSeconds, toMillis,
    formatDate, formatDuration,
  };

  const ENV = {
    ...MATH_CONSTANTS,
    ...MATH_FUNCTIONS,
    ...STRING_FUNCTIONS,
    ...DATE_FUNCTIONS,
    mu,
  };

  const RESERVED_NAMES = new Set([
    "Math", "Infinity", "NaN", "undefined", "null", "true", "false",
    "lambda", "mu",
    ...Object.keys(ENV),
  ]);

  return {
    DateTime,
    Duration,
    isDate,
    isDuration,
    ENV,
    MATH_CONSTANTS,
    MATH_FUNCTIONS,
    STRING_FUNCTIONS,
    DATE_FUNCTIONS,
    RESERVED_NAMES,
    annotateFn,
    mu,
    eq,
    cmp,
    formatDisplay,
    sedReplacementToJs,
    formatDate,
    formatDuration,
  };
})();

if (typeof module !== "undefined") module.exports = FormulaRuntime;
