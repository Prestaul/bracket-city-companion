// CSS //////////////////////////////////////////////////////////////////////

let sheet = new CSSStyleSheet();
let maxDepth = -1;

function createHighlight(id, depth) {
  if (depth <= maxDepth) return;

  maxDepth = depth;

  sheet.insertRule(`
    ::highlight(${id}) {
      background-color: oklch(1 0.1 ${50 * depth});
    }
  `);
  sheet.insertRule(`
    .bracket-city-dark-mode ::highlight(${id}) {
      background-color: oklch(0.4 0.1 ${50 * depth});
    }
  `);
}

sheet.replace(`
  .active-clue {
    outline: 2px solid color-mix(in srgb, transparent, currentcolor 40%);
    outline-offset: -3px;
  }
  .solved {
    outline: 4px dashed color-mix(in srgb, transparent, currentcolor 40%);
    outline-offset: -4px;
  }
`);

document.adoptedStyleSheets = [
  ...document.adoptedStyleSheets,
  sheet,
];

// DOM //////////////////////////////////////////////////////////////////////

function updateHighlights() {
  const puzzle = document.querySelector('.puzzle-display');

  if (!puzzle) return;

  for (const blank of puzzle.querySelectorAll('.blank-line')) {
    const width = Math.round(parseFloat(blank.style.width) / 0.6) || 1;
    blank.replaceWith('_'.repeat(width));
  }

  const walker = document.createTreeWalker(puzzle, NodeFilter.SHOW_TEXT);
  const ranges = [];
  const highlights = [];

  for (let node; node = walker.nextNode();) {
    const text = node.textContent;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '[') {
        const range = new Range();
        range.setStart(node, i);
        ranges.push(range);
      }

      if (char === ']') {
        const range = ranges.pop();
        range.setEnd(node, i + 1);
        highlights[ranges.length] ??= new Highlight();
        highlights[ranges.length].add(range);
      }
    }
  }

  for (let i = 0; i < highlights.length; i++) {
    const id = `brackets-${i}`;
    createHighlight(id, i);
    CSS.highlights.delete(id);
    CSS.highlights.set(id, highlights[i]);
  }
}

new MutationObserver(updateHighlights).observe(document.body, {
  childList: true,
  subtree: true,
});

updateHighlights();
