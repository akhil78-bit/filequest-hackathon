import type { EarnedReceipt } from '../../organizer/earned-batch';

export interface WorkState { busy: boolean; credit: number; earned: number; batches: number; lastFiles: number; error: string }

/** Backpressure: one active request plus at most 25 files of coalesced earned credit. */
export class WorkScheduler {
  private state: WorkState = { busy: false, credit: 0, earned: 0, batches: 0, lastFiles: 0, error: '' };
  private listeners = new Set<() => void>();
  private enabled = false;
  private lastEvent = 0;
  private generation = 0;
  private closed = false;
  constructor(private request: (count: number, eventId: number) => Promise<EarnedReceipt>) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<WorkState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  grant(eventId: number, count: number) {
    if (!this.enabled || !Number.isSafeInteger(eventId) || eventId <= this.lastEvent || !Number.isInteger(count) || count < 1 || count > 25) return;
    this.lastEvent = eventId;
    this.update({ credit: Math.min(25, this.state.credit + count) });
    void this.flush();
  }
  resume() { if (this.state.error || this.closed) return; this.enabled = true; void this.flush(); }
  pause() { this.enabled = false; }
  assist() { this.enabled = false; this.update({ credit: 0 }); }
  cancel() { this.generation++; this.enabled = false; this.update({ busy: false, credit: 0 }); }
  reset() {
    this.generation++; this.enabled = false; this.lastEvent = 0; this.closed = false;
    this.update({ busy: false, credit: 0, earned: 0, batches: 0, lastFiles: 0, error: '' });
  }
  private async flush() {
    if (!this.enabled || this.state.busy || !this.state.credit) return;
    const count = this.state.credit, eventId = this.lastEvent, generation = this.generation;
    this.update({ busy: true, credit: 0 });
    try {
      const receipt = await this.request(count, eventId);
      if (generation !== this.generation) return;
      this.update({ busy: false, earned: this.state.earned + receipt.entries.length, batches: this.state.batches + 1, lastFiles: receipt.entries.length });
      if (!receipt.remaining) { this.enabled = false; this.closed = true; this.update({ credit: 0 }); }
      else void this.flush();
    } catch (cause) {
      if (generation !== this.generation) return;
      this.enabled = false;
      this.update({ busy: false, credit: 0, error: cause instanceof Error ? cause.message : 'File processing failed.' });
    }
  }
}
