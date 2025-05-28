console.log('Idifier waiting for puzzle...');

console.log('Idifier plugin initializing...');
initPlugin();

function initPlugin() {
  const container = document.querySelector('.puzzle-container')?.parentElement;
  const initialDate = document.querySelector('.puzzle-date')?.textContent.trim();

  if (!container || !initialDate) return setTimeout(initPlugin, 500);

  let cleanup = initialDate ? initPuzzle(initialDate) : null;
  new MutationObserver(() => {
    cleanup?.();

    cleanup = initPuzzle(document.querySelector('.puzzle-date').textContent.trim());
  }).observe(container, { childList: true });

  const themeLink = document.createElement("link");
  themeLink.rel = "stylesheet";
  themeLink.type = "text/css";
  themeLink.href = chrome.runtime.getURL("/styles/mobile.css");
  console.log('Idifier theme link created.', themeLink.href);
  document.head.appendChild(themeLink);

  console.log('Idifier plugin initialized.');
}

function initPuzzle(date) {
  const keyDate = new Date(date).toISOString().substring(0, 10);
  const puzzleStorageKey = `idifierPuzzle_${keyDate}`;

  console.log(`Idifier puzzle (${keyDate}) initializing...`);

  insertIds();

  function getPuzzleWithIds() {
    const stored = localStorage.getItem(puzzleStorageKey);
    if (stored) {
      console.log('Idifier puzzle read from localstorage.', { puzzleWithIds: stored });
      return stored;
    }

    console.log('Idifier reading puzzle...');

    const rawText = JSON.parse(
      localStorage.getItem(`bracketPuzzle_${keyDate}`) || '{}'
    )?.initialPuzzle.trim();
    if (!rawText) throw new Error('Unable to locate the puzzle text');

    let i = 0;
    const text = rawText.trim().replaceAll('[', () => (++i + '[').padStart(3, '0'));

    localStorage.setItem(puzzleStorageKey, text);

    console.log('Idifier puzzle read.', { puzzleWithIds: text });

    return text;
  }

  function insertIds() {
    let puzzleWithIds = getPuzzleWithIds();
    const expressions = document.querySelectorAll('.expression-item');

    console.log(`Idifier inserting ids... (${expressions.length} expressions)`);

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

    console.log('Idifier ids inserted.');
  }

  const observer = new MutationObserver(([mutation]) => {
    // Reinsert ids when the expression list rerenders
    if (Array.from(mutation.addedNodes).some(el => el.matches?.('.expression-item')))
      insertIds();
  });

  observer.observe(document.querySelector('.expressions-list'), { childList: true });

  return () => {
    observer.disconnect();
    console.log(`Idifier puzzle (${keyDate}) cleaned up.`);
  };
}
