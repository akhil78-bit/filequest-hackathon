import { Icon } from '../../../components/Icon';
import { CATEGORIES } from '../../organizer/classify';
import type { useOrganizer } from '../../organizer/useOrganizer';
import type { WorkState } from './work-scheduler';

interface InventorySummaryProps {
  organizer: Pick<ReturnType<typeof useOrganizer>, 'manifest' | 'phase' | 'downloadUrl' | 'batchBusy'>;
  work: Readonly<WorkState>;
  finishing: boolean;
}

function processingFeedback({ organizer, work, finishing }: InventorySummaryProps): string {
  if (organizer.phase === 'complete' && organizer.downloadUrl) {
    return 'All file bytes checked. Your download is ready.';
  }
  if (organizer.phase === 'error') return 'Processing stopped. No partial download is available.';
  if (organizer.phase === 'cancelled') return 'Quest cancelled. Original files remain untouched.';
  if (organizer.phase === 'packaging' || finishing) {
    return 'Finalizing the export. Download appears after verification.';
  }
  if (work.busy) return 'Verifying earned files. Counts update after confirmation.';
  if (work.batches) {
    return `${work.lastFiles} files verified in the last batch. ${work.batches} earned batches complete.`;
  }
  return 'Energy pickups and survived waves unlock sorting batches.';
}

/** Displays acknowledged snapshots only; never schedules work or advances game state. */
export function InventorySummary({ organizer, work, finishing }: InventorySummaryProps) {
  const progress = organizer.manifest?.progress;
  const processed = progress?.processed ?? 0;
  const totalFiles = progress ? progress.total - progress.skipped : 0;
  const percent = totalFiles ? Math.floor((processed / totalFiles) * 100) : 0;
  const complete = organizer.phase === 'complete' && Boolean(organizer.downloadUrl);
  const categoryCounts = CATEGORIES.map((category) => ({
    category,
    count: organizer.manifest?.entries.filter(
      (entry) => entry.category === category && entry.status === 'processed',
    ).length ?? 0,
  }));
  const feedback = processingFeedback({ organizer, work, finishing });

  return (
    <section className={`panel chaos-mission ${complete ? 'mission-complete' : ''}`} aria-labelledby="inventory-title">
      <div className="mission-top">
        <p className="eyebrow">REAL WORK. REAL REWARD.</p>
        <span className={`worker-indicator ${organizer.batchBusy ? 'busy' : ''}`}>
          <span className="status-dot" />{complete ? 'Verified' : organizer.batchBusy ? 'Processing' : 'On-device'}
        </span>
      </div>
      <h2 id="inventory-title">Your inventory</h2>
      <p className="mission-description">
        {complete ? 'A clean copy, ready to take with you.' : progress ? 'Every counted file has been copied and checked.' : 'A little play. An actually organized archive.'}
      </p>
      <div className="progress-heading">
        <div className="actual-total">
          <strong>{processed}<small> / {totalFiles}</small></strong>
          <span>FILES VERIFIED & COPIED</span>
        </div>
        <span className="progress-percent">{percent}<small>%</small><span>files copied</span></span>
      </div>
      <progress aria-label="Actual file organization progress" value={processed} max={Math.max(1, totalFiles)} />
      <dl className="chaos-counts">
        <div><dt>Remaining</dt><dd>{progress?.remaining ?? 0}</dd></div>
        <div><dt>Skipped</dt><dd>{progress?.skipped ?? 0}</dd></div>
        <div className={(progress?.failed ?? 0) > 0 ? 'has-failures' : ''}>
          <dt>Failed</dt><dd>{progress?.failed ?? 0}</dd>
        </div>
      </dl>
      <div className="earned-counts">
        <span><Icon name="bolt" size={16} /> Game-earned <b>{work.earned}</b></span>
        <span><Icon name="check" size={16} /> Finish / other <b>{Math.max(0, processed - work.earned)}</b></span>
      </div>
      <p className="ack-feedback" role="status" aria-live="polite">
        {feedback}{work.credit ? ` Up to ${work.credit} files of earned credit waiting.` : ''}
      </p>
      <div className="category-heading">
        <h3>Organized destinations</h3>
        <span>{categoryCounts.filter(({ count }) => count > 0).length} / {CATEGORIES.length} categories</span>
      </div>
      <div className="category-list" aria-label="Successfully processed files by category">
        {categoryCounts.map(({ category, count }) => (
          <div key={category} className={`category-row ${count ? 'category-populated' : ''}`}>
            <Icon name="folder" size={17} /><span>{category}</span><b>{count}</b>
          </div>
        ))}
      </div>
      <p className="inventory-footnote">
        <Icon name="shield" size={15} /> File counts come from verified copies, never the game timer.
      </p>
    </section>
  );
}
