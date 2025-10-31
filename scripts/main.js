const INITIAL_RETRIES = 10;

let retriesRemaining = INITIAL_RETRIES;
let playButtonClicked = false;
const puzzleCache = new Map();
let currentPuzzle = null;

console.debug('Bracket City Companion (BCC) plugin initializing...');
initPlugin();

async function initPlugin() {
  await initPuzzle();

  const containerEl = document.querySelector('.puzzle-container')?.parentElement;

  if (currentPuzzle && containerEl) {
    new MutationObserver(async () => {
      currentPuzzle?.cleanup?.();
      await initPuzzle();
    }).observe(containerEl, { childList: true });

    console.debug('BCC plugin initialized.');
  } else {
    const playButton = document.querySelector('button[data-event-element="play button"]');
    if (playButton && !playButtonClicked) {
      console.debug('BCC detected play button, waiting for user to start puzzle...');
      playButton.addEventListener('click', () => {
        retriesRemaining = INITIAL_RETRIES;
        playButtonClicked = true;
        initPlugin();
      }, { once: true });
    } else {
      console.debug('BCC waiting for puzzle...');
      if (--retriesRemaining > 0) {
        setTimeout(initPlugin, 500);
      } else {
        console.debug('BCC failed to find puzzle after multiple attempts.');
      }
    }
  }
}

async function initPuzzle() {
  const messageEl = document.querySelector('.input-container > .message');
  if (!messageEl) return null;

  const rawState = getRawPuzzleState();
  if (!rawState) return null;

  console.debug(`BCC puzzle (${rawState.puzzleDate}) initializing...`);

  const puzzleObserver = new MutationObserver((records) => {
    if (records.every(r => r.target.style.display === 'none')) return;

    const { isComplete, solvedExpressions, wrongGuessList } = getRawPuzzleState();

    Object.assign(currentPuzzle, {
      isComplete: isComplete ?? false,
      solvedExpressions: solvedExpressions || [],
      wrongGuesses: wrongGuessList || [],
    });

    insertHighlights();
    insertIds();
    insertWrongGuesses();
  });

  currentPuzzle = {
    ...await getOptions(),
    puzzleDate: rawState.puzzleDate,
    puzzleWithIds: getPuzzleWithIds(rawState),
    isComplete: rawState?.isComplete ?? false,
    solvedExpressions: rawState?.solvedExpressions || [],
    wrongGuesses: rawState?.wrongGuessList || [],

    cleanup: () => puzzleObserver.disconnect(),
  };

  puzzleObserver.observe(messageEl, { attributeFilter: ['style'] });

  insertHighlights();
  insertIds();
  insertWrongGuesses();

  console.debug(`BCC puzzle (${rawState.puzzleDate}) initialized.`, currentPuzzle);
}

// PUZZLE DATA ////////////////////////////////////////////////////////////////

async function getOptions() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      'options',
      (data) => resolve({
        showIds: data?.options?.showIds ?? true,
        showHighlights: data?.options?.showHighlights ?? true,
        showWrongGuesses: data?.options?.showWrongGuesses ?? true,
      })
    );
  });
}

function getRawPuzzleState() {
  console.debug('BCC reading puzzle state...');

  const dateText = document.querySelector('.puzzle-date')?.textContent.trim();
  const puzzleDate = dateText ? new Date(dateText).toISOString().substring(0, 10) : null;

  if (!puzzleDate) {
    console.debug('BCC unable to determine puzzle date.');
    return null;
  }

  return JSON.parse(
    localStorage.getItem(`bracketPuzzle_${puzzleDate}`) || '{}'
  );
}

function getPuzzleWithIds(rawState) {
  const cached = puzzleCache.get(rawState.puzzleDate);
  if (cached) {
    console.debug('BCC puzzle read from cache.', { puzzleWithIds: cached });
    return cached;
  }

  const rawText = rawState?.initialPuzzle?.trim() || '';
  if (!rawText) {
    console.debug('BCC unable to locate the puzzle text.');
    return null;
  }

  let i = 0;
  const text = rawText.trim().replaceAll('[', () => (++i + '[').padStart(3, '0'));

  puzzleCache.set(rawState.puzzleDate, text);

  console.debug('BCC puzzle read from storage.', { puzzleWithIds: text });

  return text;
}

// IDS DOM ////////////////////////////////////////////////////////////////////

function insertIds() {
  if (!currentPuzzle.showIds) return;

  const expressions = document.querySelectorAll('.expression-item:not(.bcc-wrong-guess)');

  console.debug(`BCC inserting ids... (${expressions.length} expressions)`);

  let puzzleWithIds = currentPuzzle?.puzzleWithIds;
  if (!puzzleWithIds) throw new Error('BCC failed to insert ids: no valid puzzle found.');

  for (let i = expressions.length; i--;) {
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

// WRONG GUESSES DOM //////////////////////////////////////////////////////////

function appendCreatedElement(parent, tag) {
  const el = document.createElement(tag);
  parent.appendChild(el);
  return el;
}

function insertWrongGuesses() {
  if (!currentPuzzle.showWrongGuesses) return;

  const { wrongGuesses } = currentPuzzle;
  console.debug(`BCC inserting wrong guesses... (${wrongGuesses.length} wrong guesses)`);

  const target = document.querySelector('.solved-expressions');
  if (!target) throw new Error('BCC failed to insert wrong guesses: solved-expressions not found in DOM.');

  const container = document.createElement('div');
  container.id = 'bcc-wrong-guesses';

  let el = appendCreatedElement(container, 'h3');
  el.textContent = 'Wrong Guesses:';

  el = appendCreatedElement(container, 'div');
  el.className = 'expressions-list';

  el = appendCreatedElement(el, 'div');
  el.className = 'expression-item bcc-wrong-guess';
  el.textContent = wrongGuesses.join(', ') || '---- None ----';

  const prevEl = document.getElementById('bcc-wrong-guesses');
  if (prevEl) prevEl.replaceWith(container);
  else target.appendChild(container);

  console.debug('BCC wrong guesses inserted.');
}

// HIGHLIGHTS DOM /////////////////////////////////////////////////////////////

function insertHighlights() {
  if (!currentPuzzle.showHighlights) return;

  console.debug('BCC inserting highlights...');

  const puzzle = document.querySelector('.puzzle-display');

  if (!puzzle) throw new Error('BCC failed to insert highlights: puzzle-display not found in DOM.');

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
    const id = `bcc-${i}`;
    CSS.highlights.delete(id);
    CSS.highlights.set(id, highlights[i]);
  }

  console.debug('BCC highlights inserted.');
}
