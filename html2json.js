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
    tagName: string,          // lowercased
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
function parseAttributes(attributesText) {
  const attributes = {};

  attributesText.replace(
    /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
    (match, name, doubleQuotedValue, singleQuotedValue, unquotedValue) => {
      attributes[name] = doubleQuotedValue ?? singleQuotedValue ?? unquotedValue;
      return match;
    }
  );

  return attributes;
}

function parseHtml(htmlText) {
  const root = {
    type: "document",
    children: [],
  };

  const stack = [root];

  const parts = htmlText
    .split(/(<\/?[a-zA-Z][\w-]*(?:\s+[^<>]*)?>)/)
    .filter((part) => part !== "");

  parts.forEach((part) => {
    const openingTagMatch = part.match(/^<([a-zA-Z][\w-]*)(?:\s+([^<>]*))?>$/);
    const closingTagMatch = part.match(/^<\/([a-zA-Z][\w-]*)>$/);

    if (closingTagMatch) {
      const tag = closingTagMatch[1].toLowerCase();

      if (stack.length > 1 && stack[stack.length - 1].tag === tag) {
        stack.pop();
      }

      return;
    }

    if (openingTagMatch) {
      const tag = openingTagMatch[1].toLowerCase();
      const attributesText = openingTagMatch[2] || "";

      const element = {
        type: "element",
        tag,
        attributes: parseAttributes(attributesText),
        children: [],
      };

      stack[stack.length - 1].children.push(element);
      stack.push(element);

      return;
    }

    const textContent = part.trim();

    if (textContent) {
      stack[stack.length - 1].children.push({
        type: "text",
        content: textContent,
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
