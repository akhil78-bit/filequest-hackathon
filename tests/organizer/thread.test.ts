import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { createDemoZip } from '../../src/features/organizer/demo-zip';
import type { WorkerRequest, WorkerResponse } from '../../src/features/organizer/protocol';

let code: string;
const threads: Worker[] = [];

beforeAll(async () => {
  const bundle = await build({
    configFile: false, logLevel: 'silent',
    build: {
      write: false, minify: false,
      lib: { entry: resolve('src/features/organizer/organizer.worker.ts'), name: 'FileQuestTestWorker', formats: ['iife'] },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!output || !('output' in output)) throw new Error('Worker bundling failed.');
  const chunk = output.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Worker code is missing.');
  code = chunk.code;
});

afterAll(async () => { await Promise.all(threads.map((worker) => worker.terminate())); });

function thread() {
  // Browser worker globals adapted to a real Node worker thread, not a synchronous mock.
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
    ${code}
    parentPort.on('message', (data) => globalThis.onmessage({data}));
  `, { eval: true });
  threads.push(worker);
  const messages: WorkerResponse[] = [];
  worker.on('message', (message: WorkerResponse) => messages.push(message));
  const waitFor = <T extends WorkerResponse['type']>(type: T) => new Promise<Extract<WorkerResponse, { type: T }> | WorkerResponse>((resolveMessage, reject) => {
    const onMessage = (message: WorkerResponse) => {
      if (message.type === type || message.type === 'ERROR') {
        worker.off('message', onMessage); worker.off('error', reject);
        if (message.type === 'ERROR' && type !== 'ERROR') reject(new Error(message.message));
        else resolveMessage(message);
      }
    };
    worker.on('message', onMessage); worker.once('error', reject);
  });
  const post = (request: WorkerRequest, transfer: ArrayBuffer[] = []) => worker.postMessage(request, transfer);
  return { worker, messages, waitFor, post };
}

describe('actual worker thread transport', () => {
  it('transfers an input buffer, sorts batches and returns an extractable output on another thread', async () => {
    const { worker, waitFor, post } = thread();
    const input = createDemoZip(), originals = unzipSync(input);
    const ready = waitFor('READY');
    post({ type: 'INIT', jobId: 'thread', buffer: input.buffer }, [input.buffer]);
    expect(input.byteLength).toBe(0);
    expect(await ready).toMatchObject({ type: 'READY', manifest: { progress: { processed: 0, remaining: 20 } } });
    const batch = waitFor('BATCH_RESULT');
    post({ type: 'REQUEST_BATCH', jobId: 'thread', requestId: 'pickup', maxFiles: 5 });
    expect(await batch).toMatchObject({ manifest: { progress: { processed: 5, remaining: 15 } } });
    const complete = waitFor('COMPLETE');
    post({ type: 'REQUEST_BATCH', jobId: 'thread', requestId: 'finish', maxFiles: 50 });
    const message = await complete;
    if (message.type !== 'COMPLETE') throw new Error('Missing output buffer.');
    const output = unzipSync(new Uint8Array(message.buffer));
    expect(Object.keys(output)).toHaveLength(21);
    for (const record of message.manifest.entries) expect(output[record.outputPath!]).toEqual(originals[record.originalPath]);
    await worker.terminate();
  });

  it('interrupts an active worker batch and never returns a partial export', async () => {
    const { worker, waitFor, post, messages } = thread();
    const ready = waitFor('READY');
    post({ type: 'INIT', jobId: 'cancel-thread', buffer: createDemoZip().buffer });
    await ready;
    const progress = waitFor('PROGRESS');
    post({ type: 'REQUEST_BATCH', jobId: 'cancel-thread', requestId: 'all', maxFiles: 50 });
    await progress;
    const cancelled = waitFor('CANCEL');
    post({ type: 'CANCEL', jobId: 'cancel-thread' });
    const message = await cancelled;
    if (message.type !== 'CANCEL') throw new Error('Missing cancellation acknowledgment.');
    expect(message.manifest.progress.phase).toBe('cancelled');
    expect(message.manifest.progress.processed).toBeGreaterThanOrEqual(1);
    expect(message.manifest.progress.processed).toBeLessThan(20);
    expect(message.manifest.progress.failed).toBe(0);
    expect(messages.some((item) => item.type === 'COMPLETE')).toBe(false);
    await worker.terminate();
  });
});
