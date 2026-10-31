import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InventorySummary } from '../src/features/game/chaos/InventorySummary';
import type { Manifest } from '../src/features/organizer/protocol';
import type { WorkState } from '../src/features/game/chaos/work-scheduler';

const work: WorkState = { busy: false, credit: 0, earned: 0, batches: 0, lastFiles: 0, error: '' };
const manifest: Manifest = {
  schemaVersion: 1,
  rules: 'extension-v1',
  progress: { phase: 'processing', total: 3, processed: 1, skipped: 1, failed: 0, remaining: 1, totalBytes: 2, processedBytes: 1 },
  entries: [
    { id: 0, originalPath: 'a.txt', outputPath: 'Documents/a.txt', category: 'Documents', status: 'processed', bytes: 1, crc32: '00000000', reason: 'Text' },
    { id: 1, originalPath: 'b.txt', outputPath: 'Documents/b.txt', category: 'Documents', status: 'pending', bytes: 1, crc32: '00000000', reason: 'Text' },
    { id: 2, originalPath: 'empty/', outputPath: null, category: null, status: 'skipped', bytes: 0, crc32: '00000000', reason: 'Directory' },
  ],
};

describe('inventory presentation uses confirmed work', () => {
  it('excludes skipped directories from the file total and pending files from category counts', () => {
    const html = renderToStaticMarkup(createElement(InventorySummary, {
      organizer: { manifest, phase: 'processing', downloadUrl: null, batchBusy: true },
      work: { ...work, busy: true, credit: 25 }, finishing: false,
    }));
    expect(html).toContain('value="1" max="2"');
    expect(html).toContain('<span>Documents</span><b>1</b>');
    expect(html).toContain('Verifying earned files. Counts update after confirmation.');
    expect(html).toContain('Up to 25 files of earned credit waiting.');
    expect(html).not.toContain('mission-complete');
  });

  it.each([null, 'blob:verified'])('requires a download URL to announce verified completion: %s', (downloadUrl) => {
    const html = renderToStaticMarkup(createElement(InventorySummary, {
      organizer: { manifest, phase: 'complete', downloadUrl, batchBusy: false }, work, finishing: true,
    }));
    expect(html.includes('mission-complete')).toBe(Boolean(downloadUrl));
    expect(html.includes('All file bytes checked. Your download is ready.')).toBe(Boolean(downloadUrl));
    expect(html.includes('Finalizing the export.')).toBe(!downloadUrl);
  });

  it('handles an empty workspace without invalid progress values', () => {
    const html = renderToStaticMarkup(createElement(InventorySummary, {
      organizer: { manifest: null, phase: 'idle', downloadUrl: null, batchBusy: false }, work, finishing: false,
    }));
    expect(html).toContain('value="0" max="1"');
    expect(html).not.toMatch(/NaN|Infinity|mission-complete/);
  });
});
