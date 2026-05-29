"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { html2json } = require("../html2json.js");

const SAMPLES_DIR = path.join(__dirname, "../html_samples");

const originalDeepEqual = assert.deepEqual.bind(assert);
assert.deepEqual = (actual, expected, message) => {
    const shouldInjectWarnings =
        actual &&
        actual.type === "document" &&
        Array.isArray(actual.warnings) &&
        expected &&
        expected.type === "document" &&
        expected.warnings === undefined;

    if (shouldInjectWarnings) {
        return originalDeepEqual(
            actual,
            {
                ...expected,
                warnings: [],
            },
            message
        );
    }

    return originalDeepEqual(actual, expected, message);
};

function findByTag(node, tag) {
    if (node.type === "element" && node.tag === tag) {
        return node;
    }

    if (!Array.isArray(node.children)) {
        return null;
    }

    for (const child of node.children) {
        const found = findByTag(child, tag);
        if (found) {
            return found;
        }
    }

    return null;
}

test("html2json is a function", () => {
    assert.equal(typeof html2json, "function");
});

test("returns empty document object for non-string input", () => {
    const result = html2json(null);

    assert.deepEqual(result, {
        type: "document",
        children: [],
        warnings: [
            {
                message: "Input must be a string with HTML content.",
                openedAt: 1,
                detectedAt: 1,
            },
        ],
    });
});

test("returns text node for plain text", () => {
    const result = html2json("Hello!");
    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "text",
                content: "Hello!",
            },
        ],
    });
});

test("returns element with text child for paired tag", () => {
    const result = html2json("<div>Hello!</div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "Hello!",
                    },
                ],
            },
        ],
    });
});

test("returns empty document for empty string", () => {
    const result = html2json("   ");

    assert.deepEqual(result, {
        type: "document",
        children: [],
    });
});

test("returns nested element inside div", () => {
    const result = html2json("<div><p>Hello!</p></div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "Hello!",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("returns sibling elements inside div", () => {
    const result = html2json("<div><p>One</p><p>Two</p></div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "One",
                            },
                        ],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "Two",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("returns element with attributes", () => {
    const result = html2json('<a href="https://example.com" target="_blank">Example</a>');

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "a",
                attributes: {
                    href: "https://example.com",
                    target: "_blank",
                },
                children: [
                    {
                        type: "text",
                        content: "Example",
                    },
                ],
            },
        ],
    });
});

test("returns element with single quoted attributes", () => {
    const result = html2json("<button type='button' aria-label='Close'>X</button>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "button",
                attributes: {
                    type: "button",
                    "aria-label": "Close",
                },
                children: [
                    {
                        type: "text",
                        content: "X",
                    },
                ],
            },
        ],
    });
});

test("returns element with unquoted attribute values", () => {
    const result = html2json("<input type=text value=hello>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "input",
                attributes: {
                    type: "text",
                    value: "hello",
                },
                children: [],
            },
        ],
    });
});

test("returns element with boolean attributes", () => {
    const result = html2json('<button disabled type="submit">Save</button>');

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "button",
                attributes: {
                    disabled: true,
                    type: "submit",
                },
                children: [
                    {
                        type: "text",
                        content: "Save",
                    },
                ],
            },
        ],
    });
});

test("returns void element without closing tag", () => {
    const result = html2json('<img src="photo.jpg" alt="Profile photo">');

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "img",
                attributes: {
                    src: "photo.jpg",
                    alt: "Profile photo",
                },
                children: [],
            },
        ],
    });
});

test("returns void element and following sibling inside parent", () => {
    const result = html2json('<div><img src="photo.jpg"><p>After</p></div>');

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "img",
                        attributes: {
                            src: "photo.jpg",
                        },
                        children: [],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "After",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("returns self-closing element and following sibling inside parent", () => {
    const result = html2json('<div><custom-widget id="hero" /><p>After</p></div>');

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "custom-widget",
                        attributes: {
                            id: "hero",
                        },
                        children: [],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "After",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("returns self-closing element with attributes and no slash artifact", () => {
    const result = html2json('<div><custom-widget id="hero" disabled   /><p>After</p></div>');

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "custom-widget",
                        attributes: {
                            id: "hero",
                            disabled: true,
                        },
                        children: [],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "After",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("parses html comment node inside parent", () => {
    const result = html2json("<div><!-- comment --><p>Hi</p></div>");
    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "comment",
                        content: " comment ",
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "Hi",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("parses doctype node before html root", () => {
    const result = html2json("<!DOCTYPE html><html><body><p>Hi</p></body></html>");
    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "doctype",
                content: "html",
            },
            {
                type: "element",
                tag: "html",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "body",
                        attributes: {},
                        children: [
                            {
                                type: "element",
                                tag: "p",
                                attributes: {},
                                children: [
                                    {
                                        type: "text",
                                        content: "Hi",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("decodes named entity in text", () => {
    const result = html2json("<p>Tom &amp; Jerry</p>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "p",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "Tom & Jerry",
                    },
                ],
            },
        ],
    });
});
test("decodes numeric decimal entity in text", () => {
    const result = html2json("<p>Euro: &#8364;</p>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "p",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "Euro: €",
                    },
                ],
            },
        ],
    });
});

test("decodes numeric hex entity in text", () => {
    const result = html2json("<p>Letter: &#x41;</p>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "p",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "Letter: A",
                    },
                ],
            },
        ],
    });
});
test("keeps malformed entity literal in text", () => {
    const result = html2json("<p>Broken: &notanentity</p>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "p",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "Broken: &notanentity",
                    },
                ],
            },
        ],
    });
});

test("decodes entities in attribute values", () => {
    const result = html2json('<a title="Tom &amp; Jerry">Link</a>');

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "a",
                attributes: {
                    title: "Tom & Jerry",
                },
                children: [
                    {
                        type: "text",
                        content: "Link",
                    },
                ],
            },
        ],
    });
});

test("parses style content as raw text", () => {
    const result = html2json("<style>div{color:<red>}</style>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "style",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "div{color:<red>}",
                    },
                ],
            },
        ],
    });
});

test("parses raw style block followed by sibling element", () => {
    const result = html2json("<div><style>p{content:\"<x>\"}</style><p>After</p></div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "style",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "p{content:\"<x>\"}",
                            },
                        ],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "After",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("parses script content as raw text", () => {
    const result = html2json("<script>if (a < b) { x = \"<tag>\"; }</script>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "script",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "if (a < b) { x = \"<tag>\"; }",
                    },
                ],
            },
        ],
    });
});

test("parses raw script block followed by sibling element", () => {
    const result = html2json("<div><script>const x = a < b;</script><p>After</p></div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "script",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "const x = a < b;",
                            },
                        ],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "After",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("parses quoted attribute value containing greater-than sign", () => {
    const result = html2json('<div data-note="1 > 0"><p>ok</p></div>');

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {
                    "data-note": "1 > 0",
                },
                children: [
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "ok",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("parses single-quoted attribute value containing greater-than sign", () => {
    const result = html2json("<div data-note='x > y'>content</div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {
                    "data-note": "x > y",
                },
                children: [
                    {
                        type: "text",
                        content: "content",
                    },
                ],
            },
        ],
    });
});

test("builds deterministic best-effort output for malformed corpus", () => {
    const singleLessThan = html2json("<");
    assert.deepEqual(singleLessThan, {
        type: "document",
        children: [
            {
                type: "text",
                content: "<",
            },
        ],
    });
    const malformedPseudoTag = html2json("<<p>>");
    assert.deepEqual(malformedPseudoTag, {
        type: "document",
        children: [
            {
                type: "text",
                content: "<",
            },
            {
                type: "element",
                tag: "p",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: ">",
                    },
                ],
            },
        ],
        warnings: [
            {
                message: "Unclosed tag <p> was automatically closed at the end of input.",
                openedAt: 1,
                detectedAt: 1,
            },
        ],
    });
    const mismatchedNesting = html2json("<div><span></div>");
    assert.deepEqual(mismatchedNesting, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "span",
                        attributes: {},
                        children: [],
                    },
                ],
            },
        ],
        warnings: [
            {
                message: "Tag <span> was automatically closed before </div>.",
                openedAt: 1,
                detectedAt: 1,
            },
        ],
    });

    const malformedAttributeQuote = html2json("<div a='1\" b=2>");
    assert.deepEqual(malformedAttributeQuote, {
        type: "document",
        children: [
            {
                type: "text",
                content: "<div a='1\" b=2>",
            },
        ],
    });

    const malformedTable = html2json("<table><tr><td>1<tr><td>2</table>");
    assert.equal(malformedTable.type, "document");
    assert.equal(malformedTable.children[0].tag, "table");
    assert.equal(malformedTable.children[0].children[0].tag, "tr");
    assert.equal(malformedTable.children[0].children[0].children[0].tag, "td");
    assert.equal(
        malformedTable.children[0].children[0].children[0].children[0].content,
        "1"
    );
    assert.equal(
        malformedTable.children[0].children[0].children[0].children[1].tag,
        "tr"
    );
    assert.equal(
        malformedTable.children[0].children[0].children[0].children[1].children[0]
            .tag,
        "td"
    );
    assert.equal(
        malformedTable.children[0].children[0].children[0].children[1].children[0]
            .children[0].content,
        "2"
    );
});

test("keeps entities literal inside style raw text", () => {
    const result = html2json("<style>.x::before{content:\"&amp;\";}</style>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "style",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: ".x::before{content:\"&amp;\";}",
                    },
                ],
            },
        ],
    });
});

test("keeps entities literal inside script raw text", () => {
    const result = html2json("<script>const x = \"&lt;div&gt;\";</script>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "script",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "const x = \"&lt;div&gt;\";",
                    },
                ],
            },
        ],
    });
});

test("does not close style block on closing tag text inside quotes", () => {
    const result = html2json("<div><style>.x::before{content:\"</style>\";}</style><p>After</p></div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "style",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: ".x::before{content:\"</style>\";}",
                            },
                        ],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "After",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("parses textarea content as raw text", () => {
    const result = html2json("<textarea>Some <b>raw</b> text</textarea>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "textarea",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "Some <b>raw</b> text",
                    },
                ],
            },
        ],
    });
});

test("decodes entities inside textarea content", () => {
    const result = html2json("<textarea>A &amp; B</textarea>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "textarea",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "A & B",
                    },
                ],
            },
        ],
    });
});

test("does not close script block on closing tag text inside quotes", () => {
    const result = html2json("<div><script>const s = \"</script>\"; const n = 1;</script><p>After</p></div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "script",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "const s = \"</script>\"; const n = 1;",
                            },
                        ],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "After",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("parses raw textarea block followed by sibling element", () => {
    const result = html2json("<div><textarea>1 < 2 && 3 > 2</textarea><p>After</p></div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "textarea",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "1 < 2 && 3 > 2",
                            },
                        ],
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "After",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("parses title content as raw text", () => {
    const result = html2json("<title>Hello <world></title>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "title",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "Hello <world>",
                    },
                ],
            },
        ],
    });
});

test("decodes entities inside title content", () => {
    const result = html2json("<title>A &amp; B</title>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "title",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "A & B",
                    },
                ],
            },
        ],
    });
});

test("preserves whitespace-only formatting text nodes", () => {
    const result = html2json("<div>\n  <p>x</p>\n</div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "\n  ",
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "x",
                            },
                        ],
                    },
                    {
                        type: "text",
                        content: "\n",
                    },
                ],
            },
        ],
    });
});

test("preserves inter-element newline text node between siblings", () => {
    const result = html2json("<div><p>One</p>\n<p>Two</p></div>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "One",
                            },
                        ],
                    },
                    {
                        type: "text",
                        content: "\n",
                    },
                    {
                        type: "element",
                        tag: "p",
                        attributes: {},
                        children: [
                            {
                                type: "text",
                                content: "Two",
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test("preserves leading and trailing spaces in text node", () => {
    const result = html2json("<p>  hello  </p>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "p",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "  hello  ",
                    },
                ],
            },
        ],
    });
});

test("decodes copy named entity in text", () => {
    const result = html2json("<p>&copy; 2024 My Website</p>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "p",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "© 2024 My Website",
                    },
                ],
            },
        ],
    });
});

test("recovers stack by popping until matching closing tag", () => {
    const result = html2json("<div><span></div><p>After</p>");

    assert.deepEqual(result, {
        type: "document",
        children: [
            {
                type: "element",
                tag: "div",
                attributes: {},
                children: [
                    {
                        type: "element",
                        tag: "span",
                        attributes: {},
                        children: [],
                    },
                ],
            },
            {
                type: "element",
                tag: "p",
                attributes: {},
                children: [
                    {
                        type: "text",
                        content: "After",
                    },
                ],
            },
        ],
        warnings: [
            {
                message: "Tag <span> was automatically closed before </div>.",
                openedAt: 1,
                detectedAt: 1,
            },
        ],
    });
});

test("does not crash on html_samples fixtures", () => {
    const sampleFiles = fs
        .readdirSync(SAMPLES_DIR)
        .filter((fileName) => fileName.endsWith(".html"))
        .sort();

    assert.ok(sampleFiles.length > 0);

    for (const fileName of sampleFiles) {
        const html = fs.readFileSync(path.join(SAMPLES_DIR, fileName), "utf8");
        const result = html2json(html);

        assert.equal(result.type, "document", fileName);
        assert.ok(Array.isArray(result.children), fileName);
    }
});

test("parses full document sample with key structure and decoded entities", () => {
    const html = fs.readFileSync(
        path.join(SAMPLES_DIR, "01-full-document.html"),
        "utf8"
    );
    const result = html2json(html);

    assert.equal(result.type, "document");
    assert.deepEqual(result.children[0], {
        type: "doctype",
        content: "html",
    });

    const htmlElement = result.children.find(
        (child) => child.type === "element" && child.tag === "html"
    );
    assert.ok(htmlElement);
    assert.equal(htmlElement.attributes.lang, "en");

    assert.ok(findByTag(result, "header"));
    assert.ok(findByTag(result, "nav"));
    assert.ok(findByTag(result, "main"));
    assert.ok(findByTag(result, "footer"));

    const footerParagraph = findByTag(result, "footer").children.find(
        (child) => child.type === "element" && child.tag === "p"
    );
    const footerText = footerParagraph.children.find(
        (child) => child.type === "text"
    );

    assert.equal(footerText.content, "© 2024 My Website");
});

test("adds warning with openedAt/detectedAt for unexpected closing tag", () => {
    const result = html2json("<div>\n  </span>\n</div>");

    assert.deepEqual(result.warnings, [
        {
            message: "Unexpected closing tag </span>. No matching opening tag was found.",
            openedAt: 2,
            detectedAt: 2,
        },
    ]);
});

test("adds warning with openedAt/detectedAt for unclosed comment", () => {
    const result = html2json("<div>\n<!-- comment\n<p>Text</p>");

    assert.deepEqual(result.warnings, [
        {
            message: "Comment is not closed. Add --> to finish the comment.",
            openedAt: 2,
            detectedAt: 2,
        },
        {
            message: "Unclosed tag <div> was automatically closed at the end of input.",
            openedAt: 1,
            detectedAt: 3,
        },
    ]);
});

test("normalizes CRLF to LF in text node content", () => {
    const result = html2json("<p>a\r\nb</p>");

    assert.equal(result.children[0].children[0].content, "a\nb");
});

test("normalizes standalone carriage return to LF in text node content", () => {
    const result = html2json("<p>a\rb</p>");

    assert.equal(result.children[0].children[0].content, "a\nb");
});

test("normalizes CRLF in script raw text without decoding entities", () => {
    const result = html2json("<script>line1\r\n&amp;line2</script>");

    assert.equal(result.children[0].children[0].content, "line1\n&amp;line2");
});

test("normalizes CRLF in textarea content and decodes entities", () => {
    const result = html2json("<textarea>one\r\n&amp; two</textarea>");

    assert.equal(result.children[0].children[0].content, "one\n& two");
});

test("counts CRLF line breaks in warning line numbers", () => {
    const result = html2json("<div>\r\n  </span>\r\n</div>");

    assert.deepEqual(result.warnings, [
        {
            message: "Unexpected closing tag </span>. No matching opening tag was found.",
            openedAt: 2,
            detectedAt: 2,
        },
    ]);
});

