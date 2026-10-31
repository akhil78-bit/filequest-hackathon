import { describe, expect, it, vi } from 'vitest';
import { FileRushEngine, gatesFor } from '../../src/features/game/engine';
import type { ManifestEntry } from '../../src/features/organizer/protocol';
import type { PacketReceipt } from '../../src/features/organizer/packet-request';
import { CATEGORIES } from '../../src/features/organizer/classify';

export function sampleEntry(id = 0): ManifestEntry {
  return { id, originalPath: `folder/note-${id}.txt`, outputPath: `Documents/note-${id}.txt`,
    category: 'Documents', status: 'pending', bytes: 4, crc32: '00000000', reason: '.txt extension → Documents' };
}
const ack = (entry: ManifestEntry): PacketReceipt => ({ requestId: `game-route-${entry.id}`, entry: { ...entry, status: 'processed' } });
function correct(engine: FileRushEngine) { engine.select(engine.getSnapshot().gates.indexOf(engine.getSnapshot().packet!.category!)); }
function deferred() {
  let resolve!: (receipt: PacketReceipt) => void, reject!: (error: Error) => void;
  const promise = new Promise<PacketReceipt>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('File Rush mechanics', () => {
  it('builds four distinct deterministic gates including the actual category', () => {
    for (let id = 0; id < 30; id++) {
      const gates = gatesFor(sampleEntry(id));
      expect(new Set(gates).size).toBe(4); expect(gates).toContain('Documents');
      expect(gates).toEqual(gatesFor(sampleEntry(id)));
    }
  });
  it.each(CATEGORIES)('always offers a gate for the actual %s category', (category) => {
    expect(gatesFor({ ...sampleEntry(), category })).toContain(category);
  });
  it('empty inventories wait for export confirmation instead of inventing packets or points', () => {
    const request = vi.fn(), engine = new FileRushEngine(request);
    engine.start([], 'calm');
    expect(engine.getSnapshot()).toMatchObject({ phase: 'finishing', score: 0, confirmed: 0, packet: null });
    expect(request).not.toHaveBeenCalled();
  });
  it('starts in tutorial, filters skipped entries and wraps keyboard steering', () => {
    const request = vi.fn(); const engine = new FileRushEngine(request);
    expect(engine.getSnapshot().phase).toBe('tutorial');
    engine.start([{ ...sampleEntry(9), status: 'skipped' }, sampleEntry()], 'rush');
    expect(engine.getSnapshot().packet?.id).toBe(0);
    engine.select(0); engine.move(-1); expect(engine.getSnapshot().lane).toBe(3);
    engine.move(1); expect(engine.getSnapshot().lane).toBe(0);
    engine.select(99); expect(engine.getSnapshot().lane).toBe(0);
    expect(request).not.toHaveBeenCalled();
  });
  it('wrong gates and timeouts never request file processing', async () => {
    const request = vi.fn(); const engine = new FileRushEngine(request);
    engine.start([sampleEntry()], 'rush');
    engine.select(engine.getSnapshot().gates.findIndex((gate) => gate !== 'Documents'));
    await engine.route();
    expect(engine.getSnapshot()).toMatchObject({ lives: 2, score: 0, combo: 0, confirmed: 0 });
    engine.tick(9000); expect(engine.getSnapshot().lives).toBe(1);
    engine.tick(9000); expect(engine.getSnapshot().phase).toBe('lost');
    await engine.route(); expect(request).not.toHaveBeenCalled();
    expect(engine.getSnapshot().packet?.id).toBe(0);
  });
  it('score and combo are granted only after an actual receipt; repeated inputs cannot duplicate a request', async () => {
    const waiting = deferred(), request = vi.fn(() => waiting.promise), entry = sampleEntry();
    const engine = new FileRushEngine(request); engine.start([entry, sampleEntry(1)], 'rush'); correct(engine);
    const pending = engine.route();
    await engine.route(); await engine.route(); engine.tick(100000);
    expect(request).toHaveBeenCalledExactlyOnceWith(0, 'route-0');
    expect(engine.getSnapshot()).toMatchObject({ phase: 'waiting', score: 0, combo: 0, confirmed: 0, lives: 3, elapsed: 0 });
    waiting.resolve(ack(entry)); await pending;
    expect(engine.getSnapshot()).toMatchObject({ phase: 'playing', confirmed: 1, score: 200, combo: 1 });
    expect(engine.getSnapshot().packet?.id).toBe(1);
  });
  it('worker latency cannot drain time, lives or speed bonus', async () => {
    const waiting = deferred(), engine = new FileRushEngine(() => waiting.promise), entry = sampleEntry();
    engine.start([entry], 'rush'); engine.tick(2000); correct(engine);
    const pending = engine.route(); engine.tick(600000);
    expect(engine.getSnapshot().elapsed).toBe(2000);
    waiting.resolve(ack(entry)); await pending;
    expect(engine.getSnapshot()).toMatchObject({ score: 175, lives: 3, phase: 'finishing' });
  });
  it('calm mode has no timeout or speed-dependent reward', async () => {
    const engine = new FileRushEngine(async () => ack(sampleEntry()));
    engine.start([sampleEntry()], 'calm'); engine.tick(1e9);
    expect(engine.getSnapshot()).toMatchObject({ elapsed: 0, lives: 3, phase: 'playing' });
    correct(engine); await engine.route(); expect(engine.getSnapshot().score).toBe(100);
  });
  it('pause/resume freezes time and ignores routing while paused', async () => {
    const request = vi.fn(); const engine = new FileRushEngine(request);
    engine.start([sampleEntry()], 'rush'); engine.tick(1000); engine.pause(); engine.tick(100000); await engine.route();
    expect(engine.getSnapshot()).toMatchObject({ phase: 'paused', elapsed: 1000 }); expect(request).not.toHaveBeenCalled();
    engine.resume(); engine.tick(500); expect(engine.getSnapshot().elapsed).toBe(1500);
  });
  it('pause during a slow copy takes effect after confirmation without losing the ACK', async () => {
    const waiting = deferred(), engine = new FileRushEngine(() => waiting.promise), entry = sampleEntry();
    engine.start([entry, sampleEntry(1)], 'rush'); correct(engine);
    const pending = engine.route(); engine.pause(); waiting.resolve(ack(entry)); await pending;
    expect(engine.getSnapshot()).toMatchObject({ phase: 'paused', confirmed: 1, pauseRequested: true });
    engine.resume(); expect(engine.getSnapshot().phase).toBe('playing');
  });
  it('increments combos after ACK and resets them on a mistake', async () => {
    const engine = new FileRushEngine(async (id) => ack(sampleEntry(id)));
    engine.start([sampleEntry(), sampleEntry(1), sampleEntry(2)], 'calm');
    correct(engine); await engine.route(); correct(engine); await engine.route();
    expect(engine.getSnapshot()).toMatchObject({ score: 225, combo: 2, bestCombo: 2, confirmed: 2 });
    engine.select(engine.getSnapshot().gates.findIndex((gate) => gate !== 'Documents')); await engine.route();
    expect(engine.getSnapshot()).toMatchObject({ combo: 0, bestCombo: 2, score: 225 });
  });
  it.each(['cancelled', 'finishing', 'error'] as const)('late ACK cannot award score after %s', async (phase) => {
    const waiting = deferred(), engine = new FileRushEngine(() => waiting.promise), entry = sampleEntry();
    engine.start([entry], 'rush'); correct(engine);
    const pending = engine.route(); engine.stop(phase, 'Stopped.'); waiting.resolve(ack(entry)); await pending;
    expect(engine.getSnapshot()).toMatchObject({ phase, score: 0, confirmed: 0 });
  });
  it('archive replacement invalidates an in-flight receipt', async () => {
    const waiting = deferred(), engine = new FileRushEngine(() => waiting.promise);
    engine.start([sampleEntry()], 'rush'); correct(engine);
    const pending = engine.route(); engine.reset(); waiting.resolve(ack(sampleEntry())); await pending;
    expect(engine.getSnapshot()).toMatchObject({ phase: 'tutorial', score: 0, confirmed: 0, packet: null });
  });
  it.each(['rejected', 'wrong receipt'] as const)('does not score a %s copy', async (kind) => {
    const engine = new FileRushEngine(async () => {
      if (kind === 'rejected') throw new Error('CRC mismatch');
      return ack(sampleEntry(99));
    });
    engine.start([sampleEntry()], 'calm'); correct(engine); await engine.route();
    expect(engine.getSnapshot()).toMatchObject({ phase: 'error', score: 0, confirmed: 0 });
  });
  it('retries lost games using pending files without resetting previously confirmed score', async () => {
    const engine = new FileRushEngine(async (id) => ack(sampleEntry(id)));
    engine.start([sampleEntry(), sampleEntry(1)], 'rush'); correct(engine); await engine.route();
    for (let index = 0; index < 3; index++) engine.tick(10000);
    const score = engine.getSnapshot().score;
    engine.start([ack(sampleEntry()).entry, sampleEntry(1)], 'calm');
    expect(engine.getSnapshot()).toMatchObject({ phase: 'playing', lives: 3, score, confirmed: 1 });
    expect(engine.getSnapshot().packet?.id).toBe(1);
  });
});
