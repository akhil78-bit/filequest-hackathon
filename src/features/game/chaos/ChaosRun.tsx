import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { ZipWorkspace } from '../../../components/ZipWorkspace';
import type { Organizer } from '../../../components/ZipWorkspace';
import { CATEGORIES } from '../../organizer/classify';
import { ChaosEngine, multiplier } from './model';
import type { RunMode } from './model';
import { WorkScheduler } from './work-scheduler';
import { RunnerCanvas } from './RunnerCanvas';
import { createChaosDemo } from './demo';
import './chaos.css';

const InventoryControls = memo(ZipWorkspace);
const laneNames = ['left', 'center', 'right'];
const entityNames = { orb: 'energy', barrier: 'crate', sweeper: 'moving hazard', shield: 'shield', magnet: 'magnet', repair: 'repair' };

export function ChaosRun({ organizer }: { organizer: Organizer }) {
  const bonus = useRef(false);
  const [work] = useState(() => new WorkScheduler(organizer.requestEarnedBatch));
  const [engine] = useState(() => new ChaosEngine((event) => { if (!bonus.current) work.grant(event.id, event.files); }));
  const game = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const job = useSyncExternalStore(work.subscribe, work.getSnapshot);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [mode, setMode] = useState<RunMode>(() => reduced ? 'calm' : 'rush');
  const arena = useRef<HTMLElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const previousJob = useRef(organizer.jobId);
  const demoRequested = useRef(false);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const progress = organizer.manifest?.progress;
  const canPlay = organizer.manifest !== null && ['ready', 'processing', 'complete'].includes(organizer.phase);
  const active = ['playing', 'paused', 'gameover'].includes(game.phase);
  const overlay = game.phase !== 'playing';
  const remaining = organizer.manifest?.entries.filter((entry) => entry.status === 'pending' && entry.category !== null).length ?? 0;
  const readyForFinish = organizer.manifest !== null && ['ready', 'processing'].includes(organizer.phase);

  const pause = useCallback(() => { work.pause(); engine.pause(); }, [work, engine]);
  const resume = () => { engine.resume(); arena.current?.focus(); };
  const finish = useCallback(() => {
    demoRequested.current = false; work.assist();
    engine.stop('finishing', 'Finishing remaining files without gameplay. These copies are shown separately from game-earned work.');
    organizer.finishSorting();
  }, [engine, work, organizer.finishSorting]);
  const cancel = useCallback(() => {
    demoRequested.current = false; work.cancel(); engine.stop('cancelled', 'Quest cancelled. Your original archive is untouched.'); organizer.cancel();
  }, [engine, work, organizer.cancel]);

  useEffect(() => {
    const sync = () => { if (engine.getSnapshot().phase === 'playing' && !bonus.current) work.resume(); else work.pause(); };
    const unsubscribe = engine.subscribe(sync); sync();
    return () => { work.pause(); unsubscribe(); };
  }, [engine, work]);

  useEffect(() => {
    if (previousJob.current !== organizer.jobId) {
      previousJob.current = organizer.jobId; bonus.current = false; work.reset(); engine.reset(true);
    }
    if (organizer.phase === 'ready' && organizer.manifest && demoRequested.current) {
      demoRequested.current = false; engine.start(mode); arena.current?.focus();
    }
    if (organizer.phase === 'complete' && organizer.downloadUrl && !bonus.current && game.phase !== 'victory') {
      work.assist(); engine.stop('victory', 'Quest complete. The organized ZIP and every exported file have been verified.');
    }
    if (organizer.phase === 'error' && game.phase !== 'error') { demoRequested.current = false; work.cancel(); engine.stop('error', organizer.error); }
    if (organizer.phase === 'cancelled' && game.phase !== 'cancelled') { demoRequested.current = false; work.cancel(); engine.stop('cancelled', 'Cancelled safely. No partial ZIP was exported.'); }
  }, [engine, work, organizer.jobId, organizer.phase, organizer.manifest, organizer.downloadUrl, organizer.error, mode, game.phase]);

  useEffect(() => {
    if (job.error && game.phase !== 'error' && game.phase !== 'cancelled') engine.stop('error', job.error);
  }, [job.error, engine, game.phase]);

  useEffect(() => {
    // Announce state changes and recover focus from controls that disappear or
    // become disabled. Never pull focus back from the ZIP panel or another app.
    if (game.phase !== 'playing' && game.phase !== 'tutorial' && document.hasFocus()
      && panel.current?.contains(document.activeElement)) dialog.current?.focus({ preventScroll: true });
  }, [game.phase]);

  useEffect(() => {
    const visibility = () => { if (document.hidden) pause(); };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => { setReduced(media.matches); if (media.matches) pause(); };
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility); media.addEventListener('change', preference);
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', preference); };
  }, [pause]);

  const start = (choice = mode) => {
    if (!canPlay) return;
    if (organizer.phase === 'complete') bonus.current = true;
    if (!bonus.current && remaining === 0) { finish(); return; }
    engine.start(choice, bonus.current); arena.current?.focus();
  };
  const demo = () => {
    bonus.current = false; demoRequested.current = true;
    void organizer.load(new File([createChaosDemo()], 'filequest-chaos-demo.zip', { type: 'application/zip' }));
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey
      || (event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (['arrowleft', 'a', 'arrowright', 'd'].includes(key)) { event.preventDefault(); engine.move(key === 'arrowleft' || key === 'a' ? -1 : 1); }
    else if (/^[1-3]$/.test(key)) { event.preventDefault(); engine.select(Number(key) - 1); }
    else if (key === 'p' || key === 'escape') { event.preventDefault(); if (game.phase === 'paused') resume(); else pause(); }
    else if ((key === ' ' || key === 'enter') && event.target === arena.current && game.mode === 'calm') { event.preventDefault(); engine.step(); }
  };
  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    if (game.phase !== 'playing' || (event.target as HTMLElement).tagName === 'BUTTON') return;
    swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus();
  };
  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    const first = swipe.current; swipe.current = null;
    if (!first || first.id !== event.pointerId) return;
    const dx = event.clientX - first.x, dy = event.clientY - first.y;
    if (Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy)) engine.move(dx > 0 ? 1 : -1);
  };
  const incoming = game.entities.filter((entity) => !entity.resolved && entity.z > .15 && entity.z < .86).sort((a, b) => b.z - a.z).slice(0, 3);
  const score = Math.floor(game.score);

  return <div className="chaos-layout">
    <section ref={panel} className="chaos-game" aria-labelledby="chaos-title" onKeyDown={keyboard}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pause(); }}>
      <div className="chaos-heading"><div><p className="eyebrow">ARCADE WITH AN ACTUAL PAYOFF</p><h2 id="chaos-title">CHAOS <span>RUN</span><sup>↗</sup></h2></div><span className="chaos-badge">{bonus.current ? 'BONUS RUN / ZIP COMPLETE' : game.mode === 'calm' && game.phase !== 'tutorial' ? 'CALM / YOU SET THE PACE' : 'DODGE · COLLECT · ORGANIZE'}</span></div>
      <div className="chaos-hud" aria-label="Run statistics">
        <div><span>Run score</span><strong>{score.toLocaleString().padStart(5, '0')}</strong></div>
        <div><span>Hull integrity</span><strong className="health-pips" role="img" aria-label={`${game.health} of 3 health`}>{'◆'.repeat(game.health)}<i aria-hidden="true">{'◇'.repeat(3 - game.health)}</i></strong></div>
        <div><span>Speed</span><strong>{game.speed.toFixed(1)}<small>×</small></strong></div>
        <div><span>Combo</span><strong className="lime">×{multiplier(game.combo)}</strong></div>
      </div>
      <section ref={arena} className={`chaos-stage ${reduced ? 'reduced-effects' : ''}`} tabIndex={0} aria-label="Chaos Run game arena" aria-describedby="chaos-keys chaos-track"
        onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { swipe.current = null; }}>
        <RunnerCanvas engine={engine} reduced={reduced} />
        <div className="track-labels" aria-hidden="true"><span>SECTOR {String(game.waves + 1).padStart(2, '0')}</span><span>{Math.floor(game.distance)} M</span></div>
        {!overlay && <div className="power-hud"><span>{game.shield > 0 ? `S SHIELD ${Math.ceil(game.shield / 1000)}s` : 'S SHIELD OFFLINE'}</span><span>{game.magnet > 0 ? `M MAGNET ${Math.ceil(game.magnet / 1000)}s` : 'M MAGNET OFFLINE'}</span></div>}
        {overlay && <div className="chaos-overlay"><div ref={dialog} className="chaos-dialog" role="group" tabIndex={-1} aria-label={`Run state: ${game.phase}`}>
          {game.phase === 'tutorial' && <><span className="dialog-mark" aria-hidden="true">↯</span><p className="eyebrow">OUTRUN THE CLUTTER</p><h3>Play fast.<br /><em>Leave organized.</em></h3><p>Pilot the neon stream. Dodge crates, collect energy and unlock real file-sorting batches as you go.</p>
            <div className="chaos-mode" role="group" aria-label="Game mode"><button aria-pressed={mode === 'rush'} onClick={() => setMode('rush')}>Chaos mode<small>Endless runner · 3 health</small></button><button aria-pressed={mode === 'calm'} onClick={() => setMode('calm')}>Calm mode<small>No timer · advance by choice</small></button></div>
            <button className="primary-button" disabled={organizer.phase === 'reading' || organizer.batchBusy} onClick={() => canPlay ? start() : demo()}>{organizer.phase === 'reading' ? 'Preparing your inventory…' : canPlay ? remaining === 0 ? 'Finalize empty inventory' : `Run with ${remaining} files ↗` : 'Play instant demo ↗'}</button>
            <small>120 real synthetic files. No upload needed.<br />← → / A D or swipe to steer. Lime diamonds earn batches.</small>
          </>}
          {game.phase === 'paused' && <><span className="dialog-mark" aria-hidden="true">Ⅱ</span><h3>Hold your lane.</h3><p>The runner is paused. Already-earned work may finish; no new gameplay batches start until you resume.</p><button className="primary-button" onClick={resume}>Resume run</button><button className="text-button" onClick={() => { setMode('calm'); start('calm'); }}>Restart in calm mode · keep file progress</button></>}
          {game.phase === 'gameover' && <><span className="dialog-mark danger" aria-hidden="true">◇</span><p className="eyebrow">RUN OVER · FILES SAFE</p><h3>A crash.<br /><em>Not a lost file.</em></h3><p>{score.toLocaleString()} points · {Math.floor(game.distance)} m<br />{progress?.processed ?? 0} files copied so far. Restart keeps this progress.</p><button className="primary-button" disabled={!canPlay} onClick={() => start()}>Restart runner ↗</button><button className="secondary-button" disabled={!canPlay} onClick={() => { setMode('calm'); start('calm'); }}>Continue in calm mode</button>{readyForFinish && <button className="text-button" onClick={finish}>Finish remaining files without playing</button>}</>}
          {game.phase === 'finishing' && <><span className="dialog-mark" aria-hidden="true">◈</span><h3>Securing the loot.</h3><p>{game.feedback}</p><p>Download unlocks after ZIP finalization and byte verification.</p></>}
          {game.phase === 'victory' && <><span className="victory-mark" aria-hidden="true">✓</span><p className="eyebrow">QUEST COMPLETE / INVENTORY VERIFIED</p><h3>Chaos conquered.</h3><p>{progress?.processed ?? 0} files organized · {score.toLocaleString()} points<br />{job.earned} files earned through play · {Math.max(0, (progress?.processed ?? 0) - job.earned)} finished otherwise</p>{organizer.downloadUrl && <a className="primary-button download-button" href={organizer.downloadUrl} download="filequest-organized.zip">Download organized ZIP ↓</a>}<div className="dialog-actions"><button className="text-button" onClick={() => start()}>Continue endless bonus run</button><button className="text-button" onClick={demo}>New synthetic quest</button></div></>}
          {(game.phase === 'error' || game.phase === 'cancelled') && <><span className="dialog-mark" aria-hidden="true">{game.phase === 'error' ? '!' : '■'}</span><h3>{game.phase === 'error' ? 'Stopped safely.' : 'Take another route.'}</h3><p>{game.feedback}</p><p>Original files remain untouched. No partial ZIP is offered.</p><button className="primary-button" onClick={demo}>Start a fresh demo</button><button className="secondary-button" onClick={organizer.reset}>Choose another ZIP</button></>}
        </div></div>}
      </section>
      <div className="chaos-feedback" role="status" aria-live="polite"><span aria-hidden="true">›</span>{game.feedback}</div>
      <p id="chaos-track" className={game.mode === 'calm' && game.phase === 'playing' ? 'calm-track' : 'sr-only'}>Selected lane: {laneNames[game.lane]}. {incoming.length ? incoming.map((entity) => `${entityNames[entity.kind]} in ${laneNames[entity.lane]} lane`).join('; ') : 'Track ahead is clear.'}</p>
      <div className="chaos-controls"><button className="secondary-button" disabled={game.phase !== 'playing'} aria-label="Steer left" onClick={() => engine.move(-1)}>←</button>{game.mode === 'calm' ? <button className="primary-button" disabled={game.phase !== 'playing'} onClick={() => engine.step()}>Advance safely</button> : <span id="chaos-keys"><kbd>←</kbd><kbd>→</kbd> / A D steer<br /><kbd>P</kbd> pause · swipe on mobile</span>}<button className="secondary-button" disabled={game.phase !== 'playing'} aria-label="Steer right" onClick={() => engine.move(1)}>→</button>
        {['playing', 'paused'].includes(game.phase) && <button className="secondary-button" onClick={() => game.phase === 'paused' ? resume() : pause()}>{game.phase === 'paused' ? 'Resume' : 'Pause'}</button>}
      </div>
      {game.mode === 'calm' && <p id="chaos-keys" className="helper">No clock runs. Move with arrows / A D / 1–3, then press Space or Advance. Choose Finish sorting at any time.</p>}
      <div className="chaos-legend" aria-label="Collectibles and hazards"><span>◆ Energy → up to 8 files</span><span>▧ Avoid crates</span><span>S Shield</span><span>M Magnet</span><span>+ Repair</span><span>Wave → up to 16 files</span></div>
      <div className="chaos-bottom"><label><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} /> Reduced effects</label>{readyForFinish && <button className="text-button" onClick={finish}>Finish sorting without playing ↗</button>}{active && <button className="text-button" onClick={cancel}>Cancel quest</button>}</div>
    </section>
    <aside className="chaos-inventory" aria-label="Actual file organization">
      <section className="panel chaos-mission"><div className="mission-top"><p className="eyebrow">THE REAL REWARD</p><span className={`worker-indicator ${job.busy ? 'busy' : ''}`}>{job.busy ? 'SORTING FILES' : 'ON YOUR DEVICE'}</span></div><h2>A clean inventory.</h2><p>Play the runner. Take home organized files.</p>
        <div className="actual-total"><strong>{progress?.processed ?? 0}<small> / {progress ? progress.total - progress.skipped : 0}</small></strong><span>FILES VERIFIED & COPIED</span></div>
        <progress aria-label="Actual file organization progress" value={progress?.processed ?? 0} max={Math.max(1, progress ? progress.total - progress.skipped : 1)} />
        <dl className="chaos-counts"><div><dt>Remaining</dt><dd>{progress?.remaining ?? 0}</dd></div><div><dt>Skipped</dt><dd>{progress?.skipped ?? 0}</dd></div><div><dt>Failed</dt><dd>{progress?.failed ?? 0}</dd></div></dl>
        <div className="earned-counts"><span>Game-earned <b>{job.earned}</b></span><span>Finish / other <b>{Math.max(0, (progress?.processed ?? 0) - job.earned)}</b></span></div>
        <p className="ack-feedback" role="status" aria-live="polite">{job.busy ? 'Copying and checking your earned files. Totals update after verification.' : job.batches ? `${job.lastFiles} files verified in the last batch. ${job.batches} earned batches completed.` : 'Collect energy or survive a wave to start organizing.'}{job.credit ? ` Next earned credit: up to ${job.credit} files.` : ''}</p>
        <div className="category-list" aria-label="Successfully processed files by category">{CATEGORIES.map((category) => <span key={category}>{category} {organizer.manifest?.entries.filter((entry) => entry.category === category && entry.status === 'processed').length ?? 0}</span>)}</div>
        <p className="helper">Your files are processed on this device. Download an organized copy; originals stay untouched.</p>
      </section>
      <section className="panel chaos-zip"><InventoryControls organizer={organizer} gameActive={active} onFinish={finish} onCancel={cancel} /></section>
    </aside>
  </div>;
}
