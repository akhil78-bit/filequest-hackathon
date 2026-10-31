import { describe, expect, it, vi } from 'vitest';
import { WorkScheduler } from '../../src/features/game/chaos/work-scheduler';
import { EarnedBatch } from '../../src/features/organizer/earned-batch';
import type { EarnedReceipt } from '../../src/features/organizer/earned-batch';
import type { Manifest, WorkerRequest } from '../../src/features/organizer/protocol';

export const manifest = (count = 40): Manifest => ({ schemaVersion: 1, rules: 'extension-v1',
  progress: { phase: 'ready', total: count, processed: 0, skipped: 0, failed: 0, remaining: count, processedBytes: 0, totalBytes: count },
  entries: Array.from({ length: count }, (_, id) => ({ id, originalPath: `${id}.txt`, outputPath: `Documents/${id}.txt`, category: 'Documents', bytes: 1, crc32: '00000000', status: 'pending', reason: 'Synthetic test' })),
});
const receipt = (count: number, remaining: number): EarnedReceipt => ({ requestId: 'test', remaining, entries: manifest(count).entries.map((entry) => ({ ...entry, status: 'processed' })) });
function deferred() {
  let resolve!: (value: EarnedReceipt) => void, reject!: (error: Error) => void;
  const promise = new Promise<EarnedReceipt>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('bounded earned-work scheduler', () => {
  it('keeps one active batch and at most 25 files of coalesced credit; duplicates cannot grant work', async () => {
    const first = deferred(), second = deferred();
    const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const scheduler = new WorkScheduler(request);
    scheduler.grant(1, 8); expect(request).not.toHaveBeenCalled();
    scheduler.resume(); scheduler.grant(1, 8); scheduler.grant(1, 8);
    for (let id = 2; id < 100; id++) scheduler.grant(id, 24);
    expect(request).toHaveBeenCalledTimes(1); expect(scheduler.getSnapshot()).toMatchObject({ busy: true, credit: 25, earned: 0 });
    first.resolve(receipt(8, 492)); await first.promise; await Promise.resolve();
    expect(request).toHaveBeenLastCalledWith(25, 99); expect(request).toHaveBeenCalledTimes(2);
    expect(scheduler.getSnapshot().earned).toBe(8);
    second.resolve(receipt(25, 467)); await second.promise;
    expect(scheduler.getSnapshot()).toMatchObject({ earned: 33, busy: false, batches: 2 });
  });
  it('pauses queued work, preserves already-confirmed work and resumes safely', async () => {
    const first = deferred(), second = deferred(), request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const scheduler = new WorkScheduler(request); scheduler.resume(); scheduler.grant(1, 8); scheduler.grant(2, 16); scheduler.pause();
    first.resolve(receipt(8, 100)); await first.promise;
    expect(request).toHaveBeenCalledTimes(1); expect(scheduler.getSnapshot()).toMatchObject({ credit: 16, earned: 8 });
    scheduler.resume(); expect(request).toHaveBeenCalledTimes(2);
    second.resolve(receipt(16, 84)); await second.promise; expect(scheduler.getSnapshot().earned).toBe(24);
  });
  it('manual finish drops pending credit while still attributing an already-earned in-flight batch', async () => {
    const pending = deferred(), request = vi.fn(() => pending.promise), scheduler = new WorkScheduler(request);
    scheduler.resume(); scheduler.grant(1, 8); scheduler.grant(2, 16); scheduler.assist();
    pending.resolve(receipt(8, 100)); await pending.promise;
    expect(scheduler.getSnapshot()).toMatchObject({ credit: 0, earned: 8 }); expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['reset', 'cancel'] as const)('%s invalidates stale acknowledgments', async (action) => {
    const pending = deferred(), scheduler = new WorkScheduler(() => pending.promise); scheduler.resume(); scheduler.grant(1, 8); scheduler[action]();
    pending.resolve(receipt(8, 100)); await pending.promise;
    expect(scheduler.getSnapshot()).toMatchObject({ earned: 0, credit: 0, busy: false });
  });
  it('does not manufacture completion on failure or request more work after the archive is finished', async () => {
    const pending = deferred(), request = vi.fn(() => pending.promise), scheduler = new WorkScheduler(request);
    scheduler.resume(); scheduler.grant(1, 8); scheduler.grant(2, 16);
    pending.resolve(receipt(5, 0)); await pending.promise;
    scheduler.resume(); scheduler.grant(3, 16);
    expect(scheduler.getSnapshot()).toMatchObject({ earned: 5, credit: 0 }); expect(request).toHaveBeenCalledTimes(1);
    const broken = new WorkScheduler(async () => { throw new Error('CRC failed'); }); broken.resume(); broken.grant(1, 8);
    await Promise.resolve(); expect(broken.getSnapshot()).toMatchObject({ earned: 0, busy: false, error: 'CRC failed' });
  });
});

describe('exact batch acknowledgment adapter', () => {
  it('requests a bounded group and ignores PROGRESS, stale jobs and unrelated ACKs', async () => {
    const batch = new EarnedBatch(), sent: WorkerRequest[] = [], source = manifest();
    let resolved = false;
    const pending = batch.request('current', 1, 8, source, (message) => sent.push(message));
    pending.then(() => { resolved = true; });
    expect(batch.request('current', 1, 8, source, () => {})).toBe(pending);
    expect(sent).toEqual([{ type: 'REQUEST_BATCH', jobId: 'current', requestId: 'chaos-1', maxFiles: 8 }]);
    batch.receive({ type: 'PROGRESS', jobId: 'current', progress: { ...source.progress, processed: 8 } });
    const updated = { ...source, entries: source.entries.map((entry) => entry.id < 8 ? { ...entry, status: 'processed' as const } : entry) };
    batch.receive({ type: 'BATCH_RESULT', jobId: 'stale', requestId: 'chaos-1', entryIds: [0], manifest: updated });
    batch.receive({ type: 'BATCH_RESULT', jobId: 'current', requestId: 'other', entryIds: [0], manifest: updated });
    await Promise.resolve(); expect(resolved).toBe(false);
    batch.receive({ type: 'BATCH_RESULT', jobId: 'current', requestId: 'chaos-1', entryIds: Array.from({ length: 8 }, (_, id) => id), manifest: updated });
    expect((await pending).entries).toHaveLength(8); expect((await pending).remaining).toBe(32);
  });
  it('caps requests to remaining entries and rejects mismatched duplicate ACK entries', async () => {
    const batch = new EarnedBatch(), send = vi.fn(), source = manifest(2);
    const pending = batch.request('a', 1, 25, source, send);
    expect(send).toHaveBeenCalledWith({ type: 'REQUEST_BATCH', jobId: 'a', requestId: 'chaos-1', maxFiles: 2 });
    const rejection = expect(pending).rejects.toThrow('did not match');
    batch.receive({ type: 'BATCH_RESULT', jobId: 'a', requestId: 'chaos-1', entryIds: [0, 0], manifest: source });
    await rejection; expect(batch.active).toBe(false);
  });
  it.each([0, -1, 26, 1.5, NaN])('rejects invalid batch size %s', async (count) => {
    await expect(new EarnedBatch().request('a', 1, count, manifest(), () => {})).rejects.toThrow('Invalid earned batch');
  });
  it('rejects parallel batches and cancellation without a receipt', async () => {
    const batch = new EarnedBatch(), pending = batch.request('a', 1, 8, manifest(), () => {});
    await expect(batch.request('a', 2, 8, manifest(), () => {})).rejects.toThrow('current earned');
    const rejection = expect(pending).rejects.toThrow('Cancelled'); batch.abort('Cancelled'); await rejection;
  });
});
