"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { html2json } = require("../html2json.js");

test("html2json is a function", () => {
    assert.equal(typeof html2json, "function");
});

test("returns empty document object for non-string input", () => {
    const result = html2json(null);

    assert.deepEqual(result, {
        type: "document",
        children: [],
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


