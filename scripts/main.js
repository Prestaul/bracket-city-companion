let options = {};
let puzzleDate = null;
let puzzleCache = new Map();

console.debug('Bracket City Companion (BCC) plugin initializing...');
initPlugin();

async function initPlugin() {
  const containerEl = document.querySelector('.puzzle-container')?.parentElement;
  const displayEl = document.querySelector('.puzzle-display')?.parentElement;

  if (!containerEl || !displayEl) {
    console.debug('BCC waiting for puzzle...');
    return setTimeout(initPlugin, 500);
  }

  let cleanup = await initPuzzle();
  new MutationObserver(async () => {
    cleanup?.();

    cleanup = await initPuzzle();
  }).observe(containerEl, { childList: true });

  console.debug('BCC plugin initialized.');
}

// PUZZLE DATA ////////////////////////////////////////////////////////////////

async function getOptions() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      'options',
      (data) => resolve({
        showIds: data?.options?.showIds ?? true,
        showHighlights: data?.options?.showHighlights ?? true,
      })
    );
  });
}

function updatePuzzleDate() {
  const dateText = document.querySelector('.puzzle-date')?.textContent.trim();
  puzzleDate = dateText ? new Date(dateText).toISOString().substring(0, 10) : null;
}

function getRawPuzzleText() {
  console.debug('BCC reading puzzle...');

  return JSON.parse(
    localStorage.getItem(`bracketPuzzle_${puzzleDate}`) || '{}'
  )?.initialPuzzle.trim();
}

// PUZZLE OBSERVERS ///////////////////////////////////////////////////////////

async function initPuzzle() {
  updatePuzzleDate();

  if (!puzzleDate) {
    console.debug('BCC no puzzle date found.');
    return;
  }

  console.debug(`BCC puzzle (${puzzleDate}) initializing...`);

  const { showIds, showHighlights } = await getOptions();
  let solutionObserver, puzzleObserver;

  if (showHighlights) {
    updateHighlights();

    puzzleObserver = new MutationObserver(([mutation]) => {
      // Reinsert highlights when the puzzle display rerenders
      updateHighlights();
    });
    puzzleObserver.observe(document.querySelector('.puzzle-display'), { childList: true });
  }

  if (showIds) {
    insertIds();

    solutionObserver = new MutationObserver(([mutation]) => {
      // Reinsert ids when the expression list rerenders
      if (Array.from(mutation.addedNodes).some(el => el.matches?.('.expression-item')))
        insertIds();
    });
    solutionObserver.observe(document.querySelector('.expressions-list'), { childList: true });
  }

  console.debug(`BCC puzzle (${puzzleDate}) initialized.`);

  return () => {
    puzzleObserver?.disconnect();
    solutionObserver?.disconnect();
    console.debug(`BCC puzzle (${puzzleDate}) cleaned up.`);
  };
}

// IDS DOM ////////////////////////////////////////////////////////////////////

function getPuzzleWithIds() {
  const cached = puzzleCache.get(puzzleDate);
  if (cached) {
    console.debug('BCC puzzle read from cache.', { puzzleWithIds: cached });
    return cached;
  }

  const rawText = getRawPuzzleText();
  if (!rawText) throw new Error('Unable to locate the puzzle text');

  let i = 0;
  const text = rawText.trim().replaceAll('[', () => (++i + '[').padStart(3, '0'));

  puzzleCache.set(puzzleDate, text);

  console.debug('BCC puzzle read.', { puzzleWithIds: text });

  return text;
}

function insertIds() {
  let puzzleWithIds = getPuzzleWithIds();
  const expressions = document.querySelectorAll('.expression-item');

  console.debug(`BCC inserting ids... (${expressions.length} expressions)`);

  for (let i = expressions.length; i--; ) {
    const el = expressions[i];
    const expression = el.querySelector('.expression')?.textContent.trim();
    const solution = el.querySelector('.solution')?.textContent.trim();
    if (!expression || !solution) return;

    const index = puzzleWithIds.indexOf(expression);
    const id = puzzleWithIds.substring(index - 2, index);

    puzzleWithIds = puzzleWithIds.replace(id + expression, solution);

    el.prepend(id + ' ');
  }

  console.debug('BCC ids inserted.');
}

// HIGHLIGHTS CSS /////////////////////////////////////////////////////////////

const sheet = new CSSStyleSheet();
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

// HIGHLIGHTS DOM /////////////////////////////////////////////////////////////

function updateHighlights() {
  console.debug('BCC inserting highlights...');

  const puzzle = document.querySelector('.puzzle-display');

  if (!puzzle) {
    console.debug('BCC no puzzle display found.');
    return;
  }

  puzzle.querySelectorAll('.blank-line').forEach(blank => {
    // Replace blank lines with underscores based on their width
    const width = Math.round(parseFloat(blank.style.width) / 0.6) || 1;
    blank.replaceWith('_'.repeat(width));
  });

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

  console.debug('BCC highlights inserted.');
}
