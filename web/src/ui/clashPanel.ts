import { ClashIssue } from '../types';
import { showToast } from './notifications';
import { BimViewer } from '../viewer/bimViewer';

export class ClashPanel {
  private container: HTMLElement;
  private viewer: BimViewer;
  private issues: ClashIssue[] = [];
  private filteredIssues: ClashIssue[] = [];

  // Filter state
  private selectedDiscipline: string = 'Todas';
  private selectedStatus: string = 'Todos';
  private searchQuery: string = '';

  // Callback when status is modified
  public onIssueStatusChanged?: (guid: string, newStatus: ClashIssue['status']) => void;

  constructor(container: HTMLElement, viewer: BimViewer) {
    this.container = container;
    this.viewer = viewer;
  }

  public render(issues: ClashIssue[]): void {
    this.issues = issues;
    this.applyFilters();
  }

  public setDisciplineFilter(discipline: string): void {
    this.selectedDiscipline = discipline;
    const select = document.getElementById('filter-discipline') as HTMLSelectElement;
    if (select) select.value = discipline;
    this.applyFilters();
  }

  public setStatusFilter(status: string): void {
    this.selectedStatus = status;
    const select = document.getElementById('filter-status') as HTMLSelectElement;
    if (select) select.value = status;
    this.applyFilters();
  }

  public applyFilters(): void {
    this.filteredIssues = this.issues.filter(issue => {
      // Discipline filter
      if (this.selectedDiscipline !== 'Todas' && issue.discipline !== this.selectedDiscipline) {
        return false;
      }
      // Status filter
      if (this.selectedStatus !== 'Todos' && (issue.status === 'Open' ? 'Active' : issue.status) !== this.selectedStatus) {
        return false;
      }
      // Search query
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        const matchesTitle = issue.title.toLowerCase().includes(q);
        const matchesDesc = issue.description.toLowerCase().includes(q);
        const matchesAuthor = issue.author.toLowerCase().includes(q);
        const matchesIds = issue.elementIds.some(id => id.includes(q));
        const matchesLabels = issue.labels.some(l => l.toLowerCase().includes(q));
        const matchesGrid = issue.gridLocation?.toLowerCase().includes(q);
        if (!issue.discipline.toLowerCase().includes(q) && !matchesTitle && !matchesDesc && !matchesAuthor && !matchesIds && !matchesLabels && !matchesGrid) {
          return false;
        }
      }
      return true;
    });

    this.updateDom();
  }

  private updateDom(): void {
    this.container.innerHTML = `
      <div class="panel-header">
        <div class="panel-title-row">
          <div class="panel-title">
            <span class="panel-title-text">Catálogo de incidencias</span>
            <span class="panel-badge-count">${this.filteredIssues.length} de ${this.issues.length}</span>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="panel-search-box">
          <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="text" 
            id="panel-search-input" 
            aria-label="Buscar incidencias" placeholder="Buscar por título, disciplina o ID Revit" 
            value="${escapeHtml(this.searchQuery)}"
          />
          ${this.searchQuery ? '<button id="btn-clear-search" class="btn-clear-search" title="Limpiar búsqueda">&times;</button>' : ''}
        </div>

        <!-- Filter Controls -->
        <div class="filter-segments" role="group" aria-label="Disciplina">
          ${[['Todas','Todas'],['Comunicaciones','COM'],['Estructuras','EST'],['Sanitarias','SAN'],['Eléctricas','ELE'],['Arquitectura','ARQ'],['General','GEN']].map(([value, label]) => this.segment('discipline', value, label, this.selectedDiscipline)).join('')}
        </div>
        <div class="filter-segments" role="group" aria-label="Estado">
          ${[['Todos','Todos'],['Active','Activas'],['In Review','En revisión'],['Resolved','Resueltas'],['Closed','Cerradas']].map(([value, label]) => this.segment('status', value, label, this.selectedStatus)).join('')}
        </div>
      </div>

      <!-- Issues List -->
      <div class="panel-cards-list">
        ${this.filteredIssues.length === 0 ? this.renderEmptyState() : this.filteredIssues.map(issue => this.renderIssueCard(issue)).join('')}
      </div>
    `;

    this.attachEvents();
  }

  private segment(group: string, value: string, label: string, selected: string): string {
    return `<button data-filter="${group}" data-value="${value}" title="${value}" aria-pressed="${value === selected}">${label}</button>`;
  }

  private renderEmptyState(): string {
    return `
      <div class="empty-state">
        <div class="empty-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <h3 class="empty-title">Sin incidencias coincidentes</h3>
        <p class="empty-desc">No se encontraron interferencias con los filtros aplicados o el término de búsqueda actual.</p>
        <button id="btn-reset-filters" class="btn-editorial-reset">Restablecer Filtros</button>
      </div>
    `;
  }

  private renderIssueCard(issue: ClashIssue): string {
    const statusClass = issue.status.toLowerCase().replace(' ', '-');
    const priorityClass = issue.priority.toLowerCase();
    const formattedIndex = issue.index < 10 ? `0${issue.index}` : `${issue.index}`;

    const idsHtml = issue.elementIds.length > 0 
      ? issue.elementIds.map(id => `
          <button class="btn-revit-id" data-revit-id="${escapeHtml(id)}" title="Copiar ID para seleccionar en Revit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="id-text">ID: <strong>${escapeHtml(id)}</strong></span>
          </button>
        `).join('')
      : `<span class="no-id-badge">Sin ID directo</span>`;

    return `
      <article class="clash-card clash-priority-${priorityClass}" data-guid="${escapeHtml(issue.guid)}">
        <!-- Card Header -->
        <div class="card-header">
          <div class="card-meta-top">
            <span class="card-index">#${formattedIndex}</span>
            <div class="card-pills-wrap">
              <span class="pill-discipline pill-${issue.discipline.toLowerCase()}">${issue.discipline}</span>
              <span class="pill-priority pill-${priorityClass}">${({Critical:'Crítica',High:'Alta',Normal:'Normal',Low:'Baja'})[issue.priority]}</span>
              ${issue.gridLocation ? `<span class="pill-grid">${escapeHtml(issue.gridLocation)}</span>` : ''}
            </div>
          </div>

          <h4 class="card-title" title="${escapeHtml(issue.title)}">${escapeHtml(issue.title)}</h4>
        </div>

        <!-- Snapshot Container -->
        ${issue.snapshotUrl ? `
          <button aria-label="Ampliar captura" class="card-snapshot-container" data-snapshot-url="${issue.snapshotUrl}" data-issue-title="${escapeHtml(issue.title)}">
            <img src="${issue.snapshotUrl}" alt="Snapshot ${escapeHtml(issue.title)}" class="card-snapshot" loading="lazy" />
            <div class="snapshot-overlay">
              <span class="snapshot-overlay-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
                <span>Inspección HD</span>
              </span>
            </div>
          </button>
        ` : ''}

        <!-- Description -->
        <p class="card-description">${escapeHtml(issue.description)}</p>

        <!-- Element IDs & Action row -->
        <div class="card-meta-bottom">
          <div class="revit-ids-row">
            <span class="revit-label">Revit IDs:</span>
            <div class="id-buttons-wrap">
              ${idsHtml}
            </div>
          </div>

          <div class="card-actions-row">
            <!-- Dynamic Status Selector -->
            <div class="status-select-wrapper">
              <span class="status-indicator-dot status-dot-${statusClass}"></span>
              <select aria-label="Estado de la incidencia" class="card-status-select" data-guid="${escapeHtml(issue.guid)}">
                <option value="Open" ${issue.status === 'Open' ? 'selected' : ''}>Abierta</option>
                <option value="Active" ${issue.status === 'Active' ? 'selected' : ''}>Activa</option>
                <option value="In Review" ${issue.status === 'In Review' ? 'selected' : ''}>En Revisión</option>
                <option value="Resolved" ${issue.status === 'Resolved' ? 'selected' : ''}>Resuelta</option>
                <option value="Closed" ${issue.status === 'Closed' ? 'selected' : ''}>Cerrada</option>
              </select>
            </div>

            <!-- Focus 3D button -->
            <button class="btn-focus-3d" data-guid="${escapeHtml(issue.guid)}" title="Centrar cámara 3D en la interferencia">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="22" y1="12" x2="18" y2="12"></line>
                <line x1="6" y1="12" x2="2" y2="12"></line>
                <line x1="12" y1="6" x2="12" y2="2"></line>
                <line x1="12" y1="22" x2="12" y2="18"></line>
              </svg>
              <span>Enfocar 3D</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  private attachEvents(): void {
    // Search input
    const searchInput = document.getElementById('panel-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchQuery = searchInput.value;
        const cursor = searchInput.selectionStart;
        this.applyFilters();
        const input = this.container.querySelector<HTMLInputElement>('#panel-search-input');
        input?.focus();
        if (cursor !== null) input?.setSelectionRange(cursor, cursor);
      });
    }

    const btnClearSearch = document.getElementById('btn-clear-search');
    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        this.searchQuery = '';
        this.applyFilters();
      });
    }

    this.container.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => {
      button.onclick = () => {
        if (button.dataset.filter === 'discipline') this.setDisciplineFilter(button.dataset.value!);
        else this.setStatusFilter(button.dataset.value!);
        this.container.querySelector<HTMLButtonElement>(`[data-filter="${button.dataset.filter}"][data-value="${button.dataset.value}"]`)?.focus();
      };
    });

    // Reset filters button
    const btnReset = document.getElementById('btn-reset-filters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.selectedDiscipline = 'Todas';
        this.selectedStatus = 'Todos';
        this.searchQuery = '';
        this.applyFilters();
      });
    }

    // Copy Revit Element ID buttons with micro-feedback
    this.container.querySelectorAll('.btn-revit-id').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).getAttribute('data-revit-id');
        if (id && !btn.classList.contains('copied')) {
          navigator.clipboard.writeText(id).then(() => {
            const originalContent = btn.innerHTML;
            btn.classList.add('copied');
            btn.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2E7D5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>¡Copiado!</span>
            `;
            setTimeout(() => {
              btn.innerHTML = originalContent;
              btn.classList.remove('copied');
            }, 1400);

            showToast(`Element ID ${id} copiado. Pega en Revit con "Seleccionar por Id".`, 'success', 2200);
          }).catch(() => {
            showToast(`ID ${id}`, 'info');
          });
        }
      });
    });

    // Card status changer
    this.container.querySelectorAll('.card-status-select').forEach(select => {
      select.addEventListener('click', (e) => e.stopPropagation());
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        const guid = (select as HTMLElement).getAttribute('data-guid');
        const newStatus = (e.target as HTMLSelectElement).value as ClashIssue['status'];
        if (guid) {
          const issue = this.issues.find(i => i.guid === guid);
          if (issue) {
            issue.status = newStatus;
            if (this.onIssueStatusChanged) {
              this.onIssueStatusChanged(guid, newStatus);
            }
            showToast(`Estado de #${issue.index} actualizado a "${newStatus}".`, 'info', 1800);
            this.applyFilters();
          }
        }
      });
    });

    // Focus 3D button
    this.container.querySelectorAll('.btn-focus-3d').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const guid = (btn as HTMLElement).getAttribute('data-guid');
        const issue = this.issues.find(i => i.guid === guid);
        if (issue) void this.focusIssue(issue, true);
      });
    });

    // Snapshot click to zoom modal
    this.container.querySelectorAll('.card-snapshot-container').forEach(box => {
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = (box as HTMLElement).getAttribute('data-snapshot-url');
        const title = (box as HTMLElement).getAttribute('data-issue-title') || 'Inspección de Colisión';
        if (url) this.openImageModal(url, title);
      });
    });

    // Clicking card background focuses in 3D
    this.container.querySelectorAll('.clash-card').forEach(card => {
      card.addEventListener('click', () => {
        const guid = (card as HTMLElement).getAttribute('data-guid');
        const issue = this.issues.find(i => i.guid === guid);
        if (issue) void this.focusIssue(issue, false);
      });
    });
  }

  private async focusIssue(issue: ClashIssue, verbose: boolean): Promise<void> {
    this.container.querySelectorAll('.clash-card.is-focused').forEach(c => c.classList.remove('is-focused'));
    this.container.querySelector(`.clash-card[data-guid="${CSS.escape(issue.guid)}"]`)?.classList.add('is-focused');
    const mode = await this.viewer.focusClash(issue.viewpoint, issue.ifcGuids);
    if (mode === 'elements') {
      showToast(`#${issue.index}: elementos en colisión resaltados en rojo (#E0301E).`, 'success', 2500);
    } else if (mode === 'camera') {
      showToast(`#${issue.index}: cámara y baliza 3D del viewpoint BCF sincronizadas con éxito.`, 'success', 2800);
    } else if (mode === 'none') {
      showToast(`#${issue.index}: modelo encuadrado. Comprueba si el BCF corresponde a este modelo IFC.`, 'info', 3500);
    }
  }

  /**
   * Opens high-resolution modal with zoom & pan navigation
   */
  private openImageModal(url: string, title: string): void {
    let modal = document.getElementById('image-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'image-modal';
      modal.className = 'image-modal';
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-window">
          <div class="modal-header">
            <div class="modal-header-left">
              <span class="modal-indicator"></span>
              <h3 id="modal-title" class="modal-title">Inspección de Incidencia</h3>
            </div>
            <div class="modal-toolbar">
              <button id="modal-zoom-out" class="modal-tool-btn" title="Alejar (-)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
              <span id="modal-zoom-level" class="modal-zoom-text">100%</span>
              <button id="modal-zoom-in" class="modal-tool-btn" title="Acercar (+)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
              <button id="modal-zoom-reset" class="modal-tool-btn" title="Restablecer escala">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
              </button>
              <button class="modal-close" title="Cerrar (Esc)">&times;</button>
            </div>
          </div>
          <div class="modal-viewport">
            <img id="modal-img" src="" alt="Snapshot HD" />
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      let zoom = 1.0;
      const img = modal.querySelector('#modal-img') as HTMLImageElement;
      const zoomText = modal.querySelector('#modal-zoom-level') as HTMLElement;

      const updateZoom = (z: number) => {
        zoom = Math.min(Math.max(z, 0.5), 3.0);
        if (img) img.style.transform = `scale(${zoom})`;
        if (zoomText) zoomText.textContent = `${Math.round(zoom * 100)}%`;
      };

      modal.querySelector('#modal-zoom-in')?.addEventListener('click', () => updateZoom(zoom + 0.25));
      modal.querySelector('#modal-zoom-out')?.addEventListener('click', () => updateZoom(zoom - 0.25));
      modal.querySelector('#modal-zoom-reset')?.addEventListener('click', () => updateZoom(1.0));

      const closeModal = () => {
        modal?.classList.remove('open');
        updateZoom(1.0);
      };

      modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
      modal.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && modal?.classList.contains('open')) {
          closeModal();
        }
      });
    }

    const titleEl = modal.querySelector('#modal-title');
    if (titleEl) titleEl.textContent = title;

    const img = modal.querySelector('#modal-img') as HTMLImageElement;
    if (img) {
      img.src = url;
      img.style.transform = 'scale(1)';
    }
    const zoomText = modal.querySelector('#modal-zoom-level');
    if (zoomText) zoomText.textContent = '100%';

    modal.classList.add('open');
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
