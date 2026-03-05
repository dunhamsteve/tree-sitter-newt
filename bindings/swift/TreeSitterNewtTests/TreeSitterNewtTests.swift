import XCTest
import SwiftTreeSitter
import TreeSitterNewt

final class TreeSitterNewtTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_newt())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Newt grammar")
    }
}
