import { CancelledError, OrganizerSession } from './session';
import type { WorkerRequest, WorkerResponse } from './protocol';

/** Shared by the browser worker and protocol integration tests. */
export function createWorkerHandler(emit: (message: WorkerResponse, transfer?: Transferable[]) => void) {
  let session: OrganizerSession | null = null;
  let jobId = '';
  let queue = Promise.resolve();
  let completeSent = false;
  const announced = new Set<number>();
  const report = (cause: unknown, id: string) => {
    if (cause instanceof CancelledError) return;
    emit({ type: 'ERROR', jobId: id, message: cause instanceof Error ? cause.message : 'ZIP processing failed.', manifest: session?.snapshot() });
  };
  return (message: WorkerRequest): Promise<void> => {
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
    const activeSession = session;
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
    });
    return queue;
  };
}
