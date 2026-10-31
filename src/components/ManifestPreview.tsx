import type { Manifest } from '../features/organizer/protocol';
import { Icon } from './Icon';

interface ManifestPreviewProps {
  manifest: Manifest;
  complete: boolean;
}

/** Read-only audit trail; completion and download eligibility stay with the caller. */
export function ManifestPreview({ manifest, complete }: ManifestPreviewProps) {
  return (
    <details className="manifest-preview" open={complete}>
      <summary>
        <Icon name="file" size={17} /> View file manifest <span>{manifest.entries.length}</span>
      </summary>
      <p className="helper">Original paths, new destinations and actual status. The completed ZIP includes filequest-manifest.json. Failed or cancelled jobs have no partial download.</p>
      <div className="table-scroll" role="region" aria-label="Archive manifest" tabIndex={0}>
        <table>
          <caption className="sr-only">Original paths, output paths, categories and actual processing status.</caption>
          <thead>
            <tr><th scope="col">Original file</th><th scope="col">Destination / status</th></tr>
          </thead>
          <tbody>
            {manifest.entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  {entry.originalPath}
                  <small>{entry.bytes.toLocaleString()} bytes · CRC32 {entry.crc32}</small>
                </td>
                <td>
                  <span className="destination">{entry.outputPath ?? 'No output path'}</span>
                  <small className={`entry-status entry-${entry.status}`}>
                    {entry.category ?? 'Directory'} · {entry.status}
                  </small>
                  <small>{entry.reason}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
