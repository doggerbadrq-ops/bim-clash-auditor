import './style.css';
import { supportBundledIfcBinding } from './viewer/webIfcCompatibility';
import JSZip from 'jszip';
import type { BimViewer, LoadedModelInfo } from './viewer/bimViewer';
import { BcfManager } from './bcf/bcfManager';
import { ClashPanel } from './ui/clashPanel';
import { DropZoneHandler } from './ui/dropZone';
import { SAMPLE_CLASH_ISSUES } from './bcf/sampleData';
import { showToast } from './ui/notifications';

async function bootstrap() {
  const container = document.getElementById('viewer-container');
  const panelContainer = document.getElementById('clash-panel-container');

  if (!container || !panelContainer) {
    console.error('Faltan contenedores principales en el DOM.');
    return;
  }

  // 0. Theme Manager (Warm Editorial Paper & Amber vs Midnight Transmission)


  // 1. Initialize 3D Viewer with That Open Company
  const { BimViewer } = await import('./viewer/bimViewer');
  const viewer = new BimViewer(container);
  initThemeManager(() => viewer.applyTheme());
  supportBundledIfcBinding();
  await viewer.init();

  // 1b. Panel de modelos federados
  const modelsPanel = document.getElementById('models-panel');
  const modelsList = document.getElementById('models-list');
  const modelsCount = document.getElementById('models-count');
  const renderModels = (models: LoadedModelInfo[]) => {
    if (!modelsPanel || !modelsList) return;
    modelsPanel.hidden = models.length === 0;
    if (modelsCount) modelsCount.textContent = String(models.length);
    modelsList.innerHTML = '';
    for (const m of models) {
      const li = document.createElement('li');
      li.classList.toggle('is-hidden', !m.visible);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = m.visible;
      cb.title = 'Mostrar / ocultar disciplina';
      cb.addEventListener('change', () => viewer.setModelVisible(m.id, cb.checked));
      const label = document.createElement('div');
      label.className = 'model-name';
      label.title = m.name;
      label.textContent = m.name;
      if (m.sizeMb) {
        const size = document.createElement('span');
        size.className = 'model-size';
        size.textContent = m.sizeMb;
        label.appendChild(size);
      }
      const del = document.createElement('button');
      del.innerHTML = '&times;';
      del.title = 'Quitar este modelo';
      del.addEventListener('click', async () => {
        await viewer.removeModel(m.id);
        const left = viewer.modelCount;
        document.getElementById('model-name')!.textContent =
          left === 0 ? 'Sin modelo IFC' : left === 1 ? viewer.getModels()[0].name : `Modelo federado · ${left} disciplinas`;
        showToast(`"${m.name}" retirado de la escena.`, 'info', 2000);
      });
      li.append(cb, label, del);
      modelsList.appendChild(li);
    }
  };
  viewer.onModelsChanged = renderModels;

  // 1c. Tijera (plano de corte sobre una cara)
  const btnScissors = document.getElementById('btn-clip-face');
  viewer.onScissorsChanged = active => btnScissors?.classList.toggle('active', active);
  viewer.onPlaneCreated = ok => {
    showToast(ok
      ? 'Plano creado. Arrastra la flecha para desplazarlo · N invierte · Supr borra el plano bajo el cursor.'
      : 'No se encontró ninguna cara bajo el cursor. Haz clic directamente sobre un elemento.',
      ok ? 'success' : 'warning', ok ? 3200 : 2500);
  };
  const toggleScissors = () => {
    const next = !viewer.isScissorsActive;
    viewer.setScissorsMode(next);
    if (next) showToast('Tijera activa: haz clic sobre la cara donde quieres cortar (Esc cancela).', 'info', 2600);
  };
  btnScissors?.addEventListener('click', toggleScissors);
  document.getElementById('btn-clip-flip')?.addEventListener('click', () => {
    showToast(viewer.flipLastPlane() ? 'Plano invertido.' : 'No hay planos de corte que invertir.', 'info', 1400);
  });

  // 2. Initialize BCF Manager
  const bcfManager = new BcfManager();

  // 3. Initialize Clash Panel
  const clashPanel = new ClashPanel(panelContainer, viewer);
  clashPanel.onIssueStatusChanged = (guid, newStatus) => {
    bcfManager.updateIssueStatus(guid, newStatus);
  };

  // 4. Initialize Drag & Drop
  const dropZoneHandler = new DropZoneHandler(viewer, bcfManager, clashPanel);
  dropZoneHandler.init();

  // 5. Pre-load sample clash issues so the UI is immediately functional & interactive
  clashPanel.render(SAMPLE_CLASH_ISSUES);
  bcfManager.setIssues(SAMPLE_CLASH_ISSUES);

  // 6. Bind Top Toolbar Controls
  const btnTransparent = document.getElementById('btn-transparent');
  btnTransparent?.addEventListener('click', () => {
    const isTrans = viewer.toggleTransparency();
    btnTransparent.classList.toggle('active', isTrans);
    showToast(
      isTrans ? 'Modo Rayos X activado (Opacidad 25%)' : 'Modo Opaco estándar restaurado',
      'info',
      2000
    );
  });

  const btnResetView = document.getElementById('btn-reset-view');
  btnResetView?.addEventListener('click', () => {
    viewer.resetView();
    showToast('Cámara restablecida a perspectiva isométrica.', 'info', 1500);
  });

  const btnFitModel = document.getElementById('btn-fit-model');
  btnFitModel?.addEventListener('click', () => {
    viewer.fitModelToFrame();
    showToast('Ajustando encuadre al modelo.', 'info', 1500);
  });

  const btnLoadDemo = document.getElementById('btn-load-demo');
  btnLoadDemo?.addEventListener('click', () => {
    clashPanel.render(SAMPLE_CLASH_ISSUES);
    bcfManager.setIssues(SAMPLE_CLASH_ISSUES);
    showToast('Dataset de auditoría recargado (Comunicaciones vs MEP/EST).', 'success', 2200);
  });

  // Export / Download .bcfzip button
  const btnExportBcf = document.getElementById('btn-export-bcf');
  btnExportBcf?.addEventListener('click', async () => {
    try {
      await exportBcfZip(bcfManager);
    } catch (error) {
      console.error('Error exportando BCF:', error);
      showToast('No se pudo exportar el archivo BCF.', 'error', 5000);
    }
  });

  // Botón Descargar / Cerrar IFC para liberar memoria RAM
  const btnUnloadIfc = document.getElementById('btn-unload-ifc');
  btnUnloadIfc?.addEventListener('click', async () => {
    await viewer.clearPreviousModels();
    viewer.clearAllClipPlanes();
    resetClipUi();
    document.getElementById('model-name')!.textContent = 'Sin modelo IFC';
    const ifcBadge = document.getElementById('ifc-badge');
    if (ifcBadge) {
      ifcBadge.textContent = '';
      ifcBadge.classList.remove('badge-visible');
    }
    showToast('Todos los modelos IFC cerrados. Memoria RAM liberada.', 'info', 2500);
  });


  // ── VISTAS RAPIDAS ────────────────────────────────────────────────────
  document.getElementById('btn-view-iso')?.addEventListener('click', () => {
    viewer.setView('iso');
    showToast('Vista isométrica', 'info', 1000);
  });
  document.getElementById('btn-view-top')?.addEventListener('click', () => {
    viewer.setView('top');
    showToast('Vista planta', 'info', 1000);
  });
  document.getElementById('btn-view-front')?.addEventListener('click', () => {
    viewer.setView('front');
    showToast('Vista frontal', 'info', 1000);
  });
  document.getElementById('btn-view-right')?.addEventListener('click', () => {
    viewer.setView('right');
    showToast('Vista lateral', 'info', 1000);
  });

  // ── PLANOS DE CORTE & DESPLAZADOR VISUAL ──────────────────────────────
  const sliderWidget = document.getElementById('section-slider-widget');
  const sliderTitle = document.getElementById('section-slider-title');
  const sliderRange = document.getElementById('section-slider-range') as HTMLInputElement | null;
  const sliderVal = document.getElementById('section-slider-val');
  const btnCloseSlider = document.getElementById('btn-close-section-slider');
  let currentCutAxis: 'X' | 'Y' = 'Y';

  const showSlider = (axis: 'X' | 'Y', title: string) => {
    currentCutAxis = axis;
    if (sliderWidget) sliderWidget.style.display = 'flex';
    if (sliderTitle) sliderTitle.textContent = title;
    if (sliderRange) sliderRange.value = '50';
    if (sliderVal) sliderVal.textContent = '50%';
  };

  function hideSlider() {
    if (sliderWidget) sliderWidget.style.display = 'none';
  }
  function resetClipUi() {
    document.getElementById('btn-clip-y')?.classList.remove('active');
    document.getElementById('btn-clip-x')?.classList.remove('active');
    hideSlider();
  }

  sliderRange?.addEventListener('input', (e) => {
    const val = Number((e.target as HTMLInputElement).value);
    if (sliderVal) sliderVal.textContent = `${val}%`;
    viewer.setClipPlaneOffset(currentCutAxis, val / 100);
  });

  btnCloseSlider?.addEventListener('click', () => {
    viewer.clearAllClipPlanes();
    document.getElementById('btn-clip-y')?.classList.remove('active');
    document.getElementById('btn-clip-x')?.classList.remove('active');
    hideSlider();
    showToast('Planos de corte eliminados', 'info', 1200);
  });

  document.getElementById('btn-clip-y')?.addEventListener('click', () => {
    const on = viewer.toggleClipPlane('Y', 0.5);
    document.getElementById('btn-clip-y')?.classList.toggle('active', on);
    if (on) {
      document.getElementById('btn-clip-x')?.classList.remove('active');
      showSlider('Y', '📐 Corte H (Entrepisos / Planta)');
      showToast('Corte H activado — usa el desplazador para mover el plano', 'info', 2000);
    } else {
      hideSlider();
    }
  });

  document.getElementById('btn-clip-x')?.addEventListener('click', () => {
    const on = viewer.toggleClipPlane('X', 0.5);
    document.getElementById('btn-clip-x')?.classList.toggle('active', on);
    if (on) {
      document.getElementById('btn-clip-y')?.classList.remove('active');
      showSlider('X', '📐 Corte V (Fachada / Longitudinal)');
      showToast('Corte V activado — usa el desplazador para mover el plano', 'info', 2000);
    } else {
      hideSlider();
    }
  });

  document.getElementById('btn-clip-clear')?.addEventListener('click', () => {
    viewer.clearAllClipPlanes();
    document.getElementById('btn-clip-y')?.classList.remove('active');
    document.getElementById('btn-clip-x')?.classList.remove('active');
    hideSlider();
    showToast('Planos de corte eliminados', 'info', 1200);
  });
  // ── ATAJOS DE TECLADO ─────────────────────────────────────────────────
  // A = zoom extents / fit all   I = iso   P = planta   F = frente   L = lateral
  // X = tijera (corte sobre cara)  N = invertir plano  Supr = borrar plano bajo cursor
  // C = corte horizontal (toggle)  V = corte vertical (toggle)  Esc = quitar cortes
  // + / - = step zoom   W/S = desplazar plano de corte H arriba/abajo
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    switch(e.key.toLowerCase()) {
      case 'a': viewer.fitModelToFrame(); showToast('Zoom Extents', 'info', 800); break;
      case 'i': viewer.setView('iso');   showToast('Vista isométrica', 'info', 800); break;
      case 'p': viewer.setView('top');   showToast('Vista planta', 'info', 800); break;
      case 'f': viewer.setView('front'); showToast('Vista frontal', 'info', 800); break;
      case 'l': viewer.setView('right'); showToast('Vista lateral', 'info', 800); break;
      case 'c': {
        const on = viewer.toggleClipPlane('Y', 0.5);
        document.getElementById('btn-clip-y')?.classList.toggle('active', on);
        showToast(on ? 'Corte H activado — W/S para desplazar' : 'Corte H desactivado', 'info', 1600);
        break;
      }
      case 'v': {
        const on2 = viewer.toggleClipPlane('X', 0.5);
        document.getElementById('btn-clip-x')?.classList.toggle('active', on2);
        showToast(on2 ? 'Corte V activado' : 'Corte V desactivado', 'info', 1600);
        break;
      }
      case 'x': toggleScissors(); break;
      case 'n': viewer.flipLastPlane(); break;
      case 'delete': case 'supr': void viewer.deletePlaneUnderCursor(); break;
      case 'w': viewer.nudgeClipPlane('Y', 0.5);  break; // subir plano de corte H
      case 's': viewer.nudgeClipPlane('Y', -0.5); break; // bajar plano de corte H
      case '+': case '=': viewer.stepZoom(1.3); break;   // zoom in
      case '-': viewer.stepZoom(0.77); break;             // zoom out
      case 'escape':
        if (viewer.isScissorsActive) { viewer.setScissorsMode(false); break; }
        viewer.clearAllClipPlanes();
        resetClipUi(); break;
    }
  });
  console.log('🏛️ That Open Clash Auditor - Editorial Japandi Suite inicializado.');
}

function initThemeManager(onChange: () => void) {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('clash-auditor-theme') === 'theme-midnight' ? 'theme-midnight' : 'theme-warm-editorial';
  root.setAttribute('data-theme', savedTheme);

  const btnTheme = document.getElementById('btn-theme-toggle');
  updateThemeButtonLabel(btnTheme, savedTheme);

  btnTheme?.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') || 'theme-midnight';
    const nextTheme = current === 'theme-midnight' ? 'theme-warm-editorial' : 'theme-midnight';
    root.setAttribute('data-theme', nextTheme);
    onChange();
    localStorage.setItem('clash-auditor-theme', nextTheme);
    updateThemeButtonLabel(btnTheme, nextTheme);
    showToast(
      nextTheme === 'theme-warm-editorial' ? 'Tema activo: Warm Paper & Amber (Japandi Editorial)' : 'Tema activo: Midnight Transmission (Carbón Ejecutivo)',
      'info',
      2000
    );
  });
}

function updateThemeButtonLabel(btn: HTMLElement | null, theme: string) {
  if (!btn) return;
  if (theme === 'theme-warm-editorial') {
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
      <span>Midnight</span>
    `;
    btn.setAttribute('title', 'Cambiar a tema Midnight Transmission');
  } else {
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
      <span>Warm Paper</span>
    `;
    btn.setAttribute('title', 'Cambiar a tema Warm Editorial / Japandi Luxury');
  }
}

/**
 * Creates and downloads a compliant .bcfzip file containing current issues and statuses
 */
async function exportBcfZip(bcfManager: BcfManager) {
  const issues = bcfManager.getIssues();
  if (issues.length === 0) {
    showToast('No hay incidencias para exportar.', 'warning');
    return;
  }

  const imported = await bcfManager.exportImported();
  if (imported) return downloadBcf(imported);
  const zip = new JSZip();

  // 1. bcf.version
  zip.file('bcf.version', `<?xml version="1.0" encoding="UTF-8"?>
<Version VersionId="2.1">
  <DetailedVersion>2.1</DetailedVersion>
</Version>`);

  // 2. Add each topic
  for (const issue of issues) {
    const folder = zip.folder(issue.guid);
    if (!folder) continue;

    // markup.bcf
    const markupXml = `<?xml version="1.0" encoding="UTF-8"?>
<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Topic Guid="${issue.guid}" TopicType="${issue.type}" TopicStatus="${issue.status}">
    <Title>${escapeXml(issue.title)}</Title>
    <Priority>${issue.priority}</Priority>
    <Index>${issue.index}</Index>
    <CreationDate>${issue.creationDate}</CreationDate>
    <CreationAuthor>${escapeXml(issue.author)}</CreationAuthor>
    ${issue.assignedTo ? `<AssignedTo>${escapeXml(issue.assignedTo)}</AssignedTo>` : ''}
    <Description>${escapeXml(issue.description)}</Description>
    ${issue.labels.map(l => `<Labels>${escapeXml(l)}</Labels>`).join('\n    ')}
  </Topic>
    <Viewpoints Guid="${issue.guid}">
      <Viewpoint>viewpoint.bcfv</Viewpoint>
    </Viewpoints>
</Markup>`;
    folder.file('markup.bcf', markupXml);

    // viewpoint.bcfv
    const vp = issue.viewpoint || { position: { x: 12, y: 16, z: 3.5 }, target: { x: 0, y: 0, z: 0 } };
    const vpXml = `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${issue.guid}">
  <Components>
    <Selection>
      ${issue.ifcGuids.map((g, idx) => `
        <Component IfcGuid="${escapeXml(g)}"><OriginatingSystem>BIM Clash Auditor</OriginatingSystem><AuthoringToolId>${escapeXml(issue.elementIds[idx] || '')}</AuthoringToolId></Component>
      `).join('')}
    </Selection>
  </Components>
  <PerspectiveCamera>
    <CameraViewPoint>
      <X>${vp.position?.x ?? 0}</X>
      <Y>${vp.position?.y ?? 0}</Y>
      <Z>${vp.position?.z ?? 0}</Z>
    </CameraViewPoint>
    <CameraDirection>
      <X>${(vp.target?.x ?? 0) - (vp.position?.x ?? 0)}</X>
      <Y>${(vp.target?.y ?? 0) - (vp.position?.y ?? 0)}</Y>
      <Z>${(vp.target?.z ?? 0) - (vp.position?.z ?? 0)}</Z>
    </CameraDirection>
    <CameraUpVector>
      <X>0</X>
      <Y>0</Y>
      <Z>1</Z>
    </CameraUpVector>
    <FieldOfView>60</FieldOfView>
  </PerspectiveCamera>

</VisualizationInfo>`;
    folder.file('viewpoint.bcfv', vpXml);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBcf(blob);
}

function downloadBcf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'BIM_Clash_Audit_Export.bcfzip';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Paquete "BIM_Clash_Audit_Export.bcfzip" exportado exitosamente.', 'success', 2800);
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  void bootstrap().catch(error => {
    console.error('Error inicializando el visor:', error);
    showToast('No se pudo iniciar el visor 3D. Comprueba WebGL y recarga la aplicación.', 'error', 10000);
  });
});
