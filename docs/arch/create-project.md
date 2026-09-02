# Create Project — 索引

`src/tools/createProject.ts` — 從 FWLib template 建立新的 GNU ARM 專案。

---

## 入口

```
HT32: Create Project（ht32.createProject）
  └─ openCreateProjectPanel()     ← Webview wizard UI
       └─ onGenerate callback
            └─ generateProjectFiles()   ← 主要產生邏輯
                 └─ generateTasksAndLaunch()  ← 寫 tasks.json / launch.json
```

---

## Wizard 流程

1. 選 FWLib Root → `detectFwlibSeries()` 判斷系列（std-5xxxx / std-4xxxx / std-1xxxx / 49x-490/491/493）；判斷邏輯先看目錄名稱，再掃 `library/HT32*xxxx_Driver/` 是否存在，不依賴 `project_template/`
2. 列出 MCU 選單：
   - 標準系列 → `listStdMcus()`：掃 `project_template/IP/Example/GNU_ARM/*.mk`，每個 `.mk` 一個 chip；**`project_template/` 不存在時 fallback 到 bundled `templates/{familyTag}/GNU_ARM/*.mk`**
   - 49x 系列 → `list49xMcus()`：掃 `libraries/cmsis/.../startup/gcc/linker/*_FLASH.ld`，再掃 device header 取得封裝選項
3. 填寫 Project Name / Project Folder / Output Type
4. Generate → `generateProjectFiles()`

---

## 產出目錄結構

```
{projectFolder}/
└── HT32_VSCode/
    └── {projectName}/          ← bgDir
        ├── GNU_ARM/
        │   ├── startup_*.s     ← 複製自 FWLib + patch
        │   ├── linker.ld       ← 複製自 FWLib + patch
        │   └── ht32_stack_analysis.c
        ├── src/                ← 使用者可編輯的源碼
        │   ├── main.c
        │   ├── *_it.c / *_int.c
        │   ├── system_*.c
        │   └── conf.h / ...
        ├── Makefile
        ├── sources.list
        ├── includes.list
        ├── defines.list
        ├── adefines.list
        ├── compile_commands.json
        ├── project.meta.json
        └── project.settings.json
```

---

## 各系列依賴來源

> 詳細的逐檔清單（startup / linker / driver / system / conf.h / board support / syscalls）  
> → **[fwlib-deps.md — Create Project 節](fwlib-deps.md#create-project)**

---

## `.mk` 的角色（標準系列）

標準系列以 `parseMkFile()` 讀 `{chipSuffix}.mk`，作為 driver 清單、startup 檔名、define、htChipNum 的唯一依據。  
→ **[fwlib-deps.md — .mk 檔的角色](fwlib-deps.md#mk-檔的角色標準系列)**

---

## startup .s 與 linker.ld patch

複製後套用以下 patch：

- `"w"` → `"aw",%nobits`（SHF_ALLOC，讓 `--print-memory-usage` 計入 RAM）
- `Heap_Size = 0` → `MIN_HEAP_SIZE`（確保 malloc 可用）
- `patchLdMemory()`：填入 PDSC / Settings.ini 的正確 RAM/Flash 大小，再呼叫 `patchLdStackSections()`

各路徑 patch 函式對照表與 49x heap/stack 設計原則  
→ **[ARCHITECTURE.md — Startup / Linker Script Patch 函式](../ARCHITECTURE.md#startup--linker-script-patch-函式)**  
→ **[linker-startup.md](linker-startup.md)**

---

## FWLib bat 整合

`_CreateProjectConfig.bat` 已加入 `HT32_VSCode` 支援：以 gsar 替換 `project.meta.json` 與 `project.settings.json` 中的 placeholder，可在 FWLib example 目錄下直接產生專案，不需要 extension wizard。  
→ **[fwlib-bat-integration.md](fwlib-bat-integration.md)**

---

## MCU RAM / Flash 大小查詢順序

1. `conf/Settings.ini` `[SRAM]` 區段（`lookupSramFromSettings`）→ 僅 RAM
2. bundled PDSC（`lookupMemoryFromPdsc`）→ RAM + Flash
3. template linker.ld 原始 placeholder

→ **[settings-ini.md](settings-ini.md)**

---

## 多系列與 FPU 判斷

`detectFpuPresentFromHeader()` 掃 device header 判斷是否有硬體 FPU；結果影響 Makefile `-mfpu` / `-mfloat-abi`、compile_commands.json、project.settings.json 中的 `fpu` 欄位。  
→ **[fpu_present.md](fpu_present.md)**
