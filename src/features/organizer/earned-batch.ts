import type { Manifest, ManifestEntry, WorkerRequest, WorkerResponse } from './protocol';

export interface EarnedReceipt { requestId: string; entries: ManifestEntry[]; remaining: number }

/** One bounded, exact-entry batch. PROGRESS is never a receipt. */
export class EarnedBatch {
  private pending: {
    jobId: string; requestId: string; ids: number[]; promise: Promise<EarnedReceipt>;
    resolve: (receipt: EarnedReceipt) => void; reject: (error: Error) => void;
  } | null = null;
  get active() { return this.pending !== null; }

  request(jobId: string, eventId: number, count: number, manifest: Manifest, send: (request: WorkerRequest) => void): Promise<EarnedReceipt> {
    const requestId = `chaos-${eventId}`;
    if (this.pending) {
      if (this.pending.jobId === jobId && this.pending.requestId === requestId) return this.pending.promise;
      return Promise.reject(new Error('Wait for the current earned batch.'));
    }
    if (!Number.isSafeInteger(eventId) || eventId < 1 || !Number.isInteger(count) || count < 1 || count > 25) return Promise.reject(new Error('Invalid earned batch.'));
    const ids = manifest.entries.filter((entry) => entry.status === 'pending' && entry.category !== null).slice(0, count).map((entry) => entry.id);
    if (!ids.length) return Promise.reject(new Error('No pending files remain.'));
    let resolve!: (receipt: EarnedReceipt) => void, reject!: (error: Error) => void;
    const promise = new Promise<EarnedReceipt>((accept, decline) => { resolve = accept; reject = decline; });
    this.pending = { jobId, requestId, ids, promise, resolve, reject };
    try { send({ type: 'REQUEST_BATCH', jobId, requestId, maxFiles: ids.length }); }
    catch { this.abort('Could not send the earned batch.'); }
    return promise;
  }

  receive(message: WorkerResponse) {
    const pending = this.pending;
    if (!pending || message.jobId !== pending.jobId || message.type !== 'BATCH_RESULT' || message.requestId !== pending.requestId) return;
    this.pending = null;
    const entries = pending.ids.map((id) => message.manifest.entries.find((entry) => entry.id === id));
    if (message.entryIds.length !== pending.ids.length || message.entryIds.some((id, index) => id !== pending.ids[index])
      || entries.some((entry) => entry?.status !== 'processed' || !entry.outputPath)) {
      pending.reject(new Error('Worker acknowledgment did not match the earned files.')); return;
    }
    pending.resolve({ requestId: message.requestId, entries: entries as ManifestEntry[],
      remaining: message.manifest.entries.filter((entry) => entry.status === 'pending' && entry.category !== null).length });
  }
  abort(reason: string) { const pending = this.pending; this.pending = null; pending?.reject(new Error(reason)); }
}
