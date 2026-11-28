"use strict";

// Block definitions, JavaScript generators and palette contents for the
// formula builder. Every function block is described once in SPECS; the same
// description yields the Blockly block, its generator and its palette button.
const FormulaBlocks = (() => {
  const gen = javascript.javascriptGenerator;
  const O = javascript.Order;

  const NUM = "Number";
  const BOOL = "Boolean";
  const STR = "String";
  const DATE = "Date";
  const DUR = "Duration";
  const FN = "Function";

  const COLOR = {
    num: "#3a78c2",
    ops: "#2b9a88",
    funcs: "#7b5bd0",
    trig: "#bf5479",
    logic: "#c98a2b",
    str: "#c4623b",
    dates: "#3b9a6e",
    lambda: "#9b59b6",
    vars: "#4f8fd9",
    root: "#4a5568",
  };

  const arg = (name, check, order = O.NONE) => ({ name, check, order });
  const numArg = (name, order) => arg(name, NUM, order);
  const strArg = (name, order) => arg(name, STR, order);
  const dateArg = (name, order) => arg(name, DATE, order);
  const durArg = (name, order) => arg(name, DUR, order);

  function binary(id, sym, js, order, leftOrder, rightOrder, label, title) {
    return {
      id, group: "ops", label, title, msg: `%1 ${sym} %2`, out: NUM,
      args: [numArg("A", leftOrder), numArg("B", rightOrder)],
      build: ([a, b]) => [`${a}${js}${b}`, order],
    };
  }

  function call(id, group, label, title, msg, js, argCount = 1) {
    const names = ["X", "Y"].slice(0, argCount);
    return {
      id, group, label, title, msg, out: NUM,
      args: names.map((n) => numArg(n)),
      build: (a) => [`${js}(${a.join(", ")})`, O.FUNCTION_CALL],
    };
  }

  function fnSpec(id, group, label, title, msg, js, out, args) {
    return {
      id, group, label, title, msg, out, args,
      build: (a) => [`${js}(${a.join(", ")})`, O.FUNCTION_CALL],
    };
  }

  function compare(id, sym, js, order, label, title) {
    return {
      id, group: "logic", label, title, msg: `%1 ${sym} %2`, out: BOOL,
      args: [arg("A", null, order), arg("B", null, order)],
      build: ([a, b]) => [`${a} ${js} ${b}`, order],
    };
  }

  const SPECS = [
    // --- operators ---------------------------------------------------------
    binary("add", "+", " + ", O.ADDITION, O.BITWISE_SHIFT, O.ADDITION, "+", "Add"),
    binary("sub", "−", " - ", O.SUBTRACTION, O.BITWISE_SHIFT, O.SUBTRACTION, "−", "Subtract"),
    binary("mul", "×", " * ", O.MULTIPLICATION, O.MULTIPLICATION, O.MULTIPLICATION, "×", "Multiply"),
    binary("div", "÷", " / ", O.DIVISION, O.MODULUS, O.EXPONENTIATION, "÷", "Divide"),
    binary("pow", "^", " ** ", O.EXPONENTIATION, O.BITWISE_NOT, O.EXPONENTIATION, "xʸ", "Power"),
    {
      id: "sq", group: "ops", label: "x²", title: "Square", msg: "( %1 )²", out: NUM,
      args: [numArg("X", O.BITWISE_NOT)],
      build: ([x]) => [`${x} ** 2`, O.EXPONENTIATION],
    },
    {
      id: "neg", group: "ops", label: "−x", title: "Negate", msg: "−( %1 )", out: NUM,
      args: [numArg("X", O.UNARY_NEGATION)],
      build: ([x]) => [x.startsWith("-") ? `-(${x})` : `-${x}`, O.UNARY_NEGATION],
    },
    binary("rem", "rem", " % ", O.MODULUS, O.MODULUS, O.EXPONENTIATION, "rem", "Remainder after division"),

    // --- functions (unqualified Math names) --------------------------------
    call("sqrt", "funcs", "√", "Square root", "√( %1 )", "sqrt"),
    call("cbrt", "funcs", "∛", "Cube root", "∛( %1 )", "cbrt"),
    {
      id: "nroot", group: "funcs", label: "ⁿ√", title: "n-th root", msg: "( %1 ) ^ (1 / %2)", out: NUM,
      args: [numArg("X", O.BITWISE_NOT), numArg("N", O.EXPONENTIATION)],
      build: ([x, n]) => [`${x} ** (1 / ${n})`, O.EXPONENTIATION],
    },
    call("abs", "funcs", "|x|", "Absolute value", "| %1 |", "abs"),
    call("floor", "funcs", "⌊x⌋", "Round down", "⌊ %1 ⌋", "floor"),
    call("ceil", "funcs", "⌈x⌉", "Round up", "⌈ %1 ⌉", "ceil"),
    call("round", "funcs", "round", "Round to nearest integer", "round( %1 )", "round"),
    call("trunc", "funcs", "trunc", "Drop the fractional part", "trunc( %1 )", "trunc"),
    call("sign", "funcs", "sign", "Sign: −1, 0 or 1", "sign( %1 )", "sign"),
    call("exp", "funcs", "eˣ", "e to the power x", "exp( %1 )", "exp"),
    call("ln", "funcs", "ln", "Natural logarithm", "ln( %1 )", "log"),
    call("log10", "funcs", "log₁₀", "Base-10 logarithm", "log₁₀( %1 )", "log10"),
    call("log2", "funcs", "log₂", "Base-2 logarithm", "log₂( %1 )", "log2"),
    {
      id: "logb", group: "funcs", label: "log b", title: "Logarithm to any base", msg: "log( %1 , base %2 )", out: NUM,
      args: [numArg("X"), numArg("B")],
      build: ([x, b]) => [`log(${x}) / log(${b})`, O.DIVISION],
    },
    call("min", "funcs", "min", "Smaller of two values", "min( %1 , %2 )", "min", 2),
    call("max", "funcs", "max", "Larger of two values", "max( %1 , %2 )", "max", 2),
    call("hypot", "funcs", "hypot", "√(x² + y²)", "hypot( %1 , %2 )", "hypot", 2),

    // --- trigonometry (unqualified Math names) -----------------------------
    call("sin", "trig", "sin", "Sine (radians)", "sin( %1 )", "sin"),
    call("cos", "trig", "cos", "Cosine (radians)", "cos( %1 )", "cos"),
    call("tan", "trig", "tan", "Tangent (radians)", "tan( %1 )", "tan"),
    ...[["sec", "cos", "Secant"], ["csc", "sin", "Cosecant"], ["cot", "tan", "Cotangent"]].map(
      ([id, base, title]) => ({
        id, group: "trig", label: id, title: `${title} (radians)`, msg: `${id}( %1 )`, out: NUM,
        args: [numArg("X")],
        build: ([x]) => [`1 / ${base}(${x})`, O.DIVISION],
      })
    ),
    call("asin", "trig", "asin", "Inverse sine", "asin( %1 )", "asin"),
    call("acos", "trig", "acos", "Inverse cosine", "acos( %1 )", "acos"),
    call("atan", "trig", "atan", "Inverse tangent", "atan( %1 )", "atan"),
    call("atan2", "trig", "atan2", "Angle of the point (x, y)", "atan2( y %1 , x %2 )", "atan2", 2),
    call("sinh", "trig", "sinh", "Hyperbolic sine", "sinh( %1 )", "sinh"),
    call("cosh", "trig", "cosh", "Hyperbolic cosine", "cosh( %1 )", "cosh"),
    call("tanh", "trig", "tanh", "Hyperbolic tangent", "tanh( %1 )", "tanh"),
    call("asinh", "trig", "asinh", "Inverse hyperbolic sine", "asinh( %1 )", "asinh"),
    call("acosh", "trig", "acosh", "Inverse hyperbolic cosine", "acosh( %1 )", "acosh"),
    call("atanh", "trig", "atanh", "Inverse hyperbolic tangent", "atanh( %1 )", "atanh"),
    {
      id: "torad", group: "trig", label: "→rad", title: "Degrees to radians", msg: "rad( %1 ° )", out: NUM,
      args: [numArg("X", O.MODULUS)],
      build: ([x]) => [`${x} * PI / 180`, O.DIVISION],
    },
    {
      id: "todeg", group: "trig", label: "→deg", title: "Radians to degrees", msg: "deg( %1 rad )", out: NUM,
      args: [numArg("X", O.MODULUS)],
      build: ([x]) => [`${x} * 180 / PI`, O.DIVISION],
    },

    // --- logic -------------------------------------------------------------
    {
      id: "if", group: "logic", label: "if/else", title: "If … then … else", out: null,
      msg: "if %1 then %2 else %3",
      args: [arg("C", BOOL, O.CONDITIONAL), arg("T", null, O.CONDITIONAL), arg("F", null, O.CONDITIONAL)],
      build: ([c, t, f]) => [`${c} ? ${t} : ${f}`, O.CONDITIONAL],
    },
    compare("eq", "=", "===", O.EQUALITY, "=", "Equal to"),
    compare("ne", "≠", "!==", O.EQUALITY, "≠", "Not equal to"),
    compare("lt", "<", "<", O.RELATIONAL, "<", "Less than"),
    compare("le", "≤", "<=", O.RELATIONAL, "≤", "Less than or equal to"),
    compare("gt", ">", ">", O.RELATIONAL, ">", "Greater than"),
    compare("ge", "≥", ">=", O.RELATIONAL, "≥", "Greater than or equal to"),
    {
      id: "and", group: "logic", label: "and", title: "Both are true", msg: "%1 and %2", out: BOOL,
      args: [arg("A", BOOL, O.LOGICAL_AND), arg("B", BOOL, O.LOGICAL_AND)],
      build: ([a, b]) => [`${a} && ${b}`, O.LOGICAL_AND],
    },
    {
      id: "or", group: "logic", label: "or", title: "At least one is true", msg: "%1 or %2", out: BOOL,
      args: [arg("A", BOOL, O.LOGICAL_OR), arg("B", BOOL, O.LOGICAL_OR)],
      build: ([a, b]) => [`${a} || ${b}`, O.LOGICAL_OR],
    },
    {
      id: "not", group: "logic", label: "not", title: "Opposite truth value", msg: "not %1", out: BOOL,
      args: [arg("A", BOOL, O.LOGICAL_NOT)],
      build: ([a]) => [`!${a}`, O.LOGICAL_NOT],
    },

    // --- strings -----------------------------------------------------------
    fnSpec("str_length", "str", "length", "String length", "length( %1 )", "length", NUM, [strArg("S")]),
    fnSpec("str_trim", "str", "trim", "Remove leading/trailing whitespace", "trim( %1 )", "trim", STR, [strArg("S")]),
    fnSpec("str_sub", "str", "substring", "Substring by offset and length", "substring( %1 , offset %2 , len %3 )", "substring", STR, [strArg("S"), numArg("OFF"), numArg("LEN")]),
    fnSpec("str_cap", "str", "capitalize", "Capitalize first character", "capitalize( %1 )", "capitalize", STR, [strArg("S")]),
    fnSpec("str_upper", "str", "toUpper", "Convert to uppercase", "toUpper( %1 )", "toUpper", STR, [strArg("S")]),
    fnSpec("str_lower", "str", "toLower", "Convert to lowercase", "toLower( %1 )", "toLower", STR, [strArg("S")]),
    fnSpec("str_append", "str", "append", "Concatenate two strings", "append( %1 , %2 )", "append", STR, [strArg("A"), strArg("B")]),
    fnSpec("str_times", "str", "times", "Repeat string count times", "times( %1 , %2 )", "times", STR, [strArg("S"), numArg("N")]),
    fnSpec("str_find", "str", "find", "First index matching regexp, or -1", "find( %1 , re %2 )", "find", NUM, [strArg("S"), strArg("RE")]),
    fnSpec("str_replace", "str", "replace", "Replace regexp match (sed \\1..9 &)", "replace( %1 , re %2 , with %3 )", "replace", STR, [strArg("S"), strArg("RE"), strArg("REP")]),
    fnSpec("str_replace_flags", "str", "replace/f", "Replace regexp match with flags (e.g. g, i)", "replace( %1 , re %2 , with %3 , flags %4 )", "replace", STR, [strArg("S"), strArg("RE"), strArg("REP"), strArg("FLAGS")]),
    fnSpec("to_string", "str", "toString", "Convert value to string", "toString( %1 )", "toString", STR, [arg("X", null)]),
    fnSpec("to_number", "str", "toNumber", "Parse string as number", "toNumber( %1 )", "toNumber", NUM, [strArg("S")]),

    // --- dates & durations -------------------------------------------------
    fnSpec("date_from", "dates", "from", "Parse date string or integer epoch (ms)", "from( %1 )", "from", DATE, [arg("X", [STR, NUM])]),
    fnSpec("date_now", "dates", "now", "Current UTC date/time", "now()", "now", DATE, []),
    fnSpec("date_of", "dates", "dateOf", "Create UTC date (y, m, d)", "dateOf( y %1 , m %2 , d %3 )", "dateOf", DATE, [numArg("Y"), numArg("M"), numArg("D")]),
    fnSpec("datetime_of", "dates", "dateTimeOf", "Create UTC date/time", "dateTimeOf( y %1 , m %2 , d %3 , h %4 , min %5 , s %6 )", "dateTimeOf", DATE, [numArg("Y"), numArg("M"), numArg("D"), numArg("H"), numArg("MIN"), numArg("S")]),
    fnSpec("date_diff", "dates", "dateDiff", "Difference between two dates (duration)", "dateDiff( %1 , %2 )", "dateDiff", DUR, [dateArg("A"), dateArg("B")]),
    fnSpec("date_add", "dates", "dateAdd", "Add a duration to a date", "dateAdd( %1 , %2 )", "dateAdd", DATE, [dateArg("D"), durArg("DUR")]),
    fnSpec("date_sub", "dates", "dateSub", "Subtract a duration from a date", "dateSub( %1 , %2 )", "dateSub", DATE, [dateArg("D"), durArg("DUR")]),
    fnSpec("format_date", "dates", "formatDate", "Format date as ISO string", "formatDate( %1 )", "formatDate", STR, [dateArg("D")]),
    fnSpec("format_date_fmt", "dates", "formatDate/f", "Format date with token pattern", "formatDate( %1 , fmt %2 )", "formatDate", STR, [dateArg("D"), strArg("FMT")]),
    fnSpec("dur_days", "dates", "days", "Duration in days", "days( %1 )", "days", DUR, [numArg("N")]),
    fnSpec("dur_hours", "dates", "hours", "Duration in hours", "hours( %1 )", "hours", DUR, [numArg("N")]),
    fnSpec("dur_minutes", "dates", "minutes", "Duration in minutes", "minutes( %1 )", "minutes", DUR, [numArg("N")]),
    fnSpec("dur_seconds", "dates", "seconds", "Duration in seconds", "seconds( %1 )", "seconds", DUR, [numArg("N")]),
    fnSpec("dur_millis", "dates", "millis", "Duration in milliseconds", "millis( %1 )", "millis", DUR, [numArg("N")]),
    fnSpec("dur_make", "dates", "duration", "Build duration (d, h, m, s, ms)", "duration( d %1 , h %2 , m %3 , s %4 , ms %5 )", "duration", DUR, [numArg("D"), numArg("H"), numArg("MIN"), numArg("S"), numArg("MS")]),
    fnSpec("dur_parse", "dates", "parseDuration", "Parse duration string (D:HH:mm:ss:SSS)", "parseDuration( %1 )", "parseDuration", DUR, [strArg("S")]),
    fnSpec("dur_add", "dates", "durAdd", "Add two durations", "durAdd( %1 , %2 )", "durAdd", DUR, [durArg("A"), durArg("B")]),
    fnSpec("dur_sub", "dates", "durSub", "Subtract two durations", "durSub( %1 , %2 )", "durSub", DUR, [durArg("A"), durArg("B")]),
    fnSpec("dur_scale", "dates", "durScale", "Scale duration by a number", "durScale( %1 , %2 )", "durScale", DUR, [durArg("DUR"), numArg("K")]),
    fnSpec("dur_div", "dates", "durDiv", "Ratio of two durations", "durDiv( %1 , %2 )", "durDiv", NUM, [durArg("A"), durArg("B")]),
    fnSpec("dur_neg", "dates", "durNeg", "Negate a duration", "durNeg( %1 )", "durNeg", DUR, [durArg("DUR")]),
    fnSpec("dur_abs", "dates", "durAbs", "Absolute value of a duration", "durAbs( %1 )", "durAbs", DUR, [durArg("DUR")]),
    fnSpec("format_dur", "dates", "formatDur", "Format duration (D:HH:mm:ss:SSS)", "formatDuration( %1 )", "formatDuration", STR, [durArg("DUR")]),
    fnSpec("format_dur_fmt", "dates", "formatDur/f", "Format duration with token pattern", "formatDuration( %1 , fmt %2 )", "formatDuration", STR, [durArg("DUR"), strArg("FMT")]),
    fnSpec("date_year", "dates", "year", "UTC year", "year( %1 )", "year", NUM, [dateArg("D")]),
    fnSpec("date_month", "dates", "month", "UTC month (1–12)", "month( %1 )", "month", NUM, [dateArg("D")]),
    fnSpec("date_day", "dates", "day", "UTC day of month (1–31)", "day( %1 )", "day", NUM, [dateArg("D")]),
    fnSpec("date_weekday", "dates", "weekday", "UTC weekday (0=Sun..6=Sat)", "weekday( %1 )", "weekday", NUM, [dateArg("D")]),
    fnSpec("date_hour", "dates", "hour", "UTC hour (0–23)", "hour( %1 )", "hour", NUM, [dateArg("D")]),
    fnSpec("date_minute", "dates", "minute", "UTC minute (0–59)", "minute( %1 )", "minute", NUM, [dateArg("D")]),
    fnSpec("date_second", "dates", "second", "UTC second (0–59)", "second( %1 )", "second", NUM, [dateArg("D")]),
    fnSpec("date_ms", "dates", "millisOf", "UTC millisecond (0–999)", "millisecond( %1 )", "millisecond", NUM, [dateArg("D")]),
    fnSpec("date_epoch", "dates", "toEpoch", "Milliseconds since Unix epoch", "toEpoch( %1 )", "toEpoch", NUM, [dateArg("D")]),
    fnSpec("dur_to_days", "dates", "toDays", "Duration in days", "toDays( %1 )", "toDays", NUM, [durArg("DUR")]),
    fnSpec("dur_to_hours", "dates", "toHours", "Duration in hours", "toHours( %1 )", "toHours", NUM, [durArg("DUR")]),
    fnSpec("dur_to_minutes", "dates", "toMinutes", "Duration in minutes", "toMinutes( %1 )", "toMinutes", NUM, [durArg("DUR")]),
    fnSpec("dur_to_seconds", "dates", "toSeconds", "Duration in seconds", "toSeconds( %1 )", "toSeconds", NUM, [durArg("DUR")]),
    fnSpec("dur_to_millis", "dates", "toMillis", "Duration in milliseconds", "toMillis( %1 )", "toMillis", NUM, [durArg("DUR")]),
  ];

  // Unqualified constants matching jsformula.js.
  const CONSTANTS = {
    PI: { label: "π", js: "PI", order: O.ATOMIC },
    PI2: { label: "π/2", js: "PI / 2", order: O.DIVISION },
    PI3: { label: "π/3", js: "PI / 3", order: O.DIVISION },
    TWO_PI3: { label: "2π/3", js: "2 * PI / 3", order: O.DIVISION },
    PI4: { label: "π/4", js: "PI / 4", order: O.DIVISION },
    PI5: { label: "π/5", js: "PI / 5", order: O.DIVISION },
    TWO_PI5: { label: "2π/5", js: "2 * PI / 5", order: O.DIVISION },
    PI6: { label: "π/6", js: "PI / 6", order: O.DIVISION },
    PI7: { label: "π/7", js: "PI / 7", order: O.DIVISION },
    TWO_PI7: { label: "2π/7", js: "2 * PI / 7", order: O.DIVISION },
    THREE_PI7: { label: "3π/7", js: "3 * PI / 7", order: O.DIVISION },
    PI8: { label: "π/8", js: "PI / 8", order: O.DIVISION },
    THREE_PI8: { label: "3π/8", js: "3 * PI / 8", order: O.DIVISION },
    E: { label: "e", js: "E", order: O.ATOMIC },
    TAU: { label: "τ", js: "2 * PI", order: O.MULTIPLICATION },
    SQRT2: { label: "√2", js: "SQRT2", order: O.ATOMIC },
    SQRT3: { label: "√3", js: "sqrt(3)", order: O.FUNCTION_CALL },
    SQRT5: { label: "√5", js: "sqrt(5)", order: O.FUNCTION_CALL },
    INF: { label: "∞", js: "Infinity", order: O.ATOMIC },
  };

  const ROUND_SHAPE = 2; // zelos constants: SHAPES.ROUND

  function defineBlocks() {
    Blockly.Extensions.register("f_round", function () {
      this.setOutputShape(ROUND_SHAPE);
    });

    const json = SPECS.map((s) => ({
      type: `f_${s.id}`,
      message0: s.msg,
      args0: s.args.map((a) => {
        const input = { type: "input_value", name: a.name };
        if (a.check) input.check = a.check;
        return input;
      }),
      inputsInline: true,
      output: s.out,
      colour: COLOR[s.group],
      tooltip: s.title,
    }));

    json.push(
      {
        type: "f_num", message0: "%1", inputsInline: true, output: NUM, colour: COLOR.num,
        args0: [{ type: "field_number", name: "NUM", value: 0 }],
        tooltip: "Number",
      },
      {
        type: "f_const", message0: "%1", inputsInline: true, output: NUM, colour: COLOR.num,
        args0: [{
          type: "field_dropdown", name: "C",
          options: Object.entries(CONSTANTS).map(([key, c]) => [c.label, key]),
        }],
        tooltip: "Constant",
      },
      {
        type: "f_bool", message0: "%1", inputsInline: true, output: BOOL, colour: COLOR.logic,
        args0: [{
          type: "field_dropdown", name: "V",
          options: [["true", "true"], ["false", "false"]],
        }],
        tooltip: "Truth value",
      },
      {
        type: "f_str", message0: '"%1"', inputsInline: true, output: STR, colour: COLOR.str,
        args0: [{ type: "field_input", name: "TEXT", text: "" }],
        tooltip: "String constant",
      },
      {
        type: "f_lambda", message0: "λ( %1 ) → %2", inputsInline: true, output: FN, colour: COLOR.lambda,
        args0: [
          { type: "field_input", name: "PARAMS", text: "x" },
          { type: "input_value", name: "BODY" },
        ],
        tooltip: "Anonymous function: λ(x) → body (separate multiple parameters with commas)",
      },
      {
        type: "f_mu", message0: "μ( %1 )", inputsInline: true, output: FN, colour: COLOR.lambda,
        args0: [{ type: "input_value", name: "FN", check: FN }],
        tooltip: "Recursive fixed-point combinator: μ(λ(f, x) → ...)",
      },
      {
        type: "f_param", message0: "%1", inputsInline: true, output: null, colour: COLOR.lambda,
        args0: [{ type: "field_input", name: "NAME", text: "x" }],
        tooltip: "Lambda parameter reference",
      }
    );
    for (const definition of json) definition.extensions = ["f_round"];
    Blockly.defineBlocksWithJsonArray(json);

    // Function application block with configurable arity (1, 2, 3, ...).
    Blockly.Blocks.f_apply = {
      init() {
        this.arity_ = 1;
        this.setOutput(true);
        this.setOutputShape(ROUND_SHAPE);
        this.setInputsInline(true);
        this.setColour(COLOR.lambda);
        this.setTooltip("Call a function with arguments");
        this.rebuildShape_();
      },
      saveExtraState() {
        return { arity: this.arity_ };
      },
      loadExtraState(state) {
        this.arity_ = Math.max(1, Number(state && state.arity) || 1);
        this.rebuildShape_();
      },
      rebuildShape_() {
        const connections = {};
        for (const input of this.inputList) {
          if (input.connection && input.connection.targetConnection) {
            connections[input.name] = input.connection.targetConnection;
          }
        }
        while (this.inputList.length) this.removeInput(this.inputList[0].name, true);
        const fnInput = this.appendValueInput("FN").setCheck(FN);
        if (connections.FN) fnInput.connection.connect(connections.FN);
        for (let i = 0; i < this.arity_; i += 1) {
          const inp = this.appendValueInput(`A${i}`).appendField(i === 0 ? "(" : ",");
          if (connections[`A${i}`]) inp.connection.connect(connections[`A${i}`]);
        }
        this.appendDummyInput("CLOSE").appendField(")");
      },
    };

    Blockly.Blocks.f_var = {
      init() {
        this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable("x"), "NAME");
        this.setOutput(true);
        this.setOutputShape(ROUND_SHAPE);
        this.setInputsInline(true);
        this.setColour(COLOR.vars);
        this.setTooltip("Variable");
      },
    };

    Blockly.Blocks.f_root = {
      init() {
        this.appendValueInput("EXPR");
        this.setInputsInline(true);
        this.setColour(COLOR.root);
        this.setDeletable(false);
        this.setMovable(false);
        this.setTooltip("The main formula");
      },
    };
  }

  const SPEC_BY_TYPE = Object.fromEntries(SPECS.map((s) => [`f_${s.id}`, s]));

  function describe(state, variableName) {
    if (!state) return "□";
    const fields = state.fields || {};
    const inputs = state.inputs || {};
    switch (state.type) {
      case "f_num": return String(fields.NUM ?? 0);
      case "f_const": return (CONSTANTS[fields.C] || { label: "?" }).label;
      case "f_bool": return String(fields.V ?? "true");
      case "f_str": return JSON.stringify(String(fields.TEXT ?? ""));
      case "f_param": return String(fields.NAME ?? "x");
      case "f_var": return variableName(state);
      case "f_lambda": return `λ(${fields.PARAMS || "x"}) → ${describe(inputs.BODY && inputs.BODY.block, variableName)}`;
      case "f_mu": return `μ(${describe(inputs.FN && inputs.FN.block, variableName)})`;
      case "f_apply": {
        const arity = (state.extraState && state.extraState.arity) || 1;
        const fn = describe(inputs.FN && inputs.FN.block, variableName);
        const args = Array.from({ length: arity }, (_, i) => describe(inputs[`A${i}`] && inputs[`A${i}`].block, variableName));
        return `${fn}(${args.join(", ")})`;
      }
      default: break;
    }
    const spec = SPEC_BY_TYPE[state.type];
    if (!spec) return "?";
    return spec.msg.replace(/%(\d)/g, (_, n) => {
      const input = inputs[spec.args[Number(n) - 1].name];
      return describe(input && input.block, variableName);
    });
  }

  function defineGenerators() {
    for (const s of SPECS) {
      gen.forBlock[`f_${s.id}`] = (block, g) => {
        const codes = s.args.map((a) => g.valueToCode(block, a.name, a.order));
        return s.build(codes);
      };
    }
    gen.forBlock.f_num = (block) => {
      const v = Number(block.getFieldValue("NUM"));
      return [String(v), v < 0 ? O.UNARY_NEGATION : O.ATOMIC];
    };
    gen.forBlock.f_const = (block) => {
      const c = CONSTANTS[block.getFieldValue("C")];
      return [c.js, c.order];
    };
    gen.forBlock.f_bool = (block) => [block.getFieldValue("V"), O.ATOMIC];
    gen.forBlock.f_str = (block) => [JSON.stringify(String(block.getFieldValue("TEXT") ?? "")), O.ATOMIC];
    gen.forBlock.f_param = (block) => [String(block.getFieldValue("NAME") || "").trim(), O.ATOMIC];
    gen.forBlock.f_var = (block) => [block.getFieldValue("NAME"), O.ATOMIC];
    gen.forBlock.f_lambda = (block, g) => {
      const params = String(block.getFieldValue("PARAMS") || "")
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const body = g.valueToCode(block, "BODY", O.NONE);
      return [`lambda(${[...params, body].join(", ")})`, O.FUNCTION_CALL];
    };
    gen.forBlock.f_mu = (block, g) => {
      const fn = g.valueToCode(block, "FN", O.NONE);
      return [`mu(${fn})`, O.FUNCTION_CALL];
    };
    gen.forBlock.f_apply = (block, g) => {
      const fn = g.valueToCode(block, "FN", O.MEMBER);
      const args = [];
      for (let i = 0; i < (block.arity_ || 1); i += 1) {
        args.push(g.valueToCode(block, `A${i}`, O.NONE));
      }
      return [`${fn}(${args.join(", ")})`, O.FUNCTION_CALL];
    };
  }

  function paletteFor(group) {
    return SPECS.filter((s) => s.group === group).map((s) => ({
      label: s.label, title: s.title, type: `f_${s.id}`,
    }));
  }

  const PALETTE = [
    {
      id: "num", label: "Num",
      items: [
        { label: "123", title: "Number", type: "f_num" },
        ...[
          "PI", "PI2", "PI3", "TWO_PI3", "PI4", "PI5", "TWO_PI5", "PI6",
          "PI7", "TWO_PI7", "THREE_PI7", "PI8", "THREE_PI8",
          "E", "TAU", "SQRT2", "SQRT3", "SQRT5", "INF",
        ].map((key) => ({
          label: CONSTANTS[key].label, title: `Constant ${CONSTANTS[key].label}`, type: "f_const", fields: { C: key },
        })),
      ],
    },
    { id: "ops", label: "Ops", items: paletteFor("ops") },
    { id: "funcs", label: "Funcs", items: paletteFor("funcs") },
    { id: "trig", label: "Trig", items: paletteFor("trig") },
    {
      id: "logic", label: "Logic",
      items: [
        ...paletteFor("logic"),
        { label: "true", title: "True", type: "f_bool", fields: { V: "true" } },
        { label: "false", title: "False", type: "f_bool", fields: { V: "false" } },
      ],
    },
    {
      id: "str", label: "Strings",
      items: [
        { label: '""', title: "String constant", type: "f_str", fields: { TEXT: "" } },
        ...paletteFor("str"),
      ],
    },
    { id: "dates", label: "Dates", items: paletteFor("dates") },
    {
      id: "lambda", label: "λ/μ",
      items: [
        { label: "λ x →", title: "Anonymous function (1 parameter)", type: "f_lambda", fields: { PARAMS: "x" } },
        { label: "λ f, x →", title: "Anonymous function (2 parameters, e.g. for μ)", type: "f_lambda", fields: { PARAMS: "f, x" } },
        { label: "μ", title: "Recursive fixed-point combinator", type: "f_mu" },
        { label: "param", title: "Bound lambda parameter reference", type: "f_param", fields: { NAME: "x" } },
        { label: "f(x)", title: "Call function with 1 argument", type: "f_apply", extraState: { arity: 1 } },
        { label: "f(x, y)", title: "Call function with 2 arguments", type: "f_apply", extraState: { arity: 2 } },
        { label: "f(x, y, z)", title: "Call function with 3 arguments", type: "f_apply", extraState: { arity: 3 } },
      ],
    },
  ];

  defineBlocks();
  defineGenerators();

  return { PALETTE, COLOR, describe };
})();
