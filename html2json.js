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

function parseHtml(htmlText) {
  const voidTags = [
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
  const root = {
    type: "document",
    children: [],
  };
  const stack = [root];
  let index = 0;
  let textBuffer = "";

  const flushTextBuffer = () => {
    if (textBuffer !== "") {
      stack[stack.length - 1].children.push({
        type: "text",
        content: decodeHtmlEntities(textBuffer),
      });
    }

    textBuffer = "";
  };

  while (index < htmlText.length) {
    if (htmlText[index] !== "<") {
      textBuffer += htmlText[index];
      index += 1;
      continue;
    }

    const rawElementMatch = tryReadRawElement(htmlText, index);
    if (rawElementMatch) {
      flushTextBuffer();

      const rawElement = {
        type: "element",
        tag: rawElementMatch.tag,
        attributes: parseAttributes(rawElementMatch.attributesText),
        children: [],
      };

      if (rawElementMatch.content !== "") {
        rawElement.children.push({
          type: "text",
          content:
            rawElementMatch.tag === "script" || rawElementMatch.tag === "style"
              ? rawElementMatch.content
              : decodeHtmlEntities(rawElementMatch.content),
        });
      }

      stack[stack.length - 1].children.push(rawElement);
      index = rawElementMatch.endIndex;
      continue;
    }
    if (htmlText.startsWith("<!--", index)) {
      const commentEndIndex = htmlText.indexOf("-->", index + 4);

      if (commentEndIndex !== -1) {
        flushTextBuffer();
        stack[stack.length - 1].children.push({
          type: "comment",
          content: htmlText.slice(index + 4, commentEndIndex),
        });
        index = commentEndIndex + 3;
        continue;
      }
    }

    const doctypeMatch = htmlText.slice(index).match(/^<!DOCTYPE\s+([^>]+)>/i);
    if (doctypeMatch) {
      flushTextBuffer();
      stack[stack.length - 1].children.push({
        type: "doctype",
        content: doctypeMatch[1].trim(),
      });
      index += doctypeMatch[0].length;
      continue;
    }

    const closingTagMatch = htmlText.slice(index).match(/^<\/([a-zA-Z][\w-]*)\s*>/);
    if (closingTagMatch) {
      flushTextBuffer();
      const tag = closingTagMatch[1].toLowerCase();

      /*
        Recovery rule for mismatched closing tags:
        pop open elements until the matching tag is found, then pop it too.
        If no matching tag exists in stack, ignore the closing tag.
      */
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

      index += closingTagMatch[0].length;
      continue;
    }
    const openingTagMatch = htmlText
      .slice(index)
      .match(/^<([a-zA-Z][\w-]*)(?:\s+((?:"[^"]*"|'[^']*'|[^'"<>])*))?\s*\/?>/);
    if (openingTagMatch) {
      flushTextBuffer();
      const tag = openingTagMatch[1].toLowerCase();
      const rawAttributesText = openingTagMatch[2] || "";
      const fullOpeningTag = openingTagMatch[0];
      const isSelfClosing = fullOpeningTag.endsWith("/>") || voidTags.includes(tag);
      const attributesText = isSelfClosing
        ? rawAttributesText.replace(/\s*\/\s*$/, "")
        : rawAttributesText;

      const element = {
        type: "element",
        tag,
        attributes: parseAttributes(attributesText),
        children: [],
      };

      stack[stack.length - 1].children.push(element);

      if (!isSelfClosing) {
        stack.push(element);
      }

      index += fullOpeningTag.length;
      continue;
    }

    textBuffer += "<";
    index += 1;
  }

  flushTextBuffer();

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
