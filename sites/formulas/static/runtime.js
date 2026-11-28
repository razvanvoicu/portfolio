"use strict";

// Runtime values and unqualified built-in functions for the Formula Builder.
// Pure JavaScript (no DOM or Blockly dependencies) so it works in both the
// browser and Node tests.
const FormulaRuntime = (() => {
  const MAX_RECURSION = 2000;
  const MAX_DATE_MS = 8.64e15;

  const MS_SEC = 1000;
  const MS_MIN = 60 * MS_SEC;
  const MS_HOUR = 60 * MS_MIN;
  const MS_DAY = 24 * MS_HOUR;

  const pad = (n, width = 2) => String(Math.trunc(Math.abs(n))).padStart(width, "0");

  class FormulaDate {
    constructor(ms) {
      if (typeof ms !== "number" || !Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) {
        throw new Error("Date is out of valid range");
      }
      this.ms = Math.trunc(ms);
    }
    valueOf() { return this.ms; }
    toISOString() { return new Date(this.ms).toISOString(); }
    toString() { return this.toISOString(); }
  }

  class FormulaDuration {
    constructor(ms) {
      if (typeof ms !== "number" || !Number.isFinite(ms)) {
        throw new Error("Duration must be finite");
      }
      this.ms = Math.round(ms);
    }
    valueOf() { return this.ms; }
    toString() { return formatDuration(this); }
  }

  const isDate = (v) => v instanceof FormulaDate;
  const isDuration = (v) => v instanceof FormulaDuration;

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
    if (isDate(v)) return v.toISOString();
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

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function buildUtcDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0, offsetMinutes = 0) {
    for (const [label, v] of [["year", year], ["month", month], ["day", day], ["hour", hour], ["minute", minute], ["second", second], ["millisecond", ms]]) {
      if (!Number.isInteger(v)) throw new Error(`Invalid date ${label}: ${v}`);
    }
    if (month < 1 || month > 12) throw new Error(`Invalid month: ${month} (expected 1–12)`);
    const maxDay = daysInMonth(year, month);
    if (day < 1 || day > maxDay) throw new Error(`Invalid day: ${day} for ${year}-${pad(month)} (expected 1–${maxDay})`);
    if (hour < 0 || hour > 23) throw new Error(`Invalid hour: ${hour} (expected 0–23)`);
    if (minute < 0 || minute > 59) throw new Error(`Invalid minute: ${minute} (expected 0–59)`);
    if (second < 0 || second > 59) throw new Error(`Invalid second: ${second} (expected 0–59)`);
    if (ms < 0 || ms > 999) throw new Error(`Invalid millisecond: ${ms} (expected 0–999)`);
    const d = new Date(0);
    d.setUTCFullYear(year, month - 1, day);
    d.setUTCHours(hour, minute, second, ms);
    return new FormulaDate(d.getTime() - offsetMinutes * MS_MIN);
  }

  const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  function parseTimezone(tz) {
    if (!tz || tz === "Z" || tz === "z" || tz === "UTC" || tz === "GMT") return 0;
    const m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz);
    if (!m) throw new Error(`Invalid timezone offset: "${tz}"`);
    const sign = m[1] === "+" ? 1 : -1;
    const h = Number(m[2]), min = Number(m[3]);
    if (h > 23 || min > 59) throw new Error(`Invalid timezone offset: "${tz}"`);
    return sign * (h * 60 + min);
  }

  function parseTimeParts(h, min, sec, frac) {
    const ms = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
    return [Number(h || 0), Number(min || 0), Number(sec || 0), ms];
  }

  function from(input) {
    if (typeof input === "number") {
      if (!Number.isInteger(input)) throw new Error(`from: epoch must be an integer, got ${input}`);
      return new FormulaDate(input);
    }
    if (typeof input !== "string") {
      throw new Error("from: expected a date string or integer epoch");
    }
    const text = input.trim();
    if (!text) throw new Error("from: date string cannot be empty");

    // A single integer is considered a Unix epoch in milliseconds.
    if (/^[+-]?\d+$/.test(text)) {
      const epoch = Number(text);
      if (!Number.isSafeInteger(epoch)) throw new Error(`from: epoch "${text}" is out of range`);
      return new FormulaDate(epoch);
    }

    // ISO-like: YYYY-MM-DD or YYYY/MM/DD with optional time and timezone.
    let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:\s*(Z|z|UTC|GMT|[+-]\d{2}:?\d{2}))?)?$/.exec(text);
    if (m) {
      const [h, min, s, ms] = parseTimeParts(m[4], m[5], m[6], m[7]);
      return buildUtcDate(Number(m[1]), Number(m[2]), Number(m[3]), h, min, s, ms, parseTimezone(m[8]));
    }

    // Month-name first: "May 1, 2024" / "May 1 2024 12:30:00Z"
    m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:\s*(Z|z|UTC|GMT|[+-]\d{2}:?\d{2}))?)?$/.exec(text);
    if (m && MONTHS[m[1].toLowerCase()]) {
      const [h, min, s, ms] = parseTimeParts(m[4], m[5], m[6], m[7]);
      return buildUtcDate(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]), h, min, s, ms, parseTimezone(m[8]));
    }

    // Day first with month name (including RFC 2822 optional weekday): "1 May 2024" / "Wed, 01 May 2024 12:30:00 GMT"
    m = /^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})[\s-]([A-Za-z]+)[\s-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:\s*(Z|z|UTC|GMT|[+-]\d{2}:?\d{2}))?)?$/.exec(text);
    if (m && MONTHS[m[2].toLowerCase()]) {
      const [h, min, s, ms] = parseTimeParts(m[4], m[5], m[6], m[7]);
      return buildUtcDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), h, min, s, ms, parseTimezone(m[8]));
    }

    // US slash format: MM/DD/YYYY (with optional time)
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:\s*(Z|z|UTC|GMT|[+-]\d{2}:?\d{2}))?)?$/.exec(text);
    if (m) {
      const [h, min, s, ms] = parseTimeParts(m[4], m[5], m[6], m[7]);
      return buildUtcDate(Number(m[3]), Number(m[1]), Number(m[2]), h, min, s, ms, parseTimezone(m[8]));
    }

    throw new Error(`from: could not parse "${input}" as a valid date`);
  }

  function now() { return new FormulaDate(Date.now()); }
  function dateOf(y, m, d) {
    return buildUtcDate(reqNum(y, "dateOf"), reqNum(m, "dateOf"), reqNum(d, "dateOf"));
  }
  function dateTimeOf(y, m, d, h, min, s) {
    return buildUtcDate(
      reqNum(y, "dateTimeOf"), reqNum(m, "dateTimeOf"), reqNum(d, "dateTimeOf"),
      reqNum(h, "dateTimeOf"), reqNum(min, "dateTimeOf"), reqNum(s, "dateTimeOf")
    );
  }

  function days(n) { return new FormulaDuration(reqNum(n, "days") * MS_DAY); }
  function hours(n) { return new FormulaDuration(reqNum(n, "hours") * MS_HOUR); }
  function minutes(n) { return new FormulaDuration(reqNum(n, "minutes") * MS_MIN); }
  function seconds(n) { return new FormulaDuration(reqNum(n, "seconds") * MS_SEC); }
  function millis(n) { return new FormulaDuration(reqNum(n, "millis")); }
  function duration(d, h, m, s, ms) {
    return new FormulaDuration(
      reqNum(d, "duration") * MS_DAY
      + reqNum(h, "duration") * MS_HOUR
      + reqNum(m, "duration") * MS_MIN
      + reqNum(s, "duration") * MS_SEC
      + reqNum(ms, "duration")
    );
  }
  function parseDuration(input) {
    reqStr(input, "parseDuration");
    const text = input.trim();
    // Matches [-]d:hh:mm:ss:sss or [-]d:hh:mm:ss.sss or [-]hh:mm:ss(:sss|.sss)
    const m = /^([+-])?(?:(\d+):)?(\d+):(\d{1,2}):(\d{1,2})(?:[:.](\d{1,3}))?$/.exec(text);
    if (!m) throw new Error(`parseDuration: could not parse "${input}" (use D:HH:mm:ss:SSS or HH:mm:ss)`);
    const sign = m[1] === "-" ? -1 : 1;
    const d = Number(m[2] || 0), h = Number(m[3]), min = Number(m[4]), sec = Number(m[5]);
    const ms = m[6] ? Number(m[6].padEnd(3, "0")) : 0;
    return new FormulaDuration(sign * (d * MS_DAY + h * MS_HOUR + min * MS_MIN + sec * MS_SEC + ms));
  }

  function dateDiff(a, b) { return new FormulaDuration(reqDate(a, "dateDiff").ms - reqDate(b, "dateDiff").ms); }
  function dateAdd(d, dur) { return new FormulaDate(reqDate(d, "dateAdd").ms + reqDur(dur, "dateAdd").ms); }
  function dateSub(d, dur) { return new FormulaDate(reqDate(d, "dateSub").ms - reqDur(dur, "dateSub").ms); }
  function durAdd(a, b) { return new FormulaDuration(reqDur(a, "durAdd").ms + reqDur(b, "durAdd").ms); }
  function durSub(a, b) { return new FormulaDuration(reqDur(a, "durSub").ms - reqDur(b, "durSub").ms); }
  function durScale(dur, factor) { return new FormulaDuration(reqDur(dur, "durScale").ms * reqNum(factor, "durScale")); }
  function durDiv(a, b) { return reqDur(a, "durDiv").ms / reqDur(b, "durDiv").ms; }
  function durNeg(dur) { return new FormulaDuration(-reqDur(dur, "durNeg").ms); }
  function durAbs(dur) { return new FormulaDuration(Math.abs(reqDur(dur, "durAbs").ms)); }

  function year(d) { return new Date(reqDate(d, "year").ms).getUTCFullYear(); }
  function month(d) { return new Date(reqDate(d, "month").ms).getUTCMonth() + 1; }
  function day(d) { return new Date(reqDate(d, "day").ms).getUTCDate(); }
  function weekday(d) { return new Date(reqDate(d, "weekday").ms).getUTCDay(); }
  function hour(d) { return new Date(reqDate(d, "hour").ms).getUTCHours(); }
  function minute(d) { return new Date(reqDate(d, "minute").ms).getUTCMinutes(); }
  function second(d) { return new Date(reqDate(d, "second").ms).getUTCSeconds(); }
  function millisecond(d) { return new Date(reqDate(d, "millisecond").ms).getUTCMilliseconds(); }
  function toEpoch(d) { return reqDate(d, "toEpoch").ms; }

  function toDays(dur) { return reqDur(dur, "toDays").ms / MS_DAY; }
  function toHours(dur) { return reqDur(dur, "toHours").ms / MS_HOUR; }
  function toMinutes(dur) { return reqDur(dur, "toMinutes").ms / MS_MIN; }
  function toSeconds(dur) { return reqDur(dur, "toSeconds").ms / MS_SEC; }
  function toMillis(dur) { return reqDur(dur, "toMillis").ms; }

  const DATE_TOKEN = /\[([^\]]*)\]|YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s|SSS/g;
  function formatDate(d, fmt) {
    reqDate(d, "formatDate");
    if (fmt === undefined || fmt === "") return d.toISOString();
    reqStr(fmt, "formatDate");
    const dt = new Date(d.ms);
    const tokens = {
      YYYY: String(dt.getUTCFullYear()).padStart(4, "0"),
      YY: String(dt.getUTCFullYear()).slice(-2).padStart(2, "0"),
      MM: pad(dt.getUTCMonth() + 1, 2),
      M: String(dt.getUTCMonth() + 1),
      DD: pad(dt.getUTCDate(), 2),
      D: String(dt.getUTCDate()),
      HH: pad(dt.getUTCHours(), 2),
      H: String(dt.getUTCHours()),
      mm: pad(dt.getUTCMinutes(), 2),
      m: String(dt.getUTCMinutes()),
      ss: pad(dt.getUTCSeconds(), 2),
      s: String(dt.getUTCSeconds()),
      SSS: pad(dt.getUTCMilliseconds(), 3),
    };
    return fmt.replace(DATE_TOKEN, (match, escaped) => (escaped !== undefined ? escaped : tokens[match]));
  }

  const DUR_TOKEN = /\[([^\]]*)\]|DD|D|HH|H|mm|m|ss|s|SSS/g;
  function formatDuration(dur, fmt) {
    reqDur(dur, "formatDuration");
    const negative = dur.ms < 0;
    let rem = Math.abs(dur.ms);
    const d = Math.floor(rem / MS_DAY); rem -= d * MS_DAY;
    const h = Math.floor(rem / MS_HOUR); rem -= h * MS_HOUR;
    const min = Math.floor(rem / MS_MIN); rem -= min * MS_MIN;
    const sec = Math.floor(rem / MS_SEC); rem -= sec * MS_SEC;
    const ms = Math.round(rem);
    const sign = negative ? "-" : "";
    if (fmt === undefined || fmt === "") {
      return `${sign}${d}:${pad(h, 2)}:${pad(min, 2)}:${pad(sec, 2)}:${pad(ms, 3)}`;
    }
    reqStr(fmt, "formatDuration");
    const tokens = {
      DD: pad(d, 2),
      D: String(d),
      HH: pad(h, 2),
      H: String(h),
      mm: pad(min, 2),
      m: String(min),
      ss: pad(sec, 2),
      s: String(sec),
      SSS: pad(ms, 3),
    };
    return sign + fmt.replace(DUR_TOKEN, (match, escaped) => (escaped !== undefined ? escaped : tokens[match]));
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

  function eq(a, b) {
    if (isDate(a) && isDate(b)) return a.ms === b.ms;
    if (isDuration(a) && isDuration(b)) return a.ms === b.ms;
    return a === b;
  }

  function cmp(a, b, op) {
    const lv = (isDate(a) || isDuration(a)) ? a.ms : a;
    const rv = (isDate(b) || isDuration(b)) ? b.ms : b;
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
    if (isDate(value)) return value.toISOString();
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
    FormulaDate,
    FormulaDuration,
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
