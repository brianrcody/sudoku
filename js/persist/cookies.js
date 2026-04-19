/**
 * @fileoverview Thin cookie read/write helpers.
 *
 * Default attributes: maxAge = 2 years, path = /, SameSite = Lax.
 */

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 365 * 2;

/**
 * Reads the value of a cookie by name.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function get(name) {
  const prefix = encodeURIComponent(name) + '=';
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

/**
 * Writes a cookie.
 *
 * @param {string} name
 * @param {string} value - Already-encoded if needed; this function does not
 *   encode the value itself since callers may pre-encode for size.
 * @param {object} [opts]
 * @param {number} [opts.maxAge]
 * @param {string} [opts.path]
 * @param {string} [opts.sameSite]
 */
export function set(name, value, {
  maxAge = DEFAULT_MAX_AGE,
  path = '/',
  sameSite = 'Lax',
} = {}) {
  document.cookie = [
    `${encodeURIComponent(name)}=${value}`,
    `max-age=${maxAge}`,
    `path=${path}`,
    `SameSite=${sameSite}`,
  ].join('; ');
}

/**
 * Deletes a cookie by setting max-age to 0.
 *
 * @param {string} name
 * @param {string} [path]
 */
export function remove(name, path = '/') {
  document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=${path}`;
}
