import { describe, expect, it } from 'vitest';
import {
  classifyFile, MAX_FILE_ENTRIES, planFiles, UnsafePathError, validateFilePath,
} from '../../src/features/organizer/classify';
import { DEMO_PATHS } from '../../src/features/organizer/demo';

describe('extension-based classification', () => {
  it.each([
    ['Images', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']],
    ['Documents', ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf']],
    ['Spreadsheets', ['csv', 'xls', 'xlsx']],
    ['Code', ['js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json']],
    ['Archives', ['zip', 'tar', 'gz']],
    ['Audio', ['mp3', 'wav', 'ogg']],
    ['Videos', ['mp4', 'mov', 'webm']],
  ])('maps every documented %s extension', (category, extensions) => {
    for (const extension of extensions) {
      const result = classifyFile(`folder/example.${extension}`);
      expect(result.category).toBe(category);
      expect(result.reason).toBe(`.${extension} extension → ${category}`);
    }
  });

  it.each([
    ['invoice.csv', 'Spreadsheets'],
    ['photo.PNG', 'Images'],
    ['app.js', 'Code'],
    ['unknown.foo', 'Other'],
    ['readme', 'Other'],
    ['.gitignore', 'Other'],
    ['.png', 'Other'],
    ['.hidden.JPG', 'Images'],
    ['archive.tar.gz', 'Archives'],
    ['image.png.exe', 'Other'],
    ['folder.pdf/readme', 'Other'],
    ['invoice.pdf.js', 'Code'],
    ['photo.ＰＮＧ', 'Other'],
    ['constructor', 'Other'],
    ['file.__proto__', 'Other'],
    ['file.constructor', 'Other'],
  ])('%s → %s', (path, category) => {
    expect(classifyFile(path).category).toBe(category);
  });

  it('preserves case in the filename while explaining the normalized extension', () => {
    expect(classifyFile('photos/HOLIDAY.JPG')).toEqual({
      category: 'Images', filename: 'HOLIDAY.JPG', extension: 'jpg',
      reason: '.jpg extension → Images',
    });
  });
});

describe('strict relative file paths', () => {
  it.each([
    '', '../secret.txt', '../../secret.txt', 'folder/../secret.txt',
    '/etc/passwd', '//server/share.txt', 'C:/secret.txt', 'C:secret.txt',
    'folder\\photo.png', '\\server\\share', 'folder/./file.txt',
    'folder//file.txt', 'folder/', 'file\0.txt', 'a/line\n.txt',
    'a/tab\t.txt', 'a/\u007f.txt', 'a/file?.txt', 'a/file*.txt',
    'a/file<.txt', 'a/file>.txt', 'a/file|.txt', 'a/file".txt',
    'a/file:stream.txt', 'folder/file.', 'folder/file ', 'CON',
    'con.txt', 'PRN.txt', 'aux/notes.txt', 'NUL', 'COM1.log', 'lpt9.txt',
    'COM¹.txt', '.', '..', 'a'.repeat(241), `${'a'.repeat(239)}é`,
    Array.from({ length: 600 }, () => 'a').join('/'),
  ])('rejects unsafe path %j', (path) => {
    expect(() => validateFilePath(path)).toThrow(UnsafePathError);
    expect(() => classifyFile(path)).toThrow(UnsafePathError);
  });

  it.each(['notes from class.txt', 'a/b/file.txt', '照片/旅行.png', '.config/settings.json', 'a'.repeat(240)])('accepts %s', (path) => {
    expect(validateFilePath(path)).toBe(path);
  });

  it('normalizes Unicode to NFC', () => {
    expect(validateFilePath('cafe\u0301.txt')).toBe('café.txt');
  });
});

describe('deterministic output planning', () => {
  it('flattens folders into fixed category roots and retains the original path', () => {
    expect(planFiles(['deep/nested/invoice.csv'])[0]).toMatchObject({
      originalPath: 'deep/nested/invoice.csv', outputPath: 'Spreadsheets/invoice.csv',
    });
  });

  it('resolves duplicate names, including case-insensitive collisions', () => {
    const results = planFiles(['b/photo.png', 'a/photo.png', 'c/PHOTO.PNG']);
    expect(results.map((file) => file.outputPath)).toEqual([
      'Images/photo.png', 'Images/photo (2).png', 'Images/PHOTO (3).PNG',
    ]);
  });

  it('resolves collisions with a pre-existing suffix without losing an entry', () => {
    const results = planFiles(['a/report.txt', 'b/report (2).txt', 'c/report.txt']);
    expect(results.map((file) => file.outputPath)).toEqual([
      'Documents/report.txt', 'Documents/report (2).txt', 'Documents/report (3).txt',
    ]);
  });

  it('keeps identical input paths as separate entries', () => {
    expect(planFiles(['same.txt', 'same.txt']).map((file) => file.outputPath)).toEqual([
      'Documents/same.txt', 'Documents/same (2).txt',
    ]);
  });

  it('handles names without extensions and Unicode-equivalent names', () => {
    const results = planFiles(['a/readme', 'b/readme', 'a/café.txt', 'b/cafe\u0301.txt']);
    expect(results.map((file) => file.outputPath)).toEqual([
      'Documents/café.txt', 'Other/readme', 'Documents/café (2).txt', 'Other/readme (2)',
    ]);
  });

  it('does not let a JSON filename collide with the future root manifest', () => {
    expect(planFiles(['filequest-manifest.json'])[0]?.outputPath).toBe('Code/filequest-manifest.json');
  });

  it('is independent of caller ordering and leaves its input untouched', () => {
    const input = Object.freeze(['z/note.txt', 'a/note.txt']);
    expect(planFiles(input)).toEqual(planFiles([...input].reverse()));
    expect(input).toEqual(['z/note.txt', 'a/note.txt']);
  });

  it('rejects an unsafe entry instead of returning a partial success', () => {
    expect(() => planFiles(['photo.png', '../secret.txt'])).toThrow(UnsafePathError);
  });

  it('returns an empty plan for an empty list', () => {
    expect(planFiles([])).toEqual([]);
  });

  it('accepts 500 entries with unique output names and rejects 501', () => {
    const entries = Array.from({ length: MAX_FILE_ENTRIES }, () => 'same.txt');
    const output = planFiles(entries);
    expect(output).toHaveLength(500);
    expect(new Set(output.map((file) => file.outputPath.toLowerCase())).size).toBe(500);
    expect(output.at(-1)?.outputPath).toBe('Documents/same (500).txt');
    expect(() => planFiles([...entries, 'extra.txt'])).toThrow('at most 500');
  });

  it('classifies the documented synthetic demo with no output collisions', () => {
    const results = planFiles(DEMO_PATHS);
    expect(results).toHaveLength(9);
    expect(new Set(results.map((file) => file.category)).size).toBe(8);
    expect(new Set(results.map((file) => file.outputPath)).size).toBe(9);
    expect(results.find((file) => file.originalPath === 'random/holiday.png')?.outputPath)
      .toBe('Images/holiday (2).png');
  });
});
