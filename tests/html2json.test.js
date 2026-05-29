"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { html2json } = require("../html2json.js");

test("html2json is a function", () => {
    assert.equal(typeof html2json, "function");
  });

  test("returns empty document object for html string", () => {
    const result = html2json("<div>Hello!</div>");
  
    assert.deepEqual(result, {
      type: "document",
      children: [],
    });
  });