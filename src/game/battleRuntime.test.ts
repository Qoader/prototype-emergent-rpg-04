import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createBattle } from './battle/engine';
import { createBattleRuntime } from './battleRuntime';

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void };
const deferred = (): Deferred => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function fakeApplication(initialization: Promise<void>, renderFailure = false) {
  let destroyCount = 0;
  let renderCount = 0;
  const app = {
    stage: new Container(),
    canvas: {},
    init: () => initialization,
    render: () => { renderCount += 1; if (renderFailure) throw new Error('render failed'); },
    destroy: () => { destroyCount += 1; }
  };
  return { app, get destroyCount() { return destroyCount; }, get renderCount() { return renderCount; } };
}

function testHost() {
  let appendCount = 0;
  const value = { clientWidth: 320, clientHeight: 240, appendChild: () => { appendCount += 1; } } as unknown as HTMLElement;
  return { value, get appendCount() { return appendCount; } };
}

describe('battle runtime asynchronous ownership', () => {
  it('defers destruction until pending initialization resolves and never attaches its canvas', async () => {
    const gate = deferred();
    const fake = fakeApplication(gate.promise);
    const target = testHost();
    const runtime = createBattleRuntime(target.value, { applicationFactory: () => fake.app as never });
    await Promise.resolve();
    runtime.destroy(); runtime.destroy();
    expect(fake.destroyCount).toBe(0);
    gate.resolve();
    await runtime.init;
    expect(fake.destroyCount).toBe(1);
    expect(target.appendCount).toBe(0);
  });

  it('buffers the newest state and renders it once after initialization', async () => {
    const gate = deferred();
    const fake = fakeApplication(gate.promise);
    const runtime = createBattleRuntime(testHost().value, { applicationFactory: () => fake.app as never });
    const first = createBattle('goblin');
    const latest = { ...first, turn: 2 };
    runtime.update(first); runtime.update(latest);
    gate.resolve();
    await runtime.init;
    expect(fake.renderCount).toBe(1);
    runtime.destroy(); runtime.update(first);
    expect(fake.renderCount).toBe(1);
  });

  it('destroys a ready application exactly once when cleanup repeats', async () => {
    const gate = deferred();
    const fake = fakeApplication(gate.promise);
    const target = testHost();
    const runtime = createBattleRuntime(target.value, { applicationFactory: () => fake.app as never });
    gate.resolve();
    await runtime.init;
    expect(target.appendCount).toBe(1);
    runtime.destroy(); runtime.destroy(); runtime.destroy();
    expect(fake.destroyCount).toBe(1);
  });

  it('handles initialization rejection as a nonfatal, observed error', async () => {
    const error = new Error('renderer unavailable');
    const gate = deferred();
    const errors: unknown[] = [];
    const fake = fakeApplication(gate.promise);
    const runtime = createBattleRuntime(testHost().value, { applicationFactory: () => fake.app as never, onError: (value) => errors.push(value) });
    gate.reject(error);
    await runtime.init;
    runtime.destroy();
    expect(errors).toEqual([error]);
    expect(fake.destroyCount).toBe(0);
  });

  it('does not report a rejected initialization after the runtime is disposed', async () => {
    const gate = deferred();
    const errors: unknown[] = [];
    const fake = fakeApplication(gate.promise);
    const runtime = createBattleRuntime(testHost().value, { applicationFactory: () => fake.app as never, onError: (value) => errors.push(value) });
    await Promise.resolve();
    runtime.destroy();
    gate.reject(new Error('late renderer rejection'));
    await runtime.init;
    expect(errors).toEqual([]);
  });

  it('reports a render failure once and remains safe to update or destroy', async () => {
    const gate = deferred();
    const errors: unknown[] = [];
    const fake = fakeApplication(gate.promise, true);
    const runtime = createBattleRuntime(testHost().value, { applicationFactory: () => fake.app as never, onError: (value) => errors.push(value) });
    gate.resolve();
    await runtime.init;
    runtime.update(createBattle('goblin'));
    expect(errors).toHaveLength(1);
    expect(fake.destroyCount).toBe(1);
    expect(() => { runtime.update(createBattle('goblin')); runtime.destroy(); runtime.destroy(); }).not.toThrow();
    expect(errors).toHaveLength(1);
  });
});
