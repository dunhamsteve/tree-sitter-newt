#include "tree_sitter/parser.h"
#include "tree_sitter/alloc.h"
#include <stdio.h>
#include <string.h>

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
  while (PEEK == ' ' || PEEK == '\n' || PEEK == '\t') {
    ws = true;
    lexer->advance(lexer,true);
  }

  // Might have to deal with comments in here.
  if (PEEK == '-' || PEEK == '{') {
    if (syms[WHITESPACE] && ws) {
        lexer->result_symbol = WHITESPACE;
        return true;
    }
    // comments don't count for START/SEMI/END, let tree-sitter process the comment and get back to us
    return false;
  }

  int32_t cur = peek(state);
  uint32_t col = lexer->get_column(lexer);
  // START must indent more
  // We have `ws` so we make forward progress
  if (ws && syms[VIRT_START] && cur < col) {
    fprintf(stderr, "start [%d %d %d %d] %d %d\n", syms[0], syms[1], syms[2],
            syms[3], col, cur);
    push(state, col);
    lexer->result_symbol = VIRT_START;
    return true;
  }
  // if we are in a smaller column, we force virt_end
  // even if it's not expected (I think this is important)
  // on the editor side there is a `then` expected vs outdented `then`, but
  // maybe GLR can detect a "stray" END token?
  if (syms[VIRT_END] || true) {

    if (col < cur) {
      fprintf(stderr, "end [%d %d %d %d] %d %d\n", syms[0], syms[1], syms[2],
              syms[3], col, cur);
      pop(state);
      lexer->result_symbol = VIRT_END;
      return true;
    }
  }
  // but we can't do that for semi?
  if (syms[VIRT_SEMI]) {
    // FIXME - not eof, but we are requiring one at end of file at the moment.
    if (!lexer->eof(lexer) && col == cur) {
      lexer->result_symbol = VIRT_SEMI;
      fprintf(stderr, "semi [%d %d %d %d] %d %d\n", syms[0], syms[1], syms[2],
              syms[3], col, cur);
      return true;
    } else {
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
