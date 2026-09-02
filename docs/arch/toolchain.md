# Toolchain 搜尋策略

## 設計原則

1. **永遠回傳絕對路徑或 undefined**，絕不回傳裸名稱（如 `arm-none-eabi-gcc`）。裸名稱無法區分「找到了但沒有路徑」與「根本沒找到 fallback」，讓 Makefile CC 產生歧義。
2. **找不到就顯示警告通知**，不強迫安裝。使用者主動點選「Install via winget」才執行安裝；按 X 關閉則靜默略過，等下次開啟專案再提示。
3. **不做深度遞迴掃描**。掃描 `Program Files` 深度 6 會阻塞 activation 數分鐘，造成「Makefile 尚未產生就按 Build」的競態問題。改為固定已知路徑 + `where`/`which`。

## 統一入口：`resolveToolchain()`

make / gcc / pyocd 三項工具全部由 `resolveToolchain()` 統一解析，呼叫方只需一次呼叫：

```typescript
const { makePathFull, makeExe, gccPath, pyocdPath } =
  await resolveToolchain(root, bgFullDirs, onInstalled);
```

- **gcc 或 make 缺失**：顯示單一 warning，列出所有缺失工具，使用者點選後執行 `onInstalled`
- **pyocd**：依 bgFullDirs 中的 `serverType` 決定是否檢查，自動安裝（不另外提示）
- `initProjectsFromMeta` 不呼叫 `resolveToolchain`，找不到 gcc 時以裸名稱 fallback，不顯示通知

## arm-none-eabi-gcc 搜尋順序

| 優先順序 | 路徑 / 方式 |
|---|---|
| 1 | VS Code 設定 `ht32.gccPath` |
| 2 | `where arm-none-eabi-gcc`（Windows）/ `which`（Unix）→ 取第一行絕對路徑 |
| 3 | HT32-IDE xPack：`C:\Program Files (x86)\Holtek HT32 Series\HT32-IDE\xPack\arm-gnu-toolchain*\bin\arm-none-eabi-gcc.exe` |
| 4 | HT32-IDE xPack：`C:\Program Files\Holtek HT32 Series\HT32-IDE\xPack\arm-gnu-toolchain*\bin\arm-none-eabi-gcc.exe` |
| 5 | winget Arm GNU Toolchain：`C:\Program Files\Arm GNU Toolchain\*\bin\arm-none-eabi-gcc.exe` |
| 6 | Unix 固定路徑：`/usr/bin`、`/usr/local/bin`、`/opt/arm-none-eabi/bin` |
| 找到後 | 路徑 cache 到 `ht32.gccPath`（只在非 user-settings 來源時才寫入） |
| 找不到 | `resolveToolchain` 顯示 warning；`initProjectsFromMeta` 用裸名稱 `arm-none-eabi-gcc` fallback |

## GNU make 搜尋順序

| 優先順序 | 路徑 / 方式 |
|---|---|
| 1 | VS Code 設定 `ht32.makePath` |
| 2 | bundled make：`{extensionPath}/bin/win32-x64/make.exe` |
| 3 | winget LLVM-MinGW：`%LOCALAPPDATA%\Microsoft\WinGet\Packages\MartinStorsjo.LLVM-MinGW*\*\bin\make.exe` |
| 4 | Unix：`/usr/bin/make`、`/bin/make`、`/usr/local/bin/make`、`which make` |
| 找不到 | `resolveToolchain` 顯示 warning；tasks.json 用裸名稱 `make` fallback；`makefile.makePath` 不寫入 |

## pyOCD 搜尋順序

僅在專案的 `serverType === 'pyocd'` 時才檢查。

| 優先順序 | 路徑 / 方式 |
|---|---|
| 1 | 系統 PATH（`pyocd --version` 成功）→ 回傳 `undefined`（cortex-debug 自行找） |
| 2 | bundled uv 安裝目錄：`uv tool dir --bin` → `pyocd.exe` |
| 找不到 | 詢問使用者是否安裝（Install / Not Now）→ 確認後透過 bundled `uv tool install pyocd` 安裝 |

## 通知觸發時機

gcc / make 缺失 warning 在以下兩個時間點各觸發一次（場景不重疊，不會重複通知）：

| 時間點 | 觸發條件 | 負責範圍 |
|---|---|---|
| **extension 啟動**（300ms 後）| 偵測到 HT32 專案（`hasHint`）**且 tasks.json 已存在** | 補漏：tasks.json 存在時 `generateTasksAndLaunch` 被跳過，此處確保使用者曾按 X 略過安裝仍能收到通知 |
| **`generateTasksAndLaunch`** | tasks.json 不存在、Convert uVision / HT32-IDE、所有轉換流程 | 涵蓋初次設定與所有轉換流程 |

啟動時的 warning 包含 pyocd（若專案使用 pyocd backend）；使用者點選 Install 後才執行安裝。

## tasks.json PATH 組成規則

找到絕對路徑的工具，其 bin 目錄才會加進 task 的 PATH env：
- make：若為 bundled，以 `${config:ht32.internal.extensionRoot}/bin/win32-x64` 表示（升版後不需重新 generate）
- gcc：直接用絕對路徑的 `dirname`
- 若工具在系統 PATH（`where` 找到），tasks 直接繼承 `${env:PATH}`，不額外插入

## makefile.makePath 寫入規則

`writeMakefileToolsSettings` 只在 make 有**完整絕對路徑**時才寫 `makefile.makePath`。
找不到 make 時刪除此 key（讓 Makefile Tools extension 用它自己的預設值或顯示自己的錯誤）。
永遠不寫入裸 `"make"`——那會讓 Makefile Tools 在沒有系統 make 的機器上靜默失敗。
