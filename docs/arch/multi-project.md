# 多專案支援

## 多專案支援

兩種轉換路徑都支援一次轉換多個子專案，共用相同的 tasks.json / ProjectTreeProvider 邏輯。

### uVision（.uvprojx / .uvmpw）

**輸出目錄命名規則（`buildGenDirName()`）：**
- 固定使用 `.uvprojx` 的**檔案名稱**（不含副檔名）作為 bgDir 名稱
  - 例：`calibration.uvprojx` → `calibration/`
  - 例：`Project_12366.uvprojx` → `Project_12366/`
- `.uvmpw` 多專案：每個子 `.uvprojx` 各自用自己的檔名命名

### HT32-IDE

**輸出目錄命名規則：**
- 選擇 `Project_*` 子資料夾 → 保留資料夾名稱
  - 例：`Project_AP/` → `Project_AP/`
- 選擇 `HT32-IDE/` 本身（`.project`/`.cproject` 直接在其中）→ `Project/`

### Create Project

**輸出目錄命名規則：**
- bgDirName = 使用者在 wizard 輸入的 **projectName**（可自由編輯）
- wizard 預設值：`HT32_` + chipSuffix 去掉 `HT32F/HT32L` 前綴
  - 例：`HT32F52352` → 預設 `HT32_52352/`
  - 例：`HT32F49395_100LQFP` → 預設 `HT32_49395_100LQFP/`

### Multi-project IntelliSense（clangd）

每個 `Project_*/` 各自有一個完整的 `compile_commands.json`，包含：
- 正確的 gcc 完整路徑（替代裸名 `arm-none-eabi-gcc`）
- `--target=arm-none-eabi`（讓 clangd 以 ARM target 解析型別）
- `-isystem` 旗標（newlib / gcc include 目錄，讓 `#include <stdint.h>` 不報錯）

`.vscode/compile_commands.json` **不再產生**；不同 MCU 型號的共用 source file 會有不同 `-mcpu` 旗標，合併版本無法正確呈現。

#### compile_commands.json 尋找流程

clangd 必須知道去哪裡找 `compile_commands.json`。Source files 通常位於 `MDK_ARMv537/`、FWLib 根目錄等位置，這些目錄是 `HT32_VSCode/` 的兄弟目錄或更上層，clangd 從 source file 往上搜尋時不會經過 `HT32_VSCode/`，因此無法靠 `.clangd` 的 `CompilationDatabase:` 自動找到。

**解法：`--compile-commands-dir` 明確指定**

`writeMakefileToolsSettings()` 在 `.vscode/settings.json` 的 `clangd.arguments` 寫入：
```json
"clangd.arguments": [
  "--compile-commands-dir=${workspaceFolder}/Project_52352",
  "--query-driver=C:/.../arm-none-eabi-gcc.exe"
]
```

- `${workspaceFolder}` = `HT32_VSCode/`（VS Code workspace 根目錄）
- 路徑指向 **active project** 的 bgDir，即包含 `compile_commands.json` 的目錄
- `--compile-commands-dir` 優先於 `.clangd` 的 `CompilationDatabase:`，clangd 不管 source file 在哪個磁碟路徑都能找到

**切換 active project**

使用者在 TreeView 點選不同 Project 節點時，`setClangdIntelliSenseProject()` 同時更新：
1. `.clangd` 的 `CompilationDatabase:` 路徑（備用，`--compile-commands-dir` 優先）
2. `settings.json` 的 `clangd.arguments` 中的 `--compile-commands-dir` 路徑（將最後一段 bgDir 名稱替換）

兩者更新後執行 `clangd.restart`（若路徑相同則略過，避免不必要的閃爍）。

**`.clangd` 設定**（放於 `HT32_VSCode/`）：
```yaml
CompileFlags:
  CompilationDatabase: Project_52352
  Add:
    - --target=arm-none-eabi
    - -isystem...
Diagnostics:
  UnusedIncludes: None
```

### 共用行為（tasks.json / TreeView）

- 每個 `Project*/` 各自產生 `Build XX` / `Clean XX` task
- 多目錄時自動加 `Build All`（`dependsOrder: sequence`）
- `preLaunchTask` 指向主目錄（`Project/`）的 build task
- `regenerateMakefileFlags` 對所有 `Project*/` 套用
- ProjectTreeProvider 掃描所有 `Project*/` 下的 `project.meta.json`，`Project/` 排在最前
- TreeItem.id：專案用 `buildGenDir` 絕對路徑；Group 用 `buildGenDir::groupName`

