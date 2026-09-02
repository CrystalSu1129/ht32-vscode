# Third-Party Licenses

This extension bundles or distributes the following third-party components.

---

## OpenOCD

**Bundled binary:** `openocd/bin/openocd.exe` (Windows x64)

> Copyright (C) 2004–2024 The OpenOCD Project
> https://openocd.org

Licensed under the **GNU General Public License v2.0 or later**. Source code is available at https://sourceforge.net/p/openocd/code/. This extension distributes an unmodified pre-built binary.

---

## GNU Make

**Bundled binary:** `bin/win32-x64/make.exe` (Windows x64)

> Copyright (C) 1988–2023 Free Software Foundation, Inc.
> https://www.gnu.org/software/make/

Licensed under the **GNU General Public License v3.0 or later**. Source code is available at https://ftp.gnu.org/gnu/make/. This extension distributes an unmodified pre-built binary.

---

## uv

**Bundled binary:** `bin/win32-x64/uv.exe` (Windows x64)

> Copyright (C) 2023 Astral Software Inc.
> https://github.com/astral-sh/uv

Licensed under the **Apache License 2.0**. Used to install and manage pyOCD automatically when not already present on the system.

---

## pyOCD

**Runtime dependency** — installed automatically via uv when not present.

> Copyright (C) 2006–2024 Arm Limited and contributors
> https://github.com/pyocd/pyOCD

Licensed under the **Apache License 2.0**. pyOCD is not bundled; it is installed into the user's environment on first use.

---

## Holtek HT32 Device Family Pack (DFP)

**Bundled assets:** `dfp/Holtek/HT32_DFP/` and `dfp/Holtek/HT32F49xxx_DFP/` —
SVD files, startup files, CMSIS headers, and Flash Loader Modules (FLM/HLM).
Also distributed as CMSIS Pack files (`dfp/*.pack`) for use with pyOCD.

> Copyright (C) Holtek Semiconductor Inc.
> https://www.holtek.com

Distributed under the **Holtek CMSIS Software License Agreement** included in
each DFP. Permitted for use with Holtek HT32 devices in development tools and IDEs.

---

## fast-xml-parser

**npm runtime dependency** — used internally for parsing Keil `.uvprojx` XML files.

> Copyright (c) 2017 Amit Gupta
> https://github.com/NaturalIntelligence/fast-xml-parser

Licensed under the **MIT License**.

---

## Holtek HT32 OpenOCD MCU Configurations

**Bundled scripts:** `openocd/MCU/*.cfg`, `openocd/scripts/target/HLM*.cfg`

> Copyright (C) Holtek Semiconductor Inc.

Distributed with permission for use with Holtek HT32 devices and the bundled OpenOCD.
