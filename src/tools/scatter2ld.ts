// src/tools/scatter2ld.ts
// Converts Keil ARM scatter file (.sct) to GNU LD linker script (.ld)
// Handles HT32 patterns: standard flash/RAM, external SRAM, external flash (SPIM), IAP offset

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

interface MemRegion {
  ldName:       string;    // name used in MEMORY block, comes directly from scatter exec region name
  attrs:        string;    // rx | xrw
  origin:       number;
  length:       number;
  hasCode?:     boolean;   // true if exec region contains RESET (vector table) → main code flash
  hasData?:     boolean;   // true if exec region contains +RW or +ZI → main data RAM
  binarySects?:   string[];      // section names extracted from "name.o (SECT)" patterns (binary embed regions)
  bareObjRefs?:   string[];      // bare .o filenames (no section specifier) in dedicated Flash rx region → auto-generated SECTIONS entry
  objPlacements?: ObjPlacement[]; // "name.o(+XO/+RO/+RW/+ZI)" → pinned-object SECTIONS entries
}

interface CustomSection {
  sectName: string;   // e.g. extsram / extflash / spim
  ldMem:    string;   // MEMORY region name
  isNoLoad: boolean;
  isRam:    boolean;  // true = RAM-type region (no init copy needed)
}

interface ObjPlacement {
  glob:    string;    // "calculate.o" | "*.o"
  attr:    string;    // "+XO" | "+RO" | "+RW" | "+ZI"
  isFirst: boolean;
  sects:   string[];  // resolved GNU section patterns
}

export interface Scatter2LdResult {
  ld:             string;
  warnings:       string[];
  codeRegionName: string;   // ldName of the exec region containing RESET (main code flash)
  ramRegionName:  string;   // ldName of the first xrw exec region
}

/* ─────────────────────────────────────────────
 * Address classification (HT32 memory map)
 *
 * M0/M0+/M3 series (HT32F5xxxx, HT32F1xxxx):
 *   Flash : 0x00000000
 * M4 series (HT32F49xxx):
 *   Flash : 0x08000000
 *   SPIM  : 0x08400000   (SPI memory-mapped / external flash XIP)
 * All series:
 *   SRAM  : 0x20000000
 *   ExtRAM: 0x60000000 – 0x6FFFFFFF (PSRAM / SRAM on external bus)
 * ───────────────────────────────────────────── */

function classifyAddr(origin: number): { ldName: string; attrs: string } {
  if (origin >= 0x60000000 && origin <= 0x6FFFFFFF) { return { ldName: 'EXT_RAM', attrs: 'xrw' }; }
  if (origin >= 0x20000000 && origin <  0x60000000) { return { ldName: 'RAM',     attrs: 'xrw' }; }
  if (origin >= 0x08400000 && origin <  0x10000000) { return { ldName: 'SPIM',    attrs: 'rx'  }; }
  if (origin >= 0x08000000 && origin <  0x08400000) { return { ldName: 'FLASH',   attrs: 'rx'  }; }
  if (origin >= 0x00000000 && origin <  0x08000000) { return { ldName: 'FLASH',   attrs: 'rx'  }; }
  return { ldName: 'MEM_' + origin.toString(16).toUpperCase(), attrs: 'rx' };
}

/* ─────────────────────────────────────────────
 * Parser
 * ───────────────────────────────────────────── */

function stripComments(src: string): string {
  return src.replace(/;[^\n]*/g, '').replace(/\/\/[^\n]*/g, '');
}

function parseNum(s: string): number {
  s = s.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16);
  return parseInt(s, 10);
}

function hex(n: number): string {
  return '0x' + n.toString(16).toUpperCase().padStart(8, '0');
}


type Block = { name: string; base: number; size: number; body: string };

/** Shared brace-body extractor. Returns body and end index. */
function extractBody(src: string, bodyStart: number): { body: string; end: number } {
  let depth = 1;
  let i = bodyStart;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return { body: src.slice(bodyStart, i - 1), end: i };
}

/**
 * Find top-level load regions: NAME BASE [SIZE] [FLAGS] { ... }
 * BASE may be hex (0x...) or decimal.
 * FLAGS like "PI" are ignored. { may appear on the next line.
 */
function parseBlocks(src: string): Block[] {
  const result: Block[] = [];
  // [^{\r\n]*  — swallow optional flags on the same line (e.g. PI)
  // \s*        — allow brace on next line (and any leading whitespace)
  const headerRe = /([A-Za-z_$][A-Za-z0-9_$]*)\s+(0x[0-9a-fA-F]+|\d+)(?:\s+(0x[0-9a-fA-F]+|\d+))?[^{\r\n]*\s*\{/g;

  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(src)) !== null) {
    const name = m[1];
    const base = parseNum(m[2]);
    const size = m[3] ? parseNum(m[3]) : 0;
    const { body, end } = extractBody(src, m.index + m[0].length);
    result.push({ name, base, size, body });
    // Advance past the block so nested blocks aren't re-matched at top level
    headerRe.lastIndex = end;
  }
  return result;
}

/**
 * Parse execution regions inside a load region body.
 * Handles:
 *   - Absolute base:  NAME 0xADDR [SIZE] [FLAGS] { ... }
 *   - Relative base:  NAME +OFFSET [SIZE] [FLAGS] { ... }  (+0 most common; offset is decimal)
 * lrBase is the load region's absolute base address.
 * { may appear on the next line.
 */
function parseExecRegions(body: string, lrBase: number): Block[] {
  const result: Block[] = [];
  // +decimal-OFFSET or 0xADDR or decimal
  const headerRe = /([A-Za-z_$][A-Za-z0-9_$]*)\s+(\+\d+|0x[0-9a-fA-F]+|\d+)(?:\s+(0x[0-9a-fA-F]+|\d+))?[^{\r\n]*\s*\{/g;

  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(body)) !== null) {
    const name = m[1];
    const baseStr = m[2];
    const base = baseStr.startsWith('+')
      ? lrBase + parseInt(baseStr.slice(1), 10)
      : parseNum(baseStr);
    const size = m[3] ? parseNum(m[3]) : 0;
    const { body: erBody, end } = extractBody(body, m.index + m[0].length);
    result.push({ name, base, size, body: erBody });
    headerRe.lastIndex = end;
  }
  return result;
}

/** Extract custom named section references: *(.name) or *.o (.name) */
function extractNamedSections(body: string): string[] {
  const names: string[] = [];
  // Match *(.sectionname) or *.o (.sectionname)
  const re = /\*(?:\.[a-zA-Z0-9_]+)?\s*\(\s*\.([a-zA-Z0-9_]+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    // Exclude standard Keil attributes
    const n = m[1];
    if (!['RO', 'XO', 'RW', 'ZI'].includes(n.toUpperCase())) {
      names.push(n);
    }
  }
  return names;
}

/**
 * Extract section names from "filename.o (SECTIONNAME ...)" patterns.
 * Used to identify binary-embed regions (e.g. "iap_5828.o (IAP, +FIRST)" → ["iap"]).
 */
function extractObjSectionNames(body: string): string[] {
  // Also handles wildcard patterns like `*.o (LOADER)` common in flash-image builder scatter files.
  const re = /(?:\*|[\w.]+)\.o\s*\(\s*([A-Za-z_]\w*)/g;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = m[1];
    // Skip standard Keil section keywords
    if (['RESET', 'InRoot', 'RO', 'RW', 'ZI', 'XO'].includes(n.toUpperCase())) continue;
    results.push(n.toLowerCase());
  }
  return results;
}

/** Map Keil attribute selector to GNU LD section patterns. */
function attrToSections(attr: string): string[] {
  switch (attr.toUpperCase()) {
    case '+XO': return ['.text', '.text*'];
    case '+RO': return ['.text', '.text*', '.rodata', '.rodata*'];
    case '+RW': return ['.data', '.data*'];
    case '+ZI': return ['.bss', '.bss*'];
    default:    return [];
  }
}

/**
 * Extract "name.o(+ATTR)" placements from exec region body.
 * e.g. calculate.o(+XO)  →  { glob:'calculate.o', attr:'+XO', sects:['.text','.text*'] }
 *      *.o(+RO, +FIRST)   →  { glob:'*.o', attr:'+RO', isFirst:true, ... }
 */
function extractObjAttrPlacements(body: string): ObjPlacement[] {
  const results: ObjPlacement[] = [];
  // Matches: "name.o(+ATTR)" or "name.o(+ATTR, +FIRST)" — name may be *.o or path.o
  const re = /(\*|[\w.]+\.o)\s*\(\s*(\+(?:XO|RO|RW|ZI))(?:[^)]*\+FIRST)?[^)]*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const glob    = m[1];
    const attr    = m[2].toUpperCase();
    const isFirst = /\+FIRST/i.test(m[0]);
    const sects   = attrToSections(attr);
    results.push({ glob, attr, isFirst, sects });
  }
  return results;
}

/** True if body contains standard Keil placement patterns (no custom section conversion needed). */
function isStandardRegion(body: string): boolean {
  // +RO/+RW/+ZI/+XO  — standard Keil attribute selectors
  // RESET / InRoot    — well-known section names
  // +FIRST            — ordering modifier
  // *.o ( or name.o ( — object-scoped placement
  // name.o (no paren) — bare object file reference (e.g. ram_fun.o)
  return /\+RO|\+RW|\+ZI|\+XO|RESET|InRoot|\+FIRST|\.o\b/.test(body);
}

/* ─────────────────────────────────────────────
 * Main converter
 * ───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
 * Section block generators (module-level, shared between full-gen and template mode)
 * ───────────────────────────────────────────── */

function customSectBlock(cs: CustomSection): string {
  const noload = cs.isNoLoad ? ' (NOLOAD)' : '';
  const initSymbols = !cs.isRam ? `
  _${cs.sectName}_init_base   = LOADADDR(.${cs.sectName});
  _${cs.sectName}_init_length = SIZEOF(.${cs.sectName});` : '';
  return `${initSymbols}
  .${cs.sectName}${noload} :
  {
    . = ALIGN(4);
    _${cs.sectName}_start = .;
    *(.${cs.sectName})
    *(.${cs.sectName}*)
    . = ALIGN(4);
    _${cs.sectName}_end = .;
  } >${cs.ldMem}`;
}

function objPinnedSectBlock(r: MemRegion): string {
  const sectName = r.ldName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const keilDesc = r.objPlacements!.map(p => `${p.glob}(${p.attr})`).join(', ');
  const lines = r.objPlacements!.map(p => {
    const objFilter = p.glob === '*.o' ? '*' : `*${p.glob}`;
    const sectList  = p.sects.join(' ');
    const keepLine  = `    KEEP(${objFilter}(${sectList}))`;
    return p.isFirst ? `    /* +FIRST */\n${keepLine}` : keepLine;
  }).join('\n');
  return (
    `  /* Keil: ${keilDesc} — pinned to ${r.ldName} at ${hex(r.origin)} */\n` +
    `  .${sectName} :\n  {\n    . = ALIGN(4);\n${lines}\n    . = ALIGN(4);\n  } >${r.ldName}`
  );
}

/**
 * Template-based generation: patch FWLib linker.ld MEMORY block and insert extra SECTIONS.
 * Used when opts.templateLd is provided. Returns a modified copy of the template.
 * All patch failures are reported as warnings (never silently ignored).
 */
function buildFromTemplate(
  templateLd:     string,
  memRegions:     MemRegion[],
  customSections: CustomSection[],
  flashRegion:    MemRegion | undefined,
  ramRegion:      MemRegion | undefined,
  warnings:       string[]
): Scatter2LdResult {
  let out = templateLd;

  // ── Patch MEMORY: FLASH ────────────────────────────────────────────────────
  // Template FLASH line has no leading whitespace: FLASH (rx)     : ORIGIN = ...
  const flashRe = /^FLASH\s*\([^)]*\)\s*:\s*ORIGIN\s*=\s*[^,]+,\s*LENGTH\s*=\s*[^\r\n]+/m;
  if (flashRegion) {
    if (!flashRe.test(out)) {
      warnings.push('Template MEMORY patch failed: FLASH entry not found — verify template has standard FLASH region.');
    } else if (flashRegion.length > 0) {
      out = out.replace(flashRe, `FLASH (rx)     : ORIGIN = ${hex(flashRegion.origin)}, LENGTH = ${hex(flashRegion.length)}`);
    } else if (flashRegion.origin !== 0) {
      // Non-zero IAP offset but length unknown — patch ORIGIN only, leave template LENGTH intact
      out = out.replace(flashRe, m => m.replace(/ORIGIN\s*=\s*[\w.]+/, `ORIGIN = ${hex(flashRegion.origin)}`));
    }
  } else {
    warnings.push('No ROM/FLASH region found in scatter file — FLASH MEMORY entry not patched.');
  }

  // ── Patch MEMORY: RAM ──────────────────────────────────────────────────────
  const ramRe = /^RAM\s*\([^)]*\)\s*:\s*ORIGIN\s*=\s*[^,]+,\s*LENGTH\s*=\s*[^\r\n]+/m;
  if (ramRegion) {
    if (!ramRe.test(out)) {
      warnings.push('Template MEMORY patch failed: RAM entry not found — verify template has standard RAM region.');
    } else if (ramRegion.length > 0) {
      out = out.replace(ramRe, `RAM (xrw)      : ORIGIN = ${hex(ramRegion.origin)}, LENGTH = ${hex(ramRegion.length)}`);
    } else if (ramRegion.origin !== 0x20000000) {
      out = out.replace(ramRe, m => m.replace(/ORIGIN\s*=\s*[\w.]+/, `ORIGIN = ${hex(ramRegion.origin)}`));
    }
  } else {
    warnings.push('No RAM region found in scatter file — RAM MEMORY entry not patched.');
  }

  // ── Insert extra MEMORY regions (IAP, SPIM, EXT_RAM, etc.) ────────────────
  // Sorted by origin; inserted just before the MEMORY block closing brace.
  const extraMem = memRegions.filter(r => r !== flashRegion && r !== ramRegion);
  if (extraMem.length > 0) {
    const sorted = [...extraMem].sort((a, b) => a.origin - b.origin);
    const lines = sorted.map(r =>
      `${r.ldName.padEnd(8)} (${r.attrs.padEnd(3)}) : ORIGIN = ${hex(r.origin)}, LENGTH = ${hex(r.length)}`
    ).join('\n');
    const prev = out;
    out = out.replace(/(MEMORY\s*\{)([\s\S]*?)(\})/, `$1$2${lines}\n$3`);
    if (out === prev) warnings.push('Template MEMORY patch failed: could not locate MEMORY block to insert extra regions.');
  }

  // ── Extra SECTIONS blocks ──────────────────────────────────────────────────
  const binarySectRegions = memRegions.filter(r => !r.hasCode && r.binarySects && r.binarySects.length > 0);
  const bareObjRxRegions  = memRegions.filter(r => r.attrs === 'rx' && !r.hasCode && r.bareObjRefs && r.bareObjRefs.length > 0);
  const objPinnedReg      = memRegions.filter(r => !r.hasCode && !r.hasData && r.objPlacements && r.objPlacements.length > 0);

  // Flash-targeted sections (rx): binary-embed, bare .o, pinned-object, custom rx
  const rxSectParts: string[] = [];
  for (const r of binarySectRegions) {
    const sects = r.binarySects!;
    const sectLines = sects.map(s => `    KEEP(*(.${s}))\n    KEEP(*(.${s}*))`).join('\n');
    rxSectParts.push(
      `  /* Binary-embed region "${r.ldName}" at ${hex(r.origin)} */\n  .${sects[0]} :\n  {\n${sectLines}\n  } >${r.ldName}`
    );
  }
  for (const r of bareObjRxRegions) {
    const sectName = r.ldName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const objLines = r.bareObjRefs!.map(o => `    KEEP(*${o}(.rodata .rodata* .data .data*))`).join('\n');
    rxSectParts.push(
      `  /* Bare .o at fixed Flash address — verify section names match .c content */\n  .${sectName} :\n  {\n${objLines}\n  } >${r.ldName}`
    );
  }
  for (const r of objPinnedReg) rxSectParts.push(objPinnedSectBlock(r));
  rxSectParts.push(...customSections.filter(cs => !cs.isRam).map(customSectBlock));

  // RAM-targeted sections (xrw): custom named sections
  const rwSectParts = customSections.filter(cs => cs.isRam).map(customSectBlock);

  // Insert rx sections just before .isr_vector (after option-byte sections already in template)
  if (rxSectParts.length > 0) {
    const rxText = rxSectParts.join('\n\n');
    const prev = out;
    out = out.replace(/([ \t]*\.isr_vector\b)/, `${rxText}\n\n$1`);
    if (out === prev) warnings.push('Template SECTIONS patch failed: could not locate .isr_vector to insert flash sections.');
  }

  // Insert rw sections just before /DISCARD/
  if (rwSectParts.length > 0) {
    const rwText = rwSectParts.join('\n\n');
    const prev = out;
    out = out.replace(/([ \t]*\/DISCARD\/)/, `${rwText}\n\n  $1`);
    if (out === prev) warnings.push('Template SECTIONS patch failed: could not locate /DISCARD/ to insert RAM sections.');
  }

  return { ld: out, warnings, codeRegionName: 'FLASH', ramRegionName: 'RAM' };
}

export function scatter2ld(
  sctContent: string,
  opts: {
    deviceName?:  string;
    heapSize?:    string;   // hex string e.g. "0x1000"
    stackSize?:   string;   // hex string e.g. "0x800"
    ramLength?:   string;   // override RAM region length (from Settings.ini); hex string e.g. "0x18000"
    romOrigin?:   string;   // flash start address from uvprojx/PDSC; hex string e.g. "0x08000000"
    romLength?:   string;   // flash total size from uvprojx/PDSC; hex string e.g. "0x00080000"
    templateLd?:  string;   // FWLib linker.ld text to use as base (template-based mode)
  } = {}
): Scatter2LdResult {

  const warnings: string[] = [];
  const cleaned = stripComments(sctContent);
  const topBlocks = parseBlocks(cleaned);

  const memRegions: MemRegion[] = [];
  const customSections: CustomSection[] = [];

  // Dedup exec region names across all load regions (scatter names are unique in practice,
  // but guard against pathological cases with a simple counter suffix).
  const nameCount: Record<string, number> = {};
  function assignLdName(base: string): string {
    nameCount[base] = (nameCount[base] ?? 0) + 1;
    return nameCount[base] === 1 ? base : base + nameCount[base];
  }

  // Process top-level load regions
  for (const lr of topBlocks) {
    const execBlocks = parseExecRegions(lr.body, lr.base);

    for (const er of execBlocks) {
      // Use the exec region's own name from the scatter file as the MEMORY region name.
      // classifyAddr is used only to determine rx/xrw attrs — never for naming.
      const { attrs } = classifyAddr(er.base);
      const ldName     = assignLdName(er.name);
      const hasCode     = /\bRESET\b/.test(er.body);
      const hasData     = /\+RW|\+ZI/.test(er.body);
      const binarySects = hasCode ? [] : extractObjSectionNames(er.body);

      // Size precedence: ER explicit size → (rx only) LR explicit size → 0.
      // xrw (RAM) regions nested inside a flash load region carry no size in scatter;
      // leave as 0 so the ramLength override below applies correctly.
      let length = er.size > 0 ? er.size : (attrs === 'rx' ? lr.size : 0);

      // Any rx region inside internal flash without an explicit size gets the remaining flash space
      // so GNU LD does not error with "region full (length=0)".
      // This covers both non-code regions (binary-embed, etc.) and IAP/AP code regions where
      // the scatter AP load region has no explicit size — length = romEnd - er.base.
      // Requires romOrigin+romLength from the caller; without them length stays 0 and warning fires.
      // Regions outside [romOrigin, romEnd) (e.g. SPIM) are left untouched.
      if (length === 0 && attrs === 'rx' && opts.romOrigin && opts.romLength) {
        const romStart = parseNum(opts.romOrigin);
        const romEnd   = romStart + parseNum(opts.romLength);
        if (er.base >= romStart && er.base < romEnd) {
          length = romEnd - er.base;
        }
      }

      if (length === 0 && attrs !== 'xrw' && !hasCode) {
        warnings.push(`Region "${er.name}" at ${hex(er.base)}: no size specified; LENGTH = 0 in MEMORY block.`);
      }

      // Extract custom named sections and bare .o refs before push so they can be stored in MemRegion.
      const namedSects = extractNamedSections(er.body);

      // Extract "name.o(+XO/+RO/+RW/+ZI)" pinned-object placements.
      // Only relevant for dedicated non-code/non-data regions (e.g. Partial Lock flash sections).
      const objPlacements: ObjPlacement[] = (!hasCode && !hasData)
        ? extractObjAttrPlacements(er.body)
        : [];

      for (const p of objPlacements) {
        if (attrs === 'xrw' && (p.attr === '+RW' || p.attr === '+ZI')) {
          warnings.push(
            `Region "${er.name}" at ${hex(er.base)}: "${p.glob}(${p.attr})" in RAM region — ` +
            `execute-from-RAM requires AT> and startup copy routine; auto-conversion not supported.`
          );
        } else {
          warnings.push(
            `Region "${er.name}" at ${hex(er.base)}: "${p.glob}(${p.attr})" → pinned to ${ldName} ` +
            `as [${p.sects.join(' ')}]. Verify section names match actual .c/.s content.`
          );
        }
      }

      // Bare .o at fixed Flash address (rx, no other patterns): auto-generate SECTIONS entry.
      // xrw (RAM execute-from-RAM) still needs AT> + startup copy — emit WARNING instead.
      const bareObjRefs: string[] = [];
      if (!hasCode && !hasData && binarySects.length === 0 && namedSects.length === 0 && objPlacements.length === 0) {
        const bareObjs = [...er.body.matchAll(/\b\w[\w.]*\.o\b(?!\s*\()/g)].map(m => m[0]);
        if (bareObjs.length > 0) {
          if (attrs === 'rx') {
            bareObjRefs.push(...bareObjs);
            warnings.push(
              `Region "${er.name}" at ${hex(er.base)}: bare object(s) [${bareObjs.join(', ')}] ` +
              `auto-placed with .rodata/.data sections. Verify section names match actual .c content.`
            );
          } else {
            for (const obj of bareObjs) {
              warnings.push(
                `Region "${er.name}" at ${hex(er.base)}: object file "${obj}" in RAM region ` +
                `cannot be auto-converted — execute-from-RAM requires AT> and startup copy routine.`
              );
            }
          }
        }
      }

      memRegions.push({ ldName, attrs, origin: er.base, length, hasCode, hasData, binarySects, bareObjRefs, objPlacements });

      for (const sn of namedSects) {
        customSections.push({
          sectName: sn,
          ldMem:    ldName,
          // NOLOAD 只用於 RAM 類型（未初始化 RAM region）；
          // SPIM/FLASH (rx) 是 XIP 直接映射，不加 NOLOAD，讓 linker 正常輸出到 image
          isNoLoad: attrs === 'xrw',
          isRam:    attrs === 'xrw',
        });
      }

      // Report any body content that doesn't match any recognized pattern.
      const hasAnyRecognized = hasCode || hasData ||
        binarySects.length > 0 || namedSects.length > 0 ||
        bareObjRefs.length > 0 || objPlacements.length > 0;

      if (!hasAnyRecognized) {
        const trimmed = er.body.trim().replace(/\s+/g, ' ');
        if (trimmed.length > 0) {
          warnings.push(
            `Region "${er.name}" at ${hex(er.base)}: unrecognized content — no SECTIONS entry generated. ` +
            `Body: "${trimmed.slice(0, 120)}${trimmed.length > 120 ? '…' : ''}"`
          );
        }
      }
    }
  }

  // ── Find code flash and RAM regions ──
  // Code flash = rx region with RESET vector table.   Fallback: last rx region.
  // Main RAM   = xrw region with +RW/+ZI (standard data placement). Fallback: last xrw region.
  // Fallback handles non-standard scatter bodies while still preferring the semantically correct region.
  const allRxRegions  = memRegions.filter(r => r.attrs === 'rx');
  const allXrwRegions = memRegions.filter(r => r.attrs === 'xrw');
  const flashRegion   = allRxRegions.find(r => r.hasCode)
    ?? (allRxRegions.length  > 0 ? allRxRegions[allRxRegions.length - 1]   : undefined);
  const ramRegion     = allXrwRegions.find(r => r.hasData)
    ?? (allXrwRegions.length > 0 ? allXrwRegions[allXrwRegions.length - 1] : undefined);

  // True when the scatter has a RESET section → standard firmware with vector table & C runtime.
  // False for flash-image builder projects (e.g. IAP Maker) that only use named flash sections.
  const hasResetRegion = allRxRegions.some(r => r.hasCode);

  if (!flashRegion) warnings.push('No ROM/FLASH region found in scatter file.');
  if (!ramRegion)   warnings.push('No RAM region found in scatter file.');

  // Settings.ini override: 若提供 ramLength，覆蓋 scatter 解析出的 RAM 大小。
  // 目的：部分 Keil scatter 包含外部 SRAM（需 XMC 初始化），GNU startup 無法初始化 XMC，
  // 必須將 _estack 限縮在晶片實際內部 SRAM 範圍內以避免 HardFault。
  //
  // 注意：Settings.ini 的 SRAM size 是從 0x20000000 起算的總大小。
  // 若 RAM origin 不在 0x20000000（例如 IAP 保留前幾 byte，RAM 從 0x20000010 開始），
  // 必須扣除 offset，否則 length 會超出實際 SRAM 範圍。
  if (ramRegion && opts.ramLength) {
    const overrideLen = parseNum(opts.ramLength);
    if (overrideLen > 0) {
      const sramBase = 0x20000000;
      const offset = ramRegion.origin >= sramBase ? ramRegion.origin - sramBase : 0;
      ramRegion.length = Math.max(0, overrideLen - offset);
    }
  }

  // ── Template-based mode: patch FWLib linker.ld instead of generating from scratch ──
  if (opts.templateLd) {
    return buildFromTemplate(opts.templateLd, memRegions, customSections, flashRegion, ramRegion, warnings);
  }

  // Use expression form so patchLdStackTop() can cap _estack to Settings.ini safe value.
  const ramName    = ramRegion?.ldName ?? 'RAM';
  const estack     = ramRegion ? `ORIGIN(${ramName}) + LENGTH(${ramName})` : '0x20010000';
  // When heap/stack sizes are explicitly provided (caller detected 49x FWLib GCC startup which has
  // no .heap/.stack sections), allocate space directly via _Min_Heap/Stack_Size. Otherwise (STD)
  // startup .s owns allocation via .space + .section "aw",%nobits; keep 0x0 to avoid double-counting.
  const use49xAlloc  = !!opts.heapSize && parseInt(opts.heapSize, 16) > 0;
  const localHeapSize  = use49xAlloc ? opts.heapSize!  : '0x0';
  const localStackSize = use49xAlloc ? (opts.stackSize ?? '0x0') : '0x0';
  const deviceName = opts.deviceName ?? 'HT32';

  // ── Build MEMORY block ──
  // All regions from the scatter file are included faithfully; no filtering or renaming.
  const memLines = memRegions.map(r =>
    `  ${r.ldName.padEnd(8)} (${r.attrs.padEnd(3)}) : ORIGIN = ${hex(r.origin)}, LENGTH = ${hex(r.length)}`
  ).join('\n');

  const customBlocks = customSections.map(customSectBlock).join('\n');

  // Non-code rx regions that have explicit section content (e.g. .iap binary embed).
  // Regions with no binarySects (plain load containers) appear in MEMORY but need no SECTIONS entry.
  const binarySectRegions = allRxRegions.filter(r => !r.hasCode && r.binarySects && r.binarySects.length > 0);

  // rx regions with bare .o file references: auto-generated fixed-address Flash sections.
  const bareObjRxRegions  = allRxRegions.filter(r => !r.hasCode && r.bareObjRefs && r.bareObjRefs.length > 0);

  // Regions with "name.o(+XO/+RO)" pinned-object placements (e.g. Partial Lock flash sections).
  const objPinnedRegions  = memRegions.filter(r => !r.hasCode && !r.hasData && r.objPlacements && r.objPlacements.length > 0);

  // ── Assemble the full .ld ──
  const ld = `/* Auto-generated by scatter2ld from ${deviceName} scatter file */
/* Source: Keil scatter → GNU LD conversion */
${hasResetRegion ? `
ENTRY(Reset_Handler)

_estack    = ${estack};
${use49xAlloc ? `__StackTop = ${estack};   /* 49x: no startup __StackTop label; strong assignment required */` : ``}

_Min_Heap_Size  = ${localHeapSize};
_Min_Stack_Size = ${localStackSize};
` : ''}
MEMORY
{
${memLines}
}

SECTIONS
{
${binarySectRegions.map(r => {
  const sects = r.binarySects!;
  const sectLines = sects.map(s => `    KEEP(*(.${s}))\n    KEEP(*(.${s}*))`).join('\n');
  return `  /* Binary-embed region "${r.ldName}" at ${hex(r.origin)} */\n  .${sects[0]} :\n  {\n${sectLines}\n  } >${r.ldName}\n`;
}).join('\n')}
${bareObjRxRegions.map(r => {
  const sectName = r.ldName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const objLines = r.bareObjRefs!.map(o => `    KEEP(*${o}(.rodata .rodata* .data .data*))`).join('\n');
  return `  /* Bare .o at fixed Flash address — auto-generated; verify section names match .c content */\n  .${sectName} :\n  {\n${objLines}\n  } >${r.ldName}\n`;
}).join('\n')}
${objPinnedRegions.map(objPinnedSectBlock).join('\n\n')}
${hasResetRegion ? `  .isr_vector :
  {
    . = ALIGN(4);
    KEEP(*(.isr_vector))
    . = ALIGN(4);
  } >${flashRegion?.ldName ?? 'FLASH'}

  .text :
  {
    . = ALIGN(4);
    *(.text)
    *(.text*)
    *(.glue_7)
    *(.glue_7t)
    *(.eh_frame)
    KEEP(*(.init))
    KEEP(*(.fini))
    . = ALIGN(4);
    _etext = .;
  } >${flashRegion?.ldName ?? 'FLASH'}

  .rodata :
  {
    . = ALIGN(4);
    *(.rodata)
    *(.rodata*)
    . = ALIGN(4);
  } >${flashRegion?.ldName ?? 'FLASH'}

  .ARM.extab : { *(.ARM.extab* .gnu.linkonce.armextab.*) } >${flashRegion?.ldName ?? 'FLASH'}
  .ARM :
  {
    __exidx_start = .;
    *(.ARM.exidx*)
    __exidx_end = .;
  } >${flashRegion?.ldName ?? 'FLASH'}

  .preinit_array :
  {
    PROVIDE_HIDDEN(__preinit_array_start = .);
    KEEP(*(.preinit_array*))
    PROVIDE_HIDDEN(__preinit_array_end = .);
  } >${flashRegion?.ldName ?? 'FLASH'}

  .init_array :
  {
    PROVIDE_HIDDEN(__init_array_start = .);
    KEEP(*(SORT(.init_array.*)))
    KEEP(*(.init_array*))
    PROVIDE_HIDDEN(__init_array_end = .);
  } >${flashRegion?.ldName ?? 'FLASH'}

  .fini_array :
  {
    PROVIDE_HIDDEN(__fini_array_start = .);
    KEEP(*(SORT(.fini_array.*)))
    KEEP(*(.fini_array*))
    PROVIDE_HIDDEN(__fini_array_end = .);
  } >${flashRegion?.ldName ?? 'FLASH'}
` : ''}${ramRegion ? `  _sidata = LOADADDR(.data);

  .data :
  {
    . = ALIGN(4);
    _sdata = .;
    *(.data)
    *(.data*)
    . = ALIGN(4);
    _edata = .;
  } >${ramRegion.ldName} AT> ${flashRegion?.ldName ?? 'FLASH'}

  . = ALIGN(4);
  .bss :
  {
    _sbss = .;
    __bss_start__ = _sbss;
    *(.bss)
    *(.bss*)
    *(COMMON)
    . = ALIGN(4);
    _ebss = .;
    __bss_end__ = _ebss;
  } >${ramRegion.ldName}
${customBlocks}
  /* Collect .heap section into RAM so --print-memory-usage accounts for it.
     STD startup: Heap_Size set by .equ + .space in .s; _Min_Heap_Size = 0x0 (no double-count).
     49x startup: no .heap section in .s; allocate directly via _Min_Heap_Size. */
  .heap :
  {
    . = ALIGN(8);
    PROVIDE(end = .);   /* heap start for _sbrk */
    PROVIDE(_end = .);
    KEEP(*(.heap))
    KEEP(*(.heap*))
${use49xAlloc ? `    . += _Min_Heap_Size;   /* 49x: startup has no .heap section; allocate here */
` : ``}    . = ALIGN(8);
  } >${ramRegion.ldName}

  /* Collect .stack section into RAM so --print-memory-usage accounts for it.
     STD: Stack_Size set by .equ in startup .s; 49x: allocate via _Min_Stack_Size. */
  .stack :
  {
    . = ALIGN(8);
${!use49xAlloc ? `    PROVIDE(__HT_check_sp = .);   /* STD: stack bottom; startup .s label wins if defined */
` : ``}    KEEP(*(.stack))
    KEEP(*(.stack*))
${use49xAlloc ? `    . += _Min_Stack_Size;   /* 49x: startup has no .stack section; allocate here */
` : ``}    . = ALIGN(8);
${!use49xAlloc ? `    PROVIDE(__StackTop = .);   /* STD: initial SP = stack top; startup .s label wins if defined */
    PROVIDE(_estack = .);
` : ``}  } >${ramRegion.ldName}
${use49xAlloc ? `
  /* Correct stack bottom for watermark analysis. */
  __HT_check_sp = __StackTop - _Min_Stack_Size;
` : ``}` : customBlocks}

  /DISCARD/ :
  {
${!hasResetRegion ? `    *(*)   /* flash-image builder: discard everything not already placed */
` : `    libc.a(*) libm.a(*) libgcc.a(*)
`}  }

  .ARM.attributes 0 : { *(.ARM.attributes) }
}
`;

  return {
    ld,
    warnings,
    codeRegionName: flashRegion?.ldName ?? '',
    ramRegionName:  ramRegion?.ldName  ?? '',
  };
}
