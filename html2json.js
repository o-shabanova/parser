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
    name: string
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

  const parts = htmlText
    .split(/(<style\b(?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?\s*>[\s\S]*?<\/style\s*>|<script\b(?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?\s*>[\s\S]*?<\/script\s*>|<!--[\s\S]*?-->|<!DOCTYPE[\s\S]*?>|<\/[a-zA-Z][\w-]*\s*>|<[a-zA-Z][\w-]*(?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?\s*\/?>)/i)
    .filter((part) => part !== "");

  parts.forEach((part) => {
    const styleBlockMatch = part.match(/^<style\b((?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?)\s*>([\s\S]*?)<\/style\s*>$/i);
    const scriptBlockMatch = part.match(/^<script\b((?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?)\s*>([\s\S]*?)<\/script\s*>$/i);
    const doctypeMatch = part.match(/^<!DOCTYPE\s+([^>]+)>$/i);
    const commentMatch = part.match(/^<!--([\s\S]*?)-->$/);
    const openingTagMatch = part.match(/^<([a-zA-Z][\w-]*)(?:\s+((?:"[^"]*"|'[^']*'|[^'"<>])*))?\s*\/?>$/);
    const closingTagMatch = part.match(/^<\/([a-zA-Z][\w-]*)>$/);

    if (scriptBlockMatch) {
      const rawAttributesText = scriptBlockMatch[1] || "";
      const attributesText = rawAttributesText.trim();
      const scriptContent = scriptBlockMatch[2];
      const scriptElement = {
        type: "element",
        tag: "script",
        attributes: parseAttributes(attributesText),
        children: [],
      };

      if (scriptContent !== "") {
        scriptElement.children.push({
          type: "text",
          content: decodeHtmlEntities(scriptContent),
        });
      }

      stack[stack.length - 1].children.push(scriptElement);
      return;
    }

    if (styleBlockMatch) {
      const rawAttributesText = styleBlockMatch[1] || "";
      const attributesText = rawAttributesText.trim();
      const styleContent = styleBlockMatch[2];
      const styleElement = {
        type: "element",
        tag: "style",
        attributes: parseAttributes(attributesText),
        children: [],
      };

      if (styleContent !== "") {
        styleElement.children.push({
          type: "text",
          content: decodeHtmlEntities(styleContent),
        });
      }

      stack[stack.length - 1].children.push(styleElement);
      return;
    }

    if (doctypeMatch) {
      stack[stack.length - 1].children.push({
        type: "doctype",
        content: doctypeMatch[1].trim(),
      });

      return;
    }

    if (commentMatch) {
      stack[stack.length - 1].children.push({
        type: "comment",
        content: commentMatch[1],
      });

      return;
    }

    if (closingTagMatch) {
      const tag = closingTagMatch[1].toLowerCase();

      if (stack.length > 1 && stack[stack.length - 1].tag === tag) {
        stack.pop();
      }

      return;
    }

    if (openingTagMatch) {
      const tag = openingTagMatch[1].toLowerCase();
      const rawAttributesText = openingTagMatch[2] || "";

      const isSelfClosing =
        part.endsWith("/>") ||
        voidTags.includes(tag);
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

      return;
    }

    const textContent = part.trim();

    if (textContent) {
      stack[stack.length - 1].children.push({
        type: "text",
        content: decodeHtmlEntities(textContent),
      });
    }
  });

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
