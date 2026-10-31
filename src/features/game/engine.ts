import { CATEGORIES } from '../organizer/classify';
import type { Category } from '../organizer/classify';
import type { ManifestEntry } from '../organizer/protocol';
import type { PacketReceipt } from '../organizer/packet-request';

export type GamePhase = 'tutorial' | 'playing' | 'paused' | 'waiting' | 'lost' | 'finishing' | 'complete' | 'error' | 'cancelled';
export type GameMode = 'rush' | 'calm';
export interface GameState {
  phase: GamePhase; mode: GameMode; score: number; combo: number; bestCombo: number;
  lives: number; confirmed: number; lane: number; elapsed: number; duration: number;
  packet: ManifestEntry | null; gates: Category[]; feedback: string; pauseRequested: boolean;
}

export function gatesFor(entry: ManifestEntry): Category[] {
  const target = entry.category!;
  const others = CATEGORIES.filter((category) => category !== target);
  const choices: Category[] = [target, ...[0, 2, 4].map((offset) => others[(entry.id + offset) % others.length]!)];
  const rotate = entry.id % 4;
  return [...choices.slice(rotate), ...choices.slice(0, rotate)];
}

/** Game time affects lives/bonus only. The worker ACK alone grants a successful route. */
export class FileRushEngine {
  private listeners = new Set<() => void>();
  private queue: ManifestEntry[] = [];
  private generation = 0;
  private state: GameState = {
    phase: 'tutorial', mode: 'rush', score: 0, combo: 0, bestCombo: 0, lives: 3,
    confirmed: 0, lane: 0, elapsed: 0, duration: 8000, packet: null, gates: [],
    feedback: 'Route the actual filename to its category gate.', pauseRequested: false,
  };
  constructor(private request: (entryId: number, actionId: string) => Promise<PacketReceipt>) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private update(patch: Partial<GameState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }

  reset() {
    this.generation++; this.queue = [];
    this.update({ phase: 'tutorial', mode: 'rush', score: 0, combo: 0, bestCombo: 0, lives: 3,
      confirmed: 0, lane: 0, elapsed: 0, duration: 8000, packet: null, gates: [],
      feedback: 'Route the actual filename to its category gate.', pauseRequested: false });
  }

  start(entries: ManifestEntry[], mode: GameMode) {
    if (!['tutorial', 'lost'].includes(this.state.phase)) return;
    this.generation++;
    this.queue = entries.filter((entry) => entry.status === 'pending' && entry.category !== null);
    this.update({ mode, lives: 3, combo: 0, pauseRequested: false });
    this.next('Ready. Choose a gate and route the packet.');
  }
  private next(feedback: string) {
    const packet = this.queue[0] ?? null;
    this.update({
      packet, gates: packet ? gatesFor(packet) : [], lane: 1, elapsed: 0,
      duration: Math.max(3000, 8000 - this.state.confirmed * 180),
      phase: packet ? (this.state.pauseRequested ? 'paused' : 'playing') : 'finishing', feedback,
    });
  }
  move(delta: number) { if (this.state.phase === 'playing') this.update({ lane: (this.state.lane + delta + 4) % 4 }); }
  select(lane: number) { if (this.state.phase === 'playing' && Number.isInteger(lane) && lane >= 0 && lane < 4) this.update({ lane }); }
  tick(delta: number) {
    if (this.state.phase !== 'playing' || this.state.mode === 'calm' || !Number.isFinite(delta) || delta < 0) return;
    const elapsed = this.state.elapsed + delta;
    if (elapsed >= this.state.duration) this.miss('Packet timed out. Its file is still pending.');
    else this.update({ elapsed });
  }
  private miss(feedback: string) {
    const lives = this.state.lives - 1;
    this.update({ lives, combo: 0, elapsed: 0, phase: lives === 0 ? 'lost' : 'playing', feedback });
  }
  async route() {
    const { packet, gates, lane, phase, elapsed, duration, mode } = this.state;
    if (phase !== 'playing' || !packet) return;
    if (gates[lane] !== packet.category) { this.miss('Wrong gate. No file moved. Try another category.'); return; }
    const generation = this.generation;
    this.update({ phase: 'waiting', feedback: 'Routing… waiting for verified file copy.' });
    try {
      const receipt = await this.request(packet.id, `route-${packet.id}`);
      if (generation !== this.generation) return;
      if (receipt.requestId !== `game-route-${packet.id}` || receipt.entry.id !== packet.id
        || receipt.entry.status !== 'processed' || !receipt.entry.outputPath) throw new Error('The expected file was not confirmed.');
      const combo = this.state.combo + 1;
      const points = 100 + Math.min(combo - 1, 9) * 25 + (mode === 'rush' ? Math.round(100 * (1 - elapsed / duration)) : 0);
      this.queue.shift();
      this.update({ score: this.state.score + points, combo, bestCombo: Math.max(combo, this.state.bestCombo), confirmed: this.state.confirmed + 1 });
      this.next(`+${points} · ${receipt.entry.outputPath} verified!`);
    } catch (cause) {
      if (generation !== this.generation) return;
      this.stop('error', cause instanceof Error ? cause.message : 'The worker could not confirm this packet.');
    }
  }
  pause() {
    if (this.state.phase === 'playing') this.update({ phase: 'paused', pauseRequested: true });
    else if (this.state.phase === 'waiting') this.update({ pauseRequested: true });
  }
  resume() {
    if (this.state.phase === 'paused') this.update({ phase: 'playing', pauseRequested: false });
    else if (this.state.phase === 'waiting') this.update({ pauseRequested: false });
  }
  stop(phase: 'finishing' | 'complete' | 'error' | 'cancelled', feedback: string) {
    this.generation++;
    this.update({ phase, feedback, pauseRequested: false });
  }
}
