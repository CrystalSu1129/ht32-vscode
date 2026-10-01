# 產出檔案的時間點

每個 build-gen 目錄下的檔案由哪些操作產出、由哪個函式負責。

## 總覽

| 檔案 | 管理者 |
|------|--------|
| `Makefile` | 初次：轉換/Create Project；Patch：`updateProjectMeta` + `regenerateMakefileFlags` |
| `sources.list` | `updateProjectMeta`（唯一管理者） |
| `includes.list` | 轉換時；`regenerateMakefileFlags`（Settings Save） |
| `defines.list` | 轉換時；`regenerateMakefileFlags`（Settings Save） |
| `adefines.list` | 轉換時；`regenerateMakefileFlags`（Settings Save） |
| `compile_commands.json` | `updateProjectMeta` + `regenAllMakefileFlags` + 獨立指令 |
| `project.meta.json` | 轉換時；`updateProjectMeta`（每次呼叫都寫） |
| `project.settings.json` | 轉換時（初次）；Settings Save |

---

## Makefile

### 完整建立（`buildMakefileText` / `generateMakefile` / `buildMakefileFromProjectSettings`）

| 觸發 | 呼叫路徑 | 持有的 bgDir 變數 |
|------|---------|-----------------|
| uVision 轉換 | `uv2make()` → `buildMakefileFromProjectSettings(readProjectSettings(outDirAbs), { ... })` | `outDirAbs` |
| HT32-IDE 轉換 | `convertHt32IdeProject()` → `generateMakefile(result, bgDir, ...)` → `buildMakefileText({ ... })` | `bgDir` |
| Create Project | `generateProjectFiles(bgDir, ...)` → `buildMakefileFromProjectSettings(readProjectSettings(bgDir), { ... })` | `bgDir` |
| Open Project（無 Makefile） | `initProjectsFromMeta()` → `buildMakefileText({ ... })` | `bgDir`（loop var） |

完整建立後，呼叫端立刻補一次 `updateProjectMeta`，patch per-file rules section（含 `--redefine-sym`、`-mpure-code` 偵測）。

#### per-file 偵測統一由 `updateProjectMeta` 處理

`-mpure-code`（xo 檔）等 per-file flag 偵測只在 `updateProjectMeta` 內做。所有觸碰 Makefile 的路徑最終都會經過 `updateProjectMeta`，確保偵測一致：

- 四條初次建立路徑：建立後立刻呼叫 `updateProjectMeta`
- TreeView 操作：直接呼叫 `updateProjectMeta`
- Settings Save / `generateTasksAndLaunch`：`regenAllMakefileFlags` → 若 `project.meta.json` 存在則呼叫 `updateProjectMeta`（`skipElfInvalidation: true`），同時完成 per-file rules + CFLAGS/LDFLAGS + compile_commands.json 更新

> 舊版 FWLib misc.c 相容性不再透過 per-file Makefile rule（`objcopy --redefine-sym）處理，改為直接 patch source 檔（見 [stack-analysis.md](stack-analysis.md)）。

### Patch：SRCS + per-file compile rules（`updateProjectMeta`）

| 觸發 |
|------|
| 上述四條路徑的轉換完成後（立刻呼叫） |
| TreeView：加入 / 移除 group |
| TreeView：加入 / 移除 file |
| TreeView：toggle xo（`-mpure-code`）/ exclude / rom |

`updateProjectMeta` 內部也會呼叫 `regenerateMakefileFlags`（見下）。

若 per-file rules section 有變動，同時寫入 `.needs-rebuild` marker，下次 Build 前自動 clean rebuild。

### Patch：CFLAGS / LDFLAGS（`regenerateMakefileFlags`）

| 觸發 | 呼叫路徑 |
|------|---------|
| `updateProjectMeta`（step 5，每次） | 內部呼叫 |
| Settings Save | `openSettingsPanel` callback → `regenAllMakefileFlags` → `regenerateMakefileFlags` |
| `generateTasksAndLaunch` | → `regenAllMakefileFlags` → `regenerateMakefileFlags` |

CFLAGS/ASFLAGS 有變動時寫入 `.needs-rebuild`，下次 Build 前刪整個 `build/`。

---

## sources.list

**唯一管理者：`updateProjectMeta`（step 2）**

從 `meta.groups` 展開所有非 exclude 檔案，轉換成 bgDir-relative 路徑後寫入。所有轉換路徑皆透過 `updateProjectMeta`，不由轉換器直接寫（轉換器寫的版本會立刻被 `updateProjectMeta` 覆蓋）。

> 例外：uVision 的 `writeLists()`、HT32-IDE 的 `writeHt32IdeLists()`、Create Project 的 `generateProjectFiles()` 均自行寫一次，但緊接著的 `updateProjectMeta` 以 `buildRelPaths` 重新算過後覆蓋。

---

## includes.list

| 觸發 | 函式 | 說明 |
|------|------|------|
| uVision 轉換 | `writeLists()` in `uv2make.ts` | `-I"path"` 格式，含 `../GNU_ARM` |
| HT32-IDE 轉換 | `writeHt32IdeLists()` in `ht32ide2make.ts` | |
| Create Project | `generateProjectFiles()` | |
| Open Project（無 Makefile） | `initProjectsFromMeta()` step 3 | 從 `project.settings.json` 的 `includePaths` 重建 |
| Settings Save | `regenerateMakefileFlags()` | 當 `includePaths` 有提供時更新 |

`updateProjectMeta` **不更新** `includes.list`；include paths 的 source of truth 是 `project.settings.json` 的 `includePaths` 欄位。

---

## defines.list

| 觸發 | 函式 | 說明 |
|------|------|------|
| uVision 轉換 | `writeLists()` | `-DXXX` 格式 |
| HT32-IDE 轉換 | `writeHt32IdeLists()` | |
| Create Project | `generateProjectFiles()` | |
| Open Project（無 Makefile） | `initProjectsFromMeta()` step 4 | 從 `project.settings.json` 的 `cDefs` 重建 |
| Settings Save | `regenerateMakefileFlags()` | 當 `cDefs` 有提供時更新 |

---

## adefines.list

| 觸發 | 函式 | 說明 |
|------|------|------|
| uVision 轉換 | `writeLists()` | ASM-only defines，std 系列含 `USE_HT32_CHIP=X` |
| HT32-IDE 轉換 | `writeHt32IdeLists()` | |
| Create Project | `generateProjectFiles()` | |
| Settings Save | `regenerateMakefileFlags()` | 當 `aDefs` 有提供時更新 |
| 舊專案升級 | `regenerateMakefileFlags()` | 若檔案不存在自動建立空檔 |

---

## compile_commands.json

**底層函式：`writeCCDbFromLists`**（讀 `sources.list` / `includes.list` / `defines.list` / `adefines.list` 合成）

| 觸發 | 呼叫路徑 |
|------|---------|
| uVision 轉換 | `buildCCDb()` in `uv2make()` |
| HT32-IDE 轉換 | `writeCCDbFromLists()` in `convertHt32IdeProject()` |
| Create Project | `writeCCDbFromLists()` in `generateProjectFiles()` |
| Open Project（無 Makefile） | `initProjectsFromMeta()` step 5 |
| `updateProjectMeta`（step 5，每次） | `writeCCDbFromLists()` |
| Settings Save / `generateTasksAndLaunch` | `regenAllMakefileFlags()` → `writeCCDbFromLists()` |
| `ht32.regenerateCompileCommands` 指令 | `regenerateCompileCommandsCommand()` |

每個 bgDir 有自己的 `compile_commands.json`；`regenAllMakefileFlags` 完成後另外合併成 `.vscode/compile_commands.json`（供 clangd 使用）。

---

## project.meta.json

| 觸發 | 說明 |
|------|------|
| uVision 轉換 | 初次建立 |
| HT32-IDE 轉換 | 初次建立 |
| Create Project | 初次建立 |
| `updateProjectMeta`（step 1，每次） | 把傳入的 meta 物件寫回磁碟 |

**source of truth**：`meta.groups`（檔案列表）、`meta.linkerScripts`、`meta.fileOptions`（xo/exclude/rom，使用者設定）。

---

## project.settings.json

| 觸發 | 說明 |
|------|------|
| uVision / HT32-IDE / Create Project（初次） | 寫入 mcu、fpu、floatAbi、includePaths、cDefs 等 |
| Settings Save | `writeProjectSettings()` via settings webview，使用者可修改所有欄位 |
| 內部更新 | adapter serial 自動清除、flash loader 自動偵測等 |

**source of truth**：mcu/fpu/floatAbi 供 `regenerateMakefileFlags` 使用；`includePaths` / `cDefs` / `aDefs` 供 `includes.list` / `defines.list` / `adefines.list` 使用。

---

## .needs-rebuild marker

| 觸發 | 範圍 |
|------|------|
| `regenerateMakefileFlags`：CFLAGS/ASFLAGS 有變動 | 下次 Build 前刪整個 `build/` |
| `updateProjectMeta`：per-file rules section 有變動 | 同上 |

由 `smartRunTask`（Build 指令）在執行 make 前檢查並消費（刪除 marker + 刪 `build/`）。
