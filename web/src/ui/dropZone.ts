import { BimViewer } from '../viewer/bimViewer';
import { BcfManager } from '../bcf/bcfManager';
import { ClashPanel } from './clashPanel';
import { showToast } from './notifications';

export class DropZoneHandler {
  private viewer: BimViewer;
  private bcfManager: BcfManager;
  private clashPanel: ClashPanel;

  constructor(viewer: BimViewer, bcfManager: BcfManager, clashPanel: ClashPanel) {
    this.viewer = viewer;
    this.bcfManager = bcfManager;
    this.clashPanel = clashPanel;
  }

  public init() {
    const dropZone = document.getElementById('drop-zone');
    const ifcInput = document.getElementById('input-file-ifc') as HTMLInputElement;
    const bcfInput = document.getElementById('input-file-bcf') as HTMLInputElement;

    // Prevent default drag behaviors across the window
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    // Window dragover visual cues
    window.addEventListener('dragenter', () => {
      dropZone?.classList.add('drag-active');
    });

    dropZone?.addEventListener('dragleave', (e) => {
      if (e.target === dropZone) {
        dropZone.classList.remove('drag-active');
      }
    });

    // Drop handler
    window.addEventListener('drop', async (e: DragEvent) => {
      dropZone?.classList.remove('drag-active');
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      await this.processFiles(Array.from(files));
    });

    // File input changes
    ifcInput?.addEventListener('change', async () => {
      if (ifcInput.files && ifcInput.files.length > 0) {
        await this.processFiles(Array.from(ifcInput.files));
        ifcInput.value = '';
      }
    });

    bcfInput?.addEventListener('change', async () => {
      if (bcfInput.files && bcfInput.files.length > 0) {
        await this.processFiles(Array.from(bcfInput.files));
        bcfInput.value = '';
      }
    });
  }

  private queue: Promise<void> = Promise.resolve();

  public processFiles(files: File[]) {
    this.queue = this.queue.catch(() => {}).then(() => this.loadBatch(files));
    return this.queue;
  }

  private async loadBatch(files: File[]) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const progressBar = document.getElementById('loading-progress-bar') as HTMLElement;

    const setProgress = (text: string, percent: number) => {
      if (loadingText) loadingText.textContent = text;
      if (progressBar) progressBar.style.width = `${percent}%`;
    };

    // Finish catalogue replacement first so a paired IFC always owns the final scene.
    const ordered = [...files].sort((a, b) =>
      Number(/\.ifc$/i.test(a.name)) - Number(/\.ifc$/i.test(b.name)));
    for (const file of ordered) {
      const name = file.name.toLowerCase();

      if (name.endsWith('.ifc')) {
        try {
          if (loadingOverlay) loadingOverlay.classList.remove('hidden');
          const mbSize = (file.size / (1024 * 1024)).toFixed(1);
          setProgress(`Leyendo buffer de ${file.name} (${mbSize} MB)...`, 20);

          // Yield to render progress
          await new Promise(resolve => setTimeout(resolve, 60));

          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);

          const phase = 'Procesando geometría IFC con WebAssembly...';
          setProgress(phase, 20);
          await this.viewer.loadIfc(bytes, file.name, fraction => setProgress(phase, 20 + fraction * 75), `${mbSize} MB`);
          const count = this.viewer.modelCount;
          document.getElementById('model-name')!.textContent =
            count > 1 ? `Modelo federado · ${count} disciplinas` : file.name;

          setProgress(`Enfocando perspectiva del modelo...`, 100);
          await new Promise(resolve => setTimeout(resolve, 150));

          showToast(`"${file.name}" añadido al modelo federado (${count} cargado${count > 1 ? 's' : ''}).`, 'success');
          this.updateLoadedBadge('ifc-badge', count > 1 ? `${count} modelos IFC` : file.name, `${mbSize} MB`);
        } catch (err: any) {
          console.error('Error cargando archivo IFC:', err);
          showToast(`Error al cargar ${file.name}: ${err?.message || err}`, 'error', 4500);
        } finally {
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
        }
      } else if (name.endsWith('.bcfzip') || name.endsWith('.bcf') || name.endsWith('.zip')) {
        try {
          if (loadingOverlay) loadingOverlay.classList.remove('hidden');
          setProgress(`Extrayendo incidencias y snapshots BCF de ${file.name}...`, 35);

          await new Promise(resolve => setTimeout(resolve, 60));

          const buffer = await file.arrayBuffer();
          const issues = await this.bcfManager.loadBcfZip(buffer);

          setProgress(`Indexando ${issues.length} incidencias en catálogo...`, 80);
          await new Promise(resolve => setTimeout(resolve, 60));

          this.clashPanel.render(issues);
          if (this.bcfManager.skippedTopics) {
            showToast(`${this.bcfManager.skippedTopics} incidencias omitidas por datos BCF inválidos. Consulta la consola para el detalle.`, 'warning', 6000);
          }

          setProgress(`Incidencias BCF sincronizadas`, 100);
          await new Promise(resolve => setTimeout(resolve, 120));

          showToast(`${issues.length} incidencias BCF actualizadas en caliente desde "${file.name}".`, 'success', 3500);
          this.updateLoadedBadge('bcf-badge', file.name, `${issues.length} Incidencias`);
        } catch (err: any) {
          console.error('Error procesando BCF:', err);
          showToast(`Error al procesar BCF ${file.name}: ${err?.message || err}`, 'error', 4500);
        } finally {
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
        }
      } else {
        showToast(`Formato "${file.name}" no soportado. Arrastre archivos .ifc o .bcfzip.`, 'warning');
      }
    }
  }

  private updateLoadedBadge(id: string, name: string, detail: string) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = name + ' · ' + detail;
      el.classList.add('badge-visible');
    }
  }
}
