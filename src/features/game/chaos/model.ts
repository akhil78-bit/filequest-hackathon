export type RunMode = 'rush' | 'calm';
export type RunPhase = 'tutorial' | 'playing' | 'paused' | 'gameover' | 'finishing' | 'victory' | 'error' | 'cancelled';
export type EntityKind = 'orb' | 'barrier' | 'sweeper' | 'shield' | 'magnet' | 'repair';
export interface Entity { id: number; kind: EntityKind; lane: number; z: number; shifted: boolean; resolved: boolean; originLane?: number }
export interface Spark { x: number; z: number; age: number; color: string; angle: number }
export interface Milestone { id: number; kind: 'orb' | 'wave' | 'distance'; files: number }
export interface RunState {
  phase: RunPhase; mode: RunMode; bonus: boolean; lane: number; x: number; elapsed: number; distance: number;
  score: number; health: number; combo: number; bestCombo: number; orbs: number; waves: number;
  speed: number; shield: number; magnet: number; invulnerable: number; spawnIn: number;
  nextEntity: number; eventSerial: number; entities: Entity[]; sparks: Spark[]; feedback: string;
}
export const PLAYER_Z = .86;
export const hazardDestination = (lane: number) => lane === 2 ? 1 : lane + 1;
export const multiplier = (combo: number) => Math.min(5, 1 + Math.floor(combo / 4));
export function freshRun(mode: RunMode = 'rush', serial = 0): RunState {
  return { phase: 'tutorial', mode, bonus: false, lane: 1, x: 1, elapsed: 0, distance: 0, score: 0,
    health: 3, combo: 0, bestCombo: 0, orbs: 0, waves: 0, speed: 1, shield: 0, magnet: 0,
    invulnerable: 0, spawnIn: 400, nextEntity: 1, eventSerial: serial, entities: [], sparks: [],
    feedback: 'Dodge the clutter. Collect energy. Organize real files.' };
}

/** Pure fixed-step simulation. Only actual pickups/survival milestones emit work credit. */
export function stepRun(previous: RunState, milliseconds: number): { state: RunState; milestones: Milestone[] } {
  if (previous.phase !== 'playing' || !Number.isFinite(milliseconds) || milliseconds <= 0) return { state: previous, milestones: [] };
  const state: RunState = { ...previous, entities: previous.entities.map((entity) => ({ ...entity })), sparks: previous.sparks.map((spark) => ({ ...spark })) };
  const milestones: Milestone[] = [];
  const emit = (kind: Milestone['kind'], files: number) => { if (!state.bonus) milestones.push({ id: ++state.eventSerial, kind, files }); };
  const burst = (lane: number, color: string) => {
    for (let index = 0; index < 10; index++) state.sparks.push({ x: lane, z: PLAYER_Z, age: 0, color, angle: index * Math.PI / 5 });
    state.sparks = state.sparks.slice(-60);
  };
  for (let remaining = Math.min(milliseconds, 1000); remaining > 0 && state.phase === 'playing';) {
    const dt = Math.min(20, remaining); remaining -= dt;
    const oldDistance = state.distance;
    state.elapsed += dt; state.distance += dt * .02 * state.speed;
    state.speed = state.mode === 'calm' ? .8 : Math.min(2.5, 1 + state.elapsed / 45000);
    state.score += dt * .02 * state.speed;
    state.x += Math.sign(state.lane - state.x) * Math.min(Math.abs(state.lane - state.x), dt * .009);
    state.shield = Math.max(0, state.shield - dt); state.magnet = Math.max(0, state.magnet - dt);
    state.invulnerable = Math.max(0, state.invulnerable - dt);
    state.spawnIn -= dt;
    if (state.spawnIn <= 0 && state.entities.length < 40) {
      const row = Math.floor(state.nextEntity / 2), obstacleLane = (row * 7 + Math.floor(row / 3)) % 3;
      const moving = row % 5 === 4;
      const finalLane = moving ? hazardDestination(obstacleLane) : obstacleLane;
      const safe = (finalLane + 1 + row % 2) % 3;
      state.entities.push({ id: state.nextEntity++, kind: moving ? 'sweeper' : 'barrier', lane: obstacleLane, originLane: obstacleLane, z: -.08, shifted: false, resolved: false });
      state.entities.push({ id: state.nextEntity++, kind: 'orb', lane: safe, z: -.08, shifted: false, resolved: false });
      if (row % 4 === 0) state.entities.push({ id: state.nextEntity++, kind: (['shield', 'magnet', 'repair'] as const)[Math.floor(row / 4) % 3]!, lane: safe, z: -.25, shifted: false, resolved: false });
      state.spawnIn = Math.max(700, 1300 - state.elapsed / 180);
    }
    for (const entity of state.entities) {
      if (state.phase !== 'playing') break;
      const priorZ = entity.z;
      entity.z += dt * .00019 * state.speed;
      if (entity.kind === 'sweeper' && entity.z >= .46 && !entity.shifted) { entity.originLane ??= entity.lane; entity.lane = hazardDestination(entity.lane); entity.shifted = true; }
      if (entity.resolved || priorZ > PLAYER_Z || entity.z < PLAYER_Z) continue;
      entity.resolved = true;
      const near = Math.abs(entity.lane - state.x) < .38;
      if (!near && !(entity.kind === 'orb' && state.magnet > 0)) continue;
      if (entity.kind === 'orb') {
        state.orbs++; state.combo++; state.bestCombo = Math.max(state.bestCombo, state.combo);
        state.score += 100 * multiplier(state.combo); burst(entity.lane, '#cefa72'); emit('orb', 8);
        state.feedback = `Energy collected · ×${multiplier(state.combo)} combo · ${state.bonus ? 'bonus points only' : 'sorting credit earned'}`;
      } else if (entity.kind === 'barrier' || entity.kind === 'sweeper') {
        if (state.invulnerable > 0) continue;
        if (state.shield > 0) { state.shield = 0; state.feedback = 'Shield absorbed the impact.'; burst(entity.lane, '#7ddfff'); }
        else { state.health--; state.combo = 0; state.feedback = 'Clutter collision · change lanes!'; burst(entity.lane, '#ff7c91'); }
        state.invulnerable = 1600;
        if (!state.health) { state.phase = 'gameover'; state.feedback = 'Run over. Completed file work is safe. Restart or finish the ZIP.'; }
      } else {
        if (entity.kind === 'shield') state.shield = 10000;
        if (entity.kind === 'magnet') state.magnet = 7000;
        if (entity.kind === 'repair') state.health = Math.min(3, state.health + 1);
        state.score += 50; burst(entity.lane, '#7ddfff'); state.feedback = `${entity.kind === 'shield' ? 'Shield online' : entity.kind === 'magnet' ? 'Magnet online · all lanes collect energy' : 'Hull repaired'}!`;
      }
    }
    if (state.phase === 'playing') {
      const waves = Math.floor(state.elapsed / 10000);
      if (waves > state.waves) { state.waves = waves; emit('wave', 16); state.feedback = `Wave ${waves} survived · ${state.bonus ? 'bonus run / ZIP already complete' : 'sorting credit earned'}`; }
      if (Math.floor(state.distance / 400) > Math.floor(oldDistance / 400)) emit('distance', 24);
    }
    state.entities = state.entities.filter((entity) => entity.z < 1.12);
    state.sparks = state.sparks.map((spark) => ({ ...spark, age: spark.age + dt })).filter((spark) => spark.age < 550);
  }
  return { state, milestones };
}

export class ChaosEngine {
  private state = freshRun();
  private listeners = new Set<() => void>();
  constructor(private milestone: (event: Milestone) => void) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(state: RunState) { this.state = state; for (const listener of this.listeners) listener(); }
  reset(newArchive = false) { this.update(freshRun('rush', newArchive ? 0 : this.state.eventSerial)); }
  start(mode: RunMode, bonus = false) {
    if (!['tutorial', 'paused', 'gameover', 'victory'].includes(this.state.phase)) return;
    this.update({ ...freshRun(mode, this.state.eventSerial), bonus, phase: 'playing', feedback: mode === 'calm' ? 'Calm: move, then Advance when ready. Nothing moves on a timer.' : 'Stay in the clear lane. Catch the energy stream.' });
  }
  move(delta: number) { if (this.state.phase === 'playing' && (delta === -1 || delta === 1)) this.select(this.state.lane + delta); }
  select(lane: number) { if (this.state.phase === 'playing' && Number.isInteger(lane)) this.update({ ...this.state, lane: Math.max(0, Math.min(2, lane)), ...(this.state.mode === 'calm' ? { x: Math.max(0, Math.min(2, lane)) } : {}) }); }
  advance(delta: number) { if (this.state.mode === 'rush') this.simulate(Math.min(delta, 100)); }
  step() { if (this.state.mode === 'calm') this.simulate(350); }
  private simulate(delta: number) {
    const { state, milestones } = stepRun(this.state, delta);
    if (state === this.state) return;
    // Deliver milestones earned earlier in this frame before game-over pauses
    // the scheduler; a later collision must not erase a survived wave/pickup.
    for (const event of milestones) this.milestone(event);
    this.update(state);
  }
  pause() { if (this.state.phase === 'playing') this.update({ ...this.state, phase: 'paused', feedback: 'Paused. No new gameplay work is requested.' }); }
  resume() { if (this.state.phase === 'paused') this.update({ ...this.state, phase: 'playing', feedback: 'Back in the stream.' }); }
  stop(phase: 'finishing' | 'victory' | 'error' | 'cancelled', feedback: string) { this.update({ ...this.state, phase, feedback }); }
}
