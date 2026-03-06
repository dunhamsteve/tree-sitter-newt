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
    _arr: ($) => choice("->", "→"),
    number: $ => /\d+/,
    lamExpr: $ => seq(
      choice("\\", "λ"),
      repeat1($.identifier),
      "=>",
      $.typeExpr
    ),
    // hole, parenTypeExpression, record update
    _atom: $ => choice($.identifier, $.string, $.character, $.number, $.recUpdate, seq("(", $.typeExpr, ")")),
    _parg: $ => choice(seq("{{", $.typeExpr, "}}"), seq("{", $.typeExpr, "}"), $._atom),
    recUpdate: $ => seq("[", sep(";", seq($.identifier, choice(":=", "$="), $.term)), "]"),
    _appExpr: $ => (seq($._atom, repeat($._parg))),
    qname: ($) => sep1(".", $.identifier),
    string: $ => /"[^"]*"/,
    character: $ => /'(\\)?.'/,
    doCaseLet: $ => seq("let", "(", $.term, ")", "=", $.typeExpr, repeat($.orAlt)),
    caseAlt: $ => seq($.term, "=>", $.term),
    orAlt: $ => seq("|", $.caseAlt),
    // layout was causing trouble here. I kinda wanted to ditch it, but there
    // could be a shift/reduce thing in the real parser
    _doArrow: $ => seq("<-", $.typeExpr, repeat($.orAlt)),
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
        $._appExpr,
      ),
    // the "$" becomes operator and we get past the bit in main, but
    // it's going to fail on a "$" \ ...
    // why doesn't "$" work here?
    dollar: $ => seq("$", $.term),
    term: ($) => prec.right(seq($._term2, optional($.dollar))),

    // abind/ibind/ebind in Parser.newt
    binder: ($) =>
      choice(
        // repeat($.identifier) has a conflict
        seq("(", alias(optional("0"), "quantity"), $.identifier, ":", $.typeExpr, ")"),
        seq("{{", $.typeExpr, "}}"),
        seq("{", alias(optional("0"), "quantity"), repeat1($.identifier), ":", $.typeExpr, "}"),
      ),

    forall: ($) => seq("∀", repeat1($.identifier), ".", $.typeExpr),
    binders: ($) => seq(choice(repeat1($.binder)), $._arr, $.typeExpr),
    typeExpr: ($) => prec.right(choice($.forall, $.binders, seq($.term, optional(seq($._arr, $.typeExpr))))),

    // pitype: ($) =>
    //   seq(
    //     optional($.forall),
    //     repeat(seq(repeat1(choice($.identifier, $.binder)), $._arr)),
    //     $.identifier,
    //   ),
    sigDecl: ($) => seq($.identifier, ":", $.typeExpr),
    whereClause: $ => seq("where", layout($, choice($.sigDecl, $.defDecl))),
    defDecl: ($) => seq(alias($._appExpr, $.lhs), "=", $.typeExpr, optional($.whereClause)),
    shortDataDecl: $ => seq(
      "data",
      alias($.identifier, "typeName"),
      repeat($.identifier),
      "=",
      sep1("|", seq(alias($.identifier, "conName"), repeat($._atom)))
    ),
    dataDecl: ($) =>
      seq(
        "data",
        alias($.identifier, "typeName"),
        ":",
        $.typeExpr,
        // the layout here can be empty (so no start tag)
        // optional doesn't seem to help, so we have an error at void
        optional(seq("where", optional(layout($, $.sigDecl)))),
      ),
    jsLitString: $ => /`[^`]+`/,
    deriveDecl: $ => seq("derive", repeat1($.identifier)),
    pfuncDecl: ($) => seq(
      "pfunc",
      alias($.identifier, "name"),
      optional(seq("uses", "(", repeat1($.identifier), ")")),
      ":",
      $.typeExpr,
      ":=",
      $.jsLitString
    ),
    ptypeDecl: $ => seq(
      "ptype",
      alias($.identifier, $.name),
      optional(seq(":", $.typeExpr))
    ),
    importDef: ($) => seq("import", $.qname),
    mixfixDecl: $ => seq(
      choice("infixr", "infixl"),
      $.number,
      repeat1(alias($.identifier, $.name))
    ),
    classDecl: $ =>
      seq(
        "class",
        seq(alias($.identifier, $.className), repeat($._atom)),
        "where",
        layout($, $.sigDecl)
      ),
    instanceDecl: $ => seq(
      "instance",
      $.typeExpr,
      "where",
      layout($, choice($.sigDecl, $.defDecl))
    ),
    _decl: ($) =>
      choice(
        $.mixfixDecl,
        $.ptypeDecl,
        $.pfuncDecl,
        $.dataDecl,
        $.shortDataDecl,
        $.classDecl,
        $.instanceDecl,
        // $.recordDecl,
        // $.exportDecl,
        $.deriveDecl,
        $.sigDecl,
        $.defDecl,
      ),
    colon: _ => ":",
    module: ($) =>
      seq(
        "module",
        $.identifier,
        repeat(seq($.semi, $.importDef)),
        repeat(seq($.semi, $._decl)),
      ),
    // oof, sort this out.
    // operator: ($) => /xxxx[∘!#$%&*+,./<=>?@^|-]+/,
    // Don't think we need this at this point.

    // adding "," here does all sorts of harm...
    identifier: ($) => /_,_|,|([^()\\{}\[\],.@;\s ])[^()\\{}\[\],.@;\s ]*/,
  },
});
