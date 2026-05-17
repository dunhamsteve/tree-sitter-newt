#include "tree_sitter/parser.h"
#include "tree_sitter/alloc.h"
#include <stdio.h>
#include <string.h>

// TODO where needs to end an indent? how many?

// not available in wasm
// lexer->log(...) is documented upstream, but is not in parser.h
#define fprintf(...) //

typedef struct {
  uint32_t len;
  uint32_t cap;
  uint32_t *data;
} State;

enum TokenType {
  VIRT_START,
  VIRT_SEMI,
  VIRT_END,
  WHITESPACE,
  WHERE,
  EVERYTHING,
};

static void ensure(State *state, uint32_t count) {
  if (state->cap < count) {
    state->cap = count * 2;
    uint32_t *new_data = ts_malloc(sizeof(uint32_t) * state->cap);
    memcpy(new_data, state->data, state->len * sizeof(uint32_t));
    ts_free(state->data);
    state->data = new_data;
  }
}

static void push(State *state, uint32_t col) {
  //    fprintf(stderr, "push %d\n", col);
  ensure(state, state->len + 1);
  state->data[state->len++] = col;
}

static uint32_t pop(State *state) {
  if (state->len) {
    //        fprintf(stderr, "pop %d\n", state->data[state->len-1]);
    state->len--;
    return state->data[state->len];
  }
  fprintf(stderr, "stack underflow");
  return 0;
}

static int32_t peek(State *state) {
  return state->len ? state->data[state->len - 1] : -1; // or -1?
}

#define PEEK lexer->lookahead
#define PEEK_WS (PEEK == ' ' || PEEK == '\n' || PEEK == '\t')

// we can't do this for `where`, but for `in` or `(`, if we're expecting END, they can't be legit.
static bool isAtInOrParen(TSLexer *lexer) {
    if (PEEK == ')') return true;
    if (PEEK != 'i') return false;
    lexer->mark_end(lexer);
    lexer->advance(lexer, false);
    if (PEEK != 'n') return false;
    lexer->advance(lexer, false);
    return PEEK_WS;
}

static bool isAtWhere(TSLexer *lexer) {
    if (PEEK != 'w') return false;
    lexer->mark_end(lexer);
    lexer->advance(lexer,false); if (PEEK != 'h') return false;
    lexer->advance(lexer,false); if (PEEK != 'e') return false;
    lexer->advance(lexer,false); if (PEEK != 'r') return false;
    lexer->advance(lexer,false); if (PEEK != 'e') return false;
    lexer->advance(lexer,false); return PEEK_WS;
}

/**
 * The custom scanner is responsible for the virtual indent, outdent, and semi tokens.
 * Additionally it handles whitespace. This allows us to give the virtual tokens priority over
 * whitespace. So tree-sitter can only advance over whitespace if there is enough of it or if
 * it gets a START, SEMI, or END.
 */
bool tree_sitter_newt_external_scanner_scan(State *state, TSLexer *lexer,
                                                const bool *syms) {
  fprintf(stderr, "scan %d %d %d %d\n", syms[0], syms[1], syms[2], syms[3]);

  // skip whitespace
  bool ws = false;
  while (PEEK_WS) {
    ws = true;
    lexer->advance(lexer,true);
  }

  // Might have to deal with comments in here.
  if (PEEK == '-' || PEEK == '/') {
    if (syms[WHITESPACE] && ws) {
        lexer->result_symbol = WHITESPACE;
        return true;
    }
    // comments don't count for START/SEMI/END, let tree-sitter process the comment and get back to us
    return false;
  }


  int32_t cur = peek(state);
  uint32_t col = lexer->get_column(lexer);
  bool isEOF = lexer->eof(lexer);

  // has to happen after we get the column and after we get isEOF
  bool atWhere = isAtWhere(lexer);

  // START must indent more
  // We have `ws` so we make forward progress
  if (ws && syms[VIRT_START] && cur < col && !syms[EVERYTHING]) {
    fprintf(stderr, "start [%d %d %d %d] %d %d\n", syms[0], syms[1], syms[2],
            syms[3], col, cur);
    push(state, col);
    lexer->result_symbol = VIRT_START;
    return true;
  }
  // if we are in a smaller column, we force virt_end
  // even if it's not expected, no WS check, we might have more than one of these,
  // the stack keeps us from emitting too many
  //
  // Also, "in" gives us an end, if we're in a position to accept one.
  // We may need to pop a few levels and when we are able to accept an "in"
  // we won't be accepting a VIRT_END
  //
  // "where" gives us an end if we're not expecting a where.
  if (col < cur || (isEOF || isAtInOrParen(lexer) || atWhere && ! syms[WHERE]) && syms[VIRT_END] && state->len > 1) {
    fprintf(stderr, "end [%d %d %d %d] %d %d\n", syms[0], syms[1], syms[2],
            syms[3], col, cur);
    pop(state);
    lexer->result_symbol = VIRT_END;
    return true;
  }

  // If we're not expecting semi, it picks up things like `| ...` at the moment.
  // e.g. `|| ws && col == cur` (without ws, we get two semi at the beginning)
  if (syms[VIRT_SEMI]) {
    if (!lexer->eof(lexer) && col == cur) {
      lexer->result_symbol = VIRT_SEMI;
      fprintf(stderr, "semi [%d %d %d %d] %d %d\n", syms[0], syms[1], syms[2],
              syms[3], col, cur);
      return true;
    } else if (syms[VIRT_SEMI]) {
      fprintf(stderr, "not semi [%d %d %d %d] %d %d\n", syms[0], syms[1],
              syms[2], syms[3], col, cur);
    }
  }

  if (syms[WHITESPACE] && ws) {
    fprintf(stderr, "whitespace %d\n", cur);
    lexer->result_symbol = WHITESPACE;
    return true;
  }

  return false;
}

void *tree_sitter_newt_external_scanner_create() {
  State *state = calloc(sizeof(State), 1);
  state->cap = 20;
  state->data = ts_malloc(sizeof(uint32_t) * state->cap);
  // put the initial level at 0 and use semi at top level
  push(state, 0);
  return state;
}

void tree_sitter_newt_external_scanner_destroy(State *state) {
  ts_free(state->data);
  ts_free(state);
}

unsigned tree_sitter_newt_external_scanner_serialize(State *state,
                                                         char *buffer) {
  unsigned size = sizeof(state->data[0]) * state->len;
  if (size > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) {
    return 0;
  }
  memcpy(buffer, state->data, size);
  return size;
}

void tree_sitter_newt_external_scanner_deserialize(State *state,
                                                       char *buffer,
                                                       unsigned length) {
  unsigned len = length / sizeof(state->data[0]);
  if (len > 0) {
    ensure(state, len);
    state->len = len;
    memcpy(state->data, buffer, length);
  }
}
