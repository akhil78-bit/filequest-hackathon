import { createWorkerHandler } from './worker-handler';
import type { WorkerRequest, WorkerResponse } from './protocol';

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer: Transferable[]) => void;
};
const handle = createWorkerHandler((message, transfer = []) => worker.postMessage(message, transfer));
worker.onmessage = (event) => { void handle(event.data); };
