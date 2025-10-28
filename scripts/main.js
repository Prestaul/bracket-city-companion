const INITIAL_RETRIES = 10;

let options = {};
let puzzleDate = null;
let puzzleCache = new Map();
let retriesRemaining = INITIAL_RETRIES;
let playButtonClicked = false;

console.debug('Bracket City Companion (BCC) plugin initializing...');
initPlugin();

async function initPlugin() {
  const containerEl = document.querySelector('.puzzle-container')?.parentElement;
  const displayEl = document.querySelector('.puzzle-display')?.parentElement;

  if (!containerEl || !displayEl || !updatePuzzleDate() || !getRawPuzzleText()) {
    const playButton = document.querySelector('button[data-event-element="play button"]');
    if (playButton && !playButtonClicked) {
      console.debug('BCC detected play button, waiting for user to start puzzle...');
      playButton.addEventListener('click', () => {
        retriesRemaining = INITIAL_RETRIES;
        playButtonClicked = true;
        initPlugin();
      });
    } else {
      console.debug('BCC waiting for puzzle...');
      if (--retriesRemaining > 0) {
        setTimeout(initPlugin, 500);
      } else {
        console.debug('BCC failed to find puzzle after multiple attempts.');
      }
    }

    return;
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
        showWrongGuesses: data?.options?.showWrongGuesses ?? true,
      })
    );
  });
}

function updatePuzzleDate() {
  const dateText = document.querySelector('.puzzle-date')?.textContent.trim();
  puzzleDate = dateText ? new Date(dateText).toISOString().substring(0, 10) : null;
}

function getRawPuzzleData() {
  console.debug(`BCC reading puzzle (${puzzleDate})...`);

  return JSON.parse(
    localStorage.getItem(`bracketPuzzle_${puzzleDate}`) || '{}'
  );
}

function getRawPuzzleText() {
  return getRawPuzzleData()?.initialPuzzle?.trim() || '';
}

function getWrongGuesses() {
  return getRawPuzzleData()?.wrongGuessList || [];
}

// PUZZLE OBSERVERS ///////////////////////////////////////////////////////////

async function initPuzzle() {
  updatePuzzleDate();

  if (!puzzleDate) {
    console.debug('BCC no puzzle date found.');
    return;
  }

  console.debug(`BCC puzzle (${puzzleDate}) initializing...`);

  const { showIds, showHighlights, showWrongGuesses } = await getOptions();
  let solutionObserver, puzzleObserver;

  if (showHighlights) {
    updateHighlights();

    // Reinsert highlights when the puzzle display rerenders
    puzzleObserver = new MutationObserver(updateHighlights);
    puzzleObserver.observe(document.querySelector('.puzzle-display'), { childList: true });
  }

  if (showIds) insertIds();
  if (showWrongGuesses) insertWrongGuesses();

  if (showIds || showWrongGuesses) {
    solutionObserver = new MutationObserver(([mutation]) => {
      // Reinsert ids when the expression list rerenders
      if (Array.from(mutation.addedNodes).some(el => el.matches?.('.expression-item'))) {
        if (showIds) insertIds();
        if (showWrongGuesses) insertWrongGuesses();
      }
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
  if (!rawText) {
    console.debug('BCC unable to locate the puzzle text.');
    return null;
  }

  let i = 0;
  const text = rawText.trim().replaceAll('[', () => (++i + '[').padStart(3, '0'));

  puzzleCache.set(puzzleDate, text);

  console.debug('BCC puzzle read.', { puzzleWithIds: text });

  return text;
}

function insertIds() {
  let puzzleWithIds = getPuzzleWithIds();
  if (!puzzleWithIds) throw new Error('BCC attempting to insert ids without a valid puzzle.');

  const expressions = document.querySelectorAll('.expression-item');

  console.debug(`BCC inserting ids... (${expressions.length} expressions)`);

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

function insertWrongGuesses() {
  const existingEl = document.getElementById('bcc-wrong-guesses');
  if (existingEl) existingEl.remove();

  const answersHeader = document.querySelector('.solved-expressions > h3');
  if (!answersHeader) return;

  const wrongGuesses = getWrongGuesses();
  if (wrongGuesses.length === 0) return;

  console.debug('BCC inserting wrong guesses...', { wrongGuesses });

  const el = document.createElement('div');
  el.id = 'bcc-wrong-guesses';
  el.style.fontFamily = 'var(--mono-font)';
  el.style.fontSize = '18px';
  el.style.marginTop = '1rem';
  el.innerHTML = `<strong>Wrong Guesses:</strong> ${wrongGuesses.join(', ')}`;

  answersHeader.insertAdjacentElement('beforebegin', el);
}

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
    const id = `bcc-${i}`;
    CSS.highlights.delete(id);
    CSS.highlights.set(id, highlights[i]);
  }

  console.debug('BCC highlights inserted.');
}
