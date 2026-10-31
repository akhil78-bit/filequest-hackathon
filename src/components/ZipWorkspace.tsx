import { useState } from 'react';
import type { DragEvent } from 'react';
import { createDemoZip } from '../features/organizer/demo-zip';
import type { useOrganizer } from '../features/organizer/useOrganizer';

export type Organizer = ReturnType<typeof useOrganizer>;
export function ZipWorkspace({ organizer, gameActive = false, onFinish, onCancel }: {
  organizer: Organizer; gameActive?: boolean; onFinish?: () => void; onCancel?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const active = gameActive || ['reading', 'packaging', 'cancelling'].includes(organizer.phase) || organizer.batchBusy;
  const ready = organizer.phase === 'ready' || organizer.phase === 'processing';
  const progress = organizer.manifest?.progress;
  const phaseText: Record<Organizer['phase'], string> = {
    idle: 'Choose a ZIP to start.', reading: 'Inspecting archive metadata…',
    ready: 'Archive inspected. Ready to sort.', processing: 'Sorting real file contents…',
    packaging: 'Finalizing ZIP and verifying output bytes…', complete: 'Verified ZIP ready to download.',
    cancelling: 'Stopping file processing…', cancelled: 'Cancelled. No partial ZIP was exported.',
    error: 'Archive rejected or processing stopped. Choose a ZIP to retry.',
  };
  const acceptDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false);
    if (!active && event.dataTransfer.files[0]) void organizer.load(event.dataTransfer.files[0]);
  };
  return (
    <section className="zip-workspace" aria-labelledby="zip-title">
      <div className="results-heading zip-heading"><h3 id="zip-title">Organize a real ZIP</h3><span className="pill">On your device</span></div>
      <div className={`upload-zone${dragging ? ' dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); if (!active) setDragging(true); }}
        onDragLeave={() => setDragging(false)} onDrop={acceptDrop}>
        <label htmlFor="zip-upload">Choose a ZIP or drop it here</label>
        <input id="zip-upload" type="file" accept=".zip,application/zip,application/x-zip-compressed" disabled={active}
          aria-describedby="zip-limits zip-privacy" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void organizer.load(file);
            event.target.value = '';
          }} />
        <p id="zip-limits" className="helper">25 MiB ZIP · 500 files · 20 MiB per file · 100 MiB extracted · max 100:1 ratio</p>
        <p id="zip-privacy" className="helper">Files stay in-browser. Your original ZIP is never changed. Download contains an organized copy.</p>
      </div>
      <div className="zip-actions">
        <button className="secondary-button" disabled={active} onClick={() => {
          void organizer.load(new File([createDemoZip()], 'filequest-synthetic-demo.zip', { type: 'application/zip' }));
        }}>Try real ZIP demo</button>
        {organizer.phase !== 'idle' && !active && <button className="text-button" onClick={organizer.reset}>Reset ZIP</button>}
      </div>
      <p className="archive-name">{organizer.archiveName || 'Synthetic demo: 20 generated files, including duplicates, Unicode and binary bytes.'}</p>
      <p className="zip-status" role="status" aria-live="polite">{organizer.phase === 'processing' && !organizer.batchBusy ? 'Batch complete. Sort another batch or finish sorting.' : phaseText[organizer.phase]}</p>
      {organizer.error && <p className="error" role="alert">{organizer.error}</p>}
      {progress && <>
        <label htmlFor="zip-progress">Files copied: {progress.processed} / {progress.total - progress.skipped}</label>
        <progress id="zip-progress" max={Math.max(1, progress.total - progress.skipped)} value={progress.processed} />
        <p className="helper">{progress.processedBytes.toLocaleString()} verified file bytes copied. {progress.totalBytes.toLocaleString()} expected bytes. Directory markers are counted as skipped.</p>
      </>}
      <div className="zip-actions">
        {ready && <>
          <button className="primary-button" onClick={onFinish ?? organizer.finishSorting}>Finish sorting</button>
          {!gameActive && <button className="secondary-button" disabled={organizer.batchBusy} onClick={organizer.sortNextBatch}>Sort next 5 files</button>}
        </>}
        {(['reading', 'ready', 'processing', 'packaging', 'cancelling'].includes(organizer.phase)) && <button className="secondary-button" disabled={organizer.phase === 'cancelling'} onClick={onCancel ?? organizer.cancel}>Cancel sorting</button>}
        {organizer.downloadUrl && <a className="primary-button download-button" href={organizer.downloadUrl} download="filequest-organized.zip">Download organized ZIP ↓</a>}
      </div>
      {organizer.manifest && <details className="manifest-preview" open={organizer.phase === 'complete'}>
        <summary>Manifest preview · {organizer.manifest.entries.length} entries</summary>
        <p className="helper">The completed ZIP includes filequest-manifest.json. Failed or cancelled archives have no downloadable partial output.</p>
        <div className="table-scroll" role="region" aria-label="Archive manifest" tabIndex={0}>
          <table><caption className="sr-only">Original paths, output paths, categories and actual processing status.</caption>
            <thead><tr><th scope="col">Original path</th><th scope="col">Result / status</th></tr></thead>
            <tbody>{organizer.manifest.entries.map((entry) => <tr key={entry.id}>
              <td>{entry.originalPath}<small>{entry.bytes.toLocaleString()} bytes · CRC32 {entry.crc32}</small></td>
              <td><span className="destination">{entry.outputPath ?? 'No output path'}</span><small>{entry.category ?? 'Directory'} · {entry.status}</small><small>{entry.reason}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
    </section>
  );
}
