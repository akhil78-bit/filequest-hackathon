import { describe, expect, it, vi } from 'vitest';
import { ChaosEngine, freshRun, multiplier, stepRun } from '../../src/features/game/chaos/model';
import type { Entity, EntityKind, RunState } from '../../src/features/game/chaos/model';

const entity = (kind: EntityKind, lane = 1, z = .859): Entity => ({ id: 1, kind, lane, z, shifted: false, resolved: false });
const playing = (patch: Partial<RunState> = {}): RunState => ({ ...freshRun(), phase: 'playing', spawnIn: 1e9, ...patch });

describe('Chaos Run simulation', () => {
  it('steers smoothly between exactly three lanes and clamps edges', () => {
    const engine = new ChaosEngine(() => {}); engine.start('rush');
    engine.move(1); engine.advance(50);
    expect(engine.getSnapshot().lane).toBe(2); expect(engine.getSnapshot().x).toBeGreaterThan(1); expect(engine.getSnapshot().x).toBeLessThan(2);
    engine.advance(100); expect(engine.getSnapshot().x).toBe(2);
    engine.move(1); expect(engine.getSnapshot().lane).toBe(2);
    engine.select(-10); expect(engine.getSnapshot().lane).toBe(0);
    engine.move(-1); expect(engine.getSnapshot().lane).toBe(0);
    engine.move(7); expect(engine.getSnapshot().lane).toBe(0);
  });
  it('collects an energy entity exactly once and grants bounded real-work credit', () => {
    const first = stepRun(playing({ entities: [entity('orb')] }), 20);
    expect(first.state).toMatchObject({ orbs: 1, combo: 1, health: 3 });
    expect(first.state.score).toBeGreaterThanOrEqual(100);
    expect(first.milestones).toEqual([{ id: 1, kind: 'orb', files: 8 }]);
    expect(stepRun(first.state, 100).milestones).toEqual([]);
  });
  it('missing energy does not process a file or give pickup points', () => {
    const result = stepRun(playing({ x: 0, lane: 0, entities: [entity('orb', 2)] }), 20);
    expect(result.milestones).toHaveLength(0); expect(result.state.orbs).toBe(0); expect(result.state.score).toBeLessThan(1);
  });
  it('collisions damage health, reset combo and cannot repeatedly damage on the same object', () => {
    const result = stepRun(playing({ combo: 9, entities: [entity('barrier')] }), 20);
    expect(result.state).toMatchObject({ health: 2, combo: 0 });
    expect(stepRun(result.state, 100).state.health).toBe(2);
    expect(result.milestones).toHaveLength(0);
  });
  it('shield absorbs a collision and is consumed', () => {
    const result = stepRun(playing({ shield: 5000, entities: [entity('barrier')] }), 20);
    expect(result.state).toMatchObject({ health: 3, shield: 0 });
  });
  it.each(['shield', 'magnet', 'repair'] as const)('applies %s power-ups without inventing file progress', (kind) => {
    const result = stepRun(playing({ health: 2, entities: [entity(kind)] }), 20);
    if (kind === 'shield') expect(result.state.shield).toBe(10000);
    if (kind === 'magnet') expect(result.state.magnet).toBe(7000);
    if (kind === 'repair') expect(result.state.health).toBe(3);
    expect(result.milestones).toHaveLength(0);
  });
  it('a magnet collects energy from another lane', () => {
    const result = stepRun(playing({ magnet: 1000, entities: [entity('orb', 2)] }), 20);
    expect(result.state.orbs).toBe(1); expect(result.milestones[0]?.files).toBe(8);
  });
  it('moving hazards shift once at their telegraphed midpoint', () => {
    const result = stepRun(playing({ entities: [entity('sweeper', 0, .459)] }), 20);
    expect(result.state.entities[0]).toMatchObject({ lane: 1, shifted: true });
    expect(stepRun(result.state, 20).state.entities[0]?.lane).toBe(1);
    expect(stepRun(playing({ entities: [entity('sweeper', 2, .459)] }), 20).state.entities[0]?.lane).toBe(1);
  });
  it('zero health enters game-over, never becomes negative and does not trigger later pickups', () => {
    const result = stepRun(playing({ health: 1, entities: [entity('barrier'), { ...entity('orb'), id: 2 }] }), 100);
    expect(result.state).toMatchObject({ phase: 'gameover', health: 0, orbs: 0 }); expect(result.milestones).toHaveLength(0);
    expect(stepRun(result.state, 100).state).toBe(result.state);
  });
  it('surviving waves and distance milestones earn credit only while actually playing', () => {
    const result = stepRun(playing({ elapsed: 9990, distance: 399.9 }), 20);
    expect(result.milestones.map((event) => [event.kind, event.files])).toEqual([['wave', 16], ['distance', 24]]);
    expect(result.milestones.map((event) => event.id)).toEqual([1, 2]);
    expect(stepRun({ ...result.state, phase: 'paused' }, 1000).milestones).toEqual([]);
  });
  it('a collision later in a frame does not erase an already survived wave', () => {
    const result = stepRun(playing({ health: 1, elapsed: 9990, entities: [entity('barrier', 1, .85)] }), 100);
    expect(result.state.phase).toBe('gameover');
    expect(result.milestones).toEqual([{ id: 1, kind: 'wave', files: 16 }]);
  });
  it('raises speed over time, bounds entities/particles, and keeps a deterministic world', () => {
    let first = playing({ invulnerable: 1e9 }), second = playing({ invulnerable: 1e9 });
    for (let index = 0; index < 60; index++) {
      first = stepRun(first, 1000).state; second = stepRun(second, 1000).state;
      expect(first.entities.length).toBeLessThanOrEqual(42); expect(first.sparks.length).toBeLessThanOrEqual(60);
    }
    expect(first).toEqual(second); expect(first.speed).toBeGreaterThan(2); expect(first.speed).toBeLessThanOrEqual(2.5);
  });
  it('preserves its input snapshot', () => {
    const source = playing({ entities: [entity('orb')] }), before = structuredClone(source);
    stepRun(source, 100); expect(source).toEqual(before);
  });
  it('pause freezes distance, health, power-ups and work milestones', () => {
    const callback = vi.fn(), engine = new ChaosEngine(callback); engine.start('rush'); engine.advance(100); engine.pause();
    const paused = engine.getSnapshot(); engine.advance(100); engine.move(1);
    expect(engine.getSnapshot()).toBe(paused); expect(callback).not.toHaveBeenCalled();
    engine.resume(); engine.advance(100); expect(engine.getSnapshot().elapsed).toBeGreaterThan(paused.elapsed);
  });
  it('calm mode advances only on explicit steps and allows instant untimed lane choice', () => {
    const engine = new ChaosEngine(() => {}); engine.start('calm'); engine.advance(1e9);
    expect(engine.getSnapshot().elapsed).toBe(0);
    engine.select(2); expect(engine.getSnapshot().x).toBe(2);
    engine.step(); expect(engine.getSnapshot().elapsed).toBe(350);
    engine.pause(); engine.step(); expect(engine.getSnapshot().elapsed).toBe(350);
  });
  it('restarting resets run stats but keeps event IDs unique for the same archive', () => {
    const events: number[] = [], engine = new ChaosEngine((event) => events.push(event.id)); engine.start('rush');
    for (let index = 0; index < 2000 && engine.getSnapshot().phase === 'playing'; index++) engine.advance(100);
    expect(engine.getSnapshot().phase).toBe('gameover'); expect(events.length).toBeGreaterThan(0);
    const serial = engine.getSnapshot().eventSerial;
    engine.start('calm'); expect(engine.getSnapshot()).toMatchObject({ health: 3, score: 0, elapsed: 0, eventSerial: serial });
    engine.reset(); expect(engine.getSnapshot().eventSerial).toBe(serial);
    engine.reset(true); expect(engine.getSnapshot().eventSerial).toBe(0);
  });
  it.each(['finishing', 'victory', 'error', 'cancelled'] as const)('%s halts simulation and new work events', (phase) => {
    const callback = vi.fn(), engine = new ChaosEngine(callback); engine.start('rush'); engine.stop(phase, 'Stopped');
    const snapshot = engine.getSnapshot(); engine.advance(100); expect(engine.getSnapshot()).toBe(snapshot); expect(callback).not.toHaveBeenCalled();
  });
  it('bounds combo multipliers', () => { expect(multiplier(0)).toBe(1); expect(multiplier(4)).toBe(2); expect(multiplier(10000)).toBe(5); });
  it('bonus runs award points without claiming or requesting further file work', () => {
    const result = stepRun(playing({ bonus: true, elapsed: 9990, entities: [entity('orb')] }), 20);
    expect(result.state.orbs).toBe(1); expect(result.state.score).toBeGreaterThan(100);
    expect(result.milestones).toHaveLength(0); expect(result.state.feedback).toContain('ZIP already complete');
  });
});
