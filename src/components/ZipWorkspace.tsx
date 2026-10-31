import { useState } from 'react';
import type { DragEvent, Ref } from 'react';
import { createDemoZip } from '../features/organizer/demo-zip';
import type { useOrganizer } from '../features/organizer/useOrganizer';
import { Icon } from './Icon';

export type Organizer = ReturnType<typeof useOrganizer>;
export function ZipWorkspace({ organizer, gameActive = false, onFinish, onCancel, uploadInputRef }: {
  organizer: Organizer; gameActive?: boolean; onFinish?: () => void; onCancel?: () => void; uploadInputRef?: Ref<HTMLInputElement>;
}) {
  const [dragging, setDragging] = useState(false);
  const active = gameActive || ['reading', 'packaging', 'cancelling'].includes(organizer.phase) || organizer.batchBusy;
  const ready = organizer.phase === 'ready' || organizer.phase === 'processing';
  const progress = organizer.manifest?.progress;
  const complete = organizer.phase === 'complete' && Boolean(organizer.downloadUrl);
  const phaseText: Record<Organizer['phase'], string> = {
    idle: 'Choose your archive. We will check it before you play.', reading: 'Checking your archive…',
    ready: 'Archive checked. Your run is ready.', processing: 'Copying and verifying real files…',
    packaging: 'Building your ZIP and verifying every file…', complete: complete ? 'Your organized ZIP is ready.' : 'Preparing your verified download…',
    cancelling: 'Stopping safely…', cancelled: 'Cancelled. No partial ZIP was exported.',
    error: 'This archive could not be organized.',
  };
  const acceptDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false);
    if (!active && event.dataTransfer.files[0]) void organizer.load(event.dataTransfer.files[0]);
  };
  return (
    <section className="zip-workspace" aria-labelledby="zip-title" id="inventory">
      <div className="zip-heading"><div><p className="eyebrow">YOUR NEXT QUEST</p><h3 id="zip-title">Bring your own chaos.</h3></div><Icon name="folder" size={24} /></div>
      <div className={`upload-zone${dragging ? ' dragging' : ''}${active ? ' upload-locked' : ''}`} aria-disabled={active}
        onDragOver={(event) => { event.preventDefault(); if (!active) setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={acceptDrop}>
        <input ref={uploadInputRef} id="zip-upload" className="file-input" type="file" accept=".zip,application/zip,application/x-zip-compressed" disabled={active}
          aria-describedby="zip-limits zip-privacy" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void organizer.load(file);
            event.target.value = '';
          }} />
        <label htmlFor="zip-upload" className="drop-target"><span className="upload-icon"><Icon name="upload" size={25} /></span><strong>{dragging ? 'Drop to start your quest' : 'Drop a ZIP here'}</strong><span>or <b>browse files</b> on your device</span><small>Up to 25 MiB · 500 files</small></label>
      </div>
      <p id="zip-privacy" className="privacy-note"><Icon name="shield" size={15} /> Processed here. Never uploaded to a server.</p>
      <details className="zip-restrictions"><summary>Archive limits & supported formats</summary><p id="zip-limits">25 MiB ZIP · 500 files · 20 MiB per file · 100 MiB extracted · max 100:1 ratio. Stored or deflate ZIPs with UTF-8 names. Encrypted and ZIP64 archives are unsupported. Your originals stay untouched.</p></details>
      <div className="zip-actions demo-actions">
        <button className="text-button" disabled={active} onClick={() => {
          void organizer.load(new File([createDemoZip()], 'filequest-synthetic-demo.zip', { type: 'application/zip' }));
        }}><Icon name="layers" size={16} /> Load a small demo <span className="button-note">20 files</span></button>
        {organizer.phase !== 'idle' && !active && <button className="text-button" onClick={organizer.reset}>Reset</button>}
      </div>
      {organizer.archiveName && <p className="archive-name"><Icon name="file" size={18} /><span>{organizer.archiveName}</span></p>}
      <p className={`zip-status status-${organizer.phase}`} role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{organizer.phase === 'processing' && !organizer.batchBusy ? 'Batch verified. Play on or finish sorting.' : phaseText[organizer.phase]}</p>
      {organizer.error && <p className="error" role="alert">{organizer.error}</p>}
      {progress && <div className="archive-byte-summary"><span><b>{progress.processedBytes.toLocaleString()}</b> verified bytes copied</span><span>{progress.totalBytes.toLocaleString()} expected bytes</span></div>}
      <div className="zip-actions">
        {ready && <>
          <button className="primary-button" onClick={onFinish ?? organizer.finishSorting}><Icon name="check" size={18} /> Finish sorting</button>
          {!gameActive && <button className="secondary-button" disabled={organizer.batchBusy} onClick={organizer.sortNextBatch}>Sort next 5 files</button>}
        </>}
        {(['reading', 'ready', 'processing', 'packaging', 'cancelling'].includes(organizer.phase)) && <button className="text-button" disabled={organizer.phase === 'cancelling'} onClick={onCancel ?? organizer.cancel}>Cancel sorting</button>}
      </div>
      {complete && organizer.downloadUrl && <div className="export-ready"><span className="export-check"><Icon name="check" size={22} /></span><div><strong>Order, restored.</strong><p>{progress?.processed ?? 0} files organized. Manifest included.</p></div><a className="primary-button download-button" href={organizer.downloadUrl} download="filequest-organized.zip"><Icon name="download" /> Download ZIP</a><button className="text-button" onClick={organizer.reset}>Organize another archive <Icon name="arrow" size={16} /></button></div>}
      {organizer.manifest && <details className="manifest-preview" open={complete}>
        <summary><Icon name="file" size={17} /> View file manifest <span>{organizer.manifest.entries.length}</span></summary>
        <p className="helper">Original paths, new destinations and actual status. The completed ZIP includes filequest-manifest.json. Failed or cancelled jobs have no partial download.</p>
        <div className="table-scroll" role="region" aria-label="Archive manifest" tabIndex={0}>
          <table><caption className="sr-only">Original paths, output paths, categories and actual processing status.</caption>
            <thead><tr><th scope="col">Original file</th><th scope="col">Destination / status</th></tr></thead>
            <tbody>{organizer.manifest.entries.map((entry) => <tr key={entry.id}>
              <td>{entry.originalPath}<small>{entry.bytes.toLocaleString()} bytes · CRC32 {entry.crc32}</small></td>
              <td><span className="destination">{entry.outputPath ?? 'No output path'}</span><small className={`entry-status entry-${entry.status}`}>{entry.category ?? 'Directory'} · {entry.status}</small><small>{entry.reason}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
    </section>
  );
}
