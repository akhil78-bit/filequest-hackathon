import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { createDemoZip } from '../../src/features/organizer/demo-zip';
import type { WorkerResponse } from '../../src/features/organizer/protocol';
import { createWorkerHandler } from '../../src/features/organizer/worker-handler';
import { fixtureZip, text } from './fixtures';

function setup() {
  const messages: WorkerResponse[] = [];
  const transfers: Transferable[][] = [];
  const handle = createWorkerHandler((message, transfer = []) => { messages.push(message); transfers.push(transfer); });
  return { messages, transfers, handle };
}

describe('organizer worker protocol', () => {
  it('inspects without fake progress; queued pickup batches are idempotent and COMPLETE transfers a real ZIP once', async () => {
    const { messages, transfers, handle } = setup();
    await handle({ type: 'INIT', jobId: 'job', buffer: createDemoZip().buffer });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'READY', manifest: { progress: { processed: 0, remaining: 20 } } });
    const first = handle({ type: 'REQUEST_BATCH', jobId: 'job', requestId: 'pickup-1', maxFiles: 5 });
    const duplicate = handle({ type: 'REQUEST_BATCH', jobId: 'job', requestId: 'pickup-1', maxFiles: 5 });
    const finish = handle({ type: 'REQUEST_BATCH', jobId: 'job', requestId: 'finish', maxFiles: 25 });
    await Promise.all([first, duplicate, finish]);
    const acks = messages.filter((message) => message.type === 'BATCH_RESULT');
    expect(acks).toHaveLength(3);
    expect(acks.map((message) => message.manifest.progress.processed)).toEqual([5, 5, 20]);
    const progresses = messages.filter((message) => message.type === 'PROGRESS' && message.progress.phase === 'processing');
    expect(progresses).toHaveLength(20);
    for (const progress of progresses) {
      expect(progress).not.toHaveProperty('manifest');
      expect(progress).toHaveProperty('entry.status', 'processed');
    }
    const complete = messages.find((message) => message.type === 'COMPLETE');
    expect(complete?.type).toBe('COMPLETE');
    if (complete?.type !== 'COMPLETE') throw new Error('Expected COMPLETE');
    expect(Object.keys(unzipSync(new Uint8Array(complete.buffer)))).toHaveLength(21);
    expect(transfers[messages.indexOf(complete)]).toEqual([complete.buffer]);
    await handle({ type: 'REQUEST_BATCH', jobId: 'job', requestId: 'finish', maxFiles: 25 });
    expect(messages.filter((message) => message.type === 'COMPLETE')).toHaveLength(1);
  });

  it('ignores stale job messages', async () => {
    const { messages, handle } = setup();
    await handle({ type: 'INIT', jobId: 'current', buffer: createDemoZip().buffer });
    await handle({ type: 'REQUEST_BATCH', jobId: 'stale', requestId: 'pickup', maxFiles: 5 });
    await handle({ type: 'CANCEL', jobId: 'stale' });
    expect(messages.map((message) => message.type)).toEqual(['READY']);
  });

  it('cancels queued work, acknowledges cancellation and never publishes COMPLETE', async () => {
    const { messages, handle } = setup();
    await handle({ type: 'INIT', jobId: 'cancel', buffer: createDemoZip().buffer });
    const pending = handle({ type: 'REQUEST_BATCH', jobId: 'cancel', requestId: 'queued', maxFiles: 25 });
    await handle({ type: 'CANCEL', jobId: 'cancel' });
    await pending;
    expect(messages.at(-1)).toMatchObject({ type: 'CANCEL', manifest: { progress: { phase: 'cancelled', processed: 0, remaining: 20 } } });
    expect(messages.some((message) => message.type === 'COMPLETE')).toBe(false);
    expect(messages.some((message) => message.type === 'ERROR')).toBe(false);
  });

  it('returns a friendly preflight error without invented file failures', async () => {
    const { messages, handle } = setup();
    await handle({ type: 'INIT', jobId: 'bad', buffer: text('not zip').buffer });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'ERROR', jobId: 'bad', manifest: undefined });
  });

  it('reports an actual copy failure with consistent counters and no downloadable buffer', async () => {
    const { messages, handle } = setup();
    await handle({ type: 'INIT', jobId: 'corrupt', buffer: fixtureZip([{ path: 'bad.txt', data: text('hello'), checksum: 1 }]).buffer });
    await handle({ type: 'REQUEST_BATCH', jobId: 'corrupt', requestId: 'copy', maxFiles: 1 });
    expect(messages.at(-1)).toMatchObject({ type: 'ERROR', manifest: { progress: { failed: 1, processed: 0, remaining: 0 } } });
    expect(messages.filter((message) => message.type === 'COMPLETE')).toHaveLength(0);
  });
});
