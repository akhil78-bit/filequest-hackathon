import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { ZipWorkspace } from '../../../components/ZipWorkspace';
import type { Organizer } from '../../../components/ZipWorkspace';
import { InventorySummary } from './InventorySummary';
import { ChaosEngine, multiplier } from './model';
import type { RunMode } from './model';
import { WorkScheduler } from './work-scheduler';
import { RunnerCanvas } from './RunnerCanvas';
import { createChaosDemo } from './demo';
import { Icon } from '../../../components/Icon';
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
  const uploadInput = useRef<HTMLInputElement>(null);
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
  const uploadLocked = active || ['reading', 'packaging', 'cancelling'].includes(organizer.phase) || organizer.batchBusy;

  return <>
    <section className="intro" aria-labelledby="page-title">
      <div className="intro-main"><p className="eyebrow"><span className="eyebrow-line" /> A LITTLE PLAY. A LOT LESS CLUTTER.</p><h1 id="page-title">Turn file chaos<br />into <span>your next high score.</span></h1><p className="intro-copy">Play through a messy ZIP. Download a clean, organized copy.</p>
        <div className="intro-actions"><button className="primary-button" disabled={uploadLocked} onClick={() => uploadInput.current?.click()}><Icon name="upload" size={19} /> Upload your ZIP</button><button className="secondary-button demo-button" disabled={uploadLocked} onClick={demo}><Icon name="play" size={17} /> Try instant demo <span>120 files</span></button></div><p className="intro-note">{uploadLocked ? 'Finish or cancel this quest before choosing a new archive.' : 'No account. No setup. Your files never leave this device.'}</p>
      </div>
      <ol className="quest-steps" id="how-it-works" aria-label="How FileQuest works"><li><span className="step-index">01</span><Icon name="folder" /><div><strong>Bring the mess</strong><p>Choose a ZIP or start with synthetic files.</p></div></li><li><span className="step-index">02</span><Icon name="bolt" /><div><strong>Play with a purpose</strong><p>Energy and survival unlock real sorting work.</p></div></li><li><span className="step-index">03</span><Icon name="download" /><div><strong>Take home the order</strong><p>Download verified files in organized folders.</p></div></li></ol>
    </section>
    <div className="workspace-caption"><span><span className="status-dot" /> YOUR PLAYABLE WORKSPACE</span><span><Icon name="shield" size={15} /> Private files. Real progress.</span></div>
    <div className="chaos-layout">
      <section ref={panel} className="chaos-game" id="arena" aria-labelledby="chaos-title" onKeyDown={keyboard}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pause(); }}>
        <div className="chaos-heading"><div className="game-identity"><span className="game-emblem"><Icon name="bolt" size={27} /></span><div><p className="eyebrow">THE FILEQUEST ARCADE</p><h2 id="chaos-title">Chaos <span>Run</span></h2></div></div><span className={`chaos-badge badge-${game.phase}`}><span className="status-dot" />{bonus.current ? 'Bonus run' : game.phase === 'playing' ? game.mode === 'calm' ? 'Calm mode' : 'Run live' : game.phase === 'tutorial' ? 'Ready to play' : game.phase === 'gameover' ? 'Run over' : game.phase === 'victory' ? 'Complete' : game.phase}</span></div>
        <div className="chaos-hud" aria-label="Run statistics">
          <div className="score-stat"><span>Run score</span><strong>{score.toLocaleString().padStart(5, '0')}</strong></div>
          <div><span>Hull integrity</span><strong className="health-pips" role="img" aria-label={`${game.health} of 3 health`}>{[0, 1, 2].map((index) => <span key={index} className={index < game.health ? 'hull-full' : 'hull-empty'}><Icon name="heart" size={19} /></span>)}</strong></div>
          <div><span>Energy collected</span><strong>{game.orbs}<small>◆</small></strong></div>
          <div><span>Combo</span><strong className="violet">×{multiplier(game.combo)}</strong></div>
        </div>
        <section ref={arena} className={`chaos-stage phase-${game.phase} ${reduced ? 'reduced-effects' : ''}`} tabIndex={0} aria-label="Chaos Run game arena" aria-describedby="chaos-keys chaos-track"
          onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { swipe.current = null; }}>
          <RunnerCanvas engine={engine} reduced={reduced} />
          <div className="track-labels" aria-hidden="true"><span>SECTOR {String(game.waves + 1).padStart(2, '0')}</span><span>{game.speed.toFixed(1)}× SPEED <i /> {Math.floor(game.distance)} M</span></div>
          {!overlay && <div className="power-hud"><span className={game.shield > 0 ? 'power-active' : ''}><Icon name="shield" size={16} />{game.shield > 0 ? `Shield · ${Math.ceil(game.shield / 1000)}s` : 'Shield offline'}</span><span className={game.magnet > 0 ? 'power-active' : ''}><Icon name="bolt" size={16} />{game.magnet > 0 ? `Magnet · ${Math.ceil(game.magnet / 1000)}s` : 'Magnet offline'}</span></div>}
          {overlay && <div className="chaos-overlay"><div ref={dialog} className="chaos-dialog" role="group" tabIndex={-1} aria-label={`Run state: ${game.phase}`}>
            {game.phase === 'tutorial' && <><p className="eyebrow"><Icon name="bolt" size={15} /> DODGE. COLLECT. ORGANIZE.</p><h3>A cleaner folder.<br /><em>One thrilling run.</em></h3><p>Steer through the clutter. Collect lime energy diamonds to earn real file-sorting batches.</p>
              <div className="chaos-mode" role="group" aria-label="Game mode"><button aria-pressed={mode === 'rush'} onClick={() => setMode('rush')}><Icon name="bolt" size={18} /><span>Chaos<small>Fast-paced · 3 health</small></span></button><button aria-pressed={mode === 'calm'} onClick={() => setMode('calm')}><Icon name="shield" size={18} /><span>Calm<small>No timer · your pace</small></span></button></div>
              <button className="primary-button start-button" disabled={organizer.phase === 'reading' || organizer.batchBusy} onClick={() => canPlay ? start() : demo()}><Icon name="play" size={17} />{organizer.phase === 'reading' ? 'Checking your inventory…' : canPlay ? remaining === 0 ? 'Finalize empty inventory' : `Start run · ${remaining} files` : 'Play instant demo'}<Icon name="arrow" size={18} /></button>
              <small>{canPlay ? 'Your inspected archive is ready. Originals stay untouched.' : '120 real synthetic files. Generated on your device.'}<br />Choose Calm or Finish sorting for an untimed experience.</small>
            </>}
            {game.phase === 'paused' && <><span className="dialog-mark"><Icon name="pause" size={30} /></span><p className="eyebrow">TAKE YOUR TIME</p><h3>The chaos can wait.</h3><p>Your run is paused. Already-earned file work may finish; new gameplay batches wait for you.</p><button className="primary-button" onClick={resume}><Icon name="play" size={17} /> Resume run</button><button className="text-button" onClick={() => { setMode('calm'); start('calm'); }}>Restart in Calm · keep file progress</button></>}
            {game.phase === 'gameover' && <><span className="dialog-mark danger"><Icon name="refresh" size={30} /></span><p className="eyebrow">RUN OVER · FILES SAFE</p><h3>A fresh run<br /><em>starts here.</em></h3><div className="run-recap"><span><b>{score.toLocaleString()}</b> points</span><span><b>{Math.floor(game.distance)}</b> metres</span><span><b>{progress?.processed ?? 0}</b> files copied</span></div><p>Your completed file work is safe. Restart the runner and pick up where your inventory left off.</p><button className="primary-button" disabled={!canPlay} onClick={() => start()}><Icon name="refresh" size={18} /> Restart run</button><button className="secondary-button" disabled={!canPlay} onClick={() => { setMode('calm'); start('calm'); }}>Continue in Calm</button>{readyForFinish && <button className="text-button" onClick={finish}>Finish remaining files without playing <Icon name="arrow" size={16} /></button>}</>}
            {game.phase === 'finishing' && <><span className="dialog-mark"><Icon name="layers" size={30} /></span><p className="eyebrow">THE FINISHING TOUCH</p><h3>Packing your progress.</h3><p>{game.feedback}</p><div className="packaging-note"><Icon name="shield" size={19} /> Download unlocks after final byte verification.</div></>}
            {game.phase === 'victory' && <><span className="victory-mark"><Icon name="check" size={34} /></span><p className="eyebrow">QUEST COMPLETE · EXPORT VERIFIED</p><h3>Chaos, conquered.</h3><div className="completion-number">{progress?.processed ?? 0}<span>real files organized</span></div><div className="run-recap"><span><b>{score.toLocaleString()}</b> run score</span><span><b>{job.earned}</b> game-earned</span><span><b>{Math.max(0, (progress?.processed ?? 0) - job.earned)}</b> finished otherwise</span></div>{organizer.downloadUrl && <a className="primary-button download-button" href={organizer.downloadUrl} download="filequest-organized.zip"><Icon name="download" /> Download organized ZIP</a>}<small>Your file contents preserved. A full manifest included.</small><div className="dialog-actions"><button className="text-button" onClick={() => start()}>Continue bonus run</button><button className="text-button" onClick={demo}>New demo quest</button><button className="text-button" onClick={() => { organizer.reset(); uploadInput.current?.focus(); }}>Organize another ZIP</button></div></>}
            {(game.phase === 'error' || game.phase === 'cancelled') && <><span className={`dialog-mark ${game.phase === 'error' ? 'danger' : ''}`}><Icon name="shield" size={30} /></span><p className="eyebrow">YOUR ORIGINALS ARE SAFE</p><h3>{game.phase === 'error' ? 'Stopped safely.' : 'A new route awaits.'}</h3><p>{game.feedback}</p><small>No partial ZIP is offered. Choose another archive to try again.</small><button className="primary-button" onClick={demo}><Icon name="play" size={17} /> Start a fresh demo</button><button className="secondary-button" onClick={() => { organizer.reset(); uploadInput.current?.focus(); }}>Choose another ZIP</button></>}
          </div></div>}
        </section>
        <div className="chaos-feedback" role="status" aria-live="polite"><Icon name="bolt" size={16} />{game.feedback}</div>
        <p id="chaos-track" className={game.mode === 'calm' && game.phase === 'playing' ? 'calm-track' : 'sr-only'}>Selected lane: {laneNames[game.lane]}. {incoming.length ? incoming.map((entity) => `${entityNames[entity.kind]} in ${laneNames[entity.lane]} lane`).join('; ') : 'Track ahead is clear.'}</p>
        <div className="chaos-controls"><button className="secondary-button steer-button" disabled={game.phase !== 'playing'} aria-label="Steer left" onClick={() => engine.move(-1)}>←</button>{game.mode === 'calm' ? <button className="primary-button" disabled={game.phase !== 'playing'} onClick={() => engine.step()}>Advance</button> : <span id="chaos-keys"><kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> to steer <span>Swipe on mobile · <kbd>P</kbd> to pause</span></span>}<button className="secondary-button steer-button" disabled={game.phase !== 'playing'} aria-label="Steer right" onClick={() => engine.move(1)}>→</button>
          {['playing', 'paused'].includes(game.phase) && <button className="secondary-button pause-button" onClick={() => game.phase === 'paused' ? resume() : pause()}><Icon name={game.phase === 'paused' ? 'play' : 'pause'} size={16} />{game.phase === 'paused' ? 'Resume' : 'Pause'}</button>}
        </div>
        {game.mode === 'calm' && <p id="chaos-keys" className="helper">No clock runs. Move with arrows / A D / 1–3, then press Space or Advance. Finish sorting is always available.</p>}
        <details className="game-guide"><summary>Know your pickups <span>Energy, power-ups & hazards</span></summary><div className="chaos-legend"><span><i className="energy-diamond" /> Energy earns up to 8 files</span><span><b className="hazard-key">×</b> Avoid crates & moving hazards</span><span><kbd>S</kbd> Shield absorbs a hit</span><span><kbd>M</kbd> Magnet collects across lanes</span><span><kbd>+</kbd> Repair restores health</span><span><Icon name="layers" size={18} /> A survived wave earns up to 16 files</span></div></details>
        <div className="chaos-bottom"><label><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} /> Reduced effects</label>{readyForFinish && <button className="text-button" onClick={finish}>Finish without playing <Icon name="arrow" size={16} /></button>}{active && <button className="text-button cancel-button" onClick={cancel}>Cancel quest</button>}</div>
      </section>
      <aside className="chaos-inventory" aria-label="Actual file organization">
        <InventorySummary organizer={organizer} work={job} finishing={game.phase === 'finishing'} />
        <section className="panel chaos-zip"><InventoryControls organizer={organizer} gameActive={active} onFinish={finish} onCancel={cancel} uploadInputRef={uploadInput} /></section>
      </aside>
    </div>
  </>;
}
