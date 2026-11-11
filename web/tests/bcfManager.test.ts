import { beforeEach, expect, test, vi } from 'vitest';
import JSZip from 'jszip';
import { BcfManager } from '../src/bcf/bcfManager';

const topic = '<Topic Guid="synthetic-topic" TopicStatus="Open"><Title>Beam &amp; duct</Title><CreationAuthor>Test auditor</CreationAuthor>';
const comment = '<Comment Guid="comment"><Comment>Review clearance</Comment></Comment>';
const viewpoint = `<VisualizationInfo><OrthogonalCamera>
<CameraViewPoint><X>10</X><Y>20</Y><Z>30</Z></CameraViewPoint>
<CameraDirection><X>0</X><Y>1</Y><Z>0</Z></CameraDirection>
<CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector>
<ViewToWorldScale>15</ViewToWorldScale></OrthogonalCamera>
<Components><Selection><Component IfcGuid="synthetic-component"/></Selection></Components></VisualizationInfo>`;
async function archive(markup: string, extras: Record<string, string> = {}) {
  const zip = new JSZip();
  zip.file('topic.+/markup.bcf', markup);
  for (const [name, value] of Object.entries(extras)) zip.file(`topic.+/${name}`, value);
  return zip.generateAsync({ type: 'uint8array' });
}
beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:synthetic'), revokeObjectURL: vi.fn(),
  }));
});
for (const version of ['2.1', '3.0']) {
  test(`reads labels and counts comments once in BCF ${version}`, async () => {
    const markup = version === '2.1'
      ? `<Markup>${topic}<Labels>A</Labels><Labels>B</Labels></Topic>${comment}</Markup>`
      : `<Markup>${topic}<Labels><Label>A</Label><Label>B</Label></Labels><Comments>${comment}</Comments></Topic></Markup>`;
    const [issue] = await new BcfManager().loadBcfZip(await archive(markup));
    expect(issue.labels).toEqual(['A', 'B']);
    expect(issue.commentsCount).toBe(1);
    expect(issue.title).toBe('Beam & duct');
    expect(issue.status).toBe('Open');
  });
}
test('uses referenced viewpoint rather than ZIP order and preserves orthographic scale', async () => {
  const [issue] = await new BcfManager().loadBcfZip(await archive(
    `<Markup>${topic}</Topic><Viewpoints><Viewpoint>selected.bcfv</Viewpoint></Viewpoints></Markup>`,
    { 'first.bcfv': '<VisualizationInfo/>', 'selected.bcfv': viewpoint }));
  expect(issue.ifcGuids).toEqual(['synthetic-component']);
  expect(issue.viewpoint?.projection).toBe('Orthographic');
  expect(issue.viewpoint?.viewToWorldScale).toBe(15);
  expect(issue.viewpoint?.position).toEqual({ x: 10, y: 20, z: 30 });
});
test('failed import preserves the previous catalogue', async () => {
  const manager = new BcfManager();
  const issues = await manager.loadBcfZip(await archive(`<Markup>${topic}</Topic></Markup>`));
  await expect(manager.loadBcfZip(await archive('<broken>'))).rejects.toThrow();
  expect(manager.getIssues()).toEqual(issues);
});
test('rejects non-finite camera coordinates', async () => {
  await expect(new BcfManager().loadBcfZip(await archive(`<Markup>${topic}</Topic></Markup>`,
    { 'view.bcfv': viewpoint.replace('<X>10</X>', '<X>NaN</X>') }))).rejects.toThrow();
});
test('releases snapshots allocated by a rejected topic', async () => {
  await expect(new BcfManager().loadBcfZip(await archive(`<Markup>${topic}</Topic></Markup>`,
    { 'snapshot.png': 'synthetic', 'view.bcfv': '<broken>' }))).rejects.toThrow();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
});
test('exports status changes while retaining unknown files and original version', async () => {
  const zip = new JSZip();
  zip.file('bcf.version', '<Version VersionId="3.0"/>');
  zip.file('topic/markup.bcf', `<Markup>${topic}<Description>Keep me</Description></Topic></Markup>`);
  zip.file('topic/extension.txt', 'opaque extension');
  const manager = new BcfManager();
  await manager.loadBcfZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(manager.updateIssueStatus('synthetic-topic', 'Resolved')).toBe(true);
  const blob = await manager.exportImported();
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject; reader.readAsArrayBuffer(blob!);
  });
  const result = await JSZip.loadAsync(bytes);
  expect(await result.file('topic/markup.bcf')!.async('string')).toContain('TopicStatus="Resolved"');
  expect(await result.file('topic/extension.txt')!.async('string')).toBe('opaque extension');
  expect(await result.file('bcf.version')!.async('string')).toContain('3.0');
});

test('reads BCF 3.0 component identifiers stored as child elements', async () => {
  const [issue] = await new BcfManager().loadBcfZip(await archive(`<Markup>${topic}</Topic></Markup>`,
    { 'view.bcfv': '<VisualizationInfo><Components><Selection><Component IfcGuid="synthetic"><AuthoringToolId>123456</AuthoringToolId></Component></Selection></Components></VisualizationInfo>' }));
  expect(issue.elementIds).toEqual(['123456']);
});
test('reports partial import failures without dropping valid topics', async () => {
  const zip = new JSZip();
  zip.file('valid/markup.bcf', `<Markup>${topic}</Topic></Markup>`);
  zip.file('invalid/markup.bcf', '<broken>');
  const manager = new BcfManager();
  expect(await manager.loadBcfZip(await zip.generateAsync({ type: 'uint8array' }))).toHaveLength(1);
  expect(manager.skippedTopics).toBe(1);
});
