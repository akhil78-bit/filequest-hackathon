import { setTimeout as yieldToWorker } from 'node:timers/promises';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createChaosDemo } from '../../src/features/game/chaos/demo';
import { ChaosEngine, hazardDestination } from '../../src/features/game/chaos/model';
import { WorkScheduler } from '../../src/features/game/chaos/work-scheduler';
import { EarnedBatch } from '../../src/features/organizer/earned-batch';
import { createWorkerHandler } from '../../src/features/organizer/worker-handler';
import type { Manifest, WorkerRequest, WorkerResponse } from '../../src/features/organizer/protocol';
import { fixtureZip, text } from '../organizer/fixtures';

async function setup(input: Uint8Array<ArrayBuffer>) {
  const adapter = new EarnedBatch(), sent: WorkerRequest[] = [], messages: WorkerResponse[] = [];
  let manifest!: Manifest, active = 0, peak = 0;
  const handle = createWorkerHandler((message) => {
    messages.push(message);
    if ('manifest' in message && message.manifest) manifest = message.manifest;
    if (message.type === 'BATCH_RESULT' || message.type === 'ERROR') active = Math.max(0, active - 1);
    adapter.receive(message);
    if (message.type === 'ERROR') adapter.abort(message.message);
  });
  const work = new WorkScheduler((count, eventId) => adapter.request('chaos', eventId, count, manifest, (request) => {
    sent.push(request); peak = Math.max(peak, ++active); void handle(request);
  }));
  const engine = new ChaosEngine((event) => work.grant(event.id, event.files));
  engine.subscribe(() => { if (engine.getSnapshot().phase === 'playing') work.resume(); else work.pause(); });
  await handle({ type: 'INIT', jobId: 'chaos', buffer: input.buffer });
  return { adapter, handle, work, engine, sent, messages, manifest: () => manifest, peak: () => peak };
}

function steer(engine: ChaosEngine) {
  const state = engine.getSnapshot();
  const blocked = new Set(state.entities.filter((entity) => !entity.resolved && ['barrier', 'sweeper'].includes(entity.kind) && entity.z > .53 && entity.z < .87)
    .map((entity) => entity.kind === 'sweeper' && !entity.shifted ? hazardDestination(entity.lane) : entity.lane));
  const orb = [...state.entities].filter((entity) => !entity.resolved && entity.kind === 'orb' && entity.z > .4 && entity.z < .86).sort((a, b) => b.z - a.z)[0];
  const lane = orb && !blocked.has(orb.lane) ? orb.lane : !blocked.has(state.lane) ? state.lane : [0, 1, 2].find((candidate) => !blocked.has(candidate)) ?? state.lane;
  engine.select(lane);
}
async function play(game: Awaited<ReturnType<typeof setup>>) {
  game.engine.start('rush');
  for (let frame = 0; frame < 5000 && !game.messages.some((message) => message.type === 'COMPLETE'); frame++) {
    if (game.work.getSnapshot().error) throw new Error(game.work.getSnapshot().error);
    if (game.engine.getSnapshot().phase === 'gameover') game.engine.start('rush');
    steer(game.engine); game.engine.advance(100);
    expect(game.work.getSnapshot().credit).toBeLessThanOrEqual(25);
    await yieldToWorker(1);
  }
}
function verify(game: Awaited<ReturnType<typeof setup>>, original: ReturnType<typeof unzipSync>) {
  const complete = game.messages.find((message) => message.type === 'COMPLETE');
  if (complete?.type !== 'COMPLETE') throw new Error('No completed Chaos Run ZIP.');
  const output = unzipSync(new Uint8Array(complete.buffer));
  expect(Object.keys(output)).toHaveLength(Object.keys(original).length + 1);
  for (const entry of complete.manifest.entries) expect(output[entry.outputPath!]).toEqual(original[entry.originalPath]);
  expect(JSON.parse(strFromU8(output['filequest-manifest.json']!))).toEqual(complete.manifest);
}

describe('Chaos Run → earned batches → actual organized ZIP', () => {
  it.each([120, 500])('organizes %s actual files through running, orb pickups and survival, without one action per file', async (count) => {
    const source = createChaosDemo(count), original = unzipSync(source), game = await setup(source);
    expect(game.manifest().progress.processed).toBe(0); expect(game.sent).toHaveLength(0);
    await play(game);
    expect(game.manifest().progress).toMatchObject({ processed: count, remaining: 0, failed: 0 });
    expect(game.work.getSnapshot().earned).toBe(count);
    expect(game.peak()).toBe(1);
    expect(game.sent.length).toBeLessThan(count / 2);
    for (const request of game.sent) {
      expect(request.type).toBe('REQUEST_BATCH');
      if (request.type === 'REQUEST_BATCH') { expect(request.maxFiles).toBeGreaterThan(0); expect(request.maxFiles).toBeLessThanOrEqual(25); }
    }
    expect(new Set(game.sent.map((request) => request.type === 'REQUEST_BATCH' ? request.requestId : '')).size).toBe(game.sent.length);
    verify(game, original);
  }, 20000);

  it('starting, steering and pausing before a pickup cannot start an unrelated automatic ZIP job', async () => {
    const game = await setup(createChaosDemo());
    game.engine.start('rush');
    for (let frame = 0; frame < 10; frame++) { game.engine.move(frame % 2 ? 1 : -1); game.engine.advance(100); }
    game.engine.pause(); game.engine.advance(10000); await yieldToWorker(2);
    expect(game.sent).toHaveLength(0); expect(game.manifest().progress.processed).toBe(0);
    expect(game.work.getSnapshot().earned).toBe(0);
  });

  it('restarting during an earned batch preserves processed bytes and uses unique future event IDs', async () => {
    const source = createChaosDemo(), original = unzipSync(source), game = await setup(source);
    game.engine.start('rush');
    for (let frame = 0; frame < 100 && !game.sent.length; frame++) { steer(game.engine); game.engine.advance(100); }
    expect(game.sent.length).toBe(1);
    const serial = game.engine.getSnapshot().eventSerial;
    game.engine.pause(); game.engine.start('rush');
    expect(game.engine.getSnapshot().eventSerial).toBe(serial);
    await play(game); verify(game, original);
    expect(game.work.getSnapshot().earned).toBe(120); expect(game.peak()).toBe(1);
  }, 15000);

  it('cancels an in-flight earned batch with no fabricated count or partial export', async () => {
    const game = await setup(createChaosDemo()); game.engine.start('rush');
    for (let frame = 0; frame < 100 && !game.sent.length; frame++) { steer(game.engine); game.engine.advance(100); }
    expect(game.sent).toHaveLength(1);
    game.work.cancel(); game.engine.stop('cancelled', 'Cancelled'); game.adapter.abort('Cancelled');
    await game.handle({ type: 'CANCEL', jobId: 'chaos' }); await yieldToWorker(5);
    expect(game.engine.getSnapshot().phase).toBe('cancelled'); expect(game.work.getSnapshot().earned).toBe(0);
    expect(game.messages.some((message) => message.type === 'COMPLETE')).toBe(false);
    expect(game.manifest().progress.phase).toBe('cancelled');
  });

  it('a corrupt real file rejects its batch and cannot count as game-earned work', async () => {
    const game = await setup(fixtureZip([{ path: 'bad.txt', data: text('CRC mismatch'), checksum: 1 }]));
    game.engine.start('rush');
    for (let frame = 0; frame < 100 && !game.sent.length; frame++) { steer(game.engine); game.engine.advance(100); }
    for (let wait = 0; wait < 50 && !game.work.getSnapshot().error; wait++) await yieldToWorker(1);
    expect(game.work.getSnapshot()).toMatchObject({ earned: 0, busy: false }); expect(game.work.getSnapshot().error).toContain('integrity');
    expect(game.manifest().progress).toMatchObject({ failed: 1, processed: 0 });
    expect(game.messages.some((message) => message.type === 'COMPLETE')).toBe(false);
  });

  it('explicit finish completes the rest without calling them player-earned', async () => {
    const source = createChaosDemo(40), original = unzipSync(source), game = await setup(source);
    game.engine.start('rush');
    for (let frame = 0; frame < 100 && !game.sent.length; frame++) { steer(game.engine); game.engine.advance(100); }
    game.engine.pause();
    for (let wait = 0; wait < 100 && game.work.getSnapshot().busy; wait++) await yieldToWorker(1);
    const earned = game.work.getSnapshot().earned; expect(earned).toBeGreaterThan(0);
    game.work.assist(); game.engine.stop('finishing', 'Explicit finish');
    for (let batch = 0; batch < 20 && game.manifest().progress.phase !== 'complete'; batch++) {
      await game.handle({ type: 'REQUEST_BATCH', jobId: 'chaos', requestId: `assisted-${batch}`, maxFiles: 25 });
    }
    verify(game, original); expect(game.work.getSnapshot().earned).toBe(earned);
    expect(game.manifest().progress.processed - earned).toBeGreaterThan(0);
  });
});
