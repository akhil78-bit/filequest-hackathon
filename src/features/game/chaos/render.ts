import { hazardDestination, PLAYER_Z } from './model';
import type { RunState } from './model';

export function project(lane: number, z: number, width: number, height: number) {
  const depth = Math.max(0, Math.min(1.2, z));
  const scale = .12 + Math.pow(depth, 1.35) * .84;
  return { x: width / 2 + (lane - 1) * width * scale / 3, y: height * .18 + Math.pow(depth, 1.45) * height * .77, size: scale };
}

/** Original procedural art only: perspective track, hovercraft, hazards and particles. */
export function paintRun(ctx: CanvasRenderingContext2D, state: RunState, width: number, height: number, reduced: boolean, playerX = state.x, interpolation = 0) {
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#0a1426'); sky.addColorStop(.65, '#101b2b'); sky.addColorStop(1, '#050b14');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
  for (let index = 0; index < 45; index++) {
    const x = ((index * 173 + 59) % 997) / 997 * width;
    const y = ((index * 71 + 17) % 299) / 299 * height * .47;
    ctx.fillStyle = index % 5 ? '#63869d77' : '#c3efa7aa'; ctx.fillRect(x, y, 1.5, 1.5);
  }
  // Skyline silhouettes and a neon horizon.
  ctx.fillStyle = '#14253c';
  for (let index = 0; index < 18; index++) {
    const towerHeight = 15 + (index * 73 % 57), x = index * width / 17;
    ctx.fillRect(x, height * .23 - towerHeight, width / 26, towerHeight);
  }
  const glow = ctx.createRadialGradient(width / 2, height * .21, 0, width / 2, height * .21, width * .38);
  glow.addColorStop(0, '#9e83ff2b'); glow.addColorStop(1, '#9e83ff00'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height * .65);
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, weight = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  ctx.fillStyle = '#101a24'; ctx.beginPath(); ctx.moveTo(width * .44, height * .18); ctx.lineTo(width * .56, height * .18); ctx.lineTo(width * 1.02, height); ctx.lineTo(-width * .02, height); ctx.closePath(); ctx.fill();
  for (const boundary of [-.5, .5, 1.5, 2.5]) {
    const start = project(boundary, 0, width, height), end = project(boundary, 1.08, width, height);
    line(start.x, start.y, end.x, end.y, boundary === -.5 || boundary === 2.5 ? '#75e3ef88' : '#749fb044', 1.4);
  }
  for (let index = 0; index < 16; index++) {
    const z = ((index / 16 + (reduced ? 0 : (state.distance + interpolation * .02 * state.speed) / 150)) % 1);
    const left = project(-.5, z, width, height), right = project(2.5, z, width, height);
    line(left.x, left.y, right.x, right.y, `rgba(100,160,210,${z * .14})`);
  }
  for (const entity of [...state.entities].sort((a, b) => a.z - b.z)) {
    if (entity.z < 0 || entity.z > 1.08 || entity.resolved) continue;
    const renderZ = entity.z + interpolation * .00019 * state.speed;
    const originLane = entity.originLane ?? entity.lane;
    const visualLane = entity.kind === 'sweeper'
      ? originLane + (hazardDestination(originLane) - originLane) * Math.max(0, Math.min(1, (renderZ - .42) / .1)) : entity.lane;
    const { x, y, size } = project(visualLane, renderZ, width, height);
    const radius = Math.max(4, Math.min(width * .055, 36) * size);
    ctx.save(); ctx.translate(x, y);
    if (entity.kind === 'orb') {
      ctx.shadowColor = '#cefa72'; ctx.shadowBlur = reduced ? 0 : 16;
      ctx.fillStyle = '#cefa72'; ctx.beginPath(); ctx.moveTo(0, -radius); ctx.lineTo(radius * .75, 0); ctx.lineTo(0, radius); ctx.lineTo(-radius * .75, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f7ffd9'; ctx.fillRect(-radius * .17, -radius * .5, radius * .34, radius);
    } else if (entity.kind === 'barrier' || entity.kind === 'sweeper') {
      ctx.fillStyle = '#372a40'; ctx.strokeStyle = '#ff879d'; ctx.lineWidth = Math.max(1.5, size * 2);
      ctx.beginPath(); ctx.roundRect(-radius, -radius * .85, radius * 2, radius * 1.7, 4); ctx.fill(); ctx.stroke();
      line(-radius * .6, -radius * .5, radius * .6, radius * .5, '#ff879d', 2);
      line(radius * .6, -radius * .5, -radius * .6, radius * .5, '#ff879d', 2);
      if (entity.kind === 'sweeper') { ctx.fillStyle = '#ffb8c5'; ctx.font = `bold ${Math.max(10, radius)}px monospace`; ctx.textAlign = 'center'; ctx.fillText(originLane === 2 ? '←' : '→', 0, -radius * 1.1); }
    } else {
      ctx.strokeStyle = '#78dcff'; ctx.fillStyle = '#143649'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c2f4ff'; ctx.font = `bold ${Math.max(11, radius * 1.2)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(entity.kind === 'shield' ? 'S' : entity.kind === 'magnet' ? 'M' : '+', 0, 0);
    }
    ctx.restore();
  }
  const player = project(playerX, PLAYER_Z, width, height), hull = Math.min(30, width * .052);
  ctx.save(); ctx.translate(player.x, player.y);
  if (state.shield > 0 || state.invulnerable > 0) {
    ctx.strokeStyle = state.shield > 0 ? '#7ddfff' : '#ff95aa'; ctx.lineWidth = 2;
    ctx.fillStyle = state.shield > 0 ? '#7ddfff18' : '#ff95aa15'; ctx.beginPath(); ctx.ellipse(0, 0, hull * 1.7, hull * 1.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#75e3ef44'; ctx.beginPath(); ctx.moveTo(-hull * .55, hull); ctx.lineTo(0, hull * (reduced ? 2 : 2.3 + Math.sin(state.elapsed / 90) * .25)); ctx.lineTo(hull * .55, hull); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = reduced ? 0 : 20; ctx.shadowColor = '#75e3ef';
  ctx.fillStyle = '#92eaf4'; ctx.beginPath(); ctx.moveTo(0, -hull * 1.35); ctx.lineTo(hull, hull * .85); ctx.lineTo(hull * .45, hull * 1.15); ctx.lineTo(-hull * .45, hull * 1.15); ctx.lineTo(-hull, hull * .85); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#1b353b'; ctx.beginPath(); ctx.moveTo(0, -hull * .65); ctx.lineTo(hull * .4, hull * .35); ctx.lineTo(-hull * .4, hull * .35); ctx.closePath(); ctx.fill();
  line(-hull * .72, hull * .6, -hull * .5, hull * .6, '#fffce4', 3);
  line(hull * .72, hull * .6, hull * .5, hull * .6, '#fffce4', 3);
  ctx.restore();
  if (!reduced) for (const spark of state.sparks) {
    const age = Math.min(550, spark.age + interpolation);
    const origin = project(spark.x, spark.z, width, height), travel = age * .13;
    ctx.globalAlpha = 1 - age / 550; ctx.fillStyle = spark.color;
    ctx.fillRect(origin.x + Math.cos(spark.angle) * travel, origin.y + Math.sin(spark.angle) * travel, 3, 3);
  }
  ctx.globalAlpha = 1;
  if (state.magnet > 0) {
    ctx.strokeStyle = '#7ddfff55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(player.x, player.y, width * .28, 34, 0, Math.PI, Math.PI * 2); ctx.stroke();
  }
}
