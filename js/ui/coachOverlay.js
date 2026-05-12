/**
 * @fileoverview Coach overlay module — renders SVG arrows on top of the grid.
 *
 * Owns the #coach-overlay SVG element. Translates step.arrows into SVG
 * primitives. Coupled to the explanation panel lifecycle via CustomEvents
 * dispatched by coach.js.
 *
 * This is one of two UI modules with cross-root DOM access by design (see
 * aspec-coach-ui.md §7.1).
 */

// COACH OVERLAY COORDINATE CONSTRAINT:
// This module assumes a 414×414 px grid with 46×46 cells (414/9 ≈ 46).
// Cell index i centers at (col*46 + 23, row*46 + 23).
// If the grid size changes, update GRID_PX and CELL_PX below.
const GRID_PX = 414;
const CELL_PX = 46;
const CELL_HALF = 23;

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _gameState = null;
let _overlay = null;       // #coach-overlay
let _renderedStep = null;

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Mount the coach overlay.
 *
 * @param {HTMLElement} root - `document.body` (not used directly; module queries by ID)
 * @param {{ dispatch: function, getState: function, on: function }} gameState
 */
export function mount(root, gameState) {
  _gameState = gameState;
  _overlay = document.getElementById('coach-overlay');

  // Panel open/close events from coach.js bubble up to document.
  document.addEventListener('coach:panel-opened', (e) => {
    _showOverlay(e.detail.step);
  });
  document.addEventListener('coach:panel-closed', () => {
    _hideOverlay();
  });

  // Hide on session end — covers the case where no panel was ever opened.
  gameState.on('changed', ({ changed }) => {
    if (!changed.has('coachSession')) return;
    if (gameState.getState().coachSession === null) _hideOverlay();
  });
}

// ---------------------------------------------------------------------------
// Overlay show / hide
// ---------------------------------------------------------------------------

function _showOverlay(step) {
  if (step === _renderedStep) {
    _overlay.classList.add('visible');
    return;  // already rendered; just show
  }
  _renderedStep = step;

  const content = _overlay.querySelector('#coach-overlay-content');
  content.innerHTML = '';

  for (const arrow of step.arrows) {
    const el = _renderArrow(arrow);
    if (el) content.appendChild(el);
  }

  _overlay.classList.add('visible');
}

function _hideOverlay() {
  _overlay.classList.remove('visible');
  _renderedStep = null;
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Return the pixel center of cell index `i` within the 414×414 grid.
 *
 * @param {number} i - Cell index 0–80
 * @returns {{ x: number, y: number }}
 */
function _cellCenter(i) {
  const row = Math.floor(i / 9);
  const col = i % 9;
  return { x: col * CELL_PX + CELL_HALF, y: row * CELL_PX + CELL_HALF };
}

/**
 * Shorten a line segment by `startClear` px from `a` and `endClear` px from `b`.
 *
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} startClear - px to retreat from a toward b
 * @param {number} endClear   - px to retreat from b toward a
 * @returns {{ x: number, y: number, x: number, y: number }}
 */
function _shortenLine(a, b, startClear, endClear) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x: a.x + ux * startClear,
    y: a.y + uy * startClear,
    x2: b.x - ux * endClear,
    y2: b.y - uy * endClear,
  };
}

/**
 * Approximate start/end points for a quadratic bezier arc, stepped `startClear`
 * and `endClear` px along the tangent from each endpoint toward the control point.
 *
 * Linear tangent approximation: tangent at endpoint ≈ direction toward control.
 *
 * @param {{ x: number, y: number }} a - start
 * @param {{ x: number, y: number }} b - end
 * @param {number} cx - control x
 * @param {number} cy - control y
 * @param {number} startClear
 * @param {number} endClear
 */
function _shortenAlongCurve(a, b, cx, cy, startClear, endClear) {
  // Tangent at a ≈ direction from a toward control point.
  function stepAlong(p, toward, dist) {
    const dx = toward.x - p.x;
    const dy = toward.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
  }
  const ctrl = { x: cx, y: cy };
  const start = stepAlong(a, ctrl, startClear);
  const end = stepAlong(b, ctrl, endClear);
  return { startX: start.x, startY: start.y, endX: end.x, endY: end.y };
}

// ---------------------------------------------------------------------------
// Arrow rendering
// ---------------------------------------------------------------------------

/**
 * Render a single Arrow to an SVG element.
 *
 * @param {object} arrow - Arrow shape per aspec-coach-analyzer.md §3.2
 * @returns {SVGElement|null}
 */
function _renderArrow(arrow) {
  switch (arrow.style) {
    case 'straight-arrow': {
      const a = _cellCenter(arrow.from);
      const b = _cellCenter(arrow.to);
      const s = _shortenLine(a, b, 16, 20);
      return _line(s.x, s.y, s.x2, s.y2, {
        stroke: '#7c3aed', strokeOpacity: 0.6, strokeWidth: 1.5,
        markerEnd: 'url(#coach-arrowhead)',
      });
    }

    case 'dashed-arrow': {
      const a = _cellCenter(arrow.from);
      const b = _cellCenter(arrow.to);
      const s = _shortenLine(a, b, 18, 18);
      return _line(s.x, s.y, s.x2, s.y2, {
        stroke: '#7c3aed', strokeOpacity: 0.5, strokeWidth: 1.5,
        strokeDasharray: '4 3',
        markerEnd: 'url(#coach-arrowhead)',
      });
    }

    case 'bezier-arc': {
      const a = _cellCenter(arrow.from);
      const b = _cellCenter(arrow.to);
      const offY = arrow.controlOffsetY ?? -18;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2 + offY;
      const { startX, startY, endX, endY } = _shortenAlongCurve(a, b, cx, cy, 18, 18);
      const d = `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`;
      return _path(d, {
        stroke: '#7c3aed', strokeOpacity: 0.8, strokeWidth: 2, fill: 'none',
        markerEnd: 'url(#coach-arrowhead)',
      });
    }

    case 'connector-chain': {
      const centers = arrow.points.map(_cellCenter);
      const pts = centers.map(p => `${p.x},${p.y}`).join(' ');
      // Closed polyline — repeat first point.
      const first = centers[0];
      const closed = `${pts} ${first.x},${first.y}`;
      return _polyline(closed, {
        stroke: '#7c3aed', strokeOpacity: 0.5, strokeWidth: 1.5, fill: 'none',
      });
    }

    case 'chain-edge': {
      const a = _cellCenter(arrow.from);
      const b = _cellCenter(arrow.to);
      const s = _shortenLine(a, b, 16, 16);
      const strong = arrow.strong === true;
      return _line(s.x, s.y, s.x2, s.y2, {
        stroke: '#7c3aed',
        strokeOpacity: strong ? 0.7 : 0.5,
        strokeWidth: strong ? 2 : 1.5,
        strokeDasharray: strong ? null : '4 3',
        // No marker — chain edges have no arrowheads.
      });
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// SVG element factories
// ---------------------------------------------------------------------------

function _line(x1, y1, x2, y2, attrs) {
  const el = document.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', x1);
  el.setAttribute('y1', y1);
  el.setAttribute('x2', x2);
  el.setAttribute('y2', y2);
  _applyAttrs(el, attrs);
  return el;
}

function _path(d, attrs) {
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('d', d);
  _applyAttrs(el, attrs);
  return el;
}

function _polyline(points, attrs) {
  const el = document.createElementNS(SVG_NS, 'polyline');
  el.setAttribute('points', points);
  _applyAttrs(el, attrs);
  return el;
}

/**
 * Apply an attrs object to an SVG element, converting camelCase keys to
 * kebab-case and skipping null/undefined values.
 *
 * @param {SVGElement} el
 * @param {object} attrs
 */
function _applyAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    const dashed = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    el.setAttribute(dashed, v);
  }
}
