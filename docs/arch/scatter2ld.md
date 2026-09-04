# scatter2ld 轉換流程

## 兩種輸出模式

| 模式 | 觸發條件 | 輸出方式 |
|------|----------|----------|
| **Template-based**（主路徑） | `opts.templateLd` 已提供 | 以 FWLib linker.ld 為基底，patch MEMORY + 插入 extra sections |
| **Full-generation**（fallback） | 未提供 `opts.templateLd` | 完整由 scatter 內容生成 SECTIONS（向下相容） |

Template-based 是 Convert uVision 路徑的主要輸出方式。caller（`generateLinkerScript` in `uv2make.ts`）先找到 FWLib template linker.ld，傳入 `opts.templateLd`；`patchLdStackSections()` 由 caller 在 scatter2ld 返回後呼叫。

Full-generation 保留作為後備，當找不到 template 時啟用。

---

## Template-based 模式流程（`buildFromTemplate`）

```
scatter 解析 → MemRegions
     │
     ▼
patchMemory(template)       ← 修改 FLASH / RAM ORIGIN, LENGTH
insertExtraMemory(template) ← 插入 IAP / SPIM / EXT_RAM 等
insertRxSections(template)  ← 在 .isr_vector 前插入 flash 相關 section
insertRwSections(template)  ← 在 /DISCARD/ 前插入 RAM 相關 section
     │
     ▼
return patched template text
caller: patchLdStackSections() → 加 KEEP/__StackTop/__HT_check_sp
```

### MEMORY patch 規則

| 欄位 | 條件 | 行為 |
|------|------|------|
| FLASH ORIGIN | 有 `flashRegion` | 改為 scatter code exec region 的 origin（含 IAP offset，如 `0x2800`） |
| FLASH LENGTH | `flashRegion.length > 0` | 改為計算出的長度；否則若 origin≠0 只 patch ORIGIN，留 template LENGTH |
| RAM ORIGIN | 有 `ramRegion` | 改為 scatter data exec region 的 origin（含通訊區 offset，如 `0x20000010`） |
| RAM LENGTH | `ramRegion.length > 0` | 改為計算出的長度（已扣 offset）；否則若 origin≠`0x20000000` 只 patch ORIGIN |

patch 失敗（找不到 FLASH/RAM 行）→ **push warning 到 Problems panel**，不靜默。

### 插入 extra MEMORY regions

non-FLASH、non-RAM 的 exec region（IAP reserved、SPIM、EXT_RAM）依 origin 排序，插入 MEMORY block 最後（`}` 前）。

### 插入 extra SECTIONS

| 來源 | 插入位置 |
|------|----------|
| Binary-embed（`*.o (IAP, +FIRST)`） | `.isr_vector` 之前 |
| Bare .o 固定位址（rx） | `.isr_vector` 之前 |
| Pinned-object（`name.o(+XO/+RO)`） | `.isr_vector` 之前 |
| Custom named rx section（`*(.spim)`） | `.isr_vector` 之前 |
| Custom named xrw section（`*(.extsram)`） | `/DISCARD/` 之前 |

Template 已有的 option-byte sections（`.option_byte` / `.option_byte_wdt` / `.option_byte_pl`）不動。

---

## 輸入格式支援（`.sct` / `.lin`）

```
parseBlocks()          ← 解析頂層 Load Region（絕對位址）
parseExecRegions()     ← 解析 Load Region 內的 Execution Region
  ├── 絕對位址：NAME 0xADDR [SIZE] [FLAGS] { ... }
  └── 相對位址：NAME +OFFSET [SIZE] [FLAGS] { ... }   (+0 最常見)
```

## 已驗證的 HT32 scatter 語法模式

| 語法模式 | 範例 | 處理方式 |
|---|---|---|
| 標準 Flash/RAM（M0/M0+/M3） | `LR_IROM1 0x00000000 0x00010000 { ... }` | `classifyAddr` → rx |
| 標準 Flash（M4） | `LR_IROM1 0x08000000 0x00080000 { ... }` | `classifyAddr` → rx |
| 相對位址 execution region | `IAP +0` / `AP +0` | `parseExecRegions` → `lrBase + offset` |
| 旗標屬性（PI 等） | `AP 0x00015400 PI` | `[^{\r\n]*` 吞掉旗標 |
| `{` 在下一行 | `AP 0x00015400 PI\n{` | `[^{\r\n]*\s*\{` 跨行匹配 |
| 標準物件檔放置 | `*.o (RESET, +FIRST)` / `*(InRoot$$Sections)` | `isStandardRegion` → 不發「無 pattern」警告 |
| Binary-embed region（具名 .o） | `iap_5828.o (IAP, +FIRST)` → non-code rx ER | `extractObjSectionNames` → `binarySects = ["iap"]` → SECTIONS 輸出 `.iap : { KEEP(*(.iap)) } >IAP` |
| Binary-embed region（wildcard） | `*.o (LOADER)` → flash-image builder | 同上；支援 `*` wildcard |
| 自訂具名 section | `CMIS_TABLE 0x20000F2C { *(.cmis_table) }` | `extractNamedSections` → `cmis_table` 自訂段 |
| 無 size 的 RAM region | `RAM 0x20000010 { * (+RW +ZI) }` | length=0，等待 `ramLength` 覆蓋（offset 自動扣除） |
| 無 size 的 code region（IAP/AP 架構） | `AP 0x00002800 { *.o (RESET) }` | length = romEnd − origin（romOrigin/romLength 必須由 caller 提供） |
| **裸 .o 固定位址放置** | `flash_parameters.o`（獨佔 exec region，無括號） | MEMORY 保留 region；**發 WARNING**；自動生成 `KEEP(*flash_parameters.o(.rodata .rodata* .data .data*))` 供驗證 |
| Pinned-object（`name.o(+XO)`） | `calculate.o(+XO)` | `extractObjAttrPlacements` → `objPlacements`；生成 `KEEP` section；**發 WARNING** 請驗證 section 名稱 |
| `InRoot$$Sections` | `*(InRoot$$Sections)` | `isStandardRegion` → `InRoot` |
| SPIM XIP | exec region base `0x08400000–0x0FFFFFFF` | `classifyAddr` → attrs=rx；extra MEMORY region |
| 外部 SRAM | exec region base `0x60000000–0x6FFFFFFF` | `classifyAddr` → attrs=xrw；extra MEMORY region |

---

## IAP / AP 雙 project 架構

STD 系列（1xxxx/4xxxx/5xxxx）常見雙專案 IAP 架構：

```
IAP 0x00000000 0x00002800    ← IAP binary，含 iap_xxxx.o (IAP, +FIRST)
{
  IAP +0 { *.o (IAP, +FIRST) }
}
AP 0x00002800                ← 無 explicit size
{
  AP  +0            { *.o (RESET, +FIRST); * (+RO) }
  RAM 0x20000010    { * (+RW +ZI) }   ← 跳過前 0x10 byte 通訊區
}
```

**IAP project**（無 scatter，uvprojx 直接給完整 Flash range）：走標準 template 路徑，不經過 scatter2ld。

**AP project**（有 scatter）template-based 輸出結果：

```
MEMORY
{
IAP      (rx)  : ORIGIN = 0x00000000, LENGTH = 0x00002800   ← extra region
FLASH (rx)     : ORIGIN = 0x00002800, LENGTH = 0x0000D400   ← patched（romEnd - 0x2800）
RAM (xrw)      : ORIGIN = 0x20000010, LENGTH = 0x00003FF0   ← patched（ramLen - 0x10）
OPT_B (rx)     : ORIGIN = 0x1FF00000, LENGTH = 512          ← from template, 不動
...
}

SECTIONS
{
  /* Binary-embed region "IAP" at 0x00000000 */
  .iap :
  {
    KEEP(*(.iap))
    KEEP(*(.iap*))
  } >IAP                                                     ← inserted

  .option_byte : { ... } >OPT_B                             ← from template
  ...
  .isr_vector : { ... } >FLASH                              ← from template（AP code 從 0x2800 開始）
  ...
}
```

---

## LENGTH 計算規則

| 情境 | 來源 |
|------|------|
| exec region 有 explicit size | 直接用 |
| rx exec region 無 size（IAP/AP 架構） | `romEnd − er.base`（需 caller 提供 romOrigin + romLength） |
| xrw exec region 無 size | 由 `opts.ramLength` 覆蓋（自動扣 offset = origin − 0x20000000） |
| 無任何 size 資訊 | length=0；rx 且非 hasCode → push WARNING；code region 留 template LENGTH |

---

## 主區選取邏輯

| 類型 | 判斷依據 | Fallback |
|------|----------|----------|
| Code flash（`flashRegion`） | `hasCode`：exec region body 含 `RESET` | 最後一個 rx region |
| Main RAM（`ramRegion`） | `hasData`：exec region body 含 `+RW` 或 `+ZI` | 最後一個 xrw region |

---

## 輸出 MEMORY 命名規則

- **Template-based 模式**：FLASH / RAM 繼承 template 的名稱（`FLASH`、`RAM`）；extra regions 使用 scatter exec region 原名（`IAP`、`SPIM` 等）
- **Full-generation 模式**：所有 region 直接使用 scatter exec region 原名；`Scatter2LdResult.codeRegionName` 回傳 code region 的 scatter 名稱

---

## Flash-image builder 專案（無 RESET、僅 Full-generation 模式）

IAP Maker 類型的專案只用 scatter 把多個 binary 拼接到指定 Flash 位址，沒有 C runtime。Full-generation 模式的輸出：

| 元素 | 一般韌體 | Flash-image builder |
|------|----------|---------------------|
| `ENTRY(Reset_Handler)` | ✓ | 省略 |
| `_estack` / `_Min_*` | ✓ | 省略 |
| `.isr_vector` / `.text` / `.data` / `.bss` / `.heap` / `.stack` | ✓ | 省略 |
| `binarySectRegions`（`.loader`/`.area1`…） | 視 scatter | ✓ |
| `/DISCARD/` 內容 | `libc.a(*) libm.a(*) libgcc.a(*)` | `*(*)` |

Template-based 模式遇到 flash-image builder scatter（`hasResetRegion=false`）時，template 仍有完整 C runtime sections，與 scatter 不匹配 → 結果不正確，應 fallback 到 full-generation。目前此情境極少見，尚未自動偵測切換。

---

## 裸 .o 固定位址放置（需手動補全）

scatter2ld 偵測到裸 `.o`（獨佔 exec region，無 section 括號）時：

1. MEMORY block 保留 region
2. 自動生成 `KEEP(*obj.o(.rodata .rodata* .data .data*))` 作為參考（並 push WARNING）
3. 需手動確認 section 名稱是否正確

注意 **必須用 `*filename.o`**（加 `*` 前綴），不能是 `filename.o`，因為 OBJ 路徑含完整目錄。

---

## 警告（Warnings）

scatter2ld 的所有 warnings 都透過 Problems panel 顯示，不靜默：

- Template patch 失敗（找不到 FLASH/RAM 行、找不到 MEMORY block、找不到 .isr_vector 等）
- Pinned-object section 轉換（請驗證 section 名稱）
- 裸 .o 放置（需手動確認）
- RAM execute-from-RAM（無法自動轉換，需 `AT>` + startup copy）
- Region 無 size 且無 romOrigin/romLength（LENGTH = 0）
- 未識別的 exec region body（無任何已知 pattern）
