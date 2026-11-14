/**
 * @fileoverview Notice card — one transient message below the board (share
 * confirmations, loaded-puzzle outcomes, the copy-fallback link field).
 *
 * Owns the `#notice-root` subtree. Deliberately not a live region: callers
 * announce through srLive so nothing is read twice.
 */

let _root = null;
let _timer = null;
let _onDismiss = null;

/**
 * @param {HTMLElement} root - The `#notice-root` element.
 */
export function mount(root) {
  _root = root;
  hide();
}

/**
 * Show a message, replacing any notice already visible.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {'info'|'progress'|'error'|'link'} [opts.variant='info'] `progress`
 *   has no Dismiss button; it is expected to be replaced by an outcome.
 * @param {number} [opts.timeoutMs=0] Auto-dismiss delay; 0 keeps it until
 *   dismissed or replaced.
 * @param {function(): void} [opts.onDismiss] Called when the Dismiss button is used.
 * @returns {HTMLElement} The notice element.
 */
export function show(text, { variant = 'info', timeoutMs = 0, onDismiss = null } = {}) {
  hide();
  _onDismiss = onDismiss;

  const card = document.createElement('div');
  card.className = `notice notice-${variant}`;

  const body = document.createElement('div');
  body.className = 'notice-body';
  const message = document.createElement('div');
  message.className = 'notice-message';
  message.textContent = text;
  body.appendChild(message);
  card.appendChild(body);

  if (variant !== 'progress') {
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'btn notice-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss message');
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => {
      const cb = _onDismiss;
      hide();
      if (cb) cb();
    });
    card.appendChild(dismiss);
  }

  _root.appendChild(card);
  _root.hidden = false;

  if (timeoutMs > 0) {
    _timer = setTimeout(hide, timeoutMs);
  }
  return card;
}

/**
 * Show a message with a read-only, pre-selected field holding `url`, for
 * copying by hand. Stays until dismissed or replaced.
 *
 * @param {string} text
 * @param {string} url
 * @param {{onDismiss?: function(): void}} [opts]
 * @returns {HTMLInputElement} The field, focused with its content selected.
 */
export function showLink(text, url, { onDismiss = null } = {}) {
  const card = show(text, { variant: 'link', onDismiss });

  const field = document.createElement('input');
  field.type = 'text';
  field.readOnly = true;
  field.className = 'notice-field';
  field.id = 'share-link-field';
  field.setAttribute('aria-label', 'Shareable puzzle link');
  field.value = url;
  card.querySelector('.notice-body').appendChild(field);

  field.focus();
  field.select();
  return field;
}

/**
 * Remove the current notice, if any, without calling its `onDismiss`.
 * Requires `mount` to have run.
 */
export function hide() {
  if (_timer !== null) {
    clearTimeout(_timer);
    _timer = null;
  }
  _onDismiss = null;
  _root.innerHTML = '';
  _root.hidden = true;
}
