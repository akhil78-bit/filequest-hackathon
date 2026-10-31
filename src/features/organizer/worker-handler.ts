import { CancelledError, OrganizerSession } from './session';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { ZIP_LIMITS } from './zip-format';

function isRequest(value: unknown): value is WorkerRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (typeof message.jobId !== 'string' || !message.jobId || message.jobId.length > 100) return false;
  if (message.type === 'INIT') return message.buffer instanceof ArrayBuffer && message.buffer.byteLength <= ZIP_LIMITS.inputBytes;
  if (message.type === 'CANCEL') return true;
  return message.type === 'REQUEST_BATCH' && typeof message.requestId === 'string'
    && message.requestId.length > 0 && message.requestId.length <= 100
    && typeof message.maxFiles === 'number' && Number.isInteger(message.maxFiles)
    && message.maxFiles >= 1 && message.maxFiles <= 50;
}

/** Shared by the browser worker and protocol integration tests. */
export function createWorkerHandler(emit: (message: WorkerResponse, transfer?: Transferable[]) => void) {
  let session: OrganizerSession | null = null;
  let jobId = '';
  let queue = Promise.resolve();
  let completeSent = false;
  let queued = 0;
  const announced = new Set<number>();
  const report = (cause: unknown, id: string) => {
    if (cause instanceof CancelledError) return;
    emit({ type: 'ERROR', jobId: id, message: cause instanceof Error ? cause.message : 'ZIP processing failed.', manifest: session?.snapshot() });
  };
  return (message: unknown): Promise<void> => {
    // postMessage performs structured cloning, not TypeScript validation. In
    // particular, never pass a number/array-like value to Uint8Array allocation.
    if (!isRequest(message)) {
      const incomingId = message && typeof message === 'object' && 'jobId' in message ? message.jobId : undefined;
      const errorJob = typeof incomingId === 'string' && incomingId.length <= 100 ? incomingId : jobId;
      emit({ type: 'ERROR', jobId: errorJob, message: 'Invalid worker request or archive input exceeds 25 MiB.' });
      return Promise.resolve();
    }
    if (message.type === 'INIT') {
      if (session || jobId) {
        report(new Error('Start a new worker for a new archive.'), message.jobId);
        return Promise.resolve();
      }
      jobId = message.jobId;
      try {
        session = new OrganizerSession(new Uint8Array(message.buffer), (manifest) => {
          const entry = manifest.entries.find((record) => record.status === 'processed' && !announced.has(record.id));
          if (entry) announced.add(entry.id);
          // Send one changed record, rather than cloning all 500 paths after each file.
          emit({ type: 'PROGRESS', jobId, progress: manifest.progress, entry });
        });
        emit({ type: 'READY', jobId, manifest: session.snapshot() });
      } catch (cause) { report(cause, jobId); }
      return Promise.resolve();
    }
    if (message.jobId !== jobId || !session) return Promise.resolve();
    if (message.type === 'CANCEL') {
      session.cancel();
      emit({ type: 'CANCEL', jobId, manifest: session.snapshot() });
      return Promise.resolve();
    }
    // The UI normally has one active batch. Bound this boundary too, so a broken
    // caller cannot retain an unlimited Promise chain while a large file copies.
    if (queued >= 8) {
      report(new Error('Too many pending batch requests. Wait for acknowledgment.'), jobId);
      return Promise.resolve();
    }
    const activeSession = session;
    queued++;
    queue = queue.then(async () => {
      try {
        const result = await activeSession.requestBatch(message.requestId, message.maxFiles);
        emit({ type: 'BATCH_RESULT', jobId, requestId: message.requestId, ...result });
        if (result.manifest.progress.phase === 'complete' && !completeSent) {
          completeSent = true;
          const buffer = activeSession.takeOutput();
          emit({ type: 'COMPLETE', jobId, manifest: activeSession.snapshot(), buffer }, [buffer]);
        }
      } catch (cause) { report(cause, jobId); }
      finally { queued--; }
    });
    return queue;
  };
}
