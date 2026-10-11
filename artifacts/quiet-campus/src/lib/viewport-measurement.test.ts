import assert from 'node:assert/strict';
import test from 'node:test';
import { canReachViewportBottom } from './viewport-measurement';

function withHitTestViewport(availableHeight: number, run: (removed: () => boolean) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let removed = false;
  const probe = {
    style: {} as Record<string, string>,
    setAttribute() {},
    getBoundingClientRect() { return { left: 196.5, top: parseFloat(this.style.top) }; },
    remove() { removed = true; },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => probe,
    body: { append() {} },
    // Model the browser rounding a half-pixel sample to the excluded edge.
    elementFromPoint: (_x: number, y: number) => Math.round(y) < availableHeight ? probe : null,
  } });
  try { run(() => removed); } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as { document?: Document }).document;
  }
}

test('reachable last CSS pixel is not rejected by half-pixel rounding at the viewport edge', () => {
  withHitTestViewport(852, removed => {
    assert.equal(canReachViewportBottom(852), true);
    assert.equal(removed(), true);
  });
});

test('an oversized CSS box cannot pass the native WebView boundary', () => {
  withHitTestViewport(793, removed => {
    assert.equal(canReachViewportBottom(852), false);
    assert.equal(removed(), true);
  });
});
