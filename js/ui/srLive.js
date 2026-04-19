/**
 * @fileoverview Screen reader live region helper.
 *
 * Exposes `announce(text)` using the double-frame clear-then-set pattern so
 * repeated identical messages are re-announced.
 */

let _region = null;

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
 * (no-op in that case).
 *
 * @param {string} text
 */
export function announce(text) {
  if (!_region) return;
  _region.textContent = '';
  requestAnimationFrame(() => {
    _region.textContent = text;
  });
}
