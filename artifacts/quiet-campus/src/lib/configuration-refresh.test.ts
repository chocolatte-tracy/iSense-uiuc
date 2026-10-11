import test from 'node:test';
import assert from 'node:assert/strict';
import { watchConfiguration } from './configuration-refresh';

class Visibility extends EventTarget {
  visibilityState = 'visible';
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('app config refreshes on resume, focus and reconnect, including enabling and disabling Places', async () => {
  const sources = { window: new EventTarget(), document: new Visibility() };
  let placesEnabled = false;
  let calls = 0;
  const received: boolean[] = [];
  const stop = watchConfiguration(sources, async () => {
    calls++;
    return { placesEnabled };
  }, config => received.push(config.placesEnabled), () => assert.fail('unexpected config error'));
  await tick();
  placesEnabled = true;
  sources.window.dispatchEvent(new Event('focus'));
  await tick();
  sources.window.dispatchEvent(new Event('online'));
  await tick();
  sources.window.dispatchEvent(new Event('pageshow'));
  await tick();
  placesEnabled = false;
  sources.document.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.deepEqual(received, [false, true, true, true, false]);
  assert.equal(calls, 5);
  stop();
  sources.window.dispatchEvent(new Event('focus'));
  await tick();
  assert.equal(calls, 5);
});

test('config refresh ignores hidden pages, coalesces concurrent events and cancels on unmount', async () => {
  const sources = { window: new EventTarget(), document: new Visibility() };
  sources.document.visibilityState = 'hidden';
  let calls = 0;
  let signal: AbortSignal | undefined;
  let finish: ((value: boolean) => void) | undefined;
  let applied = 0;
  const stop = watchConfiguration(sources, receivedSignal => {
    calls++;
    signal = receivedSignal;
    return new Promise<boolean>(resolve => { finish = resolve; });
  }, () => applied++, () => assert.fail('aborted config must not report an error'));
  assert.equal(calls, 0);
  sources.document.visibilityState = 'visible';
  sources.document.dispatchEvent(new Event('visibilitychange'));
  sources.window.dispatchEvent(new Event('focus'));
  sources.window.dispatchEvent(new Event('online'));
  assert.equal(calls, 1);
  stop();
  assert.equal(signal?.aborted, true);
  finish?.(true);
  await tick();
  assert.equal(applied, 0);
});

test('configuration errors are disclosed and a later reconnect can recover', async () => {
  const sources = { window: new EventTarget(), document: new Visibility() };
  let failing = true;
  let failures = 0;
  let successes = 0;
  const stop = watchConfiguration(sources, async () => {
    if (failing) throw new Error('offline fixture');
    return true;
  }, () => successes++, () => failures++);
  await tick();
  assert.equal(failures, 1);
  failing = false;
  sources.window.dispatchEvent(new Event('online'));
  await tick();
  assert.equal(successes, 1);
  stop();
});
