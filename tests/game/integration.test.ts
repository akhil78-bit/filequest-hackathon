import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { FileRushEngine } from '../../src/features/game/engine';
import { PacketRequest } from '../../src/features/organizer/packet-request';
import { createDemoZip } from '../../src/features/organizer/demo-zip';
import { createWorkerHandler } from '../../src/features/organizer/worker-handler';
import type { Manifest, WorkerRequest, WorkerResponse } from '../../src/features/organizer/protocol';
import { fixtureZip, text } from '../organizer/fixtures';

async function setup(input = createDemoZip()) {
  const packets = new PacketRequest();
  const sent: WorkerRequest[] = [], received: WorkerResponse[] = [];
  let manifest!: Manifest;
  const handle = createWorkerHandler((message) => {
    received.push(message);
    if ('manifest' in message && message.manifest) manifest = message.manifest;
    if (message.type === 'ERROR') packets.abort(message.message);
    if (message.type === 'CANCEL') packets.abort('Cancelled');
    packets.receive(message);
  });
  const request = (id: number, actionId: string) => packets.request('game', id, actionId, manifest, (message) => { sent.push(message); void handle(message); });
  const engine = new FileRushEngine(request);
  await handle({ type: 'INIT', jobId: 'game', buffer: input.buffer });
  return { engine, packets, request, sent, received, handle, manifest: () => manifest };
}
function selectCorrect(engine: FileRushEngine) {
  engine.select(engine.getSnapshot().gates.indexOf(engine.getSnapshot().packet!.category!));
}

describe('game action → worker ACK → verified ZIP', () => {
  it('organizes the actual demo only through correct routes and preserves every file byte', async () => {
    const input = createDemoZip(), original = unzipSync(input), game = await setup(input);
    game.engine.start(game.manifest().entries, 'calm');
    expect(game.manifest().progress.processed).toBe(0);
    game.engine.select(game.engine.getSnapshot().gates.findIndex((gate) => gate !== game.engine.getSnapshot().packet!.category));
    await game.engine.route(); expect(game.sent).toHaveLength(0);
    for (let index = 0; index < 20; index++) {
      selectCorrect(game.engine);
      const pending = game.engine.route();
      expect(game.engine.getSnapshot().confirmed).toBe(index);
      await game.engine.route(); // A repeated click while waiting must not issue more work.
      await pending;
      expect(game.engine.getSnapshot().confirmed).toBe(index + 1);
      expect(game.manifest().progress.processed).toBe(index + 1);
      expect(game.sent).toHaveLength(index + 1);
    }
    for (const message of game.sent) expect(message).toMatchObject({ type: 'REQUEST_BATCH', maxFiles: 1 });
    const complete = game.received.find((message) => message.type === 'COMPLETE');
    if (complete?.type !== 'COMPLETE') throw new Error('Missing verified ZIP');
    const output = unzipSync(new Uint8Array(complete.buffer));
    expect(Object.keys(output)).toHaveLength(21);
    for (const entry of complete.manifest.entries) expect(output[entry.outputPath!]).toEqual(original[entry.originalPath]);
    expect(JSON.parse(strFromU8(output['filequest-manifest.json']!))).toEqual(complete.manifest);
  });

  it('ignores PROGRESS and stale/wrong ACKs until the requested entry is acknowledged', async () => {
    const game = await setup(), first = game.manifest().entries[0]!;
    const sent: WorkerRequest[] = [];
    const packets = new PacketRequest();
    let resolved = false;
    const pending = packets.request('a', first.id, 'one', game.manifest(), (message) => sent.push(message)).then(() => { resolved = true; });
    expect(packets.request('a', first.id, 'one', game.manifest(), (message) => sent.push(message))).toBeDefined();
    expect(sent).toHaveLength(1);
    packets.receive({ type: 'PROGRESS', jobId: 'a', progress: { ...game.manifest().progress, processed: 1 } });
    const manifest = { ...game.manifest(), entries: game.manifest().entries.map((entry) => entry.id === first.id ? { ...entry, status: 'processed' as const } : entry) };
    packets.receive({ type: 'BATCH_RESULT', jobId: 'stale', requestId: 'game-one', manifest, entryIds: [first.id] });
    packets.receive({ type: 'BATCH_RESULT', jobId: 'a', requestId: 'wrong', manifest, entryIds: [first.id] });
    await Promise.resolve(); expect(resolved).toBe(false);
    packets.receive({ type: 'BATCH_RESULT', jobId: 'a', requestId: 'game-one', manifest, entryIds: [first.id] });
    await pending; expect(resolved).toBe(true);
  });

  it('rejects stale packets and parallel requests rather than copying unrelated entries', async () => {
    const game = await setup(), first = game.manifest().entries[0]!;
    const firstPromise = game.request(first.id, 'one');
    await expect(game.request(first.id + 1, 'two')).rejects.toThrow('current packet');
    await firstPromise;
    await expect(game.request(first.id, 'replayed')).rejects.toThrow('no longer next');
    expect(game.sent).toHaveLength(1);
  });
  it('a mismatched worker batch cannot confirm a game packet', async () => {
    const game = await setup(), packets = new PacketRequest(), first = game.manifest().entries[0]!;
    const pending = packets.request('a', first.id, 'one', game.manifest(), () => {});
    const rejected = expect(pending).rejects.toThrow('expected file');
    packets.receive({ type: 'BATCH_RESULT', jobId: 'a', requestId: 'game-one', entryIds: [first.id + 1], manifest: game.manifest() });
    await rejected;
    expect(packets.active).toBe(false);
  });

  it('a corrupt real file cannot award points or produce a partial download', async () => {
    const game = await setup(fixtureZip([{ path: 'bad.txt', data: text('bad data'), checksum: 1 }]));
    game.engine.start(game.manifest().entries, 'calm'); selectCorrect(game.engine); await game.engine.route();
    expect(game.engine.getSnapshot()).toMatchObject({ phase: 'error', score: 0, confirmed: 0 });
    expect(game.manifest().progress).toMatchObject({ processed: 0, failed: 1 });
    expect(game.received.some((message) => message.type === 'COMPLETE')).toBe(false);
  });

  it('cancellation during a route invalidates scoring and suppresses export', async () => {
    const game = await setup(); game.engine.start(game.manifest().entries, 'rush'); selectCorrect(game.engine);
    const pending = game.engine.route();
    game.engine.stop('cancelled', 'Cancelled'); game.packets.abort('Cancelled');
    await game.handle({ type: 'CANCEL', jobId: 'game' }); await pending;
    expect(game.engine.getSnapshot()).toMatchObject({ phase: 'cancelled', score: 0, confirmed: 0 });
    expect(game.received.some((message) => message.type === 'COMPLETE')).toBe(false);
  });

  it('explicit finish sorting completes remaining files without manufacturing game points', async () => {
    const input = createDemoZip(), original = unzipSync(input), game = await setup(input);
    game.engine.start(game.manifest().entries, 'calm'); selectCorrect(game.engine); await game.engine.route();
    const score = game.engine.getSnapshot().score;
    game.engine.stop('finishing', 'Finish without playing');
    await game.handle({ type: 'REQUEST_BATCH', jobId: 'game', requestId: 'manual-finish', maxFiles: 50 });
    expect(game.engine.getSnapshot()).toMatchObject({ score, confirmed: 1, phase: 'finishing' });
    const complete = game.received.find((message) => message.type === 'COMPLETE');
    if (complete?.type !== 'COMPLETE') throw new Error('Expected complete export');
    const output = unzipSync(new Uint8Array(complete.buffer));
    for (const entry of complete.manifest.entries) expect(output[entry.outputPath!]).toEqual(original[entry.originalPath]);
  });
});
