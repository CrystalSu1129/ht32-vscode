/**
 * Compare two version-like strings semantically (numeric segment by segment).
 * Handles plain versions ("1.0.76"), embedded versions ("Holtek.HT32_DFP.1.0.76.pack"),
 * and xpack dir names ("arm-gnu-toolchain-13.2.Rel1-mingw-w64-...").
 *
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Each segment delimited by '.' or '-' is compared numerically when both are numbers,
 * lexicographically otherwise.
 */
export function semverCmp(a: string, b: string): number {
  const segs = (s: string) => s.split(/[.\-]/);
  const sa = segs(a);
  const sb = segs(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const pa = sa[i] ?? '';
    const pb = sb[i] ?? '';
    const na = parseInt(pa, 10);
    const nb = parseInt(pb, 10);
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      const sc = pa.localeCompare(pb);
      if (sc !== 0) return sc;
    }
  }
  return 0;
}

/** Pick the newest (highest) version string from a list using semantic comparison. */
export function newestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) return undefined;
  return [...versions].sort(semverCmp)[versions.length - 1];
}
