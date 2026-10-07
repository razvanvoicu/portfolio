"use strict";

// Block definitions, JavaScript generators and palette contents for the
// formula builder. Every function block is described once in SPECS; the same
// description yields the Blockly block, its generator and its palette button.
const FormulaBlocks = (() => {
  const gen = javascript.javascriptGenerator;
  const O = javascript.Order;

  const NUM = "Number";
  const BOOL = "Boolean";

  const COLOR = {
    num: "#3a78c2",
    ops: "#2b9a88",
    funcs: "#7b5bd0",
    trig: "#bf5479",
    logic: "#c98a2b",
    vars: "#4f8fd9",
    root: "#4a5568",
  };

  const arg = (name, check, order = O.NONE) => ({ name, check, order });
  const numArg = (name, order) => arg(name, NUM, order);

  // Operand orders are chosen so the printed JavaScript never loses a needed
  // parenthesis. Blockly compares whole precedence classes (all of * / % ** are
  // one class), so some redundant parentheses remain, such as (a / b) / c.
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

    // --- functions ---------------------------------------------------------
    call("sqrt", "funcs", "√", "Square root", "√( %1 )", "Math.sqrt"),
    call("cbrt", "funcs", "∛", "Cube root", "∛( %1 )", "Math.cbrt"),
    {
      id: "nroot", group: "funcs", label: "ⁿ√", title: "n-th root", msg: "( %1 ) ^ (1 / %2)", out: NUM,
      args: [numArg("X", O.BITWISE_NOT), numArg("N", O.EXPONENTIATION)],
      build: ([x, n]) => [`${x} ** (1 / ${n})`, O.EXPONENTIATION],
    },
    call("abs", "funcs", "|x|", "Absolute value", "| %1 |", "Math.abs"),
    call("floor", "funcs", "⌊x⌋", "Round down", "⌊ %1 ⌋", "Math.floor"),
    call("ceil", "funcs", "⌈x⌉", "Round up", "⌈ %1 ⌉", "Math.ceil"),
    call("round", "funcs", "round", "Round to nearest integer", "round( %1 )", "Math.round"),
    call("trunc", "funcs", "trunc", "Drop the fractional part", "trunc( %1 )", "Math.trunc"),
    call("sign", "funcs", "sign", "Sign: −1, 0 or 1", "sign( %1 )", "Math.sign"),
    call("exp", "funcs", "eˣ", "e to the power x", "exp( %1 )", "Math.exp"),
    call("ln", "funcs", "ln", "Natural logarithm", "ln( %1 )", "Math.log"),
    call("log10", "funcs", "log₁₀", "Base-10 logarithm", "log₁₀( %1 )", "Math.log10"),
    call("log2", "funcs", "log₂", "Base-2 logarithm", "log₂( %1 )", "Math.log2"),
    {
      id: "logb", group: "funcs", label: "log b", title: "Logarithm to any base", msg: "log( %1 , base %2 )", out: NUM,
      args: [numArg("X"), numArg("B")],
      build: ([x, b]) => [`Math.log(${x}) / Math.log(${b})`, O.DIVISION],
    },
    call("min", "funcs", "min", "Smaller of two values", "min( %1 , %2 )", "Math.min", 2),
    call("max", "funcs", "max", "Larger of two values", "max( %1 , %2 )", "Math.max", 2),
    call("hypot", "funcs", "hypot", "√(x² + y²)", "hypot( %1 , %2 )", "Math.hypot", 2),

    // --- trigonometry ------------------------------------------------------
    call("sin", "trig", "sin", "Sine (radians)", "sin( %1 )", "Math.sin"),
    call("cos", "trig", "cos", "Cosine (radians)", "cos( %1 )", "Math.cos"),
    call("tan", "trig", "tan", "Tangent (radians)", "tan( %1 )", "Math.tan"),
    ...[["sec", "cos", "Secant"], ["csc", "sin", "Cosecant"], ["cot", "tan", "Cotangent"]].map(
      ([id, base, title]) => ({
        id, group: "trig", label: id, title: `${title} (radians)`, msg: `${id}( %1 )`, out: NUM,
        args: [numArg("X")],
        build: ([x]) => [`1 / Math.${base}(${x})`, O.DIVISION],
      })
    ),
    call("asin", "trig", "asin", "Inverse sine", "asin( %1 )", "Math.asin"),
    call("acos", "trig", "acos", "Inverse cosine", "acos( %1 )", "Math.acos"),
    call("atan", "trig", "atan", "Inverse tangent", "atan( %1 )", "Math.atan"),
    call("atan2", "trig", "atan2", "Angle of the point (x, y)", "atan2( y %1 , x %2 )", "Math.atan2", 2),
    call("sinh", "trig", "sinh", "Hyperbolic sine", "sinh( %1 )", "Math.sinh"),
    call("cosh", "trig", "cosh", "Hyperbolic cosine", "cosh( %1 )", "Math.cosh"),
    call("tanh", "trig", "tanh", "Hyperbolic tangent", "tanh( %1 )", "Math.tanh"),
    call("asinh", "trig", "asinh", "Inverse hyperbolic sine", "asinh( %1 )", "Math.asinh"),
    call("acosh", "trig", "acosh", "Inverse hyperbolic cosine", "acosh( %1 )", "Math.acosh"),
    call("atanh", "trig", "atanh", "Inverse hyperbolic tangent", "atanh( %1 )", "Math.atanh"),
    {
      id: "torad", group: "trig", label: "→rad", title: "Degrees to radians", msg: "rad( %1 ° )", out: NUM,
      args: [numArg("X", O.MODULUS)],
      build: ([x]) => [`${x} * Math.PI / 180`, O.DIVISION],
    },
    {
      id: "todeg", group: "trig", label: "→deg", title: "Radians to degrees", msg: "deg( %1 rad )", out: NUM,
      args: [numArg("X", O.MODULUS)],
      build: ([x]) => [`${x} * 180 / Math.PI`, O.DIVISION],
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
  ];

  const CONSTANTS = {
    PI: { label: "π", js: "Math.PI", order: O.MEMBER },
    E: { label: "e", js: "Math.E", order: O.MEMBER },
    TAU: { label: "τ", js: "2 * Math.PI", order: O.MULTIPLICATION },
    SQRT2: { label: "√2", js: "Math.SQRT2", order: O.MEMBER },
    INF: { label: "∞", js: "Infinity", order: O.ATOMIC },
  };

  // The Zelos renderer draws Boolean blocks as hexagons and Number blocks as
  // ovals. Forcing the round shape makes every formula block an oval, so the
  // rectangular root block is the only block shaped differently.
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
      }
    );
    for (const definition of json) definition.extensions = ["f_round"];
    Blockly.defineBlocksWithJsonArray(json);

    // The variable's name is a serializable label so a saved workspace
    // restores it; the id of the variable it stands for lives in block.data.
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

    // The single, permanent block that holds the main formula. It has no
    // output, so it keeps the renderer's rectangular shape.
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

  // A short readable form of a saved (possibly partial) formula, such as
  // "x + sin( □ )". Empty slots show as □. `variableName` maps a saved
  // variable block to the name it currently has.
  function describe(state, variableName) {
    if (!state) return "□";
    const fields = state.fields || {};
    switch (state.type) {
      case "f_num": return String(fields.NUM ?? 0);
      case "f_const": return (CONSTANTS[fields.C] || { label: "?" }).label;
      case "f_bool": return String(fields.V ?? "true");
      case "f_var": return variableName(state);
      default: break;
    }
    const spec = SPEC_BY_TYPE[state.type];
    if (!spec) return "?";
    const inputs = state.inputs || {};
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
    gen.forBlock.f_var = (block) => [block.getFieldValue("NAME"), O.ATOMIC];
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
        ...["PI", "E", "TAU", "SQRT2", "INF"].map((key) => ({
          label: CONSTANTS[key].label, title: "Constant", type: "f_const", fields: { C: key },
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
  ];

  defineBlocks();
  defineGenerators();

  return { PALETTE, COLOR, describe };
})();
