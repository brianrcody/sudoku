/**
 * @fileoverview Reusable confirmation dialog.
 *
 * Manages a single `#dialog-root` container that is populated on each `open`
 * call. Traps focus within the dialog while open.
 */

let _root = null;
let _triggerEl = null;
let _onConfirm = null;
let _backdrop = null;
let _cancelBtn = null;
let _confirmBtn = null;

/**
 * Mounts the dialog into `root`. Must be called once before `open`.
 *
 * @param {HTMLElement} root - The `#dialog-root` element.
 */
export function mount(root) {
  _root = root;

  _root.innerHTML = `
    <div
      class="modal-backdrop"
      id="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div class="modal">
        <h2 id="modal-title"></h2>
        <p id="modal-body"></p>
        <div class="modal-actions">
          <button class="btn" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="modal-confirm"></button>
        </div>
      </div>
    </div>
  `;

  _backdrop = _root.querySelector('#modal-backdrop');
  _cancelBtn = _root.querySelector('#modal-cancel');
  _confirmBtn = _root.querySelector('#modal-confirm');

  _cancelBtn.addEventListener('click', close);
  _confirmBtn.addEventListener('click', _handleConfirm);

  _backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    // Trap focus within the dialog.
    if (e.key === 'Tab') {
      const focusable = [_cancelBtn, _confirmBtn];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });
}

/**
 * Opens the dialog with the given content.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} opts.confirmLabel
 * @param {function} opts.onConfirm
 */
export function open({ title, body, confirmLabel, onConfirm }) {
  _triggerEl = document.activeElement;
  _onConfirm = onConfirm;

  _root.querySelector('#modal-title').textContent = title;
  _root.querySelector('#modal-body').textContent = body;
  _confirmBtn.textContent = confirmLabel;

  _backdrop.classList.add('open');
  _cancelBtn.focus();
}

/** Closes the dialog and returns focus to the triggering element. */
export function close() {
  if (!_backdrop) return;
  _backdrop.classList.remove('open');
  _onConfirm = null;
  if (_triggerEl && typeof _triggerEl.focus === 'function') {
    _triggerEl.focus();
  }
  _triggerEl = null;
}

function _handleConfirm() {
  const cb = _onConfirm;
  close();
  if (cb) cb();
}
