import type { Category } from './classify';

export type EntryStatus = 'pending' | 'processed' | 'skipped' | 'failed' | 'cancelled';
export type Phase = 'ready' | 'processing' | 'packaging' | 'complete' | 'cancelled' | 'error';
export interface ManifestEntry {
  id: number;
  originalPath: string;
  outputPath: string | null;
  category: Category | null;
  status: EntryStatus;
  bytes: number;
  crc32: string;
  reason: string;
}
export interface Progress {
  phase: Phase;
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  remaining: number;
  processedBytes: number;
  totalBytes: number;
}
export interface Manifest {
  schemaVersion: 1;
  rules: 'extension-v1';
  progress: Progress;
  entries: ManifestEntry[];
}
export type WorkerRequest =
  | { type: 'INIT'; jobId: string; buffer: ArrayBuffer }
  | { type: 'REQUEST_BATCH'; jobId: string; requestId: string; maxFiles: number }
  | { type: 'CANCEL'; jobId: string };

export type WorkerResponse =
  | { type: 'READY' | 'CANCEL'; jobId: string; manifest: Manifest }
  | { type: 'PROGRESS'; jobId: string; progress: Progress; entry?: ManifestEntry }
  | { type: 'BATCH_RESULT'; jobId: string; requestId: string; manifest: Manifest; entryIds: number[] }
  | { type: 'COMPLETE'; jobId: string; manifest: Manifest; buffer: ArrayBuffer }
  | { type: 'ERROR'; jobId: string; message: string; manifest?: Manifest };
