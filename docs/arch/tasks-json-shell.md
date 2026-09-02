# tasks.json Shell 類型設計決策

## 問題

工作區路徑含有 PowerShell 特殊字元（如 `(~!%^)`）時，VS Code 的 `type: 'shell'` task 會把整條指令拼成字串丟給 PowerShell 解析，雙引號也擋不住這些字元：

```
make -j -C "E:\FWLib_V1.21.1(~!%^)\Project\build-gen"
~!%^ : 無法辨識 '~!%^' 詞彙...
```

## 兩種解法比較

| 解法 | 做法 | 適用情境 |
|---|---|---|
| `type: 'process'` | VS Code 直接用 `child_process.spawn(command, args)` 啟動，args 為陣列，完全不經過 shell | 指令固定、args 為純字串陣列 |
| `type: 'shell'` + `quoting: 'strong'` | VS Code 把每個值包成單引號（PowerShell 單引號內所有字元均為字面值） | 需要 shell 功能（管道、`&`、環境變數展開）或指令不固定 |

PowerShell 單引號保護範圍：`$`、`(`、`)`、`!`、`%`、`^`、`~`、`[`、`]` 全部字面值；唯一例外是路徑本身含 `'`（Windows 路徑幾乎不可能）。

## 各 Task 的選擇

| Task | 類型 | 理由 |
|---|---|---|
| Build / Compile / Clean | `type: 'process'` | args 為純字串陣列，完全不需要 shell；比 `quoting: 'strong'` 更簡單且更根本 |
| Kill OpenOCD | `type: 'shell'` + `cmd.exe` | 指令含 `2>nul & exit 0`（shell 語法），且無使用者路徑，無特殊字元風險 |
| Post-Build | `type: 'shell'` | 使用者自訂指令，必須支援任意 bat / shell 語法，不可改 |
| pyOCD Download | `type: 'shell'` + `quoting: 'strong'` | 所有 exe 路徑與 args 皆以 `{ value, quoting: 'strong' }` 包裝，單引號保護已足夠 |
| OpenOCD Download / OpenOCD-keep | `type: 'shell'` + `quoting: 'strong'` | 同上 |

## 為何 Make task 不用 `quoting: 'strong'`

兩種方式均可解決特殊字元問題。選 `type: 'process'` 的原因：

1. **更簡單**：`args` 維持 `string[]`，不需要把每個元素包成 `{ value, quoting }` 物件
2. **更根本**：完全不經過 shell，不存在「某個 arg 忘記加 quoting」的隱患

pyOCD / OpenOCD task 維持 `type: 'shell'` + `quoting: 'strong'` 是因為這些 task 在 HLM 功能開發時就以此方式寫成，quoting 保護已足夠，無額外修改必要。
