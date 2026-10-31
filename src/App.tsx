import { useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES, planFiles } from './features/organizer/classify';
import { DEMO_PATHS } from './features/organizer/demo';
import { useOrganizer } from './features/organizer/useOrganizer';
import { FileRush } from './features/game/FileRush';

export default function App() {
  const organizer = useOrganizer();
  const [paths, setPaths] = useState<readonly string[]>([]);
  const [filename, setFilename] = useState('downloads/invoice.csv');
  const [error, setError] = useState('');
  const files = planFiles(paths);

  function addFilename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next = [...paths, filename];
      planFiles(next);
      setPaths(next);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please use a safe relative filename.');
    }
  }

  function loadDemo() {
    setPaths(DEMO_PATHS);
    setError('');
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to workspace</a>
      <div className="app-shell">
        <header className="header">
          <a className="brand" href="#main" aria-label="FileQuest home">
            <span className="brand-icon" aria-hidden="true">F<span>Q</span></span>
            FileQuest<span className="brand-dot">.</span>
          </a>
          <span className="build-label"><span aria-hidden="true" /> FILE RUSH · LOCAL PLAY</span>
        </header>

        <main id="main">
          <section className="intro" aria-labelledby="page-title">
            <p className="eyebrow">YOUR DOWNLOADS FOLDER HAS A NEW QUEST</p>
            <h1 id="page-title">Your mess. <span>Your mission.</span></h1>
            <p className="intro-copy">Route packets. Build combos. Take home an organized ZIP.</p>
            <p className="privacy"><span aria-hidden="true">◈</span> Built for on-device processing. Your files stay with you.</p>
          </section>

          <FileRush organizer={organizer} />

          <details className="filename-lab"><summary>Explore the filename classifier · rules & previews</summary>
          <div className="workspace">
            <section className="panel preview-panel" aria-labelledby="preview-title">
              <div className="panel-top">
                <div><p className="eyebrow">01 / SORTING LAB</p><h2 id="preview-title">Meet your inventory</h2></div>
                <span className="pill">Filename preview</span>
              </div>
              <div className="demo-zone">
                <div className="folder-stack" aria-hidden="true"><span /><span /><span>↗</span></div>
                <h3>A little order. A lot of possibility.</h3>
                <p>Explore real extension-based classification with synthetic filenames.</p>
                <button className="primary-button" onClick={loadDemo}>Try filename demo <span aria-hidden="true">↗</span></button>
                <p className="zone-note">9 sample names · no file contents read</p>
              </div>

              <form className="filename-form" onSubmit={addFilename}>
                <label htmlFor="filename">Or test a relative file path</label>
                <div className="input-row">
                  <input id="filename" name="filename" type="text" value={filename}
                    onChange={(event) => setFilename(event.target.value)} required maxLength={1024}
                    autoComplete="off" spellCheck={false} aria-describedby={error ? 'filename-error filename-help' : 'filename-help'}
                    aria-invalid={Boolean(error)} />
                  <button className="secondary-button" type="submit">Classify</button>
                </div>
                <p id="filename-help" className="helper">Example: photos/holiday.png. Rules use extensions, without reading contents.</p>
                {error && <p className="error" id="filename-error" role="alert">{error}</p>}
              </form>

              <div className="results-heading">
                <h3>Proposed destinations <span className="count">{files.length}</span></h3>
                <button className="text-button" disabled={files.length === 0} onClick={() => { setPaths([]); setError(''); }}>Clear preview</button>
              </div>
              <p className="sr-only" role="status" aria-live="polite">{files.length} filenames in the preview. Filename previews do not process file contents.</p>
              {files.length > 0 ? (
                <div className="table-scroll" role="region" aria-label="Filename classification results" tabIndex={0}>
                  <table>
                    <caption className="sr-only">Proposed paths only. Original files have not been read or moved.</caption>
                    <thead><tr><th scope="col">Original path</th><th scope="col">Organized path</th></tr></thead>
                    <tbody>{files.map((file, index) => (
                      <tr key={`${file.originalPath}-${index}`}>
                        <td>{file.originalPath}</td>
                        <td><span className="destination">{file.outputPath}</span><small>{file.reason}</small></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <div className="empty-state"><span aria-hidden="true">＋</span><p>Your next clean folder starts here.<br /><small>Load the demo or classify a filename above.</small></p></div>}
            </section>

            <aside className="sidebar" aria-label="Project status">
              <section className="panel status-panel" aria-labelledby="status-title">
                <p className="eyebrow">02 / MISSION STATUS</p>
                <h2 id="status-title">Real work. Real progress.</h2>
                <p className="status-copy">{organizer.manifest ? `${organizer.manifest.progress.total} inspected entries. Counters reflect completed file operations.` : 'Choose a ZIP to inspect it, then sort in batches or finish the entire archive.'}</p>
                <dl className="counters" aria-label="Actual file processing counts">
                  <div><dt>Processed</dt><dd>{organizer.manifest?.progress.processed ?? 0}</dd></div>
                  <div><dt>Remaining</dt><dd>{organizer.manifest?.progress.remaining ?? 0}</dd></div>
                  <div><dt>Skipped</dt><dd>{organizer.manifest?.progress.skipped ?? 0}</dd></div>
                  <div><dt>Failed</dt><dd>{organizer.manifest?.progress.failed ?? 0}</dd></div>
                </dl>
                <p className="honesty-note">Previewing a filename does not count as processing a file.</p>
                <div className="category-list" aria-label="Successfully copied files by category">{CATEGORIES.map((category) => <span key={category}><span aria-hidden="true">▱</span> {category} {organizer.manifest?.entries.filter((entry) => entry.category === category && entry.status === 'processed').length ?? 0}</span>)}</div>
              </section>

              <section className="next-panel" aria-labelledby="next-title">
                <span className="next-marker" aria-hidden="true">↳</span>
                <p className="eyebrow">REAL WORK, EVERY ROUTE</p>
                <h2 id="next-title">A useful high score.</h2>
                <p>ZIP upload → safe inspection → worker sorting → verified downloadable copy.</p>
                <p className="next-detail">Each correct game route requests one file. Score arrives only after worker confirmation.</p>
                <span className="milestone-tag">YOUR ORIGINAL FILES STAY UNTOUCHED</span>
              </section>
            </aside>
          </div>
          </details>
          <section className="boundaries" aria-label="Prototype scope">
            <span><b>Now</b> Real ZIP input and verified output</span>
            <span><b>Private</b> Files stay on your device</span>
            <span><b>Play</b> Every correct route copies a real file</span>
          </section>
        </main>
        <footer><span>FILEQUEST / PROMPTWARS × OUTLIER 2026</span><span>A cleaner folder is the high score.</span></footer>
      </div>
    </>
  );
}
