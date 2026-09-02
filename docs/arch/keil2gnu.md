# keil2gnu 組語轉換

`keil2gnu()` 將 Keil armasm 語法的 `.s` 檔轉為 GNU assembler 語法。  
轉換流程：pre-process 行接續符（`\\\n`）→ 逐行解析指令 → 遞迴轉換 `INCLUDE` → `injectStartupInit()` 補齊 GNU 啟動序列（.data copy、.bss 清零、`__libc_init_array`）。  
輸出開頭固定加 `.syntax unified`（啟用 Thumb2 UAL 語法）。

## 指令對應

| Keil armasm | GNU as | 說明 |
|---|---|---|
| `; comment` | `@ comment` | 行尾/行首注解 |
| `name EQU value` | `.equ name, value` + `#define name value` | 常數定義；SPACE 用到的符號（Heap_Size/Stack_Size）只發 `.equ`，不發 `#define` |
| `AREA RESET, CODE/DATA, READONLY` | `.section .isr_vector,"a",%progbits` | Vector table 特例（M0 用 DATA,READONLY；M3 用 CODE,READONLY） |
| `AREA x, CODE, READONLY`（簡單名稱，非 RESET） | `.section .x,"ax",%progbits` | 具名可執行段（flash-image builder 的 LOADER/LAYOUT/AREA1 等各自獨立放置）；`\|...\|` 括住的複雜名稱 fallback 到 `.text` |
| `AREA x, CODE, READONLY`（`\|...\|` 複雜名稱） | `.text` | 一般程式碼段 |
| `AREA x, DATA, READONLY`（簡單名稱如 IAP） | `.section .iap,"a",%progbits` | 具名唯讀段（binary-embed 等）；`\|...\|` 括住的複雜名稱 fallback 到 `.section .rodata` |
| `AREA x, DATA, READWRITE` | `.section .data` | 可讀寫資料段 |
| `AREA STACK, NOINIT, READWRITE` | `.section ".stack","aw",%nobits` | Stack 特例 |
| `AREA HEAP, NOINIT, READWRITE` | `.section ".heap","aw",%nobits` | Heap 特例 |
| `AREA x, NOINIT, READWRITE` | `.section .bss` | 其他未初始化資料段 |
| `AREA x, ..., ALIGN=n` | `.balign (1<<n)` | ALIGN=3 → `.balign 8` |
| `DCD val` | `.word val` | 32-bit 資料 |
| `DCW val` | `.hword val` | 16-bit 資料 |
| `DCB val` | `.byte val` | 8-bit 資料 |
| `SPACE n` | `.if n > 0` / `.space n` / `.endif` | 保留 n bytes；用 `.if` guard 避免 n=0 時 GAS 警告 |
| `ALIGN` | `.balign 4` | 4-byte 對齊（無參數時） |
| `ALIGN n` | `.balign n` | n-byte 對齊 |
| `PRESERVE8` | `.balign 8` | 8-byte stack 對齊提示（永遠輸出，不忽略） |
| `THUMB` | `.thumb` | 切換到 Thumb 指令集 |
| `EXPORT sym` | `.global sym` | 對外公開符號 |
| `EXPORT sym [WEAK]` | `.weak sym` + `.global sym` | 弱符號 |
| `IMPORT sym` | `.extern sym` | 外部符號引用 |
| `PROC` | 移除（保留前面的 label） | 函式開始標記 |
| `ENDP` | 移除 | 函式結束標記 |
| `END` | 移除 | 檔案結束標記 |
| `INCLUDE file` | `.include "file"` | 引入另一個組語檔（需遞迴轉換） |
| `INCBIN file` | `.incbin "file"` | 嵌入二進位檔；`.axf.bin` 自動對應 sibling Project/ 的 GCC 輸出 |

## 條件組語

> **注意**：轉換後使用 **C preprocessor 指令**（`#ifdef` / `#if` 等），而非 GNU as 指令（`.ifdef` / `.if`）。
> 原因：`-D` 定義的 macro 只有 C preprocessor 認識，`.ifdef` 查的是 GNU as symbol table，永遠找不到 `-D` 定義的值。

| Keil armasm | 輸出 | 說明 |
|---|---|---|
| `IF :DEF:sym` | `#ifdef sym` | 若符號已定義 |
| `IF :LNOT::DEF:sym` | `#ifndef sym` | 若符號未定義 |
| `IF sym=val` | `#if sym == val` | 數值比較（`=` → `==`） |
| `IF cond` | `#if cond` | 一般條件 |
| `ELIF cond` | `#elif cond` | 否則如果 |
| `ELSE` | `#else` | 否則 |
| `ENDIF` | `#endif` | 條件結束 |

## 運算子

| Keil armasm | GNU / C |
|---|---|
| `a:SHL:b` | `a << b` |
| `a:SHR:b` | `a >> b` |
| `a:OR:b` | `a \| b` |
| `a:AND:b` | `a & b` |
| `a:EOR:b` | `a ^ b` |
| `:NOT:a` | `~a` |
| `a<>b` | `a != b` |

## 特殊處理

- **`handleKeilAsm` 呼叫時機**：convert uV 時，所有 `.s` 檔（無論是否有 FWLib `templateRoot`）都經過 `handleKeilAsm` → `keil2gnu`；Rule 1（startup template lookup）與 Rule 2（`ht32_op*.s` → 同名 `.c`）在 `templateRoot = undefined` 時略過，Rule 3（keil2gnu 轉換）永遠執行。純組合語言專案（無 C 源碼、有 scatter）不產生 `syscalls.c` / `ht32_stack_analysis.c`（兩者皆 `#include "ht32.h"`）。
- **`INCLUDE file`**：被 include 的檔也是 Keil 語法，需遞迴轉換後存為 `_gcc.s`，`.include` 路徑指向轉換後的檔案
- **`Stack_Size EQU` / `Heap_Size EQU`**：只發 `.equ`，不發 `#define`，確保使用者修改 `.s` 內的 `.equ` 值後能正確生效（`#define` 會被 preprocessor 先展開覆蓋掉）
- **`__main`**：Keil 的 C runtime entry，GNU 對應為 `main`（有 semihosting 時需注意）
- **Template fallback**：轉換失敗時 fallback 到 `templates/GNU_ARM/` 的預建 GCC 版本

---

## startup `.stack`/`.heap` section 必要條件

**三個條件缺一不可**：
1. `.section ".stack","aw",%nobits`：`a` = SHF_ALLOC（沒有此 flag → section 不貢獻 output section 大小）；`%nobits` = SHT_NOBITS（沒有此 flag → SHT_PROGBITS 浪費 Flash LMA）
2. linker script 有 `KEEP(*(.stack))`：否則 `--gc-sections` 丟棄（`.stack` 無其他 section 引用）
3. linker script 有對應的 `.stack : { ... } >RAM` output section

適用範圍（必須保持一致）：
- `uv2make.ts` `syncStackHeap()`：複製 FWLib GCC startup 時 patch `"w"` → `"aw",%nobits`（標準系列 Rule 1 / 49x Rule 3）
- `uv2make.ts` `keil2gnu()` + `areaToSection()`：AREA STACK/HEAP NOINIT → `"aw",%nobits`（keil2gnu fallback 路徑）
- `scatter2ld.ts`：`.stack`/`.heap` section 使用 `KEEP()`，不用 `(NOLOAD)`
- `ht32ide2make.ts` `patchStartupFiles()`：HT32-IDE startup `"w"` → `"aw",%nobits`
- `createProject.ts`：Create Project 複製 FWLib startup 後 patch `"w"` → `"aw",%nobits`

patch regex 統一格式：`/\.section\s+"\.stack"\s*,\s*"w"(?:\s*,\s*%nobits)?/g` → `'.section ".stack","aw",%nobits'`

---

## keil2gnu fallback — `injectStartupInit()` 補齊 GNU startup 序列

`handleKeilAsm` Rule 1 / Rule 3 fallback 走 `keil2gnu()` 轉換時，還需要 `injectStartupInit()` 做 post-process。Keil startup 本身依賴 Keil RTLib 初始化，轉成 GNU 格式後缺少必要的啟動序列：

**Step 1 — 移除 Keil .bss Stack/Heap block**  
Keil startup 在 `.bss` 裡定義 `Stack_Mem` / `Heap_Mem`（AREA STACK/HEAP NOINIT → `.bss`），並放置 `__initial_sp` / `__heap_base` / `__heap_limit` 等 labels。GNU toolchain 改用 linker script 的 `.stack`/`.heap` output section 管理，這些 labels 會與 `_estack`/`end` 衝突，必須移除。`.space Stack_Size` / `.space Heap_Size` 本身保留（放在 `.section ".stack/.heap","aw",%nobits` 裡，供 `--print-memory-usage` 計算）。

**Step 2 — 向量表第一項 `__initial_sp` → `_estack`**  
Keil 用 `__initial_sp`（指向 Stack_Mem 末端），GNU linker script 匯出 `_estack`（= RAM top）。

**Step 3 — 注入 .data / .bss 初始化 + SystemInit + `__libc_init_array`**  
Keil startup 的 Reset_Handler 直接呼叫 `SystemInit` → `main`，沒有 GNU 必要的啟動序列。注入順序比照 HT32-IDE GNU startup：
1. Copy `.data` section（`_sidata` → `_sdata`..`_edata`，FLASH LMA → RAM VMA）
2. Zero-fill `.bss`（`_sbss`..`_ebss`）
3. Call `SystemInit`（若原本有的話）
4. Call `__libc_init_array`（C++ 靜態建構子）

**Step 4 — 移除 `__MICROLIB` block**  
Keil 的 `#ifdef __MICROLIB` 包含 `__user_initial_stackheap`，引用已移除的 Stack_Mem/Heap_Mem，在 GNU 會造成 undefined symbol 錯誤。

**Step 5（Step 6 in code） — `.type label, %function`**  
見下節 Vector table Thumb LSB。

**適用路徑**：僅 `handleKeilAsm` keil2gnu fallback（Rule 1 找不到 template / Rule 3 找不到同名 FWLib GCC startup）。FWLib 原生 GCC startup 和 HT32-IDE startup 已內建這些序列，不需要此步驟。

---

## Vector table Thumb LSB — keil2gnu fallback 須加 `.type %function`

**根本原因**：GNU assembler 的 `.thumb_func` 只放 `$t` mapping symbol，**不設 `STT_FUNC` 型別**。GNU linker 對 `R_ARM_ABS32` 只在 symbol 型別為 `STT_FUNC` 時才自動加 bit 0（Thumb interworking）。若型別為 NOTYPE，`.word Reset_Handler` 儲存偶數位址 → Cortex-M0+ 讀 reset vector 時 EPSR.T=0 → HardFault。

**適用路徑**：startup 檔名不符合 `startup_xxx_NN.s` 模式時，`handleKeilAsm()` 走 Rule 3 fallback → `keil2gnu()` + `injectStartupInit()`。`injectStartupInit()` Step 6 必須同時插入 `.type label, %function` + `.thumb_func`：

```typescript
if (inTextSection && /^\w[\w$]*:$/.test(t)) {
  const labelName = t.slice(0, -1);
  final.push(`\t.type\t${labelName}, %function`); // 設 STT_FUNC → linker 加 bit 0
  final.push('\t.thumb_func');                      // 加 $t mapping symbol
}
```

**不受影響的路徑**（原始碼已含 `.type %function`）：
- Keil startup 符合 `startup_xxx_NN.s` → 使用 M0/M3 templates
- HT32-IDE 轉換 → 使用 Holtek GCC `.S` 原始檔
- Create Project → M0/M3 templates

**診斷方式**：
```bash
readelf -x .isr_vector HT32.elf   # offset 4 應為奇數 (e.g. b9 00 00 00)
readelf -s startup.o | grep Reset  # 應為 FUNC type，st_value 奇數
```
