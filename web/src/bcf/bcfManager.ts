import JSZip from 'jszip';
import { ClashIssue, BcfViewpointCamera } from '../types';

export class BcfManager {
  private activeIssues: ClashIssue[] = [];
  private createdBlobUrls: string[] = [];
  private sourceZip?: JSZip;
  private changedStatuses = new Map<string, ClashIssue['status']>();

  public async exportImported(): Promise<Blob | undefined> {
    if (!this.sourceZip) return;
    for (const entry of this.sourceZip.file(/\/markup\.(bcf|xml)$/i)) {
      const doc = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
      const topic = doc.querySelector('Topic');
      const guid = topic?.getAttribute('Guid') || entry.name.split('/')[0];
      const status = this.changedStatuses.get(guid);
      if (topic && status) {
        topic.setAttribute('TopicStatus', status);
        this.sourceZip.file(entry.name, new XMLSerializer().serializeToString(doc));
      }
    }
    return this.sourceZip.generateAsync({ type: 'blob' });
  }

  public getIssues(): ClashIssue[] {
    return this.activeIssues;
  }

  public setIssues(issues: ClashIssue[]) {
    this.revokeOldBlobUrls();
    this.sourceZip = undefined;
    this.changedStatuses.clear();
    this.activeIssues = issues;
  }

  public updateIssueStatus(guid: string, newStatus: ClashIssue['status']): boolean {
    const issue = this.activeIssues.find(i => i.guid === guid);
    if (issue) {
      issue.status = newStatus;
      this.changedStatuses.set(guid, newStatus);
      return true;
    }
    return false;
  }

  private revokeOldBlobUrls() {
    for (const url of this.createdBlobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
    this.createdBlobUrls = [];
  }

  /**
   * Parse a .bcfzip / .bcf file from an ArrayBuffer or File
   */
  public async loadBcfZip(data: ArrayBuffer | Uint8Array): Promise<ClashIssue[]> {


    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(data);
    const files = Object.keys(loadedZip.files);

    // Group files by topic folder (GUID or folder name)
    const topicFolders = new Set<string>();

    for (const filePath of files) {
      const parts = filePath.split('/');
      if (parts.length > 1 && parts[0] && !parts[0].startsWith('__MACOSX')) {
        topicFolders.add(parts[0]);
      }
    }

    const issues: ClashIssue[] = [];
    let issueCounter = 1;

    for (const folder of Array.from(topicFolders)) {
      try {
        const markupFile = loadedZip.file(`${folder}/markup.bcf`) || loadedZip.file(`${folder}/markup.xml`);
        if (!markupFile) continue;

        const markupXml = await markupFile.async('string');
        const parsedIssue = await this.parseBcfFolder(loadedZip, folder, markupXml, issueCounter);
        if (parsedIssue) {
          issues.push(parsedIssue);
          issueCounter++;
        }
      } catch (err) {
        console.warn(`Error parsing BCF topic folder "${folder}":`, err);
      }
    }

    if (!issues.length) throw new Error('El paquete no contiene incidencias BCF legibles.');
    const currentUrls = new Set(issues.map(issue => issue.snapshotUrl));
    this.createdBlobUrls = this.createdBlobUrls.filter(url => {
      if (currentUrls.has(url)) return true;
      URL.revokeObjectURL(url);
      return false;
    });
    this.changedStatuses.clear();
    this.sourceZip = loadedZip;
    this.activeIssues = issues;
    return issues;
  }

  private async parseBcfFolder(zip: JSZip, folder: string, markupXml: string, index: number): Promise<ClashIssue | null> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(markupXml, 'application/xml');

    const topicEl = doc.querySelector('Topic');
    if (!topicEl) return null;

    const guid = topicEl.getAttribute('Guid') || folder;
    const title = topicEl.querySelector('Title')?.textContent?.trim() || `Incidencia #${index}`;
    const description = topicEl.querySelector('Description')?.textContent?.trim() || 'Sin descripción detallada.';
    const statusRaw = topicEl.getAttribute('TopicStatus') || topicEl.querySelector('TopicStatus')?.textContent?.trim() || 'Active';
    const typeRaw = topicEl.getAttribute('TopicType') || topicEl.querySelector('TopicType')?.textContent?.trim() || 'Clash';
    const priorityRaw = topicEl.querySelector('Priority')?.textContent?.trim() || 'Normal';
    const author = topicEl.querySelector('CreationAuthor')?.textContent?.trim() || 'Auditor BIM';
    const creationDate = topicEl.querySelector('CreationDate')?.textContent?.trim() || new Date().toISOString();
    const assignedTo = topicEl.querySelector('AssignedTo')?.textContent?.trim() || undefined;

    // Labels
    const labelElements = doc.querySelectorAll('Labels');
    const labels: string[] = [];
    labelElements.forEach(el => {
      const txt = el.textContent?.trim();
      if (txt) labels.push(txt);
    });

    // Check viewpoints and snapshot
    let snapshotUrl: string | undefined = undefined;
    let cameraViewpoint: BcfViewpointCamera | undefined = undefined;
    const elementIds: Set<string> = new Set();
    const ifcGuids: Set<string> = new Set();

    // Look for snapshot image in the topic folder
    const snapshotFile = zip.file(new RegExp(`^${folder}/.*\\.(png|jpg|jpeg)$`, 'i'))[0];
    if (snapshotFile) {
      const imgBytes = await snapshotFile.async('uint8array');
      const mime = snapshotFile.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const arrayBuffer = imgBytes.buffer.slice(imgBytes.byteOffset, imgBytes.byteOffset + imgBytes.byteLength) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: mime });
      snapshotUrl = URL.createObjectURL(blob);
      this.createdBlobUrls.push(snapshotUrl);
    }

    // Look for viewpoint XML (.bcfv)
    const viewpointFile = zip.file(new RegExp(`^${folder}/.*\\.bcfv$`, 'i'))[0];
    if (viewpointFile) {
      const vXml = await viewpointFile.async('string');
      const vDoc = parser.parseFromString(vXml, 'application/xml');

      // Camera
      const pCam = vDoc.querySelector('PerspectiveCamera') || vDoc.querySelector('OrthogonalCamera');
      if (pCam) {
        const cx = parseFloat(pCam.querySelector('CameraViewPoint > X')?.textContent || '0');
        const cy = parseFloat(pCam.querySelector('CameraViewPoint > Y')?.textContent || '0');
        const cz = parseFloat(pCam.querySelector('CameraViewPoint > Z')?.textContent || '0');
        const dx = parseFloat(pCam.querySelector('CameraDirection > X')?.textContent || '0');
        const dy = parseFloat(pCam.querySelector('CameraDirection > Y')?.textContent || '0');
        const dz = parseFloat(pCam.querySelector('CameraDirection > Z')?.textContent || '0');

        const ux = parseFloat(pCam.querySelector('CameraUpVector > X')?.textContent || '0');
        const uy = parseFloat(pCam.querySelector('CameraUpVector > Y')?.textContent || '0');
        const uz = parseFloat(pCam.querySelector('CameraUpVector > Z')?.textContent || '1');

        cameraViewpoint = {
          position: { x: cx, y: cy, z: cz },
          direction: { x: dx, y: dy, z: dz },
          up: { x: ux, y: uy, z: uz },
          target: { x: cx + dx * 12, y: cy + dy * 12, z: cz + dz * 12 },
        };
      }

      // Components
      // Estrategia multi-nivel de extracción de elementos en colisión del BCF:
      // 1. Elementos dentro de <Selection>
      // 2. Elementos con atributo Selected="true"
      // 3. Elementos en <Coloring>
      // 4. Si DefaultVisibility="false", las excepciones son los elementos de la colisión
      // 5. Si la cantidad total de componentes es pequeña (<= 10), tomarlos como candidatos de colisión
      let clashComponents = Array.from(vDoc.querySelectorAll('Selection > Component, Component[Selected="true"], Coloring Component'));
      
      if (!clashComponents.length) {
        const vis = vDoc.querySelector('Visibility');
        if (vis && vis.getAttribute('DefaultVisibility')?.toLowerCase() === 'false') {
          clashComponents = Array.from(vDoc.querySelectorAll('Visibility > Exceptions > Component'));
        }
      }

      if (!clashComponents.length) {
        const allComponents = Array.from(vDoc.querySelectorAll('Component'));
        if (allComponents.length > 0 && allComponents.length <= 10) {
          clashComponents = allComponents;
        }
      }

      clashComponents.forEach(c => {
        const ifcGuid = c.getAttribute('IfcGuid') || c.getAttribute('ifcGuid');
        if (ifcGuid) ifcGuids.add(ifcGuid);

        const revitId = c.getAttribute('AuthoringToolId') || c.getAttribute('OriginatingSystemId');
        if (revitId && /^\d+$/.test(revitId)) elementIds.add(revitId);
      });
    }

    // Secondary scan for Revit Element IDs inside description, comments or title
    const textCorpus = `${title} ${description} ${labels.join(' ')}`;
    const regexRevit = /\b(?:ID[:#\s]*|Element[:#\s]*|Revit[:#\s]*)?(\d{5,8})\b/gi;
    let match;
    while ((match = regexRevit.exec(textCorpus)) !== null) {
      if (match[1]) elementIds.add(match[1]);
    }

    // Comments
    const commentsCount = doc.querySelectorAll('Comment').length;
    doc.querySelectorAll('Comment > Comment').forEach(comm => {
      const cTxt = comm.textContent || '';
      let cMatch;
      while ((cMatch = regexRevit.exec(cTxt)) !== null) {
        if (cMatch[1]) elementIds.add(cMatch[1]);
      }
    });

    // Detect Discipline
    const discipline = this.detectDiscipline(title, description, labels);

    // Normalize Status
    const status = this.normalizeStatus(statusRaw);

    // Normalize Priority
    const priority = this.normalizePriority(priorityRaw);

    // Parse Grid reference if mentioned (e.g. "Eje 3-C", "Eje A-1")
    const gridMatch = textCorpus.match(/Eje\s+[A-Za-z0-9\-]+/i);
    const gridLocation = gridMatch ? gridMatch[0] : undefined;

    return {
      guid,
      index,
      title,
      description,
      status,
      type: typeRaw.includes('Clash') ? 'Clash' : 'Issue',
      priority,
      discipline,
      author,
      creationDate,
      assignedTo,
      snapshotUrl,
      viewpoint: cameraViewpoint,
      elementIds: Array.from(elementIds),
      ifcGuids: Array.from(ifcGuids),
      commentsCount,
      labels,
      gridLocation
    };
  }

  private detectDiscipline(title: string, desc: string, labels: string[]): ClashIssue['discipline'] {
    const combined = `${title} ${desc} ${labels.join(' ')}`.toLowerCase();
    if (combined.includes('com') || combined.includes('comunicacion') || combined.includes('datos') || combined.includes('data') || combined.includes('rack') || combined.includes('cctv') || combined.includes('fibra') || combined.includes('bandeja')) {
      return 'Comunicaciones';
    }
    if (combined.includes('est') || combined.includes('estructura') || combined.includes('viga') || combined.includes('columna') || combined.includes('zapata') || combined.includes('losa') || combined.includes('concreto')) {
      return 'Estructuras';
    }
    if (combined.includes('arq') || combined.includes('arquitectura') || combined.includes('muro') || combined.includes('tabique') || combined.includes('puerta') || combined.includes('cielo') || combined.includes('ventana')) {
      return 'Arquitectura';
    }
    if (combined.includes('san') || combined.includes('sanitaria') || combined.includes('agua') || combined.includes('desague') || combined.includes('pluvial') || combined.includes('tuberia') || combined.includes('pvc') || combined.includes('drenaje')) {
      return 'Sanitarias';
    }
    if (combined.includes('ele') || combined.includes('electr') || combined.includes('tablero') || combined.includes('alimentador') || combined.includes('conduit') || combined.includes('iluminac')) {
      return 'Eléctricas';
    }
    return 'General';
  }

  private normalizeStatus(raw: string): ClashIssue['status'] {
    const lower = raw.toLowerCase();
    if (lower.includes('close') || lower.includes('cerrad')) return 'Closed';
    if (lower.includes('resolv') || lower.includes('resuelt')) return 'Resolved';
    if (lower.includes('review') || lower.includes('revis')) return 'In Review';
    if (lower.includes('open') || lower.includes('abiert')) return 'Open';
    return 'Active';
  }

  private normalizePriority(raw: string): ClashIssue['priority'] {
    const lower = raw.toLowerCase();
    if (lower.includes('crit') || lower.includes('urgente')) return 'Critical';
    if (lower.includes('high') || lower.includes('alta')) return 'High';
    if (lower.includes('low') || lower.includes('baja')) return 'Low';
    return 'Normal';
  }
}
