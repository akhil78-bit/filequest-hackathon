import { useEffect, useRef } from 'react';
import type { ChaosEngine } from './model';
import { paintRun } from './render';

export function RunnerCanvas({ engine, reduced }: { engine: ChaosEngine; reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    let width = 600, height = 440, frame = 0, looping = false, last = 0, simulation = 0;
    let playerX = engine.getSnapshot().x;
    const draw = () => {
      const state = engine.getSnapshot();
      playerX = reduced || state.mode === 'calm' ? state.x : playerX + (state.x - playerX) * .4;
      paintRun(ctx, state, width, height, reduced, playerX, looping ? simulation : 0);
    };
    const animate = (now: number) => {
      if (!looping) return;
      simulation += Math.min(100, Math.max(0, now - last)); last = now;
      if (simulation >= 45) { const delta = simulation; simulation = 0; engine.advance(delta); }
      draw();
      if (looping) frame = requestAnimationFrame(animate);
    };
    const changed = () => {
      const state = engine.getSnapshot(), shouldRun = state.phase === 'playing' && state.mode === 'rush';
      if (shouldRun && !looping) { looping = true; last = performance.now(); simulation = 0; frame = requestAnimationFrame(animate); }
      else if (!shouldRun) { looping = false; cancelAnimationFrame(frame); draw(); }
    };
    const resize = () => {
      const rect = element.getBoundingClientRect(); width = rect.width || 600; height = rect.height || 440;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); draw();
    };
    const observer = new ResizeObserver(resize); observer.observe(element);
    const unsubscribe = engine.subscribe(changed); resize(); changed();
    return () => { looping = false; cancelAnimationFrame(frame); observer.disconnect(); unsubscribe(); };
  }, [engine, reduced]);
  return <canvas ref={canvas} className="runner-canvas" role="img" aria-label="Three-lane neon track. Lime diamonds are energy, pink crates are obstacles, arrows mark moving hazards. S is shield, M is magnet, plus repairs health. See the track description and controls below." />;
}
