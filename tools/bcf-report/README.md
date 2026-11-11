# BCF Report Generator (`bcf_to_report.py`)

Command-line utility to extract all topics, snapshots, Revit Element IDs, IFC GUIDs, and comment history from standard `.bcf` / `.bcfzip` files into a formatted Word (`.docx`) and PDF clash audit report.

## Usage

```bash
pip install -r requirements.txt
python bcf_to_report.py path/to/clashes.bcfzip -o Clash_Report.docx --pdf
```

## Validation and error behavior

```bash
python -m pip install -r requirements-dev.txt
python -m py_compile bcf_to_report.py
python -m pytest -q
```

BCF 2.1 and 3.0 comment containers are supported. Snapshots and viewpoints follow
markup references when provided. Unsafe or missing attachment references produce
warnings. Malformed topic XML is skipped with a warning; empty or wholly unreadable
archives fail instead of producing a misleading empty report. Corrupt snapshots
produce a placeholder while the remaining report content is preserved.

The parser accepts a file path or a binary stream. Tests use in-memory synthetic
ZIPs and temporary outputs. PDF conversion requires Windows, Microsoft Word and
pywin32; tests mock COM to exercise cleanup on success and failure. They do not
validate PDF layout or require Word on CI. Both DOCX and PDF output paths should
refer to new files unless replacement is intentional.
