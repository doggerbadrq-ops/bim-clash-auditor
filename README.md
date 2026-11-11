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
  - Interactive 3D camera focusing on clash viewpoints, component highlighting by IFC GUID, status filtering, and snapshot previews.
  - Update issue statuses and export `.bcfzip` packages directly from the browser; imported archives retain their original attachments and version.
- **Native Windows Desktop Host (`desktop/`)**
  - Lightweight `.NET 10` (`net10.0-windows`) WPF shell embedding Microsoft Edge WebView2 with a per-user browser profile and an enlarged 4 GB JS heap limit for heavy federated IFC models.
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

**Prerequisites:** Node.js 22.12+ (22 LTS recommended) and npm.

```bash
cd web
npm ci
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
   npm ci
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

## Development checks

Run from the corresponding module directory:

```bash
# web/
npm ci
npm test
npm run build

# tools/bcf-report/
python -m pip install -r requirements-dev.txt
python -m py_compile bcf_to_report.py
python -m pytest -q

# desktop/ (Windows; copy web/dist to desktop/web-dist first)
dotnet build BIMClashAuditor.csproj -c Release
```

CI runs web and Python regression tests before packaging the web application and
building the Windows host. Tests generate small synthetic ZIP/XML fixtures in
memory. Temporary report outputs are generated at test time, never committed.

### Compatibility and current limits

- The BCF reader handles the different 2.1 and 3.0 comment/label containers.
  The viewer uses the first declared viewpoint and its referenced snapshot; it
  does not yet provide a selector for all viewpoints. Missing references do not
  silently resolve to a different declared attachment.
- Imported exports retain the original ZIP entries and update topic statuses.
  Parsing is not full XSD validation. Clipping planes, bitmaps and all BCF
  visibility rules are not yet replayed by the viewer.
- Camera coordinates use the reference model coordination matrix consistently.
  Perspective FOV and orthographic scale are supported. BCF files exported in a
  different local coordinate frame require matching IFC coordinates; coordinate
  frames are no longer guessed from proximity to the building.
- IFC batches are loaded sequentially. Failed parsing of a same-name replacement
  preserves the previously loaded model. Large models still depend on available
  browser/GPU memory; no fixed maximum model size is guaranteed.
- Unit tests cover BCF parsing/export, camera transforms/framing, model lifecycle,
  report content and COM cleanup. They do not replace interactive WebGL tests,
  real IFC stress testing, or Word rendering checks on Windows.
- The current upstream That Open/Three.js combination emits Vite warnings for
  optional `TSL`/`NodeMaterial` exports. The IFC runtime also produces a large
  bundle. These warnings remain visible and are not suppressed; a successful
  build alone does not validate every rendering path.

BCF structures are based on the buildingSMART
[2.1 schema](https://github.com/buildingSMART/BCF-XML/tree/release_2_1/Schemas) and
[3.0 schema](https://github.com/buildingSMART/BCF-XML/tree/release_3_0/Schemas).
