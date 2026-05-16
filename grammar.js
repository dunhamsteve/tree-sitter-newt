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
          seq(
            '/-',
            /[^-]*-+([^/-][^-]*-+)*/,
            '/',
          ),
        ),
      ),
    _arr: _ => choice("->", "→"),
    number: $ => /\d+/,
    lamExpr: $ => seq(
      choice("\\", "λ"),
      repeat1($.identifier),
      "=>",
      $._typeExpr
    ),
    // hole, parenTypeExpression, record update
    proj: $ => /[.][A-z0-9]/,
    _atom: $ => choice(seq($.identifier, optional(seq("@", "(", $._typeExpr, ")"))), $.proj, $.string, $.character, $.number, $.recUpdate, seq("(", $._typeExpr, ")")),
    _parg: $ => choice(seq("{{", $._typeExpr, "}}"), seq("{", $._typeExpr, "}"), $._atom),
    recUpdate: $ => seq("[", sep(";", seq($.identifier, choice(":=", "$="), $.term)), "]"),
    _appExpr: $ => seq($._atom, repeat($._parg)),
    qname: ($) => sep1(".", $.identifier),
    // TODO handle string interpolation, we'd need heavy lifting from the scanner
    // This should be close enough for interps with no strings inside
    string: _ => /"([^"]|\\.)*"/,
    character: _ => /'(\\)?.'/,
    // This is unfortunate, we have a conflict with `let` and the $.start pushes it over the other way if we don't have one here.
    // It will break `let x = case y of ...` when the ... is indented less than the x.  Unless I relax end..
    doLet: $ => seq("let", seq($.start, repeat(seq($.semi, $.letAssign)), $.end)),
    doCaseLet: $ => seq("let", $.start, $.semi, "(", $.term, ")", "=", $._typeExpr,
      choice(seq($.end, repeat($.orAlt)), seq(repeat($.orAlt), $.end))),
    caseAlt: $ => seq($.term, "=>", $.term),
    orAlt: $ => seq("|", $.caseAlt),
    // layout was causing trouble here. I kinda wanted to ditch it, but there
    // could be a shift/reduce thing in the real parser
    _doArrow: $ => seq("<-", $._typeExpr, repeat($.orAlt)),
    doArrow: $ => seq($.term, optional($._doArrow)),
    _doExpr: $ => choice(
      $.doCaseLet,
      $.doLet,
      $.doArrow,
      // HACK - if the where is the same level as `do`, we're not ending the do
      // We can't really say "where ends everything", so we pretend it's a do clause
      $.whereClause,
    ),
    doBlock: $ => seq("do", layout($, $._doExpr)),
    ifThen: ($) => seq("if", $.term, "then", $.term, "else", $.term),
    caseExpr: $ => seq(
      "case",
      $._typeExpr,
      "of",
      // HACK where clause at level of case alt
      layout($, choice($.caseAlt, $.whereClause)),
    ),
    caseLet: $ => seq(
      // what do we do with "in" - it makes an end without a start...
      "let", "(", $._typeExpr, ")", "=", $._typeExpr, repeat($.orAlt), "in"
    ),
    letAssign: $ => seq($.identifier, "=", $._typeExpr),
    letStmt: $ => seq(
      "let",
      layout($, $.letAssign),
      "in",
      $._typeExpr),
    _term2: ($) =>
      choice(
        $.caseExpr,
        $.caseLet,
        $.letStmt,
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
        seq("(", alias(optional("0"), "quantity"), $.identifier, ":", $._typeExpr, ")"),
        seq("{{", $._typeExpr, "}}"),
        seq("{", alias(optional("0"), "quantity"), repeat1($.identifier), ":", $._typeExpr, "}"),
      ),

    forall: ($) => seq(choice("∀", "forall"), repeat1($.identifier), ".", $._typeExpr),
    binders: ($) => seq(choice(repeat1($.binder)), $._arr, $._typeExpr),
    _typeExpr: ($) => prec.right(choice($.forall, $.binders, seq($.term, optional(seq($._arr, $._typeExpr))))),

    // pitype: ($) =>
    //   seq(
    //     optional($.forall),
    //     repeat(seq(repeat1(choice($.identifier, $.binder)), $._arr)),
    //     $.identifier,
    //   ),
    aliasDecl: ($) => seq("alias", $.identifier, repeat($._telescope), "=", $._typeExpr),
    sigDecl: ($) => seq($.identifier, ":", $._typeExpr),
    whereClause: $ => seq("where", layout($, choice($.sigDecl, $.defDecl))),
    defDecl: ($) => seq(alias($._appExpr, $.lhs), "=", $._typeExpr, optional($.whereClause)),
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
        $._typeExpr,
        // the layout here can be empty (so no start tag)
        // optional doesn't seem to help, so we have an error at void
        optional(seq("where", optional(layout($, $.sigDecl)))),
      ),
    jsLitString: $ => seq("`", alias(/[^`]+/, $.jsStringFragment), "`"),
    deriveDecl: $ => seq("derive", repeat1($.identifier)),
    pfuncDecl: ($) => seq(
      "pfunc",
      alias($.identifier, "name"),
      optional(seq("uses", "(", repeat1($.identifier), ")")),
      ":",
      $._typeExpr,
      ":=",
      $.jsLitString
    ),
    ptypeDecl: $ => seq(
      "ptype",
      alias($.identifier, $.name),
      optional(seq(":", $._typeExpr))
    ),
    importDef: ($) => seq("import", $.qname),
    mixfixDecl: $ => seq(
      choice("infixr", "infixl"),
      $.number,
      repeat1(alias($.identifier, $.name))
    ),
    _telescope: $ => choice($.identifier, $.binder),
    recordDecl: $ =>
      seq(
        "record",
        seq(alias($.identifier, $.recordName), repeat($._telescope)),
        "where",
        layout($, choice(seq("constructor", $.identifier), $.sigDecl)),
      ),
    classDecl: $ =>
      seq(
        "class",
        seq(alias($.identifier, $.className), repeat($._telescope)),
        "where",
        layout($, $.sigDecl)
      ),
    instanceDecl: $ => seq(
      "instance",
      $._typeExpr,
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
        $.aliasDecl,
        $.instanceDecl,
        $.recordDecl,
        // $.exportDecl,
        $.deriveDecl,
        $.sigDecl,
        $.defDecl,
      ),
    colon: _ => ":",
    module: ($) =>
      seq(
        optional($.semi),
        "module",
        $.qname,
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
