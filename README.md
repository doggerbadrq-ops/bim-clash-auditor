# BIM Clash Auditor

> **Open-source federated 3D IFC & BCF clash inspection platform** with an interactive Three.js / That Open Components web viewer, a native Windows WPF + WebView2 desktop host, and an automated BCF-to-Word/PDF audit report generator.

[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=github-actions&logoColor=white)](.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenBIM](https://img.shields.io/badge/OpenBIM-IFC%20%7C%20BCF%202.1%2F3.0-orange)](https://www.buildingsmart.org/)

---

## Key Features

- **Multi-Model IFC Federation (`web/`)**
  - Load multiple discipline IFC models simultaneously (Architecture, Structure, MEP, HVAC, Fire Protection, etc.) without overwriting previously loaded models.
  - Client-side WebAssembly parsing powered by `web-ifc` and `@thatopen/components` (no model upload to external servers required).
- **BCF 2.1 / 3.0 Clash & Issue Auditing (`web/`)**
  - Import `.bcf` / `.bcfzip` archives exported from Navisworks, Solibri, BIMcollab, or Dalux.
  - Interactive 3D camera focusing on clash viewpoints, component selection/isolation by IFC GUID, status filtering, and snapshot previews.
  - Create new issues and export updated `.bcfzip` packages directly from the browser.
- **Native Windows Desktop Host (`desktop/`)**
  - Lightweight `.NET 10` (`net10.0-windows`) WPF shell embedding Microsoft Edge WebView2 with `SharedArrayBuffer` and an enlarged 4 GB JS heap limit for heavy federated IFC models.
- **Automated BCF Report Generator (`tools/bcf-report/`)**
  - Python CLI that parses `.bcf` / `.bcfzip` issues, extracts viewpoints, snapshots, involved IFC GUIDs, statuses, and comments, and generates structured `.docx` (and optional `.pdf` via Microsoft Word COM on Windows) audit reports.

---

## Repository Structure

```text
bim-clash-auditor/
├── web/                  # Vite + TypeScript + Three.js + @thatopen/components 3D IFC/BCF viewer
├── desktop/              # Windows WPF + WebView2 desktop wrapper (.NET 10)
├── tools/
│   └── bcf-report/       # Python CLI to convert .bcf / .bcfzip files into .docx / .pdf reports
├── .github/
│   ├── workflows/        # CI pipeline (TypeScript build, Python CLI check, WPF build)
│   └── ISSUE_TEMPLATE/   # Bug & feature request templates
├── CONTRIBUTING.md
└── LICENSE
```

---

## Getting Started

### 1. Web Viewer (`web/`)

**Prerequisites:** Node.js 20+ (recommended 22 LTS) and npm.

```bash
cd web
npm install
npm run dev
```

To create a production bundle in `web/dist/`:

```bash
npm run build
```

> Load any local `.ifc` models and `.bcf` / `.bcfzip` packages via drag-and-drop or the toolbar. Sample demo clash issues are included for quick testing.

---

### 2. Automated BCF Report CLI (`tools/bcf-report/`)

**Prerequisites:** Python 3.10+

```bash
cd tools/bcf-report
pip install -r requirements.txt
python bcf_to_report.py path/to/clashes.bcf --output audit_report.docx
```

On Windows with Microsoft Word installed, pass `--pdf` to export a companion PDF alongside the `.docx` report:

```bash
python bcf_to_report.py path/to/clashes.bcf --output audit_report.docx --pdf
```

See [tools/bcf-report/README.md](tools/bcf-report/README.md) for all CLI flags.

---

### 3. Windows Desktop Host (`desktop/`)

**Prerequisites:** Windows 10/11, [.NET 10 SDK](https://dotnet.microsoft.com/), and Microsoft Edge WebView2 Runtime.

1. Build the web frontend first and copy `web/dist/` to `desktop/web-dist/`:
   ```powershell
   cd web
   npm install
   npm run build
   New-Item -ItemType Directory -Force ..\desktop\web-dist | Out-Null
   Copy-Item -Recurse -Force dist\* ..\desktop\web-dist\
   ```
2. Build or run the WPF host:
   ```powershell
   cd ..\desktop
   dotnet build -c Release
   dotnet run -c Release
   ```

---

## Open Standards Supported

- **IFC** (`IFC2x3`, `IFC4`) via `web-ifc`
- **BCF** (`2.1`, `3.0`) markup, viewpoints, bitmaps/snapshots, and component selection (`IfcGuid`)

---

## Contributing

Contributions, bug reports, and OpenBIM workflow ideas are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Released under the [MIT License](LICENSE).
