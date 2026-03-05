package tree_sitter_newt_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_newt "github.com/dunhamsteve/tree-sitter-newt/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_newt.Language())
	if language == nil {
		t.Errorf("Error loading Newt grammar")
	}
}
