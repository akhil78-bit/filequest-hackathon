import { useCallback, useEffect, useRef, useState } from 'react';
import type { Manifest, Phase, WorkerRequest, WorkerResponse } from './protocol';
import { ZIP_LIMITS } from './zip-format';
import { PacketRequest } from './packet-request';
import { EarnedBatch } from './earned-batch';

interface State {
  jobId: string;
  phase: 'idle' | 'reading' | 'cancelling' | Phase;
  manifest: Manifest | null;
  error: string;
  archiveName: string;
  downloadUrl: string | null;
  batchBusy: boolean;
}
interface Job {
  earnedBatch: EarnedBatch;
  packet: PacketRequest;
  id: string;
  worker: Worker;
  sequence: number;
  busy: boolean;
  finish: boolean;
  phase: State['phase'];
  manifest: Manifest | null;
  url: string | null;
}
const initial: State = { jobId: '', phase: 'idle', manifest: null, error: '', archiveName: '', downloadUrl: null, batchBusy: false };

export function useOrganizer() {
  const [state, setState] = useState<State>(initial);
  const current = useRef<Job | null>(null);
  const dispose = useCallback(() => {
    const job = current.current;
    current.current = null;
    if (job) { job.packet.abort('The archive was replaced or reset.'); job.earnedBatch.abort('The archive was replaced or reset.'); job.worker.terminate(); if (job.url) URL.revokeObjectURL(job.url); }
  }, []);
  useEffect(() => dispose, [dispose]);

  const batch = useCallback((job: Job, maxFiles: number) => {
    if (current.current !== job || job.busy || !['ready', 'processing'].includes(job.phase)) return;
    job.busy = true;
    setState((previous) => ({ ...previous, batchBusy: true, phase: 'processing' }));
    const request: WorkerRequest = { type: 'REQUEST_BATCH', jobId: job.id, requestId: `batch-${++job.sequence}`, maxFiles };
    job.worker.postMessage(request);
  }, []);

  const load = useCallback(async (file: File) => {
    dispose();
    if (file.size > ZIP_LIMITS.inputBytes) {
      setState({ ...initial, phase: 'error', archiveName: file.name, error: 'Choose a ZIP no larger than 25 MiB.' });
      return;
    }
    setState({ ...initial, phase: 'reading', archiveName: file.name });
    let job: Job;
    try {
      job = {
        earnedBatch: new EarnedBatch(),
        packet: new PacketRequest(),
        id: crypto.randomUUID(), worker: new Worker(new URL('./organizer.worker.ts', import.meta.url), { type: 'module' }),
        sequence: 0, busy: false, finish: false, phase: 'reading', manifest: null, url: null,
      };
    } catch {
      setState({ ...initial, phase: 'error', archiveName: file.name, error: 'This browser could not start a file-processing worker. Try a current browser.' });
      return;
    }
    current.current = job;
    setState((previous) => ({ ...previous, jobId: job.id }));
    const fail = (error: string) => {
      if (current.current !== job) return;
      job.packet.abort(error);
      job.earnedBatch.abort(error);
      job.phase = 'error'; job.worker.terminate(); job.busy = false;
      setState((previous) => ({ ...previous, phase: 'error', error, batchBusy: false, downloadUrl: null }));
    };
    job.worker.onerror = () => fail('The sorting worker stopped unexpectedly. Choose the ZIP again to retry.');
    job.worker.onmessageerror = () => fail('A worker response could not be read. Choose the ZIP again to retry.');
    job.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (current.current !== job || message.jobId !== job.id) return;
      if (job.phase === 'cancelling' && message.type !== 'CANCEL') return;
      if (message.type === 'ERROR') {
        if (message.manifest) setState((previous) => ({ ...previous, manifest: message.manifest! }));
        fail(message.message); return;
      }
      if (message.type === 'PROGRESS') {
        // A game action stays unscored/unprocessed in the UI until its BATCH_RESULT.
        if (job.packet.active || job.earnedBatch.active) return;
        if (!job.manifest) return;
        const updated = {
          ...job.manifest, progress: message.progress,
          entries: message.entry
            ? job.manifest.entries.map((entry) => entry.id === message.entry!.id ? message.entry! : entry)
            : job.manifest.entries,
        };
        job.manifest = updated; job.phase = message.progress.phase;
        setState((previous) => ({ ...previous, manifest: updated, phase: job.phase }));
        return;
      }
      job.manifest = message.manifest;
      job.phase = message.manifest.progress.phase;
      if (message.type === 'BATCH_RESULT' || message.type === 'CANCEL') job.busy = false;
      if (message.type === 'BATCH_RESULT') job.packet.receive(message);
      if (message.type === 'BATCH_RESULT') job.earnedBatch.receive(message);
      if (message.type === 'COMPLETE') {
        try { job.url = URL.createObjectURL(new Blob([message.buffer], { type: 'application/zip' })); }
        catch { fail('The download could not be prepared. Try a smaller ZIP or free some browser memory.'); return; }
        job.busy = false; job.worker.terminate();
      }
      setState((previous) => ({
        ...previous, manifest: message.manifest, phase: job.phase,
        batchBusy: job.busy, downloadUrl: job.url,
      }));
      if (message.type === 'CANCEL') job.worker.terminate();
      if (message.type === 'BATCH_RESULT' && job.finish && job.phase === 'processing') batch(job, 25);
      else if (message.type === 'BATCH_RESULT' && job.phase === 'processing'
        && !message.manifest.entries.some((entry) => entry.status === 'pending')) batch(job, 1);
    };
    try {
      const buffer = await file.arrayBuffer();
      if (current.current !== job || job.phase !== 'reading') return;
      const request: WorkerRequest = { type: 'INIT', jobId: job.id, buffer };
      job.worker.postMessage(request, [buffer]);
    } catch { fail('The selected file could not be read. Choose the ZIP again to retry.'); }
  }, [dispose, batch]);

  const cancel = useCallback(() => {
    const job = current.current;
    if (!job || ['complete', 'cancelled', 'error'].includes(job.phase)) return;
    job.finish = false;
    job.packet.abort('Sorting cancelled.');
    job.earnedBatch.abort('Sorting cancelled.');
    if (job.phase === 'reading') {
      job.phase = 'cancelled'; job.worker.terminate();
      setState((previous) => ({ ...previous, phase: 'cancelled', batchBusy: false }));
    } else {
      job.phase = 'cancelling';
      setState((previous) => ({ ...previous, phase: 'cancelling' }));
      const request: WorkerRequest = { type: 'CANCEL', jobId: job.id };
      job.worker.postMessage(request);
    }
  }, []);

  const requestPacket = useCallback((entryId: number, actionId: string) => {
    const job = current.current;
    if (!job?.manifest || job.finish || !['ready', 'processing'].includes(job.phase)) return Promise.reject(new Error('The archive is not available for gameplay.'));
    if (job.busy && !job.packet.active) return Promise.reject(new Error('Another sorting operation is in progress.'));
    return job.packet.request(job.id, entryId, actionId, job.manifest, (request) => {
      job.busy = true;
      setState((previous) => ({ ...previous, batchBusy: true, phase: 'processing' }));
      job.worker.postMessage(request);
    });
  }, []);

  const requestEarnedBatch = useCallback((count: number, eventId: number) => {
    const job = current.current;
    if (!job?.manifest || job.finish || !['ready', 'processing'].includes(job.phase)) return Promise.reject(new Error('Archive unavailable for earned work.'));
    if (job.busy && !job.earnedBatch.active) return Promise.reject(new Error('Another batch is processing.'));
    return job.earnedBatch.request(job.id, eventId, count, job.manifest, (request) => {
      job.busy = true;
      setState((previous) => ({ ...previous, batchBusy: true, phase: 'processing' }));
      job.worker.postMessage(request);
    });
  }, []);

  return {
    ...state,
    load,
    cancel,
    requestPacket,
    requestEarnedBatch,
    sortNextBatch: () => { const job = current.current; if (job) batch(job, 5); },
    finishSorting: () => { const job = current.current; if (job) { job.finish = true; batch(job, 25); } },
    reset: () => { dispose(); setState(initial); },
  };
}
