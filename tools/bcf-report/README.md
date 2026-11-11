# BCF Report Generator (`bcf_to_report.py`)

Command-line utility to extract all topics, snapshots, Revit Element IDs, IFC GUIDs, and comment history from standard `.bcf` / `.bcfzip` files into a formatted Word (`.docx`) and PDF clash audit report.

## Usage

```bash
pip install -r requirements.txt
python bcf_to_report.py path/to/clashes.bcfzip -o Clash_Report.docx --pdf
```
