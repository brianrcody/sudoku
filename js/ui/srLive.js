/**
 * @fileoverview Screen reader live region helper.
 *
 * Exposes `announce(text)` using the double-frame clear-then-set pattern so
 * repeated identical messages are re-announced.
 */

let _region = null;
let _muteDepth = 0;

/**
 * Must be called once before `announce`. Finds the `#sr-live` element in the
 * given root (or document).
 *
 * @param {HTMLElement} root
 */
export function mount(root) {
  _region = root.querySelector('#sr-live') ?? document.getElementById('sr-live');
}

/**
 * Announces `text` to screen readers. Safe to call before `mount` is called
 * (no-op in that case). A no-op inside `muted`.
 *
 * @param {string} text
 */
export function announce(text) {
  if (!_region || _muteDepth > 0) return;
  _region.textContent = '';
  requestAnimationFrame(() => {
    _region.textContent = text;
  });
}

/**
 * Runs `fn` synchronously with `announce` silenced. Calls nest; announcing
 * resumes when the outermost call returns or throws.
 *
 * @param {function(): void} fn
 */
export function muted(fn) {
  _muteDepth++;
  try {
    fn();
  } finally {
    _muteDepth--;
  }
}
