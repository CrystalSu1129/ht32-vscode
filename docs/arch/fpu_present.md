# FPU 偵測機制（`detectFpuPresentFromHeader`）

## 為何需要獨立偵測

uVision / HT32-IDE 的 project 檔中，FPU 相關欄位描述的是**矽晶片的硬體能力**，並非「請啟用 FPU 編譯器選項」的指令：

- uvprojx：`FPU2` 來自 Keil 裝置資料庫的 `<core>` capability 欄位
- HT32-IDE `.cproject`：`arm.target.fpu.name` / `arm.target.fpu.abi` 來自 IDE 的裝置 profile

問題在於部分 Cortex-M4 是「Lite」版本——矽晶片省略了 FPU 電路，對應 device header 宣告 `__FPU_PRESENT 0U`，但 project 檔仍可能標記有 FPU。若直接採用這個標記產生 `-mfpu=fpv4-sp-d16 -mfloat-abi=hard`，`core_cm4.h` 的 compile-time 檢查：

```c
#if (__FPU_PRESENT == 1U) && (__FPU_USED == 1U)
  ...
#else
  #error "target device does not support FPU"
```

就會觸發 `#error`，導致編譯失敗。**已知案例：HT32F490x1**（M4 無 FPU，`__FPU_PRESENT 0U`）。

---

## 函式邏輯

```typescript
export function detectFpuPresentFromHeader(
  includes: string[],
  baseDir: string
): boolean | undefined
```

`uv2make.ts` export，三條轉換路徑共用。

**掃描流程：**

1. 依序走訪 `includes` 陣列的每個目錄
2. 將相對路徑以 `baseDir` 解析為絕對路徑（絕對路徑則直接使用）
3. 在該目錄下尋找符合下列條件的 `.h` 檔：
   - 名稱符合 `deviceHeaderRe = /^ht32[^.]*\.h$/i`（例如 `ht32f49xxx.h`、`ht32f4xxxx_01.h`）
   - 名稱**不含** `_conf` 或 `_template`（排除 conf header 與 template 殘餘）
4. 讀取檔案內容，匹配 `/__FPU_PRESENT\s+(\d+)/`
5. 找到後立即回傳：`parseInt(value) !== 0` → `true`（有 FPU）或 `false`（無 FPU）
6. 所有目錄都找不到 → 回傳 `undefined`

**回傳值語意：**

| 回傳值 | 意義 | 呼叫端行為 |
|--------|------|-----------|
| `true` | device header 確認有 FPU | 維持 FPU 編譯旗標不變 |
| `false` | device header 確認無 FPU | 強制覆蓋：移除 `-mfpu`，改 `-mfloat-abi=soft` |
| `undefined` | 找不到 device header | 維持各路徑初始推斷不動（trust project file）|

---

## 各轉換路徑的呼叫時機

| 路徑 | 觸發條件 | `includes` 來源 | `baseDir` |
|------|----------|----------------|-----------|
| **uv2make**（Convert uVision）| `effectiveOpts.fpu` 為 true 時（uvprojx 含 `FPU2`）| uvprojx 解析出的 include paths（`info.includes`）| `outDirAbs`（includes 路徑相對於輸出目錄）|
| **ht32ide2make**（Convert HT32-IDE）| 兩個時機：① `resolvedFpuName` 有值時（.cproject `arm.target.fpu.name` 非空），用於攔截 project 檔錯誤標記；② M4 且 `fpuName` 為空時（.cproject 無 fpu.name 欄位或值為 default），用於決定是否套用 fpv4-sp-d16 fallback | .cproject 解析出的 absolute include paths | `''`（已是絕對路徑，不需 baseDir）|
| **createProject**（Create Project）| `isM4`（armCore === `'cortex-m4'`）時 | `incsRel`（FWLib-root-relative，見下）| `fwlibPath` |

---

## 各系列 Search Path 實際情形

### 49x 系列（HT32F490x1 / 491x3 / 493x5）

**Create Project** 的 `incsRel` 固定為：

```
libraries/cmsis/cm4/core_support      ← core_cm4.h 等，無 ht32*.h
libraries/cmsis/cm4/device_support    ← ht32f49xxx.h ← __FPU_PRESENT 在此
libraries/drivers/inc                 ← 周邊 driver header，無 __FPU_PRESENT
project/<boardDir>                    ← board header，無 __FPU_PRESENT
```

函式走到 `device_support` 目錄時命中 `ht32f49xxx.h`，讀出 `__FPU_PRESENT`：

| FWLib | device header | `__FPU_PRESENT` | 結果 |
|-------|--------------|----------------|------|
| HT32F490x1 | `ht32f490x1.h` | `0U` | `false` → 強制 soft-float |
| HT32F491x3 | `ht32f491x3.h` | `1U` | `true` → 保留 hard-float |
| HT32F493x5 | `ht32f493x5.h` | `1U` | `true` → 保留 hard-float |

**Convert uVision / HT32-IDE**：`includes` 來自 project 檔，只要 project 有加 `device_support`（Keil/HT32-IDE 標準做法），同樣可命中。

### 標準系列（STD 1/4/5/L5xxxx）

STD FWLib 的 device header 放置位置因系列而異：

| FWLib 系列 | device header 路徑 | include path 來源 | `__FPU_PRESENT` |
|-----------|-------------------|-------------------|----------------|
| **4xxxx** | `library/Device/Holtek/HT32F4xxxx/Include/ht32f4xxxx_01.h` | `.mk` `INCLUDE_PATH` 已含此路徑 | `1`（有 FPU）|
| **5xxxx / L5xxxx / 1xxxx** | 無獨立 device header；`__FPU_PRESENT` 僅出現在 CMSIS `core_cm*.h`，名稱不符合 `deviceHeaderRe` | — | 找不到 → `undefined` |

**4xxxx**：`ht32f4xxxx_01.h` 符合 `deviceHeaderRe = /^ht32[^.]*\.h$/i`（`_01` 是非 `.` 字元，仍能匹配），函式回傳 `true`，確認有 FPU。

**5xxxx / L5xxxx / 1xxxx**：driver inc 目錄下只有 `ht32.h`（generic wrapper）與 `ht32f5xxxx_*.h`（周邊 driver header），這些均不含 `__FPU_PRESENT`；CMSIS Core header 名稱不符合 `deviceHeaderRe`，函式回傳 `undefined`，FPU 設定完全信任 project 檔。

**結論：STD 4xxxx 可正確偵測 FPU；其他 STD 系列（5/L5/1xxxx）回傳 `undefined`，維持 project 檔設定不變。**

---

## 函式位置

`src/tools/uv2make.ts`，`export function detectFpuPresentFromHeader`。
