[English](https://ht32-holtek.github.io/ht32-vscode/) | [中文使用手冊](https://ht32-holtek.github.io/ht32-vscode/README_TRAD)

# Holtek HT32 VS Code Extension

Holtek HT32 系列 Cortex-M 微控制器（M0+/M3/M4）專用 VS Code 擴充功能。支援匯入 Keil uVision 與 HT32-IDE 專案，或從零建立新專案，並透過 **pyOCD**（預設）或內建 OpenOCD 實現一鍵編譯、燒錄與除錯。

---

<br>

## 功能特色

| 功能 | 說明 |
|------|------|
| **建立新專案** | 精靈式專案產生器，支援 HT32 FWLib（標準系列與 49x 系列） |
| **匯入 uVision** | 匯入 Keil `.uvprojx` / `.uvmpw` 專案，自動產生 Makefile、連結腳本、clangd 設定 |
| **匯入 HT32-IDE** | 匯入一個或多個 Eclipse CDT `.project`/`.cproject` 專案資料夾（支援多選） |
| **編譯 / 清除** | 一鍵或工具列按鈕；支援複合式 Post-Build 任務 |
| **除錯** | Cortex-Debug + pyOCD（預設）或內建 OpenOCD；支援 Flash & Debug 或 Attach 模式 |
| **燒錄** | 透過內建 OpenOCD + e-Link32 Pro/Lite 燒錄韌體 |
| **專案設定** | 提供編譯器旗標、除錯介面、Post-Build 指令的 WebView 設定面板 |
| **專案檔案樹** | 原始碼群組檢視，支援新增/移除檔案與群組 |
| **設定精靈** | HT32 設定檔視覺化編輯器（`conf.h`、`usbdconf.h`、`startup.s`），相容 Keil 精靈語法 |
| **Code Intelligence (clangd)** | 自動產生 `.clangd` 與各專案獨立的 `compile_commands.json` |

---

<br>

## 安裝需求

| 項目 | 說明 |
|------|------|
| 作業系統 | Windows x64 |
| 除錯器 | Holtek e-Link32 Pro / Lite；支援 J-Link、ST-Link |
| FWLib | 需要 |

> **OpenOCD**：已內建<br>
> **pyOCD**：首次使用時自動安裝<br>
> **GCC 工具鏈**：擴充功能啟動時自動偵測；找不到時透過 winget 自動安裝<br>
> **相依擴充功能**：安裝時自動一併安裝 **Cortex-Debug**（除錯介面）與 **Holtek HT32 Configuration Wizard**（[設定精靈](https://marketplace.visualstudio.com/items?itemName=holtek.ht32-config-vscode)）

---

<br>

## 安裝擴充功能

**方法一：從 .vsix 安裝**

1. VS Code → 擴充功能 → `...` → **Install from VSIX...**
2. 選取 `ht32-vscode-x.x.x.vsix`

> **注意：** VS Code 會自動從 Marketplace 尋找並安裝擴充功能的相依套件。
> 若相依套件尚未發布至 Marketplace，安裝將會失敗。

<table><tr>
<td><img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/1.jpg" width="350" style="border:1px solid #ccc; border-radius:4px; padding:3px;"></td>
<td><img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/2.jpg" width="350" style="border:1px solid #ccc; border-radius:4px; padding:3px;"></td>
</tr></table>

---

<br>

**方法二：從 Marketplace 安裝**

1. 擴充功能搜尋欄輸入 `Holtek HT32 VS Code Extension`（或直接搜尋 `holtek` / `ht32` 即可找到）
2. 點 **Install**

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/3.jpg" width="300" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

---

<br>

## 介面介紹

安裝後，左側 Activity Bar 出現 **HT32 圖示**，點擊展開 HT32 面板。

**專案未開啟時**顯示 **Create / Open / Convert** 按鈕；若有歷史記錄，下方會列出 **Recent Projects**，點擊即可直接開啟。

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/4.jpg" width="300" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

---

<br>

**工具列按鈕（專案載入後顯示）：**

| 按鈕 | 功能 |
|------|------|
| Build | 編譯 |
| Debug | 透過 pyOCD 或 OpenOCD 啟動 Cortex-Debug 除錯（Flash & Debug 或 Attach 模式） |
| Clean | 刪除 `build/` 輸出目錄 |
| Download | 燒錄韌體（不啟動除錯） |
| Settings | 開啟專案設定 |
| Generate Build & Debug Config | 重新產生 `tasks.json` 與 `launch.json` |

**`···`（更多動作）** 選單另外包含：

| 項目 | 功能 |
|------|------|
| Create Project | 開啟建立專案精靈 |
| Open Project | 開啟 `.ht32vs` 專案檔 |
| Close Project | 關閉目前載入的專案 |

---

<br>

**專案檔案樹**顯示原始碼群組結構，與 Keil uVision 的群組概念相同。

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/5.jpg" width="300" style="border:1px solid #ccc; border-radius:4px; padding:3px;"><br>

將滑鼠移至根節點即可顯示兩個按鈕：**Add New Project**（執行精靈建立新子專案）與 **Add Existing Project**（從同一資料夾選取已轉換或建立的專案）。

右鍵選單：

| 對象 | 操作 |
|------|------|
| 樹狀根節點（`.ht32vs`） | Add Existing Project（加入現有子專案）、Rename Project File（重新命名）|
| 子專案節點 | Move Up（上移）、Move Down（下移）、Remove Project（從清單移除）、Add Group（新增群組） |
| 群組 | Add New Files（新建檔案）、Add Existing Files（加入現有檔案）、Remove Group（移除群組） |
| 檔案 | Remove from Group（從群組移除）、Delete File（從磁碟刪除） |

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/12.jpg" width="300" style="border:1px solid #ccc; border-radius:4px; padding:3px;"><br>
---

<br>

## 專案檔案（.ht32vs）

每個 HT32 專案都會對應一個 **`.ht32vs` 專案檔**（儲存在 `HT32_VSCode/` 內）。此檔案記錄此專案包含哪些子專案目錄，在轉換或建立專案後自動產生。

### 開啟專案

| 方式 | 說明 |
|------|------|
| **雙擊 `.ht32vs`** | 在檔案總管雙擊 `.ht32vs` 檔案，直接開啟專案 |
| **Open Project** | 透過歡迎畫面的 **Open** 按鈕、`···` 選單或 `HT32: Open Project` 指令瀏覽並開啟 `.ht32vs` 專案檔 |
| **Recent Projects** | 點擊最近開啟清單中的任一項目（專案未開啟時顯示） |

### 管理子專案

一個 `.ht32vs` 可包含多個子專案目錄（例如 `Project_IAP` 與 `Project_AP`），無需重新轉換即可隨時新增或移除。

**使用多專案功能**時，所有子專案必須位於**同一個 `HT32_VSCode/` 資料夾**下。將滑鼠移至根節點即可顯示 **Add New Project** 與 **Add Existing Project** 按鈕。

若目前只有一個子專案，新增第二個時會彈出提示，要求輸入新的專案檔名稱。

| 操作 | 方式 |
|------|------|
| **新增子專案（新建）** | 將滑鼠移至根節點 → **Add New Project** — 執行建立專案精靈，新增子專案 |
| **新增子專案（現有）** | 將滑鼠移至根節點 → **Add Existing Project** — 從同一資料夾中選取已轉換或建立的專案 |
| **移除子專案** | 在專案節點按右鍵 → **Remove Project**，從清單中移除（磁碟上的檔案不會刪除）。僅剩一個子專案時無法執行。 |
| **上移 / 下移** | 在專案節點按右鍵 → **Move Up** 或 **Move Down**，調整子專案在 **Build All** 時的編譯順序。 |

### 重新命名專案

在 Project Tree 的根節點按右鍵 → **Rename Project File**，即可同時更名 `.ht32vs` 檔案並自動更新 Recent Projects 清單。


---

<br>

## 多專案（Multi-Project）

**多專案**允許多個獨立子專案（例如 `Project_IAP` 與 `Project_AP`）共用同一個 `HT32_VSCode/` 資料夾，並在 Project Tree 中一起管理。

### 建立多專案

Hover 根節點即可顯示 **Add New Project** 與 **Add Existing Project** 按鈕。

| 操作 | 方式 |
|------|------|
| **新增子專案（新建）** | 將滑鼠移至根節點 → **Add New Project** — 執行建立專案精靈，新增子專案 |
| **新增子專案（現有）** | 將滑鼠移至根節點 → **Add Existing Project** — 從同一資料夾中選取已轉換或建立的專案 |

當目前只有**一個**子專案，新增第二個時會彈出提示，要求輸入**新的專案檔名稱**（預設為專案根目錄名稱）。確認後產生：

| 檔案 | 內容 | 角色 |
|------|------|------|
| `ProjectA.ht32vs` | `{ "projects": ["ProjectA"] }` | 原有單一專案（不動） |
| `ProjectB.ht32vs` | `{ "projects": ["ProjectB"] }` | 新的單一專案 |
| `MyProject.ht32vs` | `{ "projects": ["ProjectA", "ProjectB"] }` | 多專案（設為 active） |

三個 `.ht32vs` 檔案共存，雙擊任一個即可切換。

### 目錄結構

```
MyProject/
└── HT32_VSCode/
    ├── ProjectA.ht32vs          ← 單一專案視圖
    ├── ProjectB.ht32vs          ← 單一專案視圖
    ├── MyProject.ht32vs         ← 多專案視圖（active）
    ├── ProjectA/
    │   ├── Makefile
    │   └── ...
    └── ProjectB/
        ├── Makefile
        └── ...
```

### 編譯與除錯

點擊工具列的 **Build**、**Debug**、**Clean** 或 **Download** 時，會彈出 QuickPick 讓使用者選擇要對哪個子專案執行。**Build** 與 **Clean** 另提供 **Build All** / **Clean All**，依序執行所有子專案。編譯順序由 Project Tree 的排列決定，可透過**右鍵 → Move Up / Move Down** 調整。

---

<br>

## 建立新專案

> 需要先準備好 HT32 FWLib（從 Holtek 官網下載）

1. HT32 面板 → **Create Project**
2. 依精靈步驟選擇：

| 步驟 | 內容 |
|------|------|
| ① | 選擇 **HT32 FWLib 根目錄** |
| ② | 選擇 **MCU 型號** |
| ③ | 選擇輸出類型：**Application** 或 **Library** |
| ④ | 輸入**專案名稱**和儲存位置 |

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/6.jpg" width="450" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

---

<br>

### 產生的檔案結構

```
MyProject/                 ← 使用者命名的專案資料夾
├── .clangd                ← 開啟專案時自動產生（clangd 設定）
└── HT32_VSCode/           ← VS Code workspace root
    ├── .vscode/
    │   ├── tasks.json
    │   └── launch.json
    ├── <projectName>.ht32vs
    └── <projectName>/     ← 名稱來自精靈中輸入的專案名稱
        ├── Makefile
        ├── sources.list
        ├── compile_commands.json
        ├── *.json
        ├── src/           ← 使用者原始碼
        │   ├── main.c
        │   ├── ht32fxxxx_it.c
        │   ├── system_ht32fxxxx.c
        │   ├── ht32fxxxx_conf.h
        │   └── ht32_op.c
        └── GNU_ARM/       ← 自動產生的 GCC 支援檔案
            ├── startup_ht32fxxxx_gcc_xx.s
            ├── linker.ld
            ├── syscalls.c
            └── ht32_stack_analysis.c
```

**NOTE:**
**工作區信任** — 若 VS Code 以受限模式開啟資料夾，將顯示通知：*「You are in Restricted Mode」*，請點選 **Trust** 以啟用編譯與除錯功能。

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/22.jpg" width="400" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

---

<br>

## 匯入 Keil uVision 專案

1. HT32 面板 → **Convert uVision Project**
2. 選取 `.uvprojx`（單一專案）或 `.uvmpw`（多專案）

`.uvmpw` 會將所有子專案**一次全部轉換**，每個子專案各產生一個獨立的目錄，目錄名稱即為 `.uvprojx` 的檔名。

**自動產生：**

- `Makefile`（MCU 型號、編譯旗標、來源檔案）
- Linker script（放在共用 `GNU_ARM/`）：有 Keil scatter 時轉換為 `<scatter檔名>.ld`（保留原始檔名，副檔名改為 `.ld`）；無 scatter 時直接取自 FWLib（標準系列為 `linker.ld`，49x 系列為 `<chip>_FLASH.ld`）
- `startup_xxx_gcc.s`（從 Keil startup 轉換，放在共用 `GNU_ARM/`）
- `compile_commands.json` / `tasks.json` / `launch.json`

**`.uvprojx` 單一專案** — 共用檔輸出至 `HT32_VSCode/GNU_ARM/`；Makefile 與中繼資料輸出至 `HT32_VSCode/Project/`

**`.uvmpw` 多專案** — 每個子專案各一個目錄，目錄名稱取自 `.uvprojx` 檔名（例如 `Project_IAP.uvprojx` + `Project_AP.uvprojx`）：
<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/7.jpg" width="300" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

```
<ProjectRoot>/
├── MDK_ARMv5/             ← 原始 Keil 專案
└── HT32_VSCode/           ← VS Code workspace root
    ├── .vscode/
    │   ├── tasks.json
    │   └── launch.json
    ├── GNU_ARM/           ← 共用：startup .s、linker script、ht32_op.c、syscalls.c、ht32_stack_analysis.c
    ├── Project_IAP/       ← 取自 uvprojx 檔名
    │   ├── Makefile
    │   ├── compile_commands.json
    │   └── *.json
    └── Project_AP/
        ├── Makefile
        ├── compile_commands.json
        └── *.json
```

---

<br>

**轉換警告**（如 Keil 預編譯 `.lib` 無法用於 GCC 工具鏈）會顯示在 VS Code **Problems** 面板中。

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/18.png" width="600" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

> **工作區信任** — 若 VS Code 以受限模式開啟資料夾，擴充功能將顯示通知：*「This workspace is in Restricted Mode. Please trust the workspace to enable all features.」*，請點選 **Trust Workspace** 以啟用編譯與除錯功能。

---

<br>

## 匯入 HT32-IDE 專案

1. HT32 面板 → **Convert HT32-IDE Project**
2. 選取一個或多個包含 `.project` / `.cproject` 的**專案資料夾**（**支援多選**）

每個選取的資料夾各自轉換為 `HT32_VSCode/` 內的獨立目錄，共用 `HT32_VSCode/GNU_ARM/` 存放 startup、linker script 與自動產生的 C 檔案。產生的資料夾結構與 TreeView 組織方式與匯入 uVision 專案相同。

> **工作區信任** — 若 VS Code 以受限模式開啟資料夾，擴充功能將顯示通知：*「This workspace is in Restricted Mode. Please trust the workspace to enable all features.」*，請點選 **Trust Workspace** 以啟用編譯與除錯功能。

---

<br>

## 建置

- HT32 工具列點 **Build**
- 或按 `Ctrl+Shift+B`（直接執行預設建置任務 **Build (make)**）

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/8.jpg" width="500" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

多專案時，工具列的 **Build**、**Debug**、**Clean**、**Download** 按鈕會彈出 QuickPick 讓使用者選擇要操作哪個子專案。**Build** 與 **Clean** 另有 **Build All** / **Clean All** 選項，可依序處理所有子專案。編譯順序與 Project Tree 的排列順序相同，可在專案節點上按右鍵 **Move Up / Move Down** 調整。

<br>

也可在「專案設定」中設定 **Post-Build** 命令，Build 成功後自動執行（例如 CRC 計算）。執行時的工作目錄為 `${workspaceFolder}`（即 `HT32_VSCode/`，VS Code workspace 根目錄），子專案目錄如 `Project_xxx/build/` 均相對此路徑。

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/9.jpg" width="300" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

---

<br>

## 清除

- HT32 工具列點 **Clean**
- 刪除 `HT32_VSCode/Project/build/`（或 `HT32_VSCode/Project_xxx/build/`）目錄下所有編譯輸出

---

<br>

## 燒錄韌體

> 需要連接 Holtek e-Link32 Pro 或 e-Link32 Lite

1. 確認 e-Link32 已連接並驅動正常
2. HT32 工具列點 **Download**
3. 韌體自動燒錄，Terminal 顯示進度

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/10.jpg" width="500" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

### 燒錄設定

點工具列 **Settings** → **Debugger** 分頁：

| 設定 | 選項 |
|------|------|
| Debug Interface | CMSIS-DAP（e-Link32）/ J-Link / ST-Link |
| Erase Mode | Erase Sector（預設）/ Erase Chip / None |

---

<br>

## 除錯

> **Cortex-Debug** 為相依套件，安裝本擴充功能時會自動一併安裝。

擴充功能支援兩種除錯後端，可在**設定 → Debugger → Debug Server** 切換：

| 後端 | 說明 |
|------|------|
| **PyOCD**（預設） | 免安裝驅動；首次使用時自動安裝 |
| **OpenOCD** | 已內建；可作為備選方案 |

> **J-Link + OpenOCD on Windows：** 需透過 [Zadig](https://zadig.akeo.ie/) 安裝 WinUSB 驅動。**J-Link + pyOCD 無需更換驅動。**

### Debug（完整流程）

1. HT32 工具列點 **Debug**
2. 自動編譯、燒錄，並啟動 GDB 除錯工作階段（透過選定的後端）

### Attach（附接到執行中的目標）

適用於目標板已經在執行（不需要重新燒錄）的情況，例如觀察特定狀態下的程式行為。

1. 確認目標板已上電並執行
2. 按 **F5** 或開啟 **Run and Debug**（Ctrl+Shift+D）
3. 從下拉選單選擇 **HT32 PyOCD Attach**（或 **HT32 OpenOCD Attach**）

> Attach 不會編譯也不會燒錄，直接附接到執行中的目標，不會 reset。

| 模式 | 說明 |
|------|------|
| HT32 PyOCD Debug | 編譯→燒錄→啟動除錯 |
| HT32 PyOCD Attach | 不燒錄，直接附接到執行中的目標 |
| HT32 OpenOCD Debug | 編譯→燒錄→啟動除錯 |
| HT32 OpenOCD Attach | 不燒錄，直接附接到執行中的目標 |

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/11.jpg" width="700" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

---

<br>

## Stack Usage Analysis（堆疊使用分析）

**HT32 Stack Usage Analysis** 顯示於 Run & Debug 側邊欄，每次除錯器暫停（中斷點、單步、手動暫停）時自動更新，功能等同於 Keil 的堆疊分析視窗。

### 面板欄位說明

| 欄位 | 說明 |
|------|------|
| **Target** | ELF 檔名（輸出名稱） |
| **Stack Top Addr (Start)** | 堆疊頂端（最高位址） |
| **Stack Bottom Addr (End/Limit)** | 堆疊底端（堆疊限制位址） |
| **Stack Size** | 堆疊總大小 |
| **Current Usage** | 最近一次除錯器暫停時的堆疊使用量 |
| **Peak Usage** | 最高堆疊使用量（需啟用 watermark 追蹤，見下方說明） |
| **Peak Addr** | 最高使用量發生的記憶體位址 |

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/21.jpg" width="700" style="border:1px solid #ccc; border-radius:4px; padding:3px;">


### 啟用 Peak（watermark）追蹤

預設 **Peak Usage** 欄位顯示提示訊息。若需顯示實際峰值：

1. 確保 `HTCFG_STACK_USAGE_ANALYSIS` 定義為 `1`（例如在專案的組態標頭檔中設定）
2. 在啟動時呼叫一次 `StackUsageAnalysisInit(0)`（RTOS scheduler 或主迴圈之前）

```c
#include "ht32_stack_analysis.h"

int main(void) {
    StackUsageAnalysisInit(0);   // 將未使用的堆疊空間填入特定 pattern，供峰值追蹤使用
    // ... 其餘初始化
}
```

兩個條件缺一不可；若未滿足，**Peak Usage** 欄位會顯示提示訊息而非數值。

---

<br>

## 專案設定

HT32 工具列點 **Settings** 開啟設定面板，面板分為三個分頁：

### Compiler 分頁

| 設定項目 | 說明 |
|----------|------|
| Output Filename | 自訂輸出檔名（留空則沿用轉換時的名稱） |
| Optimization | `-O0` / `-O1` / `-O2` / `-O3` / `-Os`（預設）/ `-Og` |
| Debug Info | `-g3`（預設，完整 debug）/ `-g`（標準）/ `-g1`（僅行號）/ `-g0`（無，release 用）|
| Float ABI | `soft`（M0/M3）/ `softfp` / `hard`（M4F） |
| FPU | `none` / `fpv4-sp-d16`（M4F）/ `fpv5-sp-d16`（M7）/ `fpv5-d16`（M7） |
| C Runtime Library | `nano`（newlib-nano）/ `nosys`（不使用 syscalls）— 可同時勾選 |
| printf float | 啟用浮點 printf（`-u _printf_float`） |
| scanf float | 啟用浮點 scanf（`-u _scanf_float`） |
| LTO | 啟用 `-flto` |
| Libraries (-l) | 要連結的函式庫名稱（`-lName`） |
| Search Paths (-L) | 函式庫搜尋路徑（`-L"dir"`） |
| Include Paths | 所有 `-I` 搜尋路徑，寫入 `includes.list`；轉換時自動填入，可在此新增額外路徑 |
| Extra CFLAGS | 附加編譯旗標，例如 `-DDEBUG` |
| Extra LDFLAGS | 附加連結旗標 |

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/15-1.png" width="500" style="border:1px solid #ccc; border-radius:4px; padding:3px;">
<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/15-2.png" width="500" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

---

<br>

### Debugger 分頁

| 設定項目 | 說明 |
|----------|------|
| **Debug Server** | **`PyOCD`**（預設）/ `OpenOCD` |
| Debug Interface | `CMSIS-DAP`（e-Link32）/ `J-Link` / `ST-Link` |
| Adapter Serial | 指定除錯器序號（空白 = 自動） |
| Adapter Speed | 傳輸速率 kHz（空白 = 介面預設） |
| Debug Level | 1~4 逐漸詳細（預設 1）|
| DFP Path | 自訂 DFP 路徑 |
| SVD File | 周邊暫存器 SVD 檔案（空白 = 自動偵測） |
| Erase Mode | `erase_sector`（預設）/ `erase_chip` / `none` |
| Smart Flash | （僅 PyOCD）跳過未更動頁面，加速重複燒錄； |
| Flash Loaders | 附加外部 Flash Loader（例如 SPI Flash） |

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/17.jpg" width="700" style="border:1px solid #ccc; border-radius:4px; padding:3px;">
<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/16.png" width="700" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

> **J-Link + OpenOCD on Windows：** 需先用 [Zadig](https://zadig.akeo.ie/) 安裝 WinUSB 驅動。切換為 WinUSB 後，SEGGER 工具（Keil、J-Flash 等）將無法辨識 J-Link；還原方式為重新安裝 SEGGER J-Link Software。

> **J-Link + pyOCD 無需更換驅動。**

---

<br>

### Build 分頁

| 設定項目 | 說明 |
|----------|------|
| Post-Build | Build 後執行的命令（工作目錄：`${workspaceFolder}` = `HT32_VSCode/`） |
| GCC Path | `arm-none-eabi-gcc` 路徑（空白 = 自動偵測或 winget 安裝） |
| OpenOCD Path | OpenOCD 路徑（空白 = 使用 bundled OpenOCD） |

> 工具鏈路徑（GCC / OpenOCD）儲存於 VS Code 機器設定，**所有專案共用**，僅顯示於第一個專案的 Build 分頁。

---

<br>

## 設定精靈（Configuration Wizard）

**Holtek HT32 Configuration Wizard** 為相依擴充功能，安裝 Holtek HT32 VS Code Extension 時會自動一併安裝，提供 HT32 韌體設定檔的視覺化圖形編輯介面，相容 Keil MDK Configuration Wizard 語法。

### 支援的設定檔

| 檔案 | 用途 |
|------|------|
| `ht32fxxxx_conf.h` | Retarget（printf/scanf 輸出埠、鮑率、函式庫啟用） |
| `system_ht32fxxxx_NN.c` | 時鐘設定（PLL、HSE/HSI、HCLK、WDT） |
| `ht32fxxxx_NN_usbdconf.h` | USB 端點設定 |
| `startup_ht32fxxxx_NN.s` | Stack / Heap 大小 |

### 開啟方式

**方法一 — 編輯器標題按鈕（推薦）：**  
開啟支援的檔案（`.h`、`.c`、`.s`）後，點擊編輯器右上角的 **Open in Holtek Configuration Wizard** 按鈕即可切換為 Wizard 視圖；點擊 **Reopen as source file** 切換回文字編輯。

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/20.jpg" width="700" style="border:1px solid #ccc; border-radius:4px; padding:3px;">

**方法二 — 右鍵選單：**  
在左側 Explorer 面板中對 `.h`、`.c`、`.s` 檔案按右鍵 → **Open in Holtek Configuration Wizard**

**方法三 — 命令面板：**  
`Ctrl+Shift+P` → **HT32: Open in Holtek Configuration Wizard**

### 控制項類型

| 類型 | 說明 |
|------|------|
| Checkbox（`<q>`） | 切換開關 |
| Dropdown（`<o>` 含選項） | 從預定義清單選擇 |
| Number（`<o>` 含範圍） | 在允許範圍內輸入數值 |
| Enable Section（`<e>`） | 主開關，控制整組設定的啟用／停用 |
| Heading（`<h>`） | 可摺疊群組 |

---

<br>

## Code Intelligence（clangd）

匯入或建立專案後，開啟專案時自動為每個專案產生 `.clangd` 與獨立的 `compile_commands.json`，提供完整的 code intelligence 支援。多專案時，在專案樹點選任意節點，`.clangd` 會自動切換至該專案的 `compile_commands.json`。

<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/13.jpg" width="700" style="border:1px solid #ccc; border-radius:4px; padding:3px;">
<img src="https://raw.githubusercontent.com/ht32-holtek/ht32-vscode/main/media/14.jpg" width="700" style="border:1px solid #ccc; border-radius:4px; padding:3px;">


---

<br>

## 指令（Ctrl+Shift+P → "HT32"）

| 指令 | 說明 |
|------|------|
| `HT32: Create Project` | 開啟建立專案精靈 |
| `HT32: Open Project` | 瀏覽並開啟 `.ht32vs` 專案檔 |
| `HT32: Convert uVision Project` | 匯入 Keil `.uvprojx` / `.uvmpw` |
| `HT32: Convert HT32-IDE Project` | 匯入 Eclipse CDT `.project` |
| `HT32: Build` | 執行建置任務 |
| `HT32: Download` | 燒錄韌體 |
| `HT32: Debug` | 啟動除錯工作階段 |
| `HT32: Clean` | 清除編譯輸出 |
| `HT32: Open Settings` | 開啟專案設定 |
| `HT32: Generate Build & Debug Config` | 重新產生 `tasks.json` 與 `launch.json` |
| `HT32: Regenerate compile_commands.json` | 重新產生供 clangd 使用的 `compile_commands.json` |
| `HT32: Close Project` | 關閉目前載入的專案 |
| `HT32: Clear Recent Projects` | 清除最近開啟清單 |
| `HT32: Refresh Stack Usage` | 手動刷新 Stack Usage Analysis 面板 |

---

<br>

## 第三方授權

內建與自動安裝元件的授權資訊請參閱 `THIRD_PARTY_LICENSES.md`。

---

<br>

## 授權

Proprietary — 請參閱 `LICENSE`

