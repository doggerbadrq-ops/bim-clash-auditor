#!/usr/bin/env python3
"""
BCF to Executive Word (.docx) & PDF Report Generator.
Parses standard buildingSMART BCF 2.1 / 3.0 packages (.bcf, .bcfzip) and produces
a formatted clash coordination report ordered by severity, including snapshots,
Revit Element IDs, IFC GUIDs, and comment traceability.
"""

import argparse
import os
import re
import shutil
import tempfile
import zipfile
import warnings
import xml.etree.ElementTree as ET
from datetime import datetime

from docx import Document
from docx.image.exceptions import UnrecognizedImageError, UnexpectedEndOfFileError
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Inches, Pt, RGBColor


def set_cell_background(cell, hex_color: str) -> None:
    shading_xml = f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>'
    cell._tc.get_or_add_tcPr().append(parse_xml(shading_xml))


def set_cell_margins(cell, top=100, bottom=100, left=140, right=140) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = OxmlElement("w:tcMar")
    for side, val in [("top", top), ("bottom", bottom), ("left", left), ("right", right)]:
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tc_mar.append(node)
    tc_pr.append(tc_mar)


def set_table_borders(table, color="D0D7DE", sz="4", val="single") -> None:
    tbl_pr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideV w:val="none"/>'
        f'  <w:left w:val="none"/>'
        f'  <w:right w:val="none"/>'
        f"</w:tblBorders>"
    )
    tbl_pr.append(borders)


def set_card_borders(table, color="CBD5E1") -> None:
    tbl_pr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'  <w:left w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'  <w:right w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        f'  <w:insideV w:val="none"/>'
        f"</w:tblBorders>"
    )
    tbl_pr.append(borders)


def detect_discipline(text: str) -> str:
    lower = text.lower()
    if any(k in lower for k in ["comunicac", "telecom", "data", "cctv", "rack", "fiber", "tic"]):
        return "Communications / IT"
    if any(k in lower for k in ["estruct", "struct", "beam", "column", "slab", "viga", "columna", "losa"]):
        return "Structural"
    if any(k in lower for k in ["sanitari", "plumbing", "pipe", "drain", "water", "pvc", "tuber"]):
        return "Plumbing"
    if any(k in lower for k in ["eléctric", "electr", "power", "lighting", "conduit", "panel", "tablero"]):
        return "Electrical"
    if any(k in lower for k in ["mecanic", "hvac", "duct", "climate", "aire"]):
        return "Mechanical / HVAC"
    if any(k in lower for k in ["arquitect", "arch", "door", "wall", "window", "tabique"]):
        return "Architecture"
    return "General"


def parse_bcf(bcf_path: str, temp_img_dir: str) -> list[dict]:
    """Read topics from a path or binary stream; warn about invalid optional content.

    Snapshots are written only to generated filenames in temp_img_dir.
    Empty or entirely unreadable archives raise ValueError.
    """
    topics = []
    with zipfile.ZipFile(bcf_path) as zf:
        markup_files = sorted([f for f in zf.namelist() if f.lower().endswith(("/markup.bcf", "/markup.xml"))])
        for idx, markup_file in enumerate(markup_files, 1):
            folder = markup_file.rsplit("/", 1)[0]
            try:
                root = ET.fromstring(zf.read(markup_file))
            except ET.ParseError:
                warnings.warn(f"Skipping malformed markup: {markup_file}", stacklevel=2)
                continue

            topic = root.find("Topic")
            if topic is None:
                warnings.warn(f"Skipping markup without Topic: {markup_file}", stacklevel=2)
                continue

            guid = topic.get("Guid") or folder
            title = (topic.findtext("Title") or f"Issue #{idx}").strip()
            status = topic.get("TopicStatus") or topic.findtext("TopicStatus", "Active")
            priority = topic.findtext("Priority", "Normal")
            desc = (topic.findtext("Description") or "No detailed description provided.").strip()
            author = topic.findtext("CreationAuthor", "BIM Auditor")
            date = (topic.findtext("CreationDate") or "")[:10]
            assigned_to = topic.findtext("AssignedTo", "Unassigned")

            comments = []
            for c in root.findall("Comment") + topic.findall("Comments/Comment"):
                c_text = (c.findtext("Comment") or "").strip()
                if c_text:
                    comments.append({
                        "text": c_text,
                        "author": c.findtext("Author", ""),
                        "date": (c.findtext("Date") or "")[:10],
                    })

            references = root.findall("Viewpoints") + topic.findall("Viewpoints/ViewPoint")
            def referenced_files(tag, extensions):
                names = [ref.findtext(tag) for ref in references if ref.findtext(tag)]
                if names:
                    result = []
                    for name in names:
                        name = name.strip()
                        candidate = f"{folder}/{name}"
                        if ".." in name or "\\" in name or name.startswith("/") or candidate not in zf.namelist():
                            warnings.warn(f"Missing or unsafe {tag} reference", stacklevel=2)
                            continue
                        result.append(candidate)
                    return result
                return sorted(n for n in zf.namelist()
                              if n.startswith(folder + "/") and n.lower().endswith(extensions))

            snap_files = referenced_files("Snapshot", (".png", ".jpg", ".jpeg"))
            saved_snapshot = None
            if snap_files:
                ext = os.path.splitext(snap_files[0])[1]
                snap_path = os.path.join(temp_img_dir, f"snap_{idx}{ext}")
                with open(snap_path, "wb") as sf:
                    sf.write(zf.read(snap_files[0]))
                saved_snapshot = snap_path

            vp_files = referenced_files("Viewpoint", (".bcfv",))
            ifc_guids = set()
            revit_ids = set()

            text_corpus = f"{title} {desc} " + " ".join(c["text"] for c in comments)
            for m in re.finditer(r"\b(?:ID[:#\s]*|Element[:#\s]*|Revit[:#\s]*)?(\d{5,8})\b", text_corpus):
                revit_ids.add(m.group(1))

            for v_file in vp_files:
                try:
                    v_root = ET.fromstring(zf.read(v_file))
                    for comp in v_root.findall(".//Selection/Component") + v_root.findall('.//Component[@Selected="true"]'):
                        g = comp.get("IfcGuid")
                        if g:
                            ifc_guids.add(g)
                        aid = comp.findtext("AuthoringToolId") or comp.get("AuthoringToolId") or comp.get("OriginatingSystemId")
                        if aid and re.match(r"^\d+$", aid):
                            revit_ids.add(aid)

                    vis = v_root.find(".//Visibility")
                    if vis is not None and vis.get("DefaultVisibility", "").lower() == "false":
                        for comp in vis.findall(".//Exceptions/Component"):
                            g = comp.get("IfcGuid")
                            if g:
                                ifc_guids.add(g)
                            aid = comp.findtext("AuthoringToolId") or comp.get("AuthoringToolId") or comp.get("OriginatingSystemId")
                            if aid and re.match(r"^\d+$", aid):
                                revit_ids.add(aid)
                except ET.ParseError:
                    warnings.warn(f"Skipping malformed viewpoint: {v_file}", stacklevel=2)

            topics.append({
                "index": idx,
                "guid": guid,
                "title": title,
                "status": status,
                "priority": priority,
                "discipline": detect_discipline(text_corpus),
                "desc": desc,
                "author": author,
                "date": date,
                "assigned_to": assigned_to,
                "comments": comments,
                "snapshot": saved_snapshot,
                "ifc_guids": sorted(ifc_guids),
                "revit_ids": sorted(revit_ids),
            })

    if not topics:
        raise ValueError("The archive contains no readable BCF topics.")
    return topics


def export_docx(topics: list[dict], source_name: str, output_docx: str) -> None:
    priority_order = {"Critical": 1, "High": 2, "Normal": 3, "Low": 4}
    topics_sorted = sorted(topics, key=lambda t: (priority_order.get(t["priority"], 9), t["index"]))

    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    normal_style = doc.styles["Normal"]
    normal_style.font.name = "Calibri"
    normal_style.font.size = Pt(10)
    normal_style.font.color.rgb = RGBColor(0x2D, 0x37, 0x48)

    # Cover Header
    p_pre = doc.add_paragraph()
    p_pre.paragraph_format.space_before = Pt(24)
    r_pre = p_pre.add_run("OPENBIM COORDINATION & CLASH AUDIT REPORT")
    r_pre.font.bold = True
    r_pre.font.size = Pt(11)
    r_pre.font.color.rgb = RGBColor(0x4A, 0x55, 0x68)

    p_title = doc.add_paragraph()
    r_title = p_title.add_run("BIM Clash & Issue Summary (BCF)")
    r_title.font.bold = True
    r_title.font.size = Pt(22)
    r_title.font.color.rgb = RGBColor(0x1A, 0x2B, 0x49)

    meta_table = doc.add_table(rows=3, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_rows = [
        ("Source BCF File:", source_name),
        ("Generated On:", datetime.now().strftime("%Y-%m-%d %H:%M")),
        ("Total Issues:", f"{len(topics_sorted)} Issues Extracted"),
    ]
    for idx, (k, v) in enumerate(meta_rows):
        row = meta_table.rows[idx]
        row.cells[0].paragraphs[0].add_run(k).font.bold = True
        row.cells[1].paragraphs[0].add_run(v)
        for c in row.cells:
            set_cell_background(c, "F8FAFC" if idx % 2 == 0 else "FFFFFF")
            set_cell_margins(c, 80, 80, 100, 100)
    set_table_borders(meta_table, "CBD5E1")

    # Summary Matrix
    doc.add_page_break()
    p_mat = doc.add_paragraph()
    r_mat = p_mat.add_run("Consolidated Clash Matrix")
    r_mat.font.bold = True
    r_mat.font.size = Pt(15)
    r_mat.font.color.rgb = RGBColor(0x1A, 0x2B, 0x49)

    tbl = doc.add_table(rows=1 + len(topics_sorted), cols=6)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    widths = [Inches(0.55), Inches(2.25), Inches(1.25), Inches(0.85), Inches(0.85), Inches(1.15)]
    headers = ["#", "Title", "Discipline", "Priority", "Status", "Element IDs"]

    for i, h in enumerate(headers):
        cell = tbl.rows[0].cells[i]
        cell.width = widths[i]
        set_cell_background(cell, "1A2B49")
        set_cell_margins(cell, 80, 80, 60, 60)
        r = cell.paragraphs[0].add_run(h)
        r.font.bold = True
        r.font.size = Pt(8.5)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    for idx, t in enumerate(topics_sorted, 1):
        row = tbl.rows[idx]
        bg = "F8FAFC" if idx % 2 == 0 else "FFFFFF"
        vals = [
            f"#{t['index']:02d}",
            t["title"],
            t["discipline"],
            t["priority"],
            t["status"],
            ", ".join(t["revit_ids"][:3]) if t["revit_ids"] else "-",
        ]
        for i, v in enumerate(vals):
            cell = row.cells[i]
            cell.width = widths[i]
            set_cell_background(cell, bg)
            set_cell_margins(cell, 55, 55, 60, 60)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(v)
            r.font.size = Pt(8.0)
            if i == 3 and t["priority"] == "Critical":
                r.font.bold = True
                r.font.color.rgb = RGBColor(0xD3, 0x2F, 0x2F)
    set_table_borders(tbl, "E2E8F0")

    # Individual Issue Cards
    doc.add_page_break()
    for idx, t in enumerate(topics_sorted, 1):
        card = doc.add_table(rows=5, cols=2)
        card.alignment = WD_TABLE_ALIGNMENT.CENTER
        card.autofit = False
        set_card_borders(card, "CBD5E1")

        # Row 0: Header
        c0_a, c0_b = card.rows[0].cells[0], card.rows[0].cells[1]
        c0_a.width, c0_b.width = Inches(5.3), Inches(1.6)
        set_cell_background(c0_a, "1A2B49")
        set_cell_background(c0_b, "1A2B49")
        set_cell_margins(c0_a, 90, 90, 100, 100)
        set_cell_margins(c0_b, 90, 90, 100, 100)

        r_tit = c0_a.paragraphs[0].add_run(f"ISSUE #{t['index']:02d}: {t['title']}")
        r_tit.font.bold = True
        r_tit.font.size = Pt(10.5)
        r_tit.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

        p_b = c0_b.paragraphs[0]
        p_b.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_b = p_b.add_run(f"[{t['priority'].upper()}]")
        r_b.font.bold = True
        r_b.font.color.rgb = RGBColor(0xFF, 0xD7, 0x00) if t["priority"] in ("Critical", "High") else RGBColor(0xE2, 0xE8, 0xF0)

        # Row 1: Snapshot
        c1 = card.rows[1].cells[0]
        c1.merge(card.rows[1].cells[1])
        c1.width = Inches(6.9)
        set_cell_background(c1, "F8FAFC")
        p_img = c1.paragraphs[0]
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if t["snapshot"] and os.path.exists(t["snapshot"]):
            try:
                p_img.add_run().add_picture(t["snapshot"], width=Inches(5.5))
            except (ValueError, OSError, UnrecognizedImageError, UnexpectedEndOfFileError):
                warnings.warn("Snapshot is unreadable; report continues without it.", stacklevel=2)
                p_img.add_run("[Snapshot unavailable]")
        else:
            p_img.add_run("[No snapshot available]")

        # Row 2: Metadata
        c2_a, c2_b = card.rows[2].cells[0], card.rows[2].cells[1]
        c2_a.width, c2_b.width = Inches(3.45), Inches(3.45)
        c2_a.paragraphs[0].add_run(f"Discipline: {t['discipline']}  |  Status: {t['status']}")
        c2_b.paragraphs[0].add_run(f"Author: {t['author']} ({t['date']})")

        # Row 3: Identifiers
        c3 = card.rows[3].cells[0]
        c3.merge(card.rows[3].cells[1])
        c3.width = Inches(6.9)
        c3.paragraphs[0].add_run(
            f"Revit Element IDs: {', '.join(t['revit_ids']) if t['revit_ids'] else 'N/A'}   |   "
            f"IFC GUIDs: {', '.join(t['ifc_guids'][:2]) if t['ifc_guids'] else 'N/A'}"
        )

        # Row 4: Description & Comments
        c4 = card.rows[4].cells[0]
        c4.merge(card.rows[4].cells[1])
        c4.width = Inches(6.9)
        set_cell_background(c4, "F8FAFC")
        c4.paragraphs[0].add_run(f"Description: {t['desc']}")
        for cm in t["comments"]:
            p_cm = c4.add_paragraph()
            p_cm.paragraph_format.left_indent = Inches(0.2)
            p_cm.add_run(f"• [{cm['date']}] {cm['author']}: {cm['text']}")

        doc.add_paragraph()
        if idx % 2 == 0 and idx < len(topics_sorted):
            doc.add_page_break()

    doc.save(output_docx)


def convert_docx_to_pdf(input_docx: str, output_pdf: str) -> None:
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    word = None
    doc_word = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc_word = word.Documents.Open(os.path.abspath(input_docx))
        doc_word.ExportAsFixedFormat(
            OutputFileName=os.path.abspath(output_pdf),
            ExportFormat=17,
            OpenAfterExport=False,
            OptimizeFor=0,
            CreateBookmarks=1,
            DocStructureTags=True,
        )
    finally:
        try:
            if doc_word is not None:
                doc_word.Close(False)
        finally:
            try:
                if word is not None:
                    word.Quit()
            finally:
                pythoncom.CoUninitialize()


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a BCF (.bcf/.bcfzip) package to Word (.docx) and optional PDF.")
    parser.add_argument("bcf_file", help="Path to input .bcf or .bcfzip file")
    parser.add_argument("-o", "--output", default="BCF_Clash_Report.docx", help="Output .docx file path")
    parser.add_argument("--pdf", action="store_true", help="Also export to PDF (Windows with Microsoft Word required)")
    args = parser.parse_args()

    temp_dir = tempfile.mkdtemp(prefix="bcf_report_")
    try:
        topics = parse_bcf(args.bcf_file, temp_dir)
        export_docx(topics, os.path.basename(args.bcf_file), args.output)
        print(f"DOCX generated: {args.output} ({len(topics)} issues)")
        if args.pdf:
            pdf_path = os.path.splitext(args.output)[0] + ".pdf"
            convert_docx_to_pdf(args.output, pdf_path)
            print(f"PDF generated: {pdf_path}")
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        parser.exit(1, f"Error: {exc}\n")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
