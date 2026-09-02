# FLASH Partial Lock — 雙專案 symdefs 轉換

## 範例位置

```
HT32_STD_4xxxx_FWLib\example\FMC\
  FLASH_PartialLock_Project_l0\   ← 產生 symbol linker script
  FLASH_PartialLock_Project_l1\   ← 消費 symbol linker script
```

---

## Keil 原始機制

### L0 — 輸出符號定義

`MDK_ARMv537\Project_42386.uvprojx` 的 `<LDads><Misc>`：

```
--entry Reset_Handler --symdefs=calculate_symbol_MDKv537.o
```

Keil linker 在連結完成後，將所有 public 符號（位址 + 名稱）寫入
`calculate_symbol_MDKv537.o`，使用 **Keil 私有格式**（非標準 ELF）。

### L1 — 輸入符號定義

`MDK_ARMv537\Project_42386.uvprojx` 的 User group：

```xml
<FileName>calculate_symbol_MDKv537.o</FileName>
<FileType>3</FileType>   <!-- Keil 把它當 linker input -->
<FilePath>..\calculate_symbol_MDKv537.o</FilePath>
```

Keil linker 讀取這個私有格式，取得 L0 各符號的 Flash 位址，
讓 L1 的 code 可以呼叫 L0 已燒入 Flash 中的函數。

### HT32-IDE 原始機制

HT32-IDE 不使用私有格式，直接提供標準 GNU LD 格式的 symbol 定義檔：

```
FLASH_PartialLock_Project_l1\calculate_symbol_GNU.ld
```

內容格式：
```ld
CalculateTest = 0x00004018;
S32Sum = 0x00004000;
```

L1 的 HT32-IDE project 將此 `.ld` 加入 linker input（Other objects）。

---

## GNU ARM 對應方案

Extension 偵測到 `--symdefs=xxx.o` 時，採用 **Method B（`.ld` 輸出）**，
與 HT32-IDE 的 `calculate_symbol_GNU.ld` 作法保持一致。

### L0 轉換

Extension 偵測 `<LDads><Misc>` 中的 `--symdefs=xxx.o`，執行：

1. 在 `outDirAbs`（build-gen 目錄）產生 `gen_syms_ld.bat`
2. 將 `postBuildCmd` 設為呼叫此 bat

`gen_syms_ld.bat` 內容：

```bat
@echo off
set "ELF=%~dp0build\HT32.elf"
set "OUT=%~dp0build\calculate_symbol_MDKv537.ld"
echo Generating symbol linker script "%OUT%" from "%ELF%" ...
powershell -NoProfile -Command ^
  "$out = (& 'arm-none-eabi-nm' '--defined-only' '--extern-only' '-n' '%ELF%') | ^
   ForEach-Object { $f=$_.Trim() -split '\s+'; if($f.Count -eq 3){ ^
     $f[2]+' = 0x'+$f[0]+';'} }; ^
   [IO.File]::WriteAllLines('%OUT%', $out, [Text.Encoding]::ASCII)"
```

- `--defined-only`：排除未定義符號（外部引用，無位址）
- `--extern-only`：排除 static/local 符號，只保留 public（與 Keil `--symdefs` 行為一致）
- `%~dp0`：bat 自身所在目錄，不依賴 cwd

產生的 `.ld` 格式（與 HT32-IDE `calculate_symbol_GNU.ld` 相同結構）：

```ld
CalculateTest = 0x00004018;
S32Sum = 0x00004000;
```

`postBuildCmd` 儲存於 `project.settings.json`，執行時機在 `make all` 完成後。

### L1 轉換

- `calculate_symbol_MDKv537.o`（FileType=3）已被 extension 跳過並發出 prebuilt warning
  （Keil 私有格式，GNU LD 無法讀取）
- **使用者需在 L0 build 完成後**，將產生的 `calculate_symbol_MDKv537.ld` 加入 L1 project：
  - 右鍵 L1 project tree 中任一 group → **Add Existing Files** → 選 `.ld` 檔
  - Extension 自動將其加入 `project.meta.json` 的 `linkerScripts[]`，Makefile 以 `-T` 帶入

---

## 建構順序

```
1. Build L0  →  build/HT32.elf
              →  build/calculate_symbol_MDKv537.ld  (post-build 產生)

2. Build L1  →  linker 透過 -T calculate_symbol_MDKv537.ld 解析 L0 符號位址
              →  build/HT32.elf
```

L0 必須先 build，L1 才能正確解析符號位址。

---

## Method A vs Method B 比較

| | Method A | Method B（採用）|
|---|---|---|
| GNU 選項 | `-Wl,--just-symbols=L0.elf` | `-Wl,-T,L0.ld` |
| 需要 | L0 ELF 可存取 | L0 build 後產生 `.ld` |
| 可 commit 進版控 | 否（ELF 為 binary） | 是（純文字） |
| 與 HT32-IDE 一致 | 否 | 是（`calculate_symbol_GNU.ld`）|
| L1 設定方式 | linker flag | Add Existing Files / linkerScripts[] |
