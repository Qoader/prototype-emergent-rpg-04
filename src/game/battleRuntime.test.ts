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

function fakeApplication(
  initialization: Promise<void>,
  renderFailure = false,
  destroyFailure = false
) {
  let destroyCount = 0;
  let renderCount = 0;
  let destroyArgs: unknown[] = [];
  let destroyed = false;
  const canvas = { remove: () => undefined };
  const app = {
    stage: new Container(),
    get canvas() {
      if (destroyed) throw new Error('canvas accessed after destroy');
      return canvas;
    },
    init: () => initialization,
    render: () => { renderCount += 1; if (renderFailure) throw new Error('render failed'); },
    destroy: (...args: unknown[]) => {
      destroyCount += 1;
      destroyArgs = args;
      destroyed = true;
      if (destroyFailure) throw new Error('destroy failed');
    }
  };
  return {
    app,
    canvas,
    get destroyCount() { return destroyCount; },
    get renderCount() { return renderCount; },
    get destroyArgs() { return destroyArgs; }
  };
}

function testHost() {
  let appendCount = 0;
  let removeCount = 0;
  const children: Array<{ parentNode?: unknown; remove: () => void }> = [];
  const value = {
    clientWidth: 320,
    clientHeight: 240,
    appendChild: (child: { parentNode?: unknown; remove: () => void }) => {
      appendCount += 1;
      child.parentNode = value;
      child.remove = () => {
        const index = children.indexOf(child);
        if (index >= 0) children.splice(index, 1);
        child.parentNode = null;
        removeCount += 1;
      };
      children.push(child);
      return child;
    },
    children
  } as unknown as HTMLElement;
  return {
    value,
    children,
    get appendCount() { return appendCount; },
    get removeCount() { return removeCount; }
  };
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

  it('reports artwork readiness once after the first successful composition', async () => {
    const gate = deferred();
    const ready: number[] = [];
    const fake = fakeApplication(gate.promise);
    const runtime = createBattleRuntime(testHost().value, { applicationFactory: () => fake.app as never, onReady: () => ready.push(fake.renderCount) });
    runtime.update(createBattle('goblin'));
    gate.resolve();
    await runtime.init;
    runtime.update(createBattle('goblin'));
    runtime.update(createBattle('goblin'));
    expect(ready).toEqual([1]);
    runtime.destroy();
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
    expect(fake.destroyArgs).toEqual([
      { removeView: true, releaseGlobalResources: false },
      { children: true }
    ]);
    expect(target.removeCount).toBe(1);
    expect(target.children).toHaveLength(0);
  });

  it('removes only its owned canvas and preserves unrelated host canvases', async () => {
    const gate = deferred();
    const fake = fakeApplication(gate.promise);
    const target = testHost();
    const unrelated = { remove: () => undefined };
    target.value.appendChild(unrelated as never);
    const runtime = createBattleRuntime(target.value, { applicationFactory: () => fake.app as never });
    gate.resolve();
    await runtime.init;
    runtime.destroy();
    expect(target.children).toEqual([unrelated]);
    expect(fake.destroyCount).toBe(1);
  });

  it('does not let a disposed late initializer remove a replacement runtime canvas', async () => {
    const oldGate = deferred();
    const newGate = deferred();
    const oldFake = fakeApplication(oldGate.promise);
    const newFake = fakeApplication(newGate.promise);
    const target = testHost();
    const oldRuntime = createBattleRuntime(target.value, { applicationFactory: () => oldFake.app as never });
    await Promise.resolve();
    oldRuntime.destroy();
    const newRuntime = createBattleRuntime(target.value, { applicationFactory: () => newFake.app as never });
    newGate.resolve();
    await newRuntime.init;
    oldGate.resolve();
    await oldRuntime.init;
    expect(target.children).toHaveLength(1);
    expect(newFake.destroyCount).toBe(0);
    newRuntime.destroy();
  });

  it('uses the saved canvas when application destruction fails', async () => {
    const gate = deferred();
    const errors: unknown[] = [];
    const fake = fakeApplication(gate.promise, false, true);
    const target = testHost();
    const runtime = createBattleRuntime(target.value, {
      applicationFactory: () => fake.app as never,
      onError: (error) => errors.push(error)
    });
    gate.resolve();
    await runtime.init;
    expect(() => runtime.destroy()).not.toThrow();
    expect(target.children).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('destroy failed');
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
    const target = testHost();
    const runtime = createBattleRuntime(target.value, {
      applicationFactory: () => fake.app as never,
      onError: (error) => { errors.push(error); throw new Error('diagnostics failed'); }
    });
    gate.resolve();
    await runtime.init;
    runtime.update(createBattle('goblin'));
    expect(fake.destroyCount).toBe(1);
    expect(target.children).toHaveLength(0);
    expect(() => { runtime.update(createBattle('goblin')); runtime.destroy(); runtime.destroy(); }).not.toThrow();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('render failed');
  });
});
