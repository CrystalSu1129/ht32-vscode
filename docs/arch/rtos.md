# FreeRTOS 轉換支援

## 背景

Holtek 官方 FreeRTOS 範例以兩種方式提供 portable layer：

| 類型 | 代表 FWLib | port.c 來源 | portmacro.h |
|------|-----------|------------|-------------|
| **include_port.c wrapper** | HT32F49x FWLib（49x 系列） | `include_port.c` 間接引入 GCC 版 | GCC 版，無需替換 |
| **直接引用 RVDS port.c** | STD 5xxxx FWLib FreeRTOS Template | `portable/RVDS/ARM_CMx/port.c` | ARMCC 語法，**GCC 不相容** |

---

## 自動替換：Convert uVision（`uv2make.ts`）

### source 路徑替換

在 sources loop 內，每個 `.c` 檔的 `finalRel` 套用正規表示式：

```
portable/RVDS/ARM_CMx  →  portable/GCC/ARM_CMx
```

程式碼位置：`uv2make.ts`，sources loop 中 `.s` 處理塊之後。

**效果**：`../../freertos/Source/portable/RVDS/ARM_CM4F/port.c`
→ `../../freertos/Source/portable/GCC/ARM_CM4F/port.c`

### include path 替換

在 includes 收集完成後，同樣的正規表示式套用於所有 include path：

```
portable/rvds/ARM_CMx  →  portable/GCC/ARM_CMx   (case-insensitive)
```

**原因**：RVDS 版 `portmacro.h` 含 ARMCC 專屬語法（`__forceinline`、`__asm msr …`），GCC 無法解析。替換為 GCC 版 include 目錄後，clangd 與編譯均正常。

### include_port.c 情境（49x 系列）

這類專案的 uVision sources 中已包含 `include_port.c`（wrapper，實際 `#include` GCC port.c），且 include path 已指向 GCC 目錄，所以兩段替換均為 no-op，不影響行為。

---

## 手動處理情境

**STD FWLib FreeRTOS Template**（如 `HT32_STD_5xxxx_FWLib/.../FreeRTOS/Template`）：

uVision 專案包含 `portable/RVDS/ARM_CMx/port.c`。轉換後 extension 自動替換為 `portable/GCC/ARM_CMx/port.c`，理論上可直接編譯。

若 FreeRTOS 目錄結構不含 `portable/GCC/` 對應版本（例如只解壓了部分檔案），需使用者自行補齊 GCC portable 目錄，或透過 Settings Webview 的 Include Paths 欄位手動調整。

---

## HT32-IDE 轉換（`ht32ide2make.ts`）

HT32-IDE 專案使用的 FreeRTOS portable 通常已是 GCC 版（HT32-IDE 本身以 GCC 編譯），
`ht32ide2make.ts` **不做** RVDS→GCC 替換。

---

## launch.json

所有轉換路徑產生的 `launch.json` 均固定帶入：

```json
"rtos": "FreeRTOS"
```

cortex-debug 藉此啟用 FreeRTOS task list 支援（在非 RTOS 專案上為 no-op，無副作用）。

---

## 相關位置

- `src/tools/uv2make.ts` — sources loop `.c` 替換 / includes 替換（鄰近程式碼）
- `src/ht32-project-assistant-for-vs-code.ts` — `generateTasksAndLaunch()`，`"rtos": "FreeRTOS"` 寫入
