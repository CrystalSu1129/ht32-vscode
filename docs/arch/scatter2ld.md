# scatter2ld 轉換流程

## 輸入格式支援（`.sct` / `.lin`）

Keil scatter file 的語法變體相當多，`scatter2ld.ts` 的 parser 處理以下所有模式：

```
parseBlocks()          ← 解析頂層 Load Region（絕對位址）
parseExecRegions()     ← 解析 Load Region 內的 Execution Region
  ├── 絕對位址：NAME 0xADDR [SIZE] [FLAGS] { ... }
  └── 相對位址：NAME +OFFSET [SIZE] [FLAGS] { ... }   (+0 最常見)
```

## 已驗證的 HT32 scatter 語法模式

| 語法模式 | 範例 | 處理方式 |
|---|---|---|
| 標準 Flash/RAM（M0/M0+/M3） | `LR_IROM1 0x00000000 0x00010000 { ... }` | `classifyAddr` → FLASH |
| 標準 Flash（M4） | `LR_IROM1 0x08000000 0x00080000 { ... }` | `classifyAddr` → FLASH |
| 相對位址 execution region | `IAP +0` / `AP +0` | `parseExecRegions` → `lrBase + offset` |
| 旗標屬性（PI 等） | `AP 0x00015400 PI` | `[^{\r\n]*` 吞掉旗標 |
| `{` 在下一行 | `AP 0x00015400 PI\n{` | `[^{\r\n]*\s*\{` 跨行匹配 |
| 標準物件檔放置 | `*.o (RESET, +FIRST)` / `*(InRoot$$Sections)` | `isStandardRegion` → 不發「無 pattern」警告 |
| Binary-embed region（具名 .o） | `iap_5828.o (IAP, +FIRST)` → non-code rx ER | `extractObjSectionNames` → `binarySects = ["iap"]` → MEMORY 名稱直接用 scatter 的 exec region 名稱（如 `IAP`）；SECTIONS 輸出 `.iap : { KEEP(*(.iap)) } >IAP` |
| Binary-embed region（wildcard） | `*.o (LOADER)` / `*.o (AREA1)` → flash-image builder | 同上；regex 同時支援 `*` wildcard（IAP Maker 專案每個區域用 `*.o (REGION_NAME)`）|
| 自訂具名 section | `CMIS_TABLE 0x20000F2C { *(.cmis_table) }` | `extractNamedSections` → `cmis_table` 自訂段 |
| 無 size 的 RAM region | `RAM 0x20001580 { * (+RW +ZI) }` | length=0，**不發警告**（等待 `ramLength` 覆蓋）；Flash 無 size 才警告 |
| 裸 .o 物件參考（同 region 有 `+RO`/RESET） | `ram_fun.o`（與 `*.o (RESET)` 同 exec region） | `isStandardRegion` → `\.o\b`；物件內容自然落入 `.text`/`.rodata`，行為正確 |
| **裸 .o 固定位址放置**（無法自動轉換） | `FLASH_PARDATA_LOAD 0x4000 { flash_parameters.o }` | MEMORY 保留 region；SECTIONS 無對應入口 → **發出 WARNING**；需手動補（見下方說明） |
| `InRoot$$Sections` | `*(InRoot$$Sections)` | `isStandardRegion` → `InRoot` |
| 多頂層 Load Region（含 binary embed） | `IAP 0x00000000 0x00002000 { iap_5828.o (IAP) }` + `AP 0x00002000 { *.o (RESET) }` | 所有 exec region 保留原名進 MEMORY；`IAP` region 有 `binarySects=["iap"]` → SECTIONS 輸出 `.iap >IAP`；`AP` region 有 RESET → code flash；`Scatter2LdResult.codeRegionName = "AP"` |
| 多 xrw region（通訊區 + 主 RAM） | `SHARE 0x20000000 0x10 { share.o (.comm) }` + `RAM 0x20000010 { * (+RW +ZI) }` | 兩者皆進 MEMORY；`hasData`（含 `+RW`/`+ZI`）識別主 RAM → `_estack`/`.data`/`.bss`/`.heap`/`.stack` 用 `RAM`；`SHARE` 只作為保留區出現在 MEMORY |
| SPIM XIP | exec region base `0x08400000–0x0FFFFFFF` | `classifyAddr` → attrs=rx（名稱來自 scatter） |
| 外部 SRAM | exec region base `0x60000000–0x6FFFFFFF` | `classifyAddr` → attrs=xrw（名稱來自 scatter） |

## 裸 .o 固定位址放置（無法自動轉換）

Keil scatter 允許把特定 `.o` 的全部 RO 內容放到固定 Flash 位址：

```
FLASH_PARDATA_LOAD 0x00004000 0x400
{
  FALSH_PARDATA_EXEC +0
  {
    flash_parameters.o          ← bare .o，無 section 括號
  }
}
```

`scatter2ld` 會在 MEMORY block 保留這個 region，但**不產生 SECTIONS 入口**，並發出 WARNING。原因：

- 偵測規則：exec region body 含 bare `filename.o`（無括號），且不含 `+RO`/RESET/named section 等其他 pattern
- 如果自動產生 `KEEP(flash_parameters.o(*))` → 會把 `.debug_info` 等 debug section 也拉進去 → region overflow
- 如果自動產生 `KEEP(flash_parameters.o(.rodata*)` → 必須知道 section 名稱，轉換時 .o 尚未編譯無法得知

**手動修正方式**（以 `flash_parameters.c` 只含 `const` 結構體為例）：

在 SECTIONS 最前面（`.isr_vector` 之前）插入：

```ld
.flash_pardata :
{
  KEEP(*flash_parameters.o(.rodata .rodata*))
} > FALSH_PARDATA_EXEC
```

注意：
1. **必須用 `*filename.o`**（不能是 `filename.o`）—— GNU LD 把 bare `filename.o(...)` 當成「開啟這個路徑的檔案」，但 Makefile 的 OBJ 路徑是 `build/up/up/flash_parameters.o`，不匹配；加 `*` 前綴才能 glob 匹配任意路徑尾端
2. **必須放在所有 wildcard section 之前** —— GNU LD 每個 input section 只放一次（先匹配先放），所以前置 `*flash_parameters.o(.rodata*)` 後，後面的 `*(.rodata*)` 就不會再包含這個 object
3. **不能用 `(*)`** —— 會把 `.debug_info`（~115 KB）也塞進 1 KB 的 region 造成 overflow
4. section 類型需依實際 `.c` 內容決定：純 `const` 用 `.rodata .rodata*`；有可寫資料另加 `.data .data*`

### 通用性與不支援場景

| 場景 | WARNING 偵測 | 自動處理 | 備註 |
|---|---|---|---|
| `const` 資料放 Flash 固定位址 | ✓ | 手動加 `.rodata*` | 今天驗證的 |
| 函式放 RAM 執行（execute-from-RAM） | ✓ | 需 `AT>` + startup copy-down | 比 const 資料複雜 |
| 自訂 section 名稱（bare，無括號） | ✓ | 需知道 section 名稱 | 無法給統一模板 |
| bare `.o` 帶括號（如 `iap.o (IAP)`） | 不進 bare 路徑 | `extractObjSectionNames` 處理 | 已支援 |
| bare `.o` 混在標準 pattern region（旁邊有 `RESET`/`+RO`） | 不觸發 | 自然落入 `.text`/`.rodata` | 行為正確，不需處理 |

WARNING 偵測本身是通用的（任何 bare `.o` 獨佔一個 exec region 都會觸發）；但「如何修」取決於 region 類型與 `.c` 內容，沒有統一的自動修正方式。

## Flash-image builder 專案（無 RESET、無 RAM）

IAP Maker 類型的專案只用 scatter 把多個 binary 拼接到指定 Flash 位址，沒有 C runtime：

- **偵測條件**：無任何 exec region 含 `RESET`（`hasResetRegion = false`）、無 xrw region（`ramRegion = undefined`）
- **linker.ld 輸出差異**：

| 元素 | 一般韌體 | Flash-image builder |
|---|---|---|
| `ENTRY(Reset_Handler)` | ✓ | 省略 |
| `_estack` / `__StackTop` / `_Min_*` | ✓ | 省略 |
| `.isr_vector` / `.text` / `.rodata` 等 C runtime flash sections | ✓ | 省略 |
| `.data` / `.bss` / `.heap` / `.stack` C runtime RAM sections | ✓ | 省略 |
| `binarySectRegions`（`.loader`/`.area1`/`.area2`… output sections） | 視 scatter 內容 | ✓ |

兩個條件獨立判斷：`hasResetRegion` 守 ENTRY / `_estack`，`ramRegion` 守 C runtime RAM sections。

### `/DISCARD/` 設定

| 專案類型 | `/DISCARD/` 內容 | 原因 |
|---|---|---|
| 一般韌體 | `libc.a(*) libm.a(*) libgcc.a(*)` | 丟棄 newlib/libgcc 的 startup crt objects（`crti.o`、`crtn.o` 等），避免多餘 section 出現在輸出 |
| Flash-image builder | `*(*)` | 丟棄所有未被放置的 section；`nano.specs` 帶入的 startup objects 若不丟棄，會在 AREA3 留下 8 bytes 幽靈佔用 |

## 主區選取邏輯（對稱設計）

| 類型 | 判斷依據 | Fallback |
|---|---|---|
| Code flash（`flashRegion`） | `hasCode`：exec region body 含 `RESET` | 最後一個 rx region |
| Main RAM（`ramRegion`） | `hasData`：exec region body 含 `+RW` 或 `+ZI` | 最後一個 xrw region |

小型特殊用途 xrw region（通訊區、保留區）通常只有具名 section（如 `*(.comm)`），不含 `+RW`/`+ZI`，自然不會被誤選為主 RAM。

## 輸出 MEMORY 命名規則

- **scatter exec region 名稱直接使用**，不做地址分類重命名（沒有 `FLASH`/`RAM`/`IAP_EMBED` 等 hardcode 名稱）
- 重複名稱加序號（極少發生）：`ER` → `ER2`
- `classifyAddr()` 只用於判斷 `attrs`（`rx` / `xrw`），不影響名稱
- `Scatter2LdResult` 回傳 `codeRegionName` 與 `ramRegionName`（對應 exec region 原名）；`codeRegionName` 供 caller 動態構成 LENGTH=0 fallback patch regex，不 hardcode `FLASH`
