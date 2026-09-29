import * as fs   from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum $Rev number that the bundled bat is allowed to replace (inclusive).
 * An existing file with rev > this value is treated as "already newer / user-customised"
 * and is left untouched.
 */
const MAX_REPLACEABLE_REV: Record<string, number> = {
  'afterbuild.bat':      435,
  'afterbuild_ap.bat':   437,
  'afterbuild_iap.bat':  358,
  'dfumaker_combo.bat':  359,
  'srec_make_combo.bat': 527,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readBatRevision(content: string): number {
  const m = /\$Rev::\s*(\d+)/.exec(content);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Extract the first bat-path token from a postBuildCmd string.
 * Strips "cmd[.exe] /c" prefix if present; handles quoted paths.
 * Returns undefined if the first token does not end with .bat.
 */
function parseBatPath(cmd: string): string | undefined {
  let rest = cmd.trim();
  rest = rest.replace(/^cmd(?:\.exe)?\s+\/[Cc]\s+/i, '').trim();
  const m = /^("(?:[^"\\]|\\.)*"|[^\s"]+)/.exec(rest);
  if (!m) return undefined;
  const tok = m[1].replace(/^"|"$/g, '');
  return tok.toLowerCase().endsWith('.bat') ? tok : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core sync (single file)
// ─────────────────────────────────────────────────────────────────────────────

export interface AfterBuildSyncResult {
  action:  'copied' | 'updated' | 'skipped';
  batPath: string;
  message: string;
}

/**
 * Sync one bat file against its bundled counterpart.
 * - Not found on disk → copy from afterbuild/.
 * - Found, rev ≤ MAX_REPLACEABLE_REV → backup (.bak) + replace.
 * - Found, rev > MAX_REPLACEABLE_REV → skip (user has newer version).
 * - batName not in bundled set → returns undefined (not our file).
 */
function syncOneBat(
  batAbs:        string,
  afterbuildDir: string,
): AfterBuildSyncResult | undefined {
  const batName = path.basename(batAbs).toLowerCase();

  // Find matching bundled file (dynamic — whatever is in afterbuild/)
  let bundledName: string | undefined;
  try {
    bundledName = fs.readdirSync(afterbuildDir).find(f => f.toLowerCase() === batName);
  } catch { return undefined; }
  if (!bundledName) return undefined;

  const bundledPath    = path.join(afterbuildDir, bundledName);
  const bundledContent = fs.readFileSync(bundledPath, 'utf8');

  // Case a: file doesn't exist → copy
  if (!fs.existsSync(batAbs)) {
    fs.mkdirSync(path.dirname(batAbs), { recursive: true });
    fs.writeFileSync(batAbs, bundledContent);
    return {
      action:  'copied',
      batPath: batAbs,
      message: `afterbuildSync: copied ${bundledName} → ${batAbs}`,
    };
  }

  // Case b: file exists → version check
  const existingContent = fs.readFileSync(batAbs, 'utf8');
  const existingRev     = readBatRevision(existingContent);
  const bundledRev      = readBatRevision(bundledContent);
  const maxRev          = MAX_REPLACEABLE_REV[batName];

  if (maxRev === undefined || existingRev > maxRev) {
    return { action: 'skipped', batPath: batAbs, message: '' };
  }

  // Backup
  const backupPath = batAbs + '.bak';
  fs.writeFileSync(backupPath, existingContent);

  fs.writeFileSync(batAbs, bundledContent);
  return {
    action:  'updated',
    batPath: batAbs,
    message: `afterbuildSync: ${batName} rev ${existingRev} → ${bundledRev}, backup: ${path.basename(backupPath)}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync the .bat file referenced in postBuildCmd, then scan its directory for
 * any sibling .bat files that also exist in the bundled afterbuild/ set and
 * apply the same rules to them.
 *
 * This handles the case where DFUmaker_combo.bat / srec_make_combo.bat live
 * in the same folder as afterbuild_ap.bat and are only called indirectly by it.
 *
 * @param postBuildCmd  Raw command from project.settings.json (no cmd /c wrapper)
 * @param wsRoot        HT32_VSCode/ directory (postBuildCmd paths are relative to this)
 * @param extensionPath VS Code extension install directory
 */
export function syncAfterBuildBats(
  postBuildCmd:  string,
  wsRoot:        string,
  extensionPath: string,
): AfterBuildSyncResult[] {
  const batToken = parseBatPath(postBuildCmd);
  if (!batToken) return [];

  const batAbs       = path.isAbsolute(batToken) ? batToken : path.resolve(wsRoot, batToken);
  const afterbuildDir = path.join(extensionPath, 'afterbuild');

  const results: AfterBuildSyncResult[] = [];
  const handled = new Set<string>();

  // Sync the primary bat referenced in postBuildCmd
  const primary = syncOneBat(batAbs, afterbuildDir);
  if (primary) {
    results.push(primary);
    handled.add(batAbs.toLowerCase());
  } else {
    return [];  // primary bat is not a bundled file — no sibling scan
  }

  // Scan the directory of the primary bat for sibling bundled bats
  const batDir = path.dirname(batAbs);
  let siblings: string[];
  try {
    siblings = fs.readdirSync(batDir).filter(f => f.toLowerCase().endsWith('.bat'));
  } catch { return results; }

  // Also get list of bundled names for fast lookup
  let bundledNames: Set<string>;
  try {
    bundledNames = new Set(fs.readdirSync(afterbuildDir).map(f => f.toLowerCase()));
  } catch { return results; }

  for (const sibling of siblings) {
    const sibAbs = path.join(batDir, sibling);
    if (handled.has(sibAbs.toLowerCase())) continue;
    if (!bundledNames.has(sibling.toLowerCase())) continue;
    handled.add(sibAbs.toLowerCase());
    const r = syncOneBat(sibAbs, afterbuildDir);
    if (r) results.push(r);
  }

  return results;
}
