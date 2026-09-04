# GCC 版本相容性設計

## 問題背景

HT32 FWLib 與 extension 產生的 startup/linker 程式碼在不同 GCC 版本下有若干相容性問題。
本文記錄各問題的根因與對應的自動處理機制。

---

## 1. `-std=gnu11` 預設 C 標準

### 問題

GCC 14 以前預設為 `-std=gnu17`；GCC 15 起預設切換到 `-std=gnu23`（C23），
引入了 `bool`、`true`、`false` 成為 keywords，與 HT32 FWLib 自己 typedef 的
`#define bool  _Bool` / `#define true  1` 衝突，造成：

```
error: cannot combine with previous 'int' declaration specifier
```

### 解法

三條轉換路徑均以 **`project.settings.json` 為 source of truth**，Makefile 從它生成：

| 路徑 | 寫入 settings | 生成 Makefile |
|------|-------------|--------------|
| Convert uV (uv2make) | `writeProjectSettings({ extraCFlags: existingSettings.extraCFlags \|\| '-std=gnu11', ... })` | `buildMakefileFromProjectSettings(readProjectSettings(...), {...})` |
| Convert HT32-IDE | `writeProjectSettings({ extraCFlags: existingSettings.extraCFlags \|\| '-std=gnu11', ... })` | `generateMakefile(..., effectiveExtraCFlags)` |
| Create Project | `writeProjectSettings({ extraCFlags: existingSettings.extraCFlags \|\| '-std=gnu11', ... })` | `buildMakefileFromProjectSettings(readProjectSettings(...), {...})` |

所有路徑都先寫 `project.settings.json`，再生成 Makefile，確保兩者永遠一致。
再次轉換時若使用者已手動修改過 `extraCFlags`，原值會被 `||` 保留（空字串才套用預設）。

### 設計原則

- **不寫死進 `CFLAGS` template**：`-std=gnu11` 由 `extraCFlags` 傳入，讓使用者可以在
  Settings Webview 的「Extra C Flags」欄位自行覆蓋（例如改成 `-std=gnu17`）。
- **`regenerateMakefileFlags`** 讀取 `project.settings.json` 的 `extraCFlags`，
  每次存設定都會自動更新 Makefile，保持一致。

---

## 2. `--no-warn-rwx-segments` 動態偵測（`LD_NO_WARN`）

### 問題

GCC 12+ 的 `ld` 新增 `--no-warn-rwx-segments` 旗標，可以抑制 "has a LOAD segment with RWX permissions" 警告。
GCC 11 及以下不認識此旗標，若直接寫死在 `LDFLAGS` 會報錯。

### 解法

Makefile 使用動態偵測 block，在執行時期測試當前 `ld` 是否支援：

```makefile
comma := ,
ifeq ($(OS),Windows_NT)
  LD_NO_WARN = $(if $(shell "$(subst gcc,ld,$(CC))" --no-warn-rwx-segments 2>&1 | findstr /C:"unrecognized"),,$(comma)--no-warn-rwx-segments)
else
  LD_NO_WARN = $(if $(shell "$(subst gcc,ld,$(CC))" --no-warn-rwx-segments 2>&1 | grep unrecognized),,$(comma)--no-warn-rwx-segments)
endif
```

`LDFLAGS` 引用 `$(LD_NO_WARN)`，老版本 GCC 自動略過此旗標。

舊版 Makefile（不含 `LD_NO_WARN` block）由 `regenerateMakefileFlags` 在執行時**自動升級**（`uv2make.ts:2940`），
無需使用者手動重新 convert。

---

## 相關檔案

- `src/tools/uv2make.ts` — `buildMakefileFromProjectSettings`（共用橋接函式）、`regenerateMakefileFlags`
- `src/tools/ht32ide2make.ts` — `generateMakefile(..., extraCFlags)`
- `src/tools/createProject.ts` — `computeProjectLists`（list 計算）+ `buildMakefileFromProjectSettings`
- `src/tools/settingsWebview.ts` — `DEFAULT_PROJECT_SETTINGS.extraCFlags`、`readProjectSettings`、`writeProjectSettings`
