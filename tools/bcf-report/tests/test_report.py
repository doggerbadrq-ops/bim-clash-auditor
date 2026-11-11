"""Synthetic ZIP fixtures only; no project data or binary fixtures are committed."""
import io
from contextlib import nullcontext
import sys
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from docx import Document
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bcf_to_report import parse_bcf, export_docx, convert_docx_to_pdf

TOPIC = '<Topic Guid="synthetic-topic" TopicStatus="Open"><Title>Beam &amp; duct</Title>'
COMMENT = '<Comment><Author>Test auditor</Author><Comment>Check clearance</Comment></Comment>'

def archive(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    stream.seek(0)
    return stream

@pytest.mark.parametrize('version', ['2.1', '3.0'])
def test_comments_and_entities(version, tmp_path):
    markup = (f'<Markup>{TOPIC}</Topic>{COMMENT}</Markup>' if version == '2.1' else
              f'<Markup>{TOPIC}<Comments>{COMMENT}</Comments></Topic></Markup>')
    topics = parse_bcf(archive({'topic/markup.bcf': markup}), str(tmp_path))
    assert topics[0]['title'] == 'Beam & duct'
    assert len(topics[0]['comments']) == 1
    assert topics[0]['comments'][0]['text'] == 'Check clearance'

@pytest.mark.parametrize('files', [{}, {'topic/markup.bcf': '<broken>'}])
def test_empty_or_malformed_fails(files, tmp_path):
    with pytest.warns(UserWarning, match='malformed') if files else nullcontext():
        with pytest.raises(ValueError, match='no readable'):
            parse_bcf(archive(files), str(tmp_path))

def test_invalid_zip(tmp_path):
    with pytest.raises(zipfile.BadZipFile):
        parse_bcf(io.BytesIO(b'not a zip'), str(tmp_path))

def test_referenced_snapshot_and_nested_folder(tmp_path):
    markup = f'<Markup>{TOPIC}</Topic><Viewpoints><Snapshot>chosen.png</Snapshot></Viewpoints></Markup>'
    topics = parse_bcf(archive({'nested/topic/markup.xml': markup,
                              'nested/topic/first.png': b'wrong',
                              'nested/topic/chosen.png': b'chosen'}), str(tmp_path))
    assert Path(topics[0]['snapshot']).read_bytes() == b'chosen'

def test_unsafe_reference_is_not_read(tmp_path):
    markup = f'<Markup>{TOPIC}</Topic><Viewpoints><Snapshot>../outside.png</Snapshot></Viewpoints></Markup>'
    with pytest.warns(UserWarning, match='unsafe'):
        topics = parse_bcf(archive({'topic/markup.bcf': markup, 'outside.png': b'outside'}), str(tmp_path))
    assert topics[0]['snapshot'] is None
    assert not list(tmp_path.iterdir())

def test_docx_content_and_corrupt_snapshot(tmp_path):
    topics = parse_bcf(archive({'topic/markup.bcf': f'<Markup>{TOPIC}</Topic></Markup>',
                               'topic/snapshot.png': b'not an image'}), str(tmp_path))
    output = tmp_path / 'report.docx'
    with pytest.warns(UserWarning, match='unreadable'):
        export_docx(topics, 'synthetic.bcfzip', str(output))
    doc = Document(output)
    text = ' '.join(cell.text for table in doc.tables for row in table.rows for cell in row.cells)
    assert 'Beam & duct' in text
    assert '[Snapshot unavailable]' in text

@pytest.mark.parametrize('failure', ['startup', 'export', None])
def test_com_cleanup(monkeypatch, failure):
    com = MagicMock()
    word = MagicMock()
    dispatch = MagicMock(return_value=word)
    if failure == 'startup': dispatch.side_effect = RuntimeError('startup')
    if failure == 'export': word.Documents.Open.return_value.ExportAsFixedFormat.side_effect = RuntimeError('export')
    client = SimpleNamespace(DispatchEx=dispatch)
    monkeypatch.setitem(sys.modules, 'pythoncom', com)
    monkeypatch.setitem(sys.modules, 'win32com', SimpleNamespace(client=client))
    monkeypatch.setitem(sys.modules, 'win32com.client', client)
    if failure:
        with pytest.raises(RuntimeError): convert_docx_to_pdf('synthetic.docx', 'synthetic.pdf')
    else:
        convert_docx_to_pdf('synthetic.docx', 'synthetic.pdf')
    com.CoUninitialize.assert_called_once()
    if failure != 'startup':
        word.Quit.assert_called_once()
        word.Documents.Open.return_value.Close.assert_called_once_with(False)
