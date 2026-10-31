import type { Manifest, ManifestEntry, WorkerRequest, WorkerResponse } from './protocol';

export interface PacketReceipt { requestId: string; entry: ManifestEntry }

/** One in-flight file, resolved exclusively by the matching worker batch ACK. */
export class PacketRequest {
  private pending: {
    jobId: string; requestId: string; entryId: number; promise: Promise<PacketReceipt>;
    resolve: (receipt: PacketReceipt) => void; reject: (error: Error) => void;
  } | null = null;

  get active() { return this.pending !== null; }

  request(jobId: string, entryId: number, actionId: string, manifest: Manifest, send: (request: WorkerRequest) => void): Promise<PacketReceipt> {
    const requestId = `game-${actionId}`;
    if (this.pending) {
      if (this.pending.jobId === jobId && this.pending.requestId === requestId && this.pending.entryId === entryId) return this.pending.promise;
      return Promise.reject(new Error('Wait for the current packet to be confirmed.'));
    }
    const next = manifest.entries.find((entry) => entry.status === 'pending' && entry.category !== null);
    if (!actionId || actionId.length > 80 || next?.id !== entryId) return Promise.reject(new Error('This packet is no longer next in the archive.'));
    let resolve!: (receipt: PacketReceipt) => void, reject!: (error: Error) => void;
    const promise = new Promise<PacketReceipt>((accept, decline) => { resolve = accept; reject = decline; });
    this.pending = { jobId, requestId, entryId, promise, resolve, reject };
    try { send({ type: 'REQUEST_BATCH', jobId, requestId, maxFiles: 1 }); }
    catch { this.abort('The packet request could not be sent.'); }
    return promise;
  }

  receive(message: WorkerResponse) {
    const pending = this.pending;
    if (!pending || message.jobId !== pending.jobId || message.type !== 'BATCH_RESULT' || message.requestId !== pending.requestId) return;
    const entry = message.manifest.entries.find((record) => record.id === pending.entryId);
    this.pending = null;
    if (message.entryIds.length !== 1 || message.entryIds[0] !== pending.entryId || entry?.status !== 'processed' || !entry.outputPath) {
      pending.reject(new Error('The worker did not confirm the expected file.')); return;
    }
    pending.resolve({ requestId: message.requestId, entry });
  }

  abort(reason: string) {
    const pending = this.pending; this.pending = null;
    pending?.reject(new Error(reason));
  }
}
