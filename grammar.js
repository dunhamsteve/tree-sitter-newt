/**
 * @file Newt grammar for tree-sitter
 * @author Steve Dunham <dunhamsteve@gmail.com>
 * @license MIT
 *
 * I copied some unpublished code that I used years ago for pi-forall
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const sep = (
  /** @type {RuleOrLiteral} */ sep,
  /** @type {RuleOrLiteral} */ rule,
) => optional(seq(rule, repeat(seq(sep, rule))));
const sep1 = (
  /** @type {RuleOrLiteral} */ sep,
  /** @type {RuleOrLiteral} */ rule,
) => seq(rule, repeat(seq(sep, rule)));
const layout = (
  /** @type {GrammarSymbols<any>} */ $,
  /** @type {RuleOrLiteral} */ rule,
) => seq($.start, repeat(seq($.semi, rule)), $.end)
// choice(
//   seq("{", optional(sep1(";", rule)), "}"),
// );

module.exports = grammar({
  name: "newt",
  word: ($) => $.identifier,
  extras: ($) => [$.comment, $._ws],
  externals: ($) => [$.start, $.semi, $.end, $._ws],
  rules: {
    // TODO: add the actual grammar rules
    source_file: ($) => $.module,
    comment: ($) =>
      token(
        choice(
          seq("--", /.*/),
          // FIXME comments /- -/ are nested, which needs to be done in scanner.c
          seq("/-", /([^-]|-+[^/])-/, "/"),
        ),
      ),


    lamExpr: $ => seq(
      choice("\\", "λ"),
      repeat1($.identifier),
      "=>",
      $.typeExpr
    ),
    // hole, parenTypeExpression, record update
    _atom: $ => choice($.varname, $.strLit, $.operator, seq("(", $.typeExpr, ")")),
    _parg: $ => choice($._atom, seq("{{", $.typeExpr, "}}"), seq("{", $.typeExpr, "}")),
    appExpr: $ => seq($._atom, repeat($._parg)),
    qname: ($) => sep1(".", $.identifier),
    strLit: $ => /"[^"]*"/,
    doCaseLet: $ => seq("let", "(", $.term, ")", "=", $.typeExpr,
      layout($, $._orAlt)),
    caseAlt: $ => seq($.term, "=>", $.term),
    _orAlt: $ => seq("|", $.caseAlt),
    _doArrow: $ => seq("<-", $.typeExpr, optional(layout($, $._orAlt))),
    doArrow: $ => seq($.term, optional($._doArrow)),
    doLet: $ => seq("let", $.identifier, "=", $.term),
    _doExpr: $ => choice(
      $.doCaseLet,
      $.doLet,
      $.doArrow),
    doBlock: $ => seq("do", layout($, $._doExpr)),
    ifThen: ($) => seq("if", $.term, "then", $.term, "else", $.term),
    _term2: ($) =>
      choice(
        // caseExpr
        // caseLet
        // caseLamExpr
        $.lamExpr,
        $.doBlock,
        $.ifThen,
        $.appExpr,
      ),
    term: ($) => prec.right(seq($._term2, repeat(seq("$", $._term2)))),

    // varname is ident|uident|_, but we'll gloss over that
    varname: ($) => $.identifier,


    // abind/ibind/ebind in Parser.newt
    binder: ($) =>
      choice(
        seq("(", $.identifier, ":", $.typeExpr, ")"),
        // seq("(", $.typeExpr, ")"),
        seq("{{", $.typeExpr, "}}"),
        seq("{", $.identifier, ":", $.typeExpr, "}"),
      ),
    _arr: ($) => choice("->", "→"),
    forall: ($) => seq("∀", repeat1($.identifier), ".", $.typeExpr),
    binders: ($) => seq(choice($.varname, repeat1($.binder)), $._arr, $.typeExpr),
    typeExpr: ($) => choice($.forall, $.binders, $.term),

    // pitype: ($) =>
    //   seq(
    //     optional($.forall),
    //     repeat(seq(repeat1(choice($.identifier, $.binder)), $._arr)),
    //     $.identifier,
    //   ),
    sigDecl: ($) => seq($.identifier, ":", $.typeExpr),
    defDecl: ($) => seq($.appExpr, "=", $.typeExpr),
    dataDecl: ($) =>
      seq(
        "data",
        $.identifier,
        ":",
        $.typeExpr,
        optional(seq("where", layout($, $.conDef))),
      ),
    importDef: ($) => seq("import", $.qname),
    conDef: ($) =>
      seq(
        $.identifier, // upper
        ":",
        $.typeExpr
      ),
    _decl: ($) =>
      choice(
        // mixfixDecl,
        // ptypeDecl
        // pfuncDecl
        $.dataDecl,
        // shortDataDecl
        // classDecl
        // instanceDecl
        // recordDecl
        // exportDecl
        // deriveDecl
        $.sigDecl,
        $.defDecl,
      ),
    module: ($) =>
      seq(
        "module",
        $.identifier,
        repeat(seq($.semi, $.importDef)),
        repeat(seq($.semi, $._decl)),
      ),
    // these are _way_ more generous in newt
    operator: ($) => /[!#$%&*+.,/<=>?@\\^|-]+/,
    identifier: ($) => /[A-Za-z_][\w']*|[,]|\+\+/,
  },
});
