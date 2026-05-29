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
