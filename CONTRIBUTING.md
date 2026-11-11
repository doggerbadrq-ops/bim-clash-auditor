# Contributing to BIM Clash Auditor

Thank you for your interest in improving **BIM Clash Auditor**! Contributions from the openBIM / AEC developer community are warmly welcomed.

## Development Setup

### 1. Web 3D Viewer (`web/`)
- Node.js 20+
- Install dependencies & start dev server:
  ```bash
  cd web
  npm install
  npm run dev
  ```
- Type-check and build:
  ```bash
  npm run build
  ```

### 2. Desktop Shell (`desktop/`)
- Windows 10/11 + .NET 10 SDK + WebView2 Runtime
- Build & run:
  ```bash
  cd desktop
  dotnet build -c Release
  ```

### 3. BCF Report Generator CLI (`tools/bcf-report/`)
- Python 3.10+
- Install dependencies:
  ```bash
  cd tools/bcf-report
  pip install -r requirements.txt
  ```

## Security & Privacy Guidelines
- Never commit proprietary `.ifc`, `.bcf`, `.bcfzip`, `.rvt`, or `.dwg` client models.
- Never commit API keys, tokens, or local machine paths.

## Pull Request Process
1. Fork the repository and create your feature branch (`git checkout -b feat/your-feature`).
2. Verify `npm run build` passes without TypeScript errors.
3. Submit a clear Pull Request describing the BIM workflow or technical bug solved.
