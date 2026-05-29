function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}

/*
  JSON schema (DOM-like AST)

  Root — always a document node:
  {
    type: "document",
    children: Node[],
    warnings: Warning[]
  }

  Node types:

  Element:
  {
    type: "element",
    tag: string,          // lowercased
    attributes: { [name: string]: string },
    children: Node[]
  }

  Text:
  {
    type: "text",
    content: string           // entities decoded in normal elements
  }

  Comment:
  {
    type: "comment",
    content: string           // raw, entities not decoded
  }

  Doctype:
  {
    type: "doctype",
    content: string
  }

  Warning (malformed HTML recovery):
  {
    message: string,
    position: number          // character index in input string
  }

  Policies:
  - Whitespace-only text nodes between tags are omitted (except inside pre, textarea, script, style).
  - Malformed HTML produces a best-effort tree; never throws.
  - Entities are decoded in text nodes and attribute values, not in script, style, comments, or doctype.
*/
function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: "\u00A0",
    copy: "\u00A9",
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][\w]+);/g, (fullMatch, entityBody) => {
    if (entityBody[0] === "#") {
      const isHex = entityBody[1] === "x" || entityBody[1] === "X";
      const numericPart = isHex ? entityBody.slice(2) : entityBody.slice(1);
      const base = isHex ? 16 : 10;
      const codePoint = Number.parseInt(numericPart, base);

      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return fullMatch;
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return fullMatch;
      }
    }

    const lowerName = entityBody.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(namedEntities, lowerName)) {
      return namedEntities[lowerName];
    }

    return fullMatch;
  });
}

function parseAttributes(attributesText) {
  const attributes = {};
  const matchedAttributeNames = new Set();

  attributesText.replace(
    /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
    (match, name, doubleQuotedValue, singleQuotedValue, unquotedValue) => {
      const rawValue = doubleQuotedValue ?? singleQuotedValue ?? unquotedValue;
      attributes[name] = decodeHtmlEntities(rawValue);
      matchedAttributeNames.add(name);
      return match;
    }
  );

  attributesText.replace(
    /(?:^|\s+)([a-zA-Z_:][\w:.-]*)(?=\s|$)/g,
    (match, name) => {
      if (!matchedAttributeNames.has(name)) {
        attributes[name] = true;
      }
      return match;
    }
  );

  return attributes;
}

/* Parser constants */
const VOID_TAGS = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

/* Node builders and tree write helpers */
function appendToCurrentParent(stack, node) {
  stack[stack.length - 1].children.push(node);
}

function createTextNode(content) {
  return {
    type: "text",
    content: decodeHtmlEntities(content),
  };
}

function createElementNode(tag, attributesText) {
  return {
    type: "element",
    tag,
    attributes: parseAttributes(attributesText),
    children: [],
  };
}

function flushTextBuffer(stack, textBuffer) {
  if (textBuffer !== "") {
    appendToCurrentParent(stack, createTextNode(textBuffer));
  }

  return "";
}

function createRawTextNode(tag, content) {
  if (tag === "script" || tag === "style") {
    return {
      type: "text",
      content,
    };
  }

  return createTextNode(content);
}

function createRawElementNode(rawElementMatch) {
  const rawElement = createElementNode(
    rawElementMatch.tag,
    rawElementMatch.attributesText
  );

  if (rawElementMatch.content !== "") {
    rawElement.children.push(
      createRawTextNode(rawElementMatch.tag, rawElementMatch.content)
    );
  }

  return rawElement;
}

/* Token readers */
function findRawClosingTag(htmlText, startIndex, tag) {
  const lowerTag = tag.toLowerCase();
  let quote = "";
  let i = startIndex;

  while (i < htmlText.length) {
    const char = htmlText[i];

    if (quote !== "") {
      if (char === "\\") {
        i += 2;
        continue;
      }

      if (char === quote) {
        quote = "";
      }

      i += 1;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      i += 1;
      continue;
    }

    if (char === "<" && htmlText[i + 1] === "/") {
      const possibleTag = htmlText
        .slice(i + 2, i + 2 + lowerTag.length)
        .toLowerCase();

      if (possibleTag === lowerTag) {
        let closingIndex = i + 2 + lowerTag.length;

        while (/\s/.test(htmlText[closingIndex] || "")) {
          closingIndex += 1;
        }

        if (htmlText[closingIndex] === ">") {
          return {
            start: i,
            end: closingIndex + 1,
          };
        }
      }
    }

    i += 1;
  }

  return null;
}

function tryReadRawElement(htmlText, startIndex) {
  const rawOpeningMatch = htmlText
    .slice(startIndex)
    .match(/^<(script|style|textarea|title)\b((?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?)\s*>/i);

  if (!rawOpeningMatch) {
    return null;
  }

  const tag = rawOpeningMatch[1].toLowerCase();
  const rawAttributesText = rawOpeningMatch[2] || "";
  const contentStart = startIndex + rawOpeningMatch[0].length;
  const closingMatch = findRawClosingTag(htmlText, contentStart, tag);

  if (!closingMatch) {
    return null;
  }

  return {
    tag,
    attributesText: rawAttributesText.trim(),
    content: htmlText.slice(contentStart, closingMatch.start),
    endIndex: closingMatch.end,
  };
}

function tryReadComment(htmlText, startIndex) {
  if (!htmlText.startsWith("<!--", startIndex)) {
    return null;
  }

  const commentEndIndex = htmlText.indexOf("-->", startIndex + 4);
  if (commentEndIndex === -1) {
    return null;
  }

  return {
    content: htmlText.slice(startIndex + 4, commentEndIndex),
    endIndex: commentEndIndex + 3,
  };
}

function tryReadDoctype(htmlText, startIndex) {
  const doctypeMatch = htmlText.slice(startIndex).match(/^<!DOCTYPE\s+([^>]+)>/i);
  if (!doctypeMatch) {
    return null;
  }

  return {
    content: doctypeMatch[1].trim(),
    endIndex: startIndex + doctypeMatch[0].length,
  };
}

function tryReadClosingTag(htmlText, startIndex) {
  const closingTagMatch = htmlText
    .slice(startIndex)
    .match(/^<\/([a-zA-Z][\w-]*)\s*>/);
  if (!closingTagMatch) {
    return null;
  }

  return {
    tag: closingTagMatch[1].toLowerCase(),
    endIndex: startIndex + closingTagMatch[0].length,
  };
}

function tryReadOpeningTag(htmlText, startIndex) {
  const openingTagMatch = htmlText
    .slice(startIndex)
    .match(/^<([a-zA-Z][\w-]*)(?:\s+((?:"[^"]*"|'[^']*'|[^'"<>])*))?\s*\/?>/);
  if (!openingTagMatch) {
    return null;
  }

  const tag = openingTagMatch[1].toLowerCase();
  const rawAttributesText = openingTagMatch[2] || "";
  const fullOpeningTag = openingTagMatch[0];
  const isSelfClosing = fullOpeningTag.endsWith("/>") || VOID_TAGS.includes(tag);
  const attributesText = isSelfClosing
    ? rawAttributesText.replace(/\s*\/\s*$/, "")
    : rawAttributesText;

  return {
    tag,
    attributesText,
    isSelfClosing,
    endIndex: startIndex + fullOpeningTag.length,
  };
}

/* Token composition */
function consumeNextToken(htmlText, startIndex) {
  const rawElementToken = tryReadRawElement(htmlText, startIndex);
  if (rawElementToken) {
    return {
      kind: "rawElement",
      endIndex: rawElementToken.endIndex,
      value: rawElementToken,
    };
  }

  const commentToken = tryReadComment(htmlText, startIndex);
  if (commentToken) {
    return {
      kind: "comment",
      endIndex: commentToken.endIndex,
      value: commentToken,
    };
  }

  const doctypeToken = tryReadDoctype(htmlText, startIndex);
  if (doctypeToken) {
    return {
      kind: "doctype",
      endIndex: doctypeToken.endIndex,
      value: doctypeToken,
    };
  }

  const closingTagToken = tryReadClosingTag(htmlText, startIndex);
  if (closingTagToken) {
    return {
      kind: "closingTag",
      endIndex: closingTagToken.endIndex,
      value: closingTagToken,
    };
  }

  const openingTagToken = tryReadOpeningTag(htmlText, startIndex);
  if (openingTagToken) {
    return {
      kind: "openingTag",
      endIndex: openingTagToken.endIndex,
      value: openingTagToken,
    };
  }

  return null;
}

/* Parser flow helpers */
function closeTagWithRecovery(stack, tag) {
  let foundTagIndex = -1;
  for (let i = stack.length - 1; i > 0; i -= 1) {
    if (stack[i].tag === tag) {
      foundTagIndex = i;
      break;
    }
  }

  if (foundTagIndex !== -1) {
    while (stack.length - 1 >= foundTagIndex) {
      stack.pop();
    }
  }
}

function applyToken(stack, token) {
  if (token.kind === "rawElement") {
    appendToCurrentParent(stack, createRawElementNode(token.value));
    return;
  }

  if (token.kind === "comment") {
    appendToCurrentParent(stack, {
      type: "comment",
      content: token.value.content,
    });
    return;
  }

  if (token.kind === "doctype") {
    appendToCurrentParent(stack, {
      type: "doctype",
      content: token.value.content,
    });
    return;
  }

  if (token.kind === "closingTag") {
    closeTagWithRecovery(stack, token.value.tag);
    return;
  }

  if (token.kind === "openingTag") {
    const element = createElementNode(token.value.tag, token.value.attributesText);
    appendToCurrentParent(stack, element);

    if (!token.value.isSelfClosing) {
      stack.push(element);
    }
  }
}

function parseHtml(htmlText) {
  const root = {
    type: "document",
    children: [],
  };
  const stack = [root];
  let index = 0;
  let textBuffer = "";

  while (index < htmlText.length) {
    if (htmlText[index] !== "<") {
      textBuffer += htmlText[index];
      index += 1;
      continue;
    }

    const token = consumeNextToken(htmlText, index);
    if (token) {
      textBuffer = flushTextBuffer(stack, textBuffer);
      applyToken(stack, token);
      index = token.endIndex;
      continue;
    }

    textBuffer += "<";
    index += 1;
  }

  textBuffer = flushTextBuffer(stack, textBuffer);

  return root;
}

function html2json(htmlText) {
  if (typeof htmlText !== "string") {
    return {
      type: "document",
      children: [],
    };
  }

  const trimmedHtml = htmlText.trim();

  if (trimmedHtml === "") {
    return {
      type: "document",
      children: [],
    };
  }

  try {
    return parseHtml(trimmedHtml);
  } catch {
    return {
      type: "document",
      children: [],
    };
  }
}

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>
`;
  const jsonContent = {
    "Comment 1":
      "You have to think about how to take into account various html inputs so your json structure will cover them all and handle different cases.",
    "Comment 2":
      "When you make any choice in terms of selecting specific json structure for conversion - be ready to provide reasoning behind such choice.",
  };

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
  <button>Click me!</button>
  <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>
`;
  const jsonContent = {
    "Comment 1":
      "You have to think about how to take into account various html inputs so your json structure will cover them all and handle different cases.",
    "Comment 2":
      "When you make any choice in terms of selecting specific json structure for conversion - be ready to provide reasoning behind such choice.",
  };

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { html2json };
}
