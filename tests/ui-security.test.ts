import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ZipWorkspace } from '../src/components/ZipWorkspace';
import type { Organizer } from '../src/components/ZipWorkspace';

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
