export const CATEGORIES = [
  'Images', 'Documents', 'Spreadsheets', 'Code',
  'Archives', 'Audio', 'Videos', 'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Extension rules are deliberately explicit: no file-content or AI inference.
const EXTENSIONS: Readonly<Record<Exclude<Category, 'Other'>, readonly string[]>> = {
  Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
  Documents: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'],
  Spreadsheets: ['csv', 'xls', 'xlsx'],
  Code: ['js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json'],
  Archives: ['zip', 'tar', 'gz'],
  Audio: ['mp3', 'wav', 'ogg'],
  Videos: ['mp4', 'mov', 'webm'],
};

const extensionCategories = new Map<string, Category>(
  Object.entries(EXTENSIONS).flatMap(([category, extensions]) =>
    extensions.map((extension) => [extension, category as Category]),
  ),
);

export class UnsafePathError extends Error {
  constructor(reason: string) {
    super(`Unsafe file path: ${reason}`);
    this.name = 'UnsafePathError';
  }
}

/** Reject unsafe entries rather than silently repairing an ambiguous path. */
export function validateFilePath(path: string): string {
  if (!path || path.startsWith('/') || path.includes('\\')) {
    throw new UnsafePathError('use a nonempty relative path with forward slashes.');
  }
  if (path.length > 1024) throw new UnsafePathError('path exceeds 1,024 characters.');

  const normalized = path.normalize('NFC');
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.' || segment === '..') {
      throw new UnsafePathError('empty, dot and parent-directory segments are forbidden.');
    }
    if (/\p{Cc}/u.test(segment) || /[<>:"|?*]/u.test(segment) || /[. ]$/u.test(segment)) {
      throw new UnsafePathError('filename contains unsupported characters or trailing dots/spaces.');
    }
    if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(segment)) {
      throw new UnsafePathError('reserved device names are forbidden.');
    }
    // Leave room for collision suffixes on common 255-byte filesystems.
    if (new TextEncoder().encode(segment).byteLength > 240) {
      throw new UnsafePathError('filename segment exceeds 240 UTF-8 bytes.');
    }
  }
  return normalized;
}

export interface Classification {
  category: Category;
  filename: string;
  extension: string | null;
  reason: string;
}

export function classifyFile(path: string): Classification {
  const normalized = validateFilePath(path);
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : null;
  const category = extension ? extensionCategories.get(extension) ?? 'Other' : 'Other';
  const reason = category !== 'Other'
    ? `.${extension} extension → ${category}`
    : extension
      ? `Unrecognized .${extension} extension → Other`
      : 'No recognized extension → Other';
  return { category, filename, extension, reason };
}

export interface PlannedFile extends Classification {
  originalPath: string;
  outputPath: string;
}

export const MAX_FILE_ENTRIES = 500;

/** Pure path plan only. This neither reads nor packages file contents. */
export function planFiles(paths: readonly string[]): PlannedFile[] {
  if (paths.length > MAX_FILE_ENTRIES) {
    throw new Error(`Choose at most ${MAX_FILE_ENTRIES} file entries.`);
  }

  // Fixed code-unit ordering is stable across devices and locales.
  const ordered = paths.map((originalPath) => ({
    originalPath,
    ...classifyFile(originalPath),
  })).sort((a, b) => a.originalPath < b.originalPath ? -1 : a.originalPath > b.originalPath ? 1 : 0);

  const usedPaths = new Set<string>();
  return ordered.map((file) => {
    const dot = file.filename.lastIndexOf('.');
    const stem = dot > 0 ? file.filename.slice(0, dot) : file.filename;
    const suffix = dot > 0 ? file.filename.slice(dot) : '';
    let outputPath = `${file.category}/${file.filename}`;
    let occurrence = 1;
    // Include generated names in the same set; existing "name (2)" is preserved.
    while (usedPaths.has(outputPath.toLowerCase())) {
      occurrence += 1;
      const marker = ` (${occurrence})`;
      // Keep generated names within the same UTF-8 filename budget as source names.
      const keepSuffix = new TextEncoder().encode(suffix).length <= 32 ? suffix : '';
      let shortened = keepSuffix ? stem : file.filename;
      while (new TextEncoder().encode(shortened + marker + keepSuffix).length > 240) {
        shortened = Array.from(shortened).slice(0, -1).join('');
      }
      outputPath = `${file.category}/${shortened}${marker}${keepSuffix}`;
    }
    usedPaths.add(outputPath.toLowerCase());
    return { ...file, outputPath };
  });
}
