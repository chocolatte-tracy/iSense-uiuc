import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardViewport, standaloneViewport } from './viewport-layout';

test('closed-keyboard standalone-sized layout never reserves a short visual viewport', () => {
  assert.equal(keyboardViewport({ layoutHeight: 852, visualHeight: 768, offsetTop: 20, editing: false }), null);
  assert.equal(keyboardViewport({ layoutHeight: 852, visualHeight: 572, editing: false }), null);
});
test('browser toolbar height is already owned by CSS dvh, not an added spacer', () => {
  assert.equal(keyboardViewport({ layoutHeight: 759, visualHeight: 759, editing: true }), null);
  assert.equal(keyboardViewport({ layoutHeight: 852, visualHeight: 780, editing: true }), null);
});
test('focused keyboard has a bounded visual height and offset', () => {
  assert.deepEqual(keyboardViewport({ layoutHeight: 852, visualHeight: 542, offsetTop: 12, editing: true }), { height: 542, top: 12 });
  assert.deepEqual(keyboardViewport({ layoutHeight: 852, visualHeight: 542, offsetTop: -12, editing: true }), { height: 542, top: 0 });
});
test('blur clears keyboard height immediately even before visual viewport recovers', () => {
  const metrics = { layoutHeight: 852, visualHeight: 542, offsetTop: 12 };
  assert.ok(keyboardViewport({ ...metrics, editing: true }));
  assert.equal(keyboardViewport({ ...metrics, editing: false }), null);
  assert.equal(keyboardViewport({ ...metrics, visualHeight: 852, editing: true }), null);
});
test('orientation/background recovery uses current geometry, not a remembered maximum', () => {
  assert.equal(keyboardViewport({ layoutHeight: 393, visualHeight: 393, editing: true }), null);
  assert.equal(keyboardViewport({ layoutHeight: 852, visualHeight: 852, editing: true }), null);
});
test('pinch zoom and unavailable/invalid visual viewport do not shrink the app', () => {
  assert.equal(keyboardViewport({ layoutHeight: 852, visualHeight: 542, scale: 1.5, editing: true }), null);
  for (const visualHeight of [undefined, NaN, Infinity, -1, 0]) {
    assert.equal(keyboardViewport({ layoutHeight: 852, visualHeight, editing: true }), null);
  }
});

test('standalone uses a larger measured viewport only when its bottom is interactive', () => {
  assert.deepEqual(standaloneViewport({ dynamicHeight: 793, candidateHeight: 852, candidateReachable: true }),
    { height: 852, policy: 'standalone-expanded' });
});
test('a status-bar-sized gap cannot authorize putting navigation outside the WebView', () => {
  assert.deepEqual(standaloneViewport({ dynamicHeight: 793, candidateHeight: 852, candidateReachable: false }),
    { height: 793, policy: 'standalone-platform-limited' });
});
test('no remembered phone height is reused after landscape rotation', () => {
  assert.deepEqual(standaloneViewport({ dynamicHeight: 393, candidateHeight: 393, candidateReachable: true }),
    { height: 393, policy: 'standalone-dynamic' });
});
test('unsupported and smaller large-viewport measurements preserve the dynamic viewport', () => {
  for (const candidateHeight of [0, 759, NaN, Infinity]) {
    assert.deepEqual(standaloneViewport({ dynamicHeight: 793, candidateHeight, candidateReachable: false }),
      { height: 793, policy: 'standalone-dynamic' });
  }
});
