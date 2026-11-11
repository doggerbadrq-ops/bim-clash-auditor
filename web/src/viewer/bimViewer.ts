import workerUrl from '@thatopen/fragments/worker?url';
import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as FRAGS from '@thatopen/fragments';
import { BcfViewpointCamera } from '../types';

/** Información de cada modelo IFC federado en la escena */
export interface LoadedModelInfo {
  id: string;
  name: string;
  sizeMb: string;
  visible: boolean;
}

type Axis = 'X' | 'Y' | 'Z';

export class BimViewer {
  public container: HTMLElement;
  public components: OBC.Components;
  public world!: OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>;
  public ifcLoader!: OBC.IfcLoader;
  public fragments!: OBC.FragmentsManager;
  public clipper!: OBC.Clipper;

  /** Se dispara cada vez que cambia la lista de modelos federados */
  public onModelsChanged?: (models: LoadedModelInfo[]) => void;

  private isTransparent = false;
  private clashMarkerGroup: THREE.Group;
  private placeholder?: THREE.Group;
  private gridHelper?: THREE.GridHelper;

  // ── Federación: todos los IFC cargados conviven en la escena ──
  private models = new Map<string, { model: FRAGS.FragmentsModel; info: LoadedModelInfo }>();

  // ── Planos de corte (todos gestionados por OBC.Clipper) ──
  private axisPlaneIds = new Map<Axis, string>();
  private lastPlaneId?: string;
  private scissorsActive = false;
  private scissorsDown?: { x: number; y: number };
  public onScissorsChanged?: (active: boolean) => void;

  // ── Zoom con rueda hacia el cursor ──
  private wheelPivotCache?: { point: THREE.Vector3 | null; x: number; y: number; t: number };
  private wheelBusy = false;
  private pendingWheel = 0;
  private lastWheelEvent?: WheelEvent;

  constructor(container: HTMLElement) {
    this.container = container;
    this.components = new OBC.Components();
    this.clashMarkerGroup = new THREE.Group();
    this.clashMarkerGroup.name = 'ClashMarkersGroup';
  }

  public async init() {
    // 1. Mundo
    const worlds = this.components.get(OBC.Worlds);
    this.world = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();

    // 2. Escena
    this.world.scene = new OBC.SimpleScene(this.components);
    this.world.scene.setup({
      backgroundColor: new THREE.Color('#F4F0E8'),
      ambientLight: { color: new THREE.Color('#F5F2EB'), intensity: 1.4 },
      directionalLight: {
        color: new THREE.Color('#FFFDF9'),
        intensity: 2.0,
        position: new THREE.Vector3(45, 90, 45)
      }
    });

    // 3. Renderer
    this.world.renderer = new OBC.SimpleRenderer(this.components, this.container);

    // 4. Cámara
    this.world.camera = new OBC.SimpleCamera(this.components);
    this.world.camera.controls?.setLookAt(28, 24, 28, 0, 1.8, 0);

    const ctrl = this.world.camera.controls;
    if (ctrl) {
      ctrl.azimuthRotateSpeed = 1.0;
      ctrl.polarRotateSpeed = 1.0;
      ctrl.truckSpeed = 2.0;
      ctrl.smoothTime = 0.12;
      ctrl.draggingSmoothTime = 0.05;
      ctrl.minDistance = 0.01;
      ctrl.maxDistance = Infinity;
      ctrl.dollyToCursor = false;
      // La rueda la gestiona nuestro propio manejador (zoom hacia el punto bajo el cursor)
      const ACTION = (ctrl.constructor as any).ACTION;
      ctrl.mouseButtons.wheel = ACTION?.NONE ?? 0;
    }

    // 5. Grilla
    this.gridHelper = new THREE.GridHelper(80, 40, 0xffffff, 0xffffff);
    this.gridHelper.position.y = -0.01;
    (this.gridHelper.material as THREE.Material).transparent = true;
    (this.gridHelper.material as THREE.Material).opacity = 0.55;
    this.world.scene.three.add(this.gridHelper);
    this.world.scene.three.add(this.clashMarkerGroup);

    // 6. Fragments + IFC
    this.fragments = this.components.get(OBC.FragmentsManager);
    this.fragments.init(workerUrl);
    this.world.camera.controls.addEventListener('update', () => {
      void this.fragments.core.update();
    });
    this.applyTheme();

    this.ifcLoader = this.components.get(OBC.IfcLoader);
    await this.ifcLoader.setup({
      wasm: { path: '/', absolute: true },
      autoSetWasm: false,
      webIfc: {
        COORDINATE_TO_ORIGIN: true,
        ALLOW_INCOMPATIBLE_SCHEMA_ALIASES: true
      }
    });

    // 7. Raycaster del mundo (lo usan la tijera, el zoom y el pivote de órbita)
    this.components.get(OBC.Raycasters).get(this.world);

    // 8. Clipper — planos de corte interactivos con flecha de arrastre
    this.clipper = this.components.get(OBC.Clipper);
    this.clipper.setup({ color: new THREE.Color('#C85A32'), opacity: 0.12, size: 5 });
    this.clipper.enabled = true;
    this.clipper.visible = true;
    this.clipper.orthogonalY = true;   // losas con pendiente leve → corte horizontal puro
    this.clipper.toleranceOrthogonalY = 0.9;

    this.components.init();

    // Orbitar alrededor del punto clicado (como Trimble Connect / Navisworks)
    this.world.dynamicAnchor = true;

    // Eventos
    window.addEventListener('resize', this.onResize);
    const dom = this.world.renderer.three.domElement;
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('pointerdown', this.onScissorsPointerDown);
    dom.addEventListener('pointerup', this.onScissorsPointerUp);

    this.createArchitecturalSamplePavilion();
  }

  public applyTheme() {
    if (!this.gridHelper) return;
    const styles = getComputedStyle(document.documentElement);
    const color = (token: string) => styles.getPropertyValue(token).trim();
    this.world.scene.three.background = new THREE.Color(color('--bg-canvas'));
    this.gridHelper.material.color.set(color('--text-secondary'));
    this.gridHelper.material.opacity = 0.20;
  }

  // =========================================================
  // MODELO DE MUESTRA (se retira al cargar el primer IFC)
  // =========================================================
  private createArchitecturalSamplePavilion() {
    const group = new THREE.Group();
    group.name = 'PlaceholderBuilding';

    const slabMat = new THREE.MeshStandardMaterial({ color: 0xd6ccba, roughness: 0.85, metalness: 0.05 });
    const slab1 = new THREE.Mesh(new THREE.BoxGeometry(26, 0.35, 18), slabMat);
    group.add(slab1);
    const slab2 = slab1.clone();
    slab2.position.set(-4.4, 3.8, 0);
    slab2.scale.x = 0.66;
    group.add(slab2);

    const colMat = new THREE.MeshStandardMaterial({ color: 0xc3b5a1, roughness: 0.75, metalness: 0.05 });
    const colGeo = new THREE.BoxGeometry(0.5, 3.8, 0.5);
    for (const [x, z] of [[-10, -7], [0, -7], [10, -7], [-10, 0], [0, 0], [10, 0], [-10, 7], [0, 7], [10, 7]]) {
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(x, 1.9, z);
      group.add(col);
    }

    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.65, 18),
      new THREE.MeshStandardMaterial({ color: 0xC85A32, roughness: 0.65, metalness: 0.1 }));
    beam.position.set(0, 3.475, 0);
    group.add(beam);

    const tray = new THREE.Mesh(new THREE.BoxGeometry(24, 0.12, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x4D7DF2, roughness: 0.85, metalness: 0.04 }));
    tray.position.set(0, 3.475, 0);
    group.add(tray);

    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 16, 24),
      new THREE.MeshStandardMaterial({ color: 0x2E7D5B, roughness: 0.4, metalness: 0.2 }));
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(4.0, 3.2, 0);
    group.add(pipe);

    const timber = new THREE.MeshStandardMaterial({ color: 0x927257, roughness: 0.93 });
    const mullion = new THREE.BoxGeometry(0.16, 3.5, 0.42);
    for (let i = 0; i < 24; i++) {
      const fin = new THREE.Mesh(mullion, timber);
      fin.position.set(-12.4 + i * 0.7, 5.66, -8.5);
      group.add(fin);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.26, 8.5), slabMat);
    roof.position.set(-4.4, 7.55, -4.7);
    group.add(roof);
    for (const x of [-12, -4, 3.5]) {
      for (const z of [-8, -1]) {
        const column = new THREE.Mesh(colGeo, colMat);
        column.position.set(x, 5.7, z);
        group.add(column);
      }
    }
    for (let i = 0; i < 16; i++) {
      const height = (i + 1) * 3.8 / 16;
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.4, height, 2.4), slabMat);
      step.position.set(10.4 - i * 0.4, height / 2 + 0.17, 6.5);
      group.add(step);
    }

    this.world.scene.three.add(group);
    group.updateMatrixWorld(true);
    // Registrar las mallas para que la tijera y el zoom también funcionen sobre la muestra
    group.traverse(child => {
      if ((child as THREE.Mesh).isMesh) this.world.meshes.add(child as THREE.Mesh);
    });
    this.placeholder = group;
  }

  private removePlaceholder() {
    const group = this.placeholder;
    if (!group) return;
    this.world.scene.three.remove(group);
    group.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      this.world.meshes.delete(mesh);
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(m => m?.dispose());
    });
    this.placeholder = undefined;
  }

  // =========================================================
  // FEDERACIÓN DE MODELOS IFC
  // =========================================================

  public getModels(): LoadedModelInfo[] {
    return [...this.models.values()].map(m => ({ ...m.info }));
  }

  public get modelCount(): number {
    return this.models.size;
  }

  /**
   * Carga un IFC y lo AÑADE a la escena (no reemplaza los anteriores).
   * Los modelos se alinean automáticamente al sistema de coordenadas del primero.
   */
  public async loadIfc(data: Uint8Array, fileName: string, onProgress: (fraction: number) => void, sizeMb = '') {
    // Si se vuelve a cargar el mismo archivo, se reemplaza solo esa disciplina
    const existing = [...this.models.values()].find(m => m.info.name === fileName);
    if (existing) await this.removeModel(existing.info.id);

    const isFirstModel = this.models.size === 0;
    if (isFirstModel) {
      // Primer modelo: asegurar que el origen de coordinación se tome de él
      (this.fragments.core as any).baseCoordinates = null;
    }

    const id = crypto.randomUUID();
    const model = await this.ifcLoader.load(data, true, id, {
      processData: { progressCallback: onProgress }
    });

    if (isFirstModel) {
      try {
        const matrix = await model.getCoordinationMatrix();
        this.fragments.baseCoordinationMatrix = matrix.clone();
        this.fragments.baseCoordinationModel = id;
      } catch (e) {
        console.warn('[BIM Auditor] No se pudo obtener la matriz de coordinación del primer modelo:', e);
      }
    }
    model.object.name = fileName;
    model.useCamera(this.world.camera.three);
    this.world.scene.three.add(model.object);
    model.object.updateMatrixWorld(true);

    this.removePlaceholder();
    this.models.set(id, { model, info: { id, name: fileName, sizeMb, visible: true } });

    if (this.isTransparent) await model.setOpacity(undefined, 0.25);
    await this.fragments.core.update(true);

    // Solo se encuadra automáticamente con el primer modelo, para no perder la vista actual
    if (this.models.size === 1) this.fitModelToFrame();
    this.emitModelsChanged();
  }

  public async removeModel(id: string) {
    const entry = this.models.get(id);
    if (!entry) return;
    this.models.delete(id);
    this.world.scene.three.remove(entry.model.object);
    await this.fragments.core.disposeModel(id);
    if (this.models.size === 0) {
      (this.fragments.core as any).baseCoordinates = null;
      this.clearClashMarkers();
    }
    this.emitModelsChanged();
  }

  public setModelVisible(id: string, visible: boolean) {
    const entry = this.models.get(id);
    if (!entry) return;
    entry.info.visible = visible;
    entry.model.object.visible = visible;
    void this.fragments.core.update(true);
    this.emitModelsChanged();
  }

  /** Cierra TODOS los modelos IFC y libera memoria */
  public async clearPreviousModels() {
    for (const id of [...this.models.keys()]) {
      const entry = this.models.get(id)!;
      this.world.scene.three.remove(entry.model.object);
      await this.fragments.core.disposeModel(id);
    }
    this.models.clear();
    (this.fragments.core as any).baseCoordinates = null;
    this.clearClashMarkers();
    this.emitModelsChanged();
  }

  private emitModelsChanged() {
    this.onModelsChanged?.(this.getModels());
  }

  /** Caja envolvente de todo lo visible (modelos IFC + muestra) */
  private getSceneBox(onlyVisible = true): THREE.Box3 {
    const box = new THREE.Box3();
    for (const { model, info } of this.models.values()) {
      if (onlyVisible && !info.visible) continue;
      const b = model.box;
      if (!b.isEmpty()) box.union(b);
    }
    if (this.placeholder) box.expandByObject(this.placeholder);
    return box;
  }

  // =========================================================
  // RAYOS X
  // =========================================================
  public toggleTransparency(): boolean {
    this.isTransparent = !this.isTransparent;
    const opacity = this.isTransparent ? 0.25 : 1.0;

    const jobs: Promise<void>[] = [];
    for (const { model } of this.models.values()) {
      jobs.push(this.isTransparent ? model.setOpacity(undefined, opacity) : model.resetOpacity(undefined));
    }
    void Promise.all(jobs).then(() => this.fragments.core.update(true));

    this.placeholder?.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.transparent = opacity < 1;
        m.opacity = opacity;
        m.depthWrite = opacity >= 0.85;
        m.needsUpdate = true;
      }
    });
    return this.isTransparent;
  }

  // =========================================================
  // ENFOQUE DE COLISIONES BCF
  // =========================================================

  /**
   * Enfoca una incidencia BCF.
   * 1º intenta localizar los elementos por IfcGuid en TODOS los modelos cargados
   *    y encuadra su caja (método robusto, no depende de coordenadas).
   * 2º si no hay coincidencias, usa la cámara del viewpoint BCF convertida
   *    de Z-arriba (BCF/IFC) a Y-arriba (Three.js) y al origen del modelo.
   * Devuelve qué método se usó, para informar al usuario.
   */
  public async focusClash(viewpoint?: BcfViewpointCamera, ifcGuids: string[] = []): Promise<'elements' | 'camera' | 'none' | 'no-model'> {
    this.clearClashMarkers();
    await this.fragments.resetHighlight();

    if (this.models.size === 0 && !this.placeholder) {
      this.showNoIfcWarning();
      return 'no-model';
    }

    // ── 1. Por elementos (IfcGuid) ──
    if (ifcGuids.length && this.models.size) {
      try {
        const map = await this.fragments.guidsToModelIdMap(ifcGuids);
        const found: OBC.ModelIdMap = {};
        let count = 0;
        for (const [modelId, ids] of Object.entries(map)) {
          if (ids.size) { found[modelId] = ids; count += ids.size; }
        }
        if (count > 0) {
          const box = new THREE.Box3();
          for (const [modelId, ids] of Object.entries(found)) {
            const model = this.fragments.list.get(modelId);
            if (!model) continue;
            box.union(await model.getMergedBox([...ids]));
          }
          await this.fragments.highlight({
            color: new THREE.Color('#E0301E'),
            renderedFaces: FRAGS.RenderedFaces.TWO,
            opacity: 1,
            transparent: false
          }, found);
          await this.fragments.core.update(true);

          const center = box.getCenter(new THREE.Vector3());
          this.addArchitecturalClashPin(center.x, center.y, center.z, box.min.y);

          // Si el BCF incluye posición de cámara, colocamos la cámara allí mirando al elemento
          if (viewpoint?.position) {
            const camPos = this.bcfPointToScene(viewpoint.position);
            this.world.camera.controls.setLookAt(camPos.x, camPos.y, camPos.z, center.x, center.y, center.z, true);
          } else {
            const bcfDir = viewpoint ? this.bcfDirectionToScene(viewpoint, center) : null;
            this.frameBox(box, bcfDir ?? undefined);
          }
          return 'elements';
        }
      } catch (err) {
        console.warn('[BIM Auditor] Error localizando elementos por IfcGuid:', err);
      }
    }

    // ── 2. Por cámara del viewpoint (BCF Snapshot alignment) ──
    if (viewpoint?.position) {
      const pos = this.bcfPointToScene(viewpoint.position);
      const dir = this.bcfDirectionToScene(viewpoint, pos) ?? new THREE.Vector3(0, 0, -1);

      let target: THREE.Vector3;
      if (viewpoint.target) {
        target = this.bcfPointToScene(viewpoint.target);
      } else {
        const sceneBox = this.getSceneBox(false);
        let lookDist = 12;
        if (!sceneBox.isEmpty()) {
          const toCenter = sceneBox.getCenter(new THREE.Vector3()).sub(pos);
          const proj = toCenter.dot(dir);
          lookDist = THREE.MathUtils.clamp(proj, 3, 40);
        }
        target = pos.clone().addScaledVector(dir, lookDist);
      }

      this.addArchitecturalClashPin(target.x, target.y, target.z);
      this.world.camera.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
      return 'camera';
    }

    this.fitModelToFrame();
    return 'none';
  }

  /**
   * Transforma un punto BCF a la escena Three.js con selección inteligente del mejor espacio de coordenadas.
   * Evalúa la matriz de coordinación de ThatOpen, transformaciones de ejes y coordenadas locales,
   * escogiendo el candidato matemáticamente coherente con el volumen del edificio.
   */
  private bcfPointToScene(p: { x: number; y: number; z: number }): THREE.Vector3 {
    const sceneBox = this.getSceneBox(false);

    // Candidato 1: Directo con matriz base de coordinación ThatOpen (Estándar nativo)
    const vDirect = new THREE.Vector3(p.x, p.y, p.z);
    if (this.models.size) this.fragments.applyBaseCoordinateSystem(vDirect, new THREE.Matrix4());

    // Candidato 2: Z-up a Y-up manual transformado con la matriz base
    const vSwapped = new THREE.Vector3(p.x, p.z, -p.y);
    if (this.models.size) this.fragments.applyBaseCoordinateSystem(vSwapped, new THREE.Matrix4());

    // Candidato 3: Directo crudo (BCFs con coordenadas locales al origen)
    const vRaw = new THREE.Vector3(p.x, p.y, p.z);

    // Candidato 4: Swapped crudo
    const vRawSwapped = new THREE.Vector3(p.x, p.z, -p.y);

    if (sceneBox.isEmpty()) return vDirect;

    const candidates = [vDirect, vSwapped, vRaw, vRawSwapped];
    let best = vDirect;
    let minDistance = Infinity;

    for (const cand of candidates) {
      if (!Number.isFinite(cand.x) || !Number.isFinite(cand.y) || !Number.isFinite(cand.z)) continue;
      const d = sceneBox.distanceToPoint(cand);
      if (d < minDistance) {
        minDistance = d;
        best = cand;
      }
    }

    return best.clone();
  }

  /**
   * Transforma la dirección de vista del viewpoint BCF hacia la escena Three.js,
   * orientándola siempre de forma coherente hacia el objetivo del modelo.
   */
  private bcfDirectionToScene(vp: BcfViewpointCamera, referencePos?: THREE.Vector3): THREE.Vector3 | null {
    const d = vp.direction
      ?? (vp.position && vp.target
        ? { x: vp.target.x - vp.position.x, y: vp.target.y - vp.position.y, z: vp.target.z - vp.position.z }
        : null);
    if (!d) return null;

    const rot = this.models.size ? new THREE.Matrix4().extractRotation(this.fragments.baseCoordinationMatrix) : null;

    // Candidatos de dirección
    const vDirect = new THREE.Vector3(d.x, d.y, d.z);
    if (rot) vDirect.applyMatrix4(rot);
    vDirect.normalize();

    const vSwapped = new THREE.Vector3(d.x, d.z, -d.y);
    if (rot) vSwapped.applyMatrix4(rot);
    vSwapped.normalize();

    const vRaw = new THREE.Vector3(d.x, d.y, d.z).normalize();
    const vRawSwapped = new THREE.Vector3(d.x, d.z, -d.y).normalize();

    const sceneBox = this.getSceneBox(false);
    if (!sceneBox.isEmpty() && referencePos) {
      const toCenter = sceneBox.getCenter(new THREE.Vector3()).sub(referencePos).normalize();
      const candidates = [vDirect, vSwapped, vRaw, vRawSwapped];
      let best = vDirect;
      let maxDot = -Infinity;
      for (const cand of candidates) {
        if (!Number.isFinite(cand.x) || !Number.isFinite(cand.y) || !Number.isFinite(cand.z)) continue;
        const dot = cand.dot(toCenter);
        if (dot > maxDot) {
          maxDot = dot;
          best = cand;
        }
      }
      return best.clone();
    }

    return vDirect;
  }

  /** Encuadra una caja, opcionalmente mirando desde la dirección dada */
  private frameBox(box: THREE.Box3, viewDir?: THREE.Vector3) {
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.75);
    const cam = this.world.camera.three as THREE.PerspectiveCamera;
    const fov = THREE.MathUtils.degToRad(cam.fov ?? 60);
    const dist = (radius / Math.sin(fov / 2)) * 1.35;
    const dir = (viewDir?.clone() ?? new THREE.Vector3(-0.6, -0.5, -0.6)).normalize();
    const pos = center.clone().addScaledVector(dir, -dist);
    this.world.camera.controls.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, true);
  }

  private showNoIfcWarning() {
    const el = document.getElementById('no-ifc-warning');
    if (!el) return;
    el.style.display = 'flex';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
  }

  public clearClashMarkers() {
    while (this.clashMarkerGroup.children.length > 0) {
      const obj = this.clashMarkerGroup.children[0] as THREE.Mesh;
      obj.geometry?.dispose();
      const material = obj.material;
      for (const item of Array.isArray(material) ? material : [material]) item?.dispose();
      this.clashMarkerGroup.remove(obj);
    }
  }

  /**
   * Marcador de colisión de alta visibilidad:
   * Baliza luminosa con esfera emisiva (#E0301E), mira circular concéntrica y plomada vertical.
   */
  public addArchitecturalClashPin(x: number, y: number, z: number, floorY?: number) {
    const baseY = floorY ?? (y - 3.0);

    // 1. Plomada vertical láser punteada
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, baseY, z), new THREE.Vector3(x, y, z)]),
      new THREE.LineDashedMaterial({ color: 0xE0301E, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.9 })
    );
    line.computeLineDistances();
    this.clashMarkerGroup.add(line);

    // 2. Baliza esférica radiante
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0xE0301E,
        roughness: 0.2,
        metalness: 0.3,
        emissive: 0xFF2200,
        emissiveIntensity: 0.8,
        depthTest: false
      })
    );
    sphere.renderOrder = 9999;
    sphere.position.set(x, y, z);
    this.clashMarkerGroup.add(sphere);

    // 3. Diana / Mira horizontal concéntrica
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 48),
      new THREE.MeshBasicMaterial({
        color: 0xE0301E,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthTest: false
      })
    );
    ring.renderOrder = 9999;
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y, z);
    this.clashMarkerGroup.add(ring);

    // 4. Anillo exterior sutil
    const ringOuter = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.12, 48),
      new THREE.MeshBasicMaterial({
        color: 0xFFA500,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        depthTest: false
      })
    );
    ringOuter.renderOrder = 9999;
    ringOuter.rotation.x = Math.PI / 2;
    ringOuter.position.set(x, y, z);
    this.clashMarkerGroup.add(ringOuter);
  }

  // =========================================================
  // NAVEGACIÓN
  // =========================================================

  public fitModelToFrame() {
    const box = this.getSceneBox();
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray());
    const dist = Math.max(maxDim * 1.6, 12);
    this.world.camera.controls.setLookAt(
      center.x + dist * 0.65, center.y + dist * 0.55, center.z + dist * 0.65,
      center.x, center.y, center.z, true
    );
  }

  public resetView() { this.fitModelToFrame(); }

  public setView(direction: 'top' | 'front' | 'right' | 'iso') {
    const box = this.getSceneBox();
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z) * 1.8 + 5;
    const positions: Record<string, [number, number, number]> = {
      top: [c.x, c.y + d, c.z + 0.001],
      front: [c.x, c.y, c.z + d],
      right: [c.x + d, c.y, c.z],
      iso: [c.x + d * 0.65, c.y + d * 0.55, c.z + d * 0.65],
    };
    const [px, py, pz] = positions[direction];
    this.world.camera.controls.setLookAt(px, py, pz, c.x, c.y, c.z, true);
  }

  /**
   * Zoom con rueda estilo Trimble Connect / Navisworks:
   * avanza hacia el punto de la geometría bajo el cursor, con un paso
   * proporcional a la distancia a ese punto (rápido de lejos, preciso de cerca),
   * y nunca se "frena" porque no depende del target de órbita.
   */
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 33;
    else if (e.deltaMode === 2) delta *= this.container.clientHeight;
    this.pendingWheel += delta;
    this.lastWheelEvent = e;
    if (!this.wheelBusy) void this.flushWheel();
  };

  private async flushWheel() {
    this.wheelBusy = true;
    try {
      while (this.pendingWheel !== 0 && this.lastWheelEvent) {
        const delta = this.pendingWheel;
        this.pendingWheel = 0;
        await this.applyWheelZoom(delta, this.lastWheelEvent);
      }
    } finally {
      this.wheelBusy = false;
    }
  }

  private async applyWheelZoom(delta: number, e: WheelEvent) {
    const ctrl = this.world.camera.controls;
    const dom = this.world.renderer.three.domElement;
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    // Pivote: geometría bajo el cursor (cache breve para no lanzar rayos en cada "clic" de rueda)
    const now = performance.now();
    const c = this.wheelPivotCache;
    let pivot: THREE.Vector3 | null;
    if (c && now - c.t < 350 && Math.abs(c.x - e.clientX) < 6 && Math.abs(c.y - e.clientY) < 6) {
      pivot = c.point;
    } else {
      const caster = this.components.get(OBC.Raycasters).get(this.world);
      const hit = await caster.castRay({ position: ndc }).catch(() => null);
      pivot = hit?.point ? hit.point.clone() : null;
      this.wheelPivotCache = { point: pivot, x: e.clientX, y: e.clientY, t: now };
    }

    const camPos = ctrl.getPosition(new THREE.Vector3());
    const target = ctrl.getTarget(new THREE.Vector3());

    // Dirección: hacia el pivote, o a lo largo del rayo del cursor
    let dir: THREE.Vector3;
    let dist: number;
    const sceneBox = this.getSceneBox();
    const sceneSize = sceneBox.isEmpty() ? 30 : sceneBox.getSize(new THREE.Vector3()).length();
    if (pivot) {
      dir = pivot.clone().sub(camPos);
      dist = dir.length();
      dir.normalize();
    } else {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.world.camera.three);
      dir = ray.ray.direction.clone();
      dist = Math.max(camPos.distanceTo(target), sceneSize * 0.15);
    }

    // ~100 px de rueda = 1 "clic". Cada clic recorre el 22 % de la distancia.
    const notches = THREE.MathUtils.clamp(delta / 100, -6, 6);
    const step = 0.78;
    let move: number;
    if (notches < 0) {
      move = dist * (1 - Math.pow(step, -notches));                 // acercar
      if (pivot) move = Math.min(move, Math.max(dist - 0.05, 0));    // no atravesar la superficie
    } else {
      move = -dist * (Math.pow(1 / step, notches) - 1);              // alejar
    }
    // Paso mínimo para que nunca se quede "pegado"
    const minStep = Math.max(sceneSize * 0.002, 0.02) * Math.sign(-notches);
    if (Math.abs(move) < Math.abs(minStep) && !(pivot && notches < 0 && dist < 0.1)) move = minStep;

    const offset = dir.multiplyScalar(move);
    const newPos = camPos.add(offset);
    const newTarget = target.add(offset);
    await ctrl.setLookAt(newPos.x, newPos.y, newPos.z, newTarget.x, newTarget.y, newTarget.z, true);
  }

  /** Zoom por teclado (+/-) hacia el centro de la pantalla */
  public stepZoom(factor: number) {
    const fake = { clientX: 0, clientY: 0, deltaY: 0, deltaMode: 0 } as WheelEvent;
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    (fake as any).clientX = rect.left + rect.width / 2;
    (fake as any).clientY = rect.top + rect.height / 2;
    void this.applyWheelZoom(factor > 1 ? -100 : 100, fake);
  }

  // =========================================================
  // PLANOS DE CORTE
  // =========================================================

  /** Tijera: el siguiente clic sobre una cara crea un plano de corte paralelo a ella */
  public setScissorsMode(active: boolean) {
    this.scissorsActive = active;
    this.container.classList.toggle('scissors-mode', active);
    this.onScissorsChanged?.(active);
  }

  public get isScissorsActive() { return this.scissorsActive; }

  private onScissorsPointerDown = (e: PointerEvent) => {
    if (!this.scissorsActive || e.button !== 0) return;
    this.scissorsDown = { x: e.clientX, y: e.clientY };
  };

  private onScissorsPointerUp = async (e: PointerEvent) => {
    if (!this.scissorsActive || e.button !== 0 || !this.scissorsDown) return;
    const moved = Math.hypot(e.clientX - this.scissorsDown.x, e.clientY - this.scissorsDown.y);
    this.scissorsDown = undefined;
    if (moved > 5) return; // fue un arrastre de órbita, no un clic
    const plane = await this.clipper.create(this.world);
    if (plane) {
      this.lastPlaneId = this.clipper.list.getKey(plane) ?? undefined;
      this.setScissorsMode(false);
      this.onPlaneCreated?.(true);
    } else {
      this.onPlaneCreated?.(false);
    }
  };

  public onPlaneCreated?: (ok: boolean) => void;

  /** Invierte el último plano creado (muestra el otro lado del corte) */
  public flipLastPlane(): boolean {
    const id = this.lastPlaneId ?? [...this.clipper.list.keys()].pop();
    const plane = id ? this.clipper.list.get(id) : undefined;
    if (!plane) return false;
    plane.setFromNormalAndCoplanarPoint(plane.normal.clone().negate(), plane.origin.clone());
    return true;
  }

  /** Borra el plano que esté bajo el cursor */
  public async deletePlaneUnderCursor() {
    await this.clipper.delete(this.world);
    this.syncAxisPlanes();
  }

  public get planeCount() { return this.clipper.list.size; }

  /** Activa/desactiva un plano por eje (Corte H = Y, Corte V = X) */
  public toggleClipPlane(axis: Axis, offset = 0.5): boolean {
    const existing = this.axisPlaneIds.get(axis);
    if (existing && this.clipper.list.has(existing)) {
      this.clipper.list.delete(existing);
      this.axisPlaneIds.delete(axis);
      return false;
    }
    const box = this.getSceneBox();
    if (box.isEmpty()) return false;
    const { normal, point } = this.axisPlaneGeometry(axis, box, offset);
    const id = this.clipper.createFromNormalAndCoplanarPoint(this.world, normal, point);
    const plane = this.clipper.list.get(id);
    if (plane) { plane.visible = true; plane.enabled = true; }
    this.axisPlaneIds.set(axis, id);
    this.lastPlaneId = id;
    return true;
  }

  public isClipPlaneActive(axis: Axis): boolean {
    const id = this.axisPlaneIds.get(axis);
    return !!id && this.clipper.list.has(id);
  }

  public setClipPlaneOffset(axis: Axis, offset: number) {
    if (!this.isClipPlaneActive(axis)) this.toggleClipPlane(axis, offset);
    const plane = this.clipper.list.get(this.axisPlaneIds.get(axis)!);
    if (!plane) return;
    const box = this.getSceneBox();
    if (box.isEmpty()) return;
    const { point } = this.axisPlaneGeometry(axis, box, offset);
    plane.setFromNormalAndCoplanarPoint(plane.normal.clone(), point);
  }

  public nudgeClipPlane(axis: Axis, delta: number) {
    const id = this.axisPlaneIds.get(axis);
    const plane = id ? this.clipper.list.get(id) : undefined;
    if (!plane) return;
    const axisVec = axis === 'X' ? new THREE.Vector3(1, 0, 0) : axis === 'Y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    plane.setFromNormalAndCoplanarPoint(plane.normal.clone(), plane.origin.clone().addScaledVector(axisVec, delta));
  }

  private axisPlaneGeometry(axis: Axis, box: THREE.Box3, offset: number) {
    const center = box.getCenter(new THREE.Vector3());
    const point = center.clone();
    let normal: THREE.Vector3;
    if (axis === 'X') {
      point.x = box.min.x + (box.max.x - box.min.x) * offset;
      normal = new THREE.Vector3(-1, 0, 0);
    } else if (axis === 'Y') {
      point.y = box.min.y + (box.max.y - box.min.y) * offset;
      normal = new THREE.Vector3(0, -1, 0);
    } else {
      point.z = box.min.z + (box.max.z - box.min.z) * offset;
      normal = new THREE.Vector3(0, 0, -1);
    }
    return { normal, point };
  }

  private syncAxisPlanes() {
    for (const [axis, id] of this.axisPlaneIds) {
      if (!this.clipper.list.has(id)) this.axisPlaneIds.delete(axis);
    }
  }

  public clearAllClipPlanes() {
    this.clipper.deleteAll();
    this.axisPlaneIds.clear();
    this.lastPlaneId = undefined;
  }

  // =========================================================

  private onResize = () => {
    this.world?.renderer?.resize(undefined);
    const cam = this.world?.camera?.three as THREE.PerspectiveCamera;
    if (cam?.isPerspectiveCamera) {
      cam.aspect = this.container.clientWidth / this.container.clientHeight;
      cam.updateProjectionMatrix();
    }
  };

  public async dispose() {
    window.removeEventListener('resize', this.onResize);
    await this.clearPreviousModels();
    this.removePlaceholder();
    this.gridHelper?.dispose();
    this.components.dispose();
  }
}
