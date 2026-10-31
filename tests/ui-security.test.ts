import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ZipWorkspace } from '../src/components/ZipWorkspace';
import type { Organizer } from '../src/components/ZipWorkspace';

const workspace = (overrides: Partial<Organizer> = {}): Organizer => ({
  jobId: 'test', phase: 'idle', error: '', archiveName: '', manifest: null,
  batchBusy: false, downloadUrl: null,
  load: vi.fn(), cancel: vi.fn(), reset: vi.fn(), finishSorting: vi.fn(),
  sortNextBatch: vi.fn(), requestPacket: vi.fn(), requestEarnedBatch: vi.fn(),
  ...overrides,
});

describe('workspace completion and input contract', () => {
  it.each(['ready', 'processing', 'packaging', 'cancelling', 'cancelled', 'error'] as const)(
    'never offers a stale download during %s', (phase) => {
      const html = renderToStaticMarkup(createElement(ZipWorkspace, { organizer: workspace({ phase, downloadUrl: 'blob:stale' }) }));
      expect(html).not.toContain('download="');
      expect(html).not.toContain('Order, restored.');
    },
  );
  it('waits for an actual download URL even after completion', () => {
    const html = renderToStaticMarkup(createElement(ZipWorkspace, { organizer: workspace({ phase: 'complete' }) }));
    expect(html).not.toContain('download="');
    expect(html).toContain('Preparing your verified download');
  });
  it('offers the verified completed ZIP', () => {
    const html = renderToStaticMarkup(createElement(ZipWorkspace, { organizer: workspace({ phase: 'complete', downloadUrl: 'blob:verified' }) }));
    expect(html).toContain('href="blob:verified" download="filequest-organized.zip"');
  });
  it('keeps a labeled native file input and locks replacement during gameplay', () => {
    const html = renderToStaticMarkup(createElement(ZipWorkspace, { organizer: workspace(), gameActive: true }));
    expect(html).toContain('for="zip-upload"');
    expect(html).toMatch(/<input[^>]*id="zip-upload"[^>]*disabled=""/);
    expect(html).toContain('aria-describedby="zip-limits zip-privacy"');
  });
});

describe('untrusted ZIP metadata rendering', () => {
  it('escapes archive names, errors and manifest text instead of creating HTML', () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const organizer: Organizer = {
      jobId: 'test', phase: 'error', error: hostile, archiveName: hostile,
      batchBusy: false, downloadUrl: null,
      load: vi.fn(), cancel: vi.fn(), reset: vi.fn(), finishSorting: vi.fn(),
      sortNextBatch: vi.fn(), requestPacket: vi.fn(), requestEarnedBatch: vi.fn(),
      manifest: {
        schemaVersion: 1, rules: 'extension-v1',
        progress: { phase: 'error', total: 1, processed: 0, failed: 1, skipped: 0, remaining: 0, totalBytes: 1, processedBytes: 0 },
        entries: [{ id: 0, originalPath: hostile, outputPath: hostile, category: 'Other',
          bytes: 1, crc32: '00000000', status: 'failed', reason: hostile }],
      },
    };
    const html = renderToStaticMarkup(createElement(ZipWorkspace, { organizer }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html.match(/&lt;img/g)).toHaveLength(5);
    expect(html).not.toContain('download="');
  });
});
