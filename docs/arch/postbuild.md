# Post-Build 指令轉換

Keil uVision 的「After Make」指令在 VS Code 由 `translateKeilPostBuildCmd()` 翻譯，
結果存入 `project.settings.json` 的 `postBuildCmd`，並作為 **Post-Build** task 執行。

---

## 轉換規則一覽

### 1. `fromelf --bin` — 略過（跳過）

```
fromelf --bin --output @L.bin @L.axf
```

Keil 用此指令產生 `.bin` 檔。VS Code Makefile 已在 `post-build` rule 裡呼叫 `arm-none-eabi-objcopy`，
輸出位置為 `Project_xxx/build/TARGET.bin`，不需要重複執行，直接略過（回傳 `''`）。

---

### 2. `cmd /C copy` — 路徑翻譯

```
cmd /C copy /Y "!L.bin" <dst>
cmd.exe /Q /C copy /Y "#L.bin" <dst>
```

- **`!L`、`#L`**：Keil 變數，展開為輸出 `.axf` 完整路徑（不含副檔名）。
  `!L.bin` / `#L.bin` 對應 `.bin` 輸出，支援大小寫。
- **翻譯後**：`cmd /C copy /Y <bin-rel> <dst-rel>`
  - `<bin-rel>`：`Project_xxx/build/TARGET.bin`（相對 `HT32_VSCode/`）
  - `<dst-rel>`：Keil 原 dst（相對 Keil `MDK_ARMv5/`）→ 轉換為相對 `HT32_VSCode/`
  - 含空格的路徑自動加引號
- **目的目錄不存在**：在轉換時（而非執行時）發出 ConversionWarning，提示使用者到 Settings 核對 `postBuildCmd`。
- **其他 `cmd /C` 語法**（非 copy 或 src 非 `[!#]L.bin`）：略過，回傳 `''`。

---

### 3. `.bat` / `.exe` 腳本 — 路徑翻譯 + vsc 模式參數

```
..\Script\afterbuild.bat  $K\ARM5\bin\fromelf #L  $D
afterbuild.exe  keil @L  HT32F52352
```

- 第一個 token 為帶有路徑分隔符（`/` 或 `\`）的 `.bat`/`.exe` 路徑。
- **翻譯後**：`<wsRoot-relative-path> vsc <targetName> <icName>`
  - `vsc` 取代原本的 Keil 模式參數（`keil` / 空白）
  - `<targetName>`：來自 uVision Target 名稱
  - `<icName>`（第 4 個 token）：Keil `$D` 變數（device name）自動展開為實際 MCU 名稱
- **腳本本身需同時支援 `vsc` 模式**（接收不同於 Keil 的路徑格式）；
  Holtek 官方 `afterbuild.bat` 已內建此模式。

---

### 4. 裸 system command — 略過（跳過）

```
cmd.exe /C someUnknownCmd
```

第一個 token **不含 `/` 或 `\`**（即無目錄成分），視為純系統命令，無法翻譯，直接略過。

---

## 處理流程

```
translateKeilPostBuildCmd(cmd, projDir, wsRoot, outDirAbs, targetName, deviceName, warnings)
│
├─ cmd /C copy 模式 → 翻譯 !L/#L.bin 路徑
│     └─ 其他 src → ''
│
├─ 解析第一個 token
│   ├─ 無路徑分隔符 → ''（bare system cmd）
│   └─ 有路徑分隔符
│       └─ 翻譯為 wsRoot-relative + vsc mode 參數
```

---

## 相關函式

| 函式 | 位置 | 說明 |
|---|---|---|
| `translateKeilPostBuildCmd()` | `uv2make.ts` | 單條指令翻譯 |
| `extractUvAfterMakeCmd()` | `uv2make.ts` | 從 `.uvprojx` XML 讀取 AfterMake 指令，過濾 fromelf，呼叫上方函式 |

`extractUvAfterMakeCmd` 傳入 `convWarnings` 陣列；翻譯過程中產生的警告（如目的目錄不存在）
會出現在 VS Code **Problems** 面板。

---

## 不支援的語法

以下 Keil post-build 語法目前**不翻譯**（回傳 `''`）：

- `fromelf --i32 / --vhx / --elf` 等非 bin 格式
- `cmd /C` 搭配 `copy` 以外的指令（`del`、`mkdir`、`echo` …）
- `!L`/`#L` 的 `.axf` 本體（非 `.bin`）
- 多行 / `&&` 串接指令

若有需要，請手動編輯 `project.settings.json` 的 `postBuildCmd` 欄位。
