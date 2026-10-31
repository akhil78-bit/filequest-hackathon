import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import { ZipWorkspace } from '../../components/ZipWorkspace';
import type { Organizer } from '../../components/ZipWorkspace';
import { CATEGORIES } from '../organizer/classify';
import { createDemoZip } from '../organizer/demo-zip';
import { FileRushEngine } from './engine';
import type { GameMode } from './engine';
import './game.css';

const ZipControls = memo(ZipWorkspace);
const categoryIcons = { Images: '▧', Documents: '▤', Spreadsheets: '▦', Code: '⌘', Archives: '▣', Audio: '♫', Videos: '▷', Other: '◇' };

export function FileRush({ organizer }: { organizer: Organizer }) {
  const [engine] = useState(() => new FileRushEngine(organizer.requestPacket));
  const game = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [mode, setMode] = useState<GameMode>(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'calm' : 'rush');
  const arena = useRef<HTMLElement>(null);
  const demoRequested = useRef(false);
  const previousJob = useRef(organizer.jobId);
  const engaged = ['playing', 'paused', 'waiting', 'lost'].includes(game.phase);
  const prepared = organizer.manifest !== null && ['ready', 'processing'].includes(organizer.phase) && !organizer.batchBusy;
  const pendingFiles = organizer.manifest?.entries.filter((entry) => entry.status === 'pending' && entry.category !== null) ?? [];

  useEffect(() => {
    if (previousJob.current !== organizer.jobId) {
      previousJob.current = organizer.jobId; engine.reset();
    }
    if (organizer.phase === 'ready' && demoRequested.current && organizer.manifest) {
      demoRequested.current = false; engine.start(organizer.manifest.entries, mode); arena.current?.focus();
      if (!organizer.manifest.entries.some((entry) => entry.status === 'pending')) organizer.finishSorting();
    }
    if (organizer.phase === 'error') { demoRequested.current = false; engine.stop('error', organizer.error); }
    if (organizer.phase === 'cancelled') { demoRequested.current = false; engine.stop('cancelled', 'Sorting stopped. Your original ZIP is untouched.'); }
    if (organizer.phase === 'complete' && organizer.downloadUrl && game.phase !== 'complete') engine.stop('complete', 'Every exported file has been verified. Your organized ZIP is ready.');
  }, [engine, organizer.jobId, organizer.phase, organizer.manifest, organizer.error, organizer.downloadUrl, organizer.finishSorting, mode, game.phase]);

  useEffect(() => {
    if (game.phase !== 'playing' || game.mode !== 'rush') return;
    let last = performance.now(), frame = 0;
    const animate = (now: number) => {
      if (now - last >= 50) { engine.tick(now - last); last = now; }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [engine, game.phase, game.mode]);

  useEffect(() => {
    const pause = () => engine.pause();
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility); };
  }, [engine]);

  const finish = useCallback(() => {
    engine.stop('finishing', 'Finishing the remaining files without gameplay. Score is frozen.');
    organizer.finishSorting();
  }, [engine, organizer.finishSorting]);
  const cancel = useCallback(() => {
    demoRequested.current = false; engine.stop('cancelled', 'Cancelling file processing…'); organizer.cancel();
  }, [engine, organizer.cancel]);
  const start = () => {
    if (!prepared || !organizer.manifest) return;
    engine.start(organizer.manifest.entries, mode); arena.current?.focus();
    if (pendingFiles.length === 0) finish();
  };
  const playDemo = () => {
    demoRequested.current = true;
    void organizer.load(new File([createDemoZip()], 'file-rush-synthetic-demo.zip', { type: 'application/zip' }));
  };
  const route = () => { void engine.route(); };
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).tagName === 'INPUT') return;
    const key = event.key.toLowerCase();
    if (key === 'p' || key === 'escape') {
      event.preventDefault(); if (game.phase === 'paused' || game.pauseRequested) engine.resume(); else engine.pause();
    } else if (['arrowleft', 'a', 'arrowright', 'd'].includes(key)) {
      event.preventDefault(); engine.move(key === 'a' || key === 'arrowleft' ? -1 : 1);
    } else if (/^[1-4]$/.test(key)) { event.preventDefault(); engine.select(Number(key) - 1); }
    else if ((key === ' ' || key === 'enter') && event.target === event.currentTarget) { event.preventDefault(); route(); }
  };
  const progress = organizer.manifest?.progress;
  const overlay = !['playing', 'waiting'].includes(game.phase);

  return <div className="rush-layout">
    <section className="rush-panel" aria-labelledby="rush-title">
      <div className="rush-title-row"><div><p className="eyebrow">ARCADE / REAL FILE OPERATIONS</p><h2 id="rush-title">FILE <span>RUSH</span><span className="rush-version">01</span></h2></div><span className="pill">{(game.phase === 'tutorial' ? mode : game.mode) === 'calm' ? 'CALM / NO TIMER' : 'ROUTE · COPY · REPEAT'}</span></div>
      <div className="rush-hud" aria-label="Game score">
        <div><span>Score</span><strong>{game.score.toLocaleString().padStart(5, '0')}</strong></div>
        <div><span>Combo</span><strong className="lime">×{game.combo}</strong></div>
        <div><span>Lives</span><strong className="rush-lives" role="img" aria-label={`${game.lives} lives`}>{'◆'.repeat(game.lives)}<span aria-hidden="true">{'◇'.repeat(3 - game.lives)}</span></strong></div>
        <div><span>File ACKs</span><strong>{game.confirmed}</strong></div>
      </div>
      <section ref={arena} tabIndex={0} className={`rush-arena phase-${game.phase} ${game.mode === 'calm' ? 'calm-mode' : ''}`} aria-label="File Rush arena" aria-describedby="rush-controls"
        onKeyDown={keyboard} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) engine.pause(); }}>
        <div className="arena-topline" aria-hidden="true"><span>INCOMING FILE STREAM</span><span>LOCAL / SECURE</span></div>
        <div className="lane-tracks" aria-hidden="true">{[0, 1, 2, 3].map((lane) => <span key={lane} className={lane === game.lane ? 'selected' : ''} />)}</div>
        {game.packet && <div className="packet" title={game.packet.originalPath} style={{ left: `clamp(85px, ${12.5 + game.lane * 25}%, calc(100% - 85px))`, top: `${21 + (game.mode === 'calm' ? .35 : game.elapsed / game.duration) * 43}%` }}>
          <span className="packet-icon" aria-hidden="true">▤</span><span className="packet-name">{game.packet.originalPath.split('/').at(-1)}</span>
          <span className="packet-kind">.{game.packet.originalPath.split('.').at(-1)?.toLowerCase()} / PACKET {game.confirmed + 1}</span>
        </div>}
        {game.phase === 'waiting' && <div className="worker-signal"><span aria-hidden="true">◈</span> VERIFYING FILE BYTES{game.pauseRequested ? ' · PAUSE QUEUED' : ''}</div>}
        <div className="gate-row" aria-label="Category gates">{(game.gates.length ? game.gates : ['Images', 'Documents', 'Code', 'Other'] as const).map((category, lane) =>
          <button key={`${category}-${lane}`} className={`category-gate${lane === game.lane ? ' chosen' : ''}`} disabled={game.phase !== 'playing'}
            aria-label={`Route to ${category}, gate ${lane + 1}`} onClick={() => { engine.select(lane); route(); }}>
            <span className="gate-icon" aria-hidden="true">{categoryIcons[category]}</span><span>{category}</span><small>{lane + 1}</small>
          </button>)}</div>
        {overlay && <div className="arena-overlay"><div className="overlay-card">
          {game.phase === 'tutorial' && <>
            <span className="overlay-symbol" aria-hidden="true">↯</span><p className="eyebrow">YOUR FOLDER. YOUR HIGH SCORE.</p><h3>Beat the mess.</h3>
            <p>Steer each file packet into its matching category. Every correct route copies <b>one real file</b> into your organized ZIP.</p>
            <div className="mode-picker" role="group" aria-label="Choose game mode"><button aria-pressed={mode === 'rush'} onClick={() => setMode('rush')}>Rush <small>Speed + 3 lives</small></button><button aria-pressed={mode === 'calm'} onClick={() => setMode('calm')}>Calm <small>No time limit</small></button></div>
            <button className="primary-button" disabled={organizer.phase === 'reading' || organizer.batchBusy} onClick={prepared ? start : playDemo}>{organizer.phase === 'reading' ? 'Inspecting demo…' : prepared ? `Play ${pendingFiles.length} files ↗` : 'Play synthetic demo ↗'}</button>
            <small className="overlay-tip">← → / A D to steer · Space to route · or tap a gate<br />Use your ZIP in the inventory panel. Files stay on-device.</small>
          </>}
          {game.phase === 'paused' && <><span className="overlay-symbol" aria-hidden="true">Ⅱ</span><h3>Take a breather.</h3><p>The packet clock is paused. No new file operations are requested.</p><button className="primary-button" onClick={() => { engine.resume(); arena.current?.focus(); }}>Resume run</button><button className="text-button" onClick={finish}>Finish sorting without playing</button></>}
          {game.phase === 'lost' && <><span className="overlay-symbol" aria-hidden="true">◇</span><h3>Out of lives.<br />Your files are safe.</h3><p>{game.confirmed} files confirmed this run. Unrouted files are still pending.</p><button className="primary-button" disabled={!prepared} onClick={start}>Continue with 3 lives</button><button className="secondary-button" onClick={() => { setMode('calm'); engine.start(organizer.manifest?.entries ?? [], 'calm'); arena.current?.focus(); }}>Switch to calm mode</button><button className="text-button" onClick={finish}>Finish sorting without playing</button></>}
          {game.phase === 'finishing' && <><span className="overlay-symbol" aria-hidden="true">◈</span><h3>Securing your inventory.</h3><p>Waiting for the worker to finish and verify the export.</p></>}
          {game.phase === 'complete' && <><span className="overlay-symbol" aria-hidden="true">✓</span><p className="eyebrow">QUEST COMPLETE</p><h3>Mess: defeated.</h3><p>{progress?.processed ?? 0} files organized · {game.score.toLocaleString()} points<br />Best combo ×{game.bestCombo} · {game.confirmed} game-confirmed routes</p>{organizer.downloadUrl && <a className="primary-button download-button" href={organizer.downloadUrl} download="filequest-organized.zip">Download organized ZIP ↓</a>}<button className="text-button" onClick={playDemo}>Play a fresh demo</button></>}
          {(game.phase === 'error' || game.phase === 'cancelled') && <><span className="overlay-symbol" aria-hidden="true">{game.phase === 'error' ? '!' : '■'}</span><h3>{game.phase === 'error' ? 'Run stopped safely.' : 'Quest cancelled.'}</h3><p>{game.feedback}</p><p>No partial ZIP is offered. Choose a ZIP again or start a fresh demo.</p><button className="primary-button" onClick={playDemo}>Play fresh demo</button></>}
        </div></div>}
      </section>
      <div className="rush-feedback" role="status" aria-live="polite" key={`${game.confirmed}-${game.feedback}`}><span aria-hidden="true">{game.feedback.startsWith('+') ? '✓' : '›'}</span>{game.feedback}
        {game.packet && game.phase === 'playing' && <span className="sr-only"> Incoming: {game.packet.originalPath}. Gates: {game.gates.map((category, index) => `${index + 1} ${category}`).join(', ')}.</span>}
      </div>
      <div className="rush-controls-row"><p id="rush-controls"><kbd>←</kbd><kbd>→</kbd> steer <kbd>Space</kbd> route <kbd>P</kbd> pause<br /><span>Tap a category gate to route directly. 1–4 selects a gate.</span></p>
        {['playing', 'paused', 'waiting'].includes(game.phase) && <button className="secondary-button" onClick={() => { if (game.phase === 'paused' || game.pauseRequested) engine.resume(); else engine.pause(); }}>{game.phase === 'paused' || game.pauseRequested ? 'Resume' : 'Pause'}</button>}
      </div>
      <div className="touch-controls" aria-label="Touch controls"><button className="secondary-button" disabled={game.phase !== 'playing'} aria-label="Move left" onClick={() => engine.move(-1)}>←</button><button className="primary-button" disabled={game.phase !== 'playing'} onClick={route}>Route packet</button><button className="secondary-button" disabled={game.phase !== 'playing'} aria-label="Move right" onClick={() => engine.move(1)}>→</button></div>
      <div className="game-exit-actions">{prepared && <button className="text-button" onClick={finish}>Finish sorting without playing ↗</button>}{engaged && <button className="text-button" onClick={cancel}>Cancel quest</button>}</div>
    </section>
    <aside className="rush-inventory" aria-label="ZIP inventory">
      <section className="panel mission-panel"><p className="eyebrow">LIVE INVENTORY / WORKER CONFIRMED</p><h2>Your files, in order.</h2>
        <dl className="counters"><div><dt>Processed</dt><dd>{progress?.processed ?? 0}</dd></div><div><dt>Remaining</dt><dd>{progress?.remaining ?? 0}</dd></div><div><dt>Skipped</dt><dd>{progress?.skipped ?? 0}</dd></div><div><dt>Failed</dt><dd>{progress?.failed ?? 0}</dd></div></dl>
        <p className="helper">{game.phase === 'waiting' ? 'File copy in flight. Waiting for batch confirmation.' : 'Only confirmed file copies count. Game score is separate.'}</p>
        <div className="category-list" aria-label="Completed files by category">{CATEGORIES.map((category) => <span key={category}>{categoryIcons[category]} {category} {organizer.manifest?.entries.filter((entry) => entry.category === category && entry.status === 'processed').length ?? 0}</span>)}</div>
      </section>
      <section className="panel zip-panel"><ZipControls organizer={organizer} gameActive={engaged} onFinish={finish} onCancel={cancel} /></section>
    </aside>
  </div>;
}
