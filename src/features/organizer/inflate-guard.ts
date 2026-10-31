import type { Inflate } from 'fflate';
import { ArchiveError } from './zip-format';

/**
 * fflate 0.8.3 accepts trailing input and retains/copies it on every push after
 * BFINAL. Its callback's `final` means caller EOF, not a verified DEFLATE EOF.
 * Isolate this pinned-version state inspection here; fail closed if it changes.
 * s.p is the residual bit offset in p after Inflate.push has compacted input.
 */
export function checkDeflateBoundary(inflater: Inflate, pushed: number, expected: number) {
  const internal = inflater as unknown as {
    s?: { f?: number; l?: Uint16Array | null; p?: number };
    p?: Uint8Array;
  };
  const state = internal.s, pending = internal.p;
  if (!state || !(pending instanceof Uint8Array) || !Number.isInteger(state.p)
    || state.p! < 0 || state.p! > 7 || (state.f !== undefined && state.f !== 0 && state.f !== 1)) {
    throw new ArchiveError('The ZIP decoder state is unsupported.');
  }
  const ended = state.f === 1 && !state.l;
  if (ended && pushed - pending.length + Math.ceil(state.p! / 8) !== expected) {
    throw new ArchiveError('Invalid ZIP: trailing data after the DEFLATE end marker.');
  }
  if (pushed === expected && !ended) {
    throw new ArchiveError('Invalid ZIP: missing DEFLATE end marker.');
  }
}
