import { ClashIssue } from '../types';

/**
 * Creates an ultra-refined, architectural BIM clash snapshot SVG
 * Styled with engineering precision: isometric projection, coordinate grids, element callouts and clearance dimensions.
 */
function createArchitecturalClashSvg(
  title: string,
  catA: string,
  idA: string,
  catB: string,
  idB: string,
  disciplineA: string = 'Comunicaciones',
  disciplineB: string = 'Estructuras',
  gridRef: string = 'Eje 3-C / +3.60m',
  colorA: string = '#2B58C6', // Slate Blue COM
  colorB: string = '#C85A32'  // Terracotta EST
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340" viewBox="0 0 600 340">
    <title>${disciplineA} vs ${disciplineB}: ${title}</title>
    <defs>
      <!-- Background gradient: warm technical slate -->
      <linearGradient id="viewportBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#181B22"/>
        <stop offset="100%" stop-color="#12141A"/>
      </linearGradient>
      
      <!-- Linear gradients for volumetric CAD objects -->
      <linearGradient id="gradElemA" x1="0" y1="0" x2="1" y2="0.8">
        <stop offset="0%" stop-color="${colorA}"/>
        <stop offset="100%" stop-color="#1A3A8A"/>
      </linearGradient>
      <linearGradient id="gradElemB" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stop-color="${colorB}"/>
        <stop offset="100%" stop-color="#8F3517"/>
      </linearGradient>
      
      <!-- Soft ambient shadow -->
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
      </filter>
      
      <filter id="clashGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <!-- Canvas Base -->
    <rect width="600" height="340" fill="url(#viewportBg)"/>

    <!-- Subtle Architectural Grid (Isometric / Axonometric guidance) -->
    <g stroke="rgba(255, 255, 255, 0.05)" stroke-width="1">
      <line x1="0" y1="60" x2="600" y2="60"/>
      <line x1="0" y1="120" x2="600" y2="120"/>
      <line x1="0" y1="180" x2="600" y2="180"/>
      <line x1="0" y1="240" x2="600" y2="240"/>
      <line x1="100" y1="0" x2="100" y2="340"/>
      <line x1="200" y1="0" x2="200" y2="340"/>
      <line x1="300" y1="0" x2="300" y2="340"/>
      <line x1="400" y1="0" x2="400" y2="340"/>
      <line x1="500" y1="0" x2="500" y2="340"/>
    </g>

    <!-- Technical Grid Bubble Top Left -->
    <g transform="translate(24, 22)">
      <rect x="0" y="0" width="160" height="26" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      <circle cx="14" cy="13" r="5" fill="#D48822"/>
      <text x="26" y="17" fill="#E5DFD5" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="600">${gridRef}</text>
    </g>

    <!-- Project watermark & Viewpoint info -->
    <text x="576" y="38" fill="rgba(229,223,213,0.4)" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" text-anchor="end" font-weight="500">TRIMBLE CONNECT &bull; PERSPECTIVE VIEW</text>

    <!-- 3D Element B: Concrete Beam / Structural Element (Vertical block with depth) -->
    <g transform="translate(260, 45)" filter="url(#softShadow)">
      <!-- Top face -->
      <polygon points="40,25 110,5 170,18 100,38" fill="${colorB}" opacity="0.85"/>
      <!-- Side face -->
      <polygon points="100,38 170,18 170,225 100,245" fill="${colorB}" opacity="0.6"/>
      <!-- Front face -->
      <polygon points="40,25 100,38 100,245 40,230" fill="url(#gradElemB)"/>
      
      <!-- Rebar stirrups dashed indicator -->
      <line x1="52" y1="65" x2="88" y2="73" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="3,3"/>
      <line x1="52" y1="125" x2="88" y2="133" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="3,3"/>
      <line x1="52" y1="185" x2="88" y2="193" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="3,3"/>
    </g>

    <!-- 3D Element A: Cable Tray / Conduit (Horizontal crossing element) -->
    <g transform="translate(60, 110)" filter="url(#softShadow)">
      <!-- Top face -->
      <polygon points="0,40 420,-30 460,-22 40,48" fill="${colorA}" opacity="0.9"/>
      <!-- Front face -->
      <polygon points="0,40 40,48 40,78 0,70" fill="url(#gradElemA)"/>
      <!-- Side face -->
      <polygon points="40,48 460,-22 460,0 40,78" fill="${colorA}" opacity="0.75"/>

      <!-- Cable tray rungs / crossbars -->
      <line x1="60" y1="44" x2="72" y2="46" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>
      <line x1="120" y1="34" x2="132" y2="36" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>
      <line x1="180" y1="24" x2="192" y2="26" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>
      <line x1="240" y1="14" x2="252" y2="16" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>
      <line x1="360" y1="-6" x2="372" y2="-4" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>
    </g>

    <!-- Collision Intersection Highlight (Refined target ring + crosshair) -->
    <g transform="translate(335, 142)" filter="url(#clashGlow)">
      <!-- Outer clearance circle -->
      <circle cx="0" cy="0" r="28" fill="none" stroke="#D48822" stroke-width="2" stroke-dasharray="5,3"/>
      <!-- Inner critical clash zone -->
      <circle cx="0" cy="0" r="14" fill="rgba(200, 90, 50, 0.45)" stroke="#C85A32" stroke-width="2.5"/>
      <!-- Central pinpoint -->
      <circle cx="0" cy="0" r="3.5" fill="#FFFFFF"/>
      <!-- Crosshairs -->
      <line x1="-36" y1="0" x2="-18" y2="0" stroke="#D48822" stroke-width="1.5"/>
      <line x1="18" y1="0" x2="36" y2="0" stroke="#D48822" stroke-width="1.5"/>
      <line x1="0" y1="-36" x2="0" y2="-18" stroke="#D48822" stroke-width="1.5"/>
      <line x1="0" y1="18" x2="0" y2="36" stroke="#D48822" stroke-width="1.5"/>
    </g>

    <!-- Technical Callout Leader Line A (Element A) -->
    <g transform="translate(130, 95)">
      <polyline points="70,30 20,0 -40,0" fill="none" stroke="${colorA}" stroke-width="1.5"/>
      <circle cx="70" cy="30" r="3" fill="${colorA}"/>
      <rect x="-135" y="-18" width="90" height="22" rx="4" fill="#181B22" stroke="${colorA}" stroke-width="1"/>
      <text x="-90" y="-3" fill="#E5DFD5" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="600" text-anchor="middle">ID: ${idA}</text>
      <text x="-90" y="-22" fill="#8C96A8" font-family="-apple-system, sans-serif" font-size="9" text-anchor="middle">${catA}</text>
    </g>

    <!-- Technical Callout Leader Line B (Element B) -->
    <g transform="translate(380, 80)">
      <polyline points="20,25 70,0 130,0" fill="none" stroke="${colorB}" stroke-width="1.5"/>
      <circle cx="20" cy="25" r="3" fill="${colorB}"/>
      <rect x="135" y="-18" width="90" height="22" rx="4" fill="#181B22" stroke="${colorB}" stroke-width="1"/>
      <text x="180" y="-3" fill="#E5DFD5" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="600" text-anchor="middle">ID: ${idB}</text>
      <text x="180" y="-22" fill="#8C96A8" font-family="-apple-system, sans-serif" font-size="9" text-anchor="middle">${catB}</text>
    </g>

    <!-- Bottom Engineering Banner -->
    <g transform="translate(0, 292)">
      <rect width="600" height="48" fill="#15181E" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <!-- Status pill -->
      <rect x="20" y="12" width="100" height="24" rx="12" fill="rgba(200,90,50,0.18)" stroke="#C85A32" stroke-width="1"/>
      <text x="70" y="28" fill="#E06D46" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="700" text-anchor="middle">HARD CLASH</text>
      
      <!-- Issue title -->
      <text x="135" y="28" fill="#E5DFD5" font-family="-apple-system, sans-serif" font-size="12" font-weight="600">${title}</text>
      
      <!-- Clearance tag -->
      <text x="580" y="28" fill="#D48822" font-family="'JetBrains Mono', monospace" font-size="11" text-anchor="end" font-weight="600">INTERSECCIÓN: 0.00 mm</text>
    </g>
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export const SAMPLE_CLASH_ISSUES: ClashIssue[] = [
  {
    guid: 'bcf-com-001-viga',
    index: 1,
    title: 'Bandeja Porta-Cables COM vs Viga Principal VP-101 (Eje 3-C)',
    description: 'La escalerilla portacables de Comunicaciones (ancho 300mm) atraviesa el peralte de la viga principal de concreto armado VP-101 (0.30x0.60m) sin pase estructural coordinado. Se requiere desvío con bayoneta normalizada a 45° por falso cielo o coordinar manga estructural según memoria de cálculo.',
    status: 'Active',
    type: 'Clash',
    priority: 'Critical',
    discipline: 'Comunicaciones',
    author: 'Ing. Supervisor BIM TIC',
    creationDate: '2026-11-04T10:15:00Z',
    assignedTo: 'Ing. Estructural / Modelador TIC',
    gridLocation: 'Eje 3-C / Nivel 02 (+3.60m)',
    level: 'Nivel 02',
    clearanceMm: 0,
    snapshotUrl: createArchitecturalClashSvg(
      'Bandeja COM vs Viga VP-101',
      'Bandeja COM 300mm',
      '451290',
      'Viga Conc. 0.30x0.60',
      '209381',
      'Comunicaciones',
      'Estructuras',
      'Eje 3-C / +3.60m',
      '#2B58C6',
      '#C85A32'
    ),
    viewpoint: {
      position: { x: 14.5, y: 18.2, z: 3.6 },
      target: { x: 12.0, y: 16.0, z: 3.2 },
      up: { x: 0, y: 0, z: 1 }
    },
    elementIds: ['451290', '209381'],
    ifcGuids: ['3u7V8XyQz4Ev$9w12MopQr', '1m9Z3AbCd5Ef$7g89IjkLm'],
    commentsCount: 3,
    labels: ['Comunicaciones', 'Estructuras', 'Hard Clash', 'Prioridad Alta']
  },
  {
    guid: 'bcf-com-002-ducto',
    index: 2,
    title: 'Conduit EMT COM 1-1/4" vs Colector Sanitario PVC 4"',
    description: 'Cruce a nivel sin separación mínima reglamentaria (menor a 150 mm según CNE Suministro y RNE IS.010). La tubería de desagüe por gravedad colisiona en cota de batea con la tubería conduit EMT de fibra óptica que alimenta el Rack Secundario.',
    status: 'In Review',
    type: 'Clash',
    priority: 'High',
    discipline: 'Comunicaciones',
    author: 'Coordinador MEP',
    creationDate: '2026-11-04T11:30:00Z',
    assignedTo: 'Especialista Sanitario',
    gridLocation: 'Eje 2-B / Corredor Norte',
    level: 'Nivel 02',
    clearanceMm: 12,
    snapshotUrl: createArchitecturalClashSvg(
      'Conduit COM vs PVC Sanitario 4"',
      'Conduit EMT 1-1/4"',
      '451302',
      'PVC Desagüe 4"',
      '389104',
      'Comunicaciones',
      'Sanitarias',
      'Eje 2-B / Corredor',
      '#2B58C6',
      '#2E7D5B'
    ),
    viewpoint: {
      position: { x: 8.2, y: 22.4, z: 2.8 },
      target: { x: 8.0, y: 21.9, z: 2.8 },
      up: { x: 0, y: 0, z: 1 }
    },
    elementIds: ['451302', '389104'],
    ifcGuids: ['2a8B7C6D5E4F3G2H1I0J9K', '9Z8Y7X6W5V4U3T2S1R0Q9P'],
    commentsCount: 2,
    labels: ['Comunicaciones', 'Sanitarias', 'Clearance', 'Pabellón B']
  },
  {
    guid: 'bcf-com-003-columna',
    index: 3,
    title: 'Caja F°G° 100x100mm empotrada vs Columna C-1 (0.50x0.50)',
    description: 'La caja de paso octogonal F°G° para sensores de intrusión y datos fue modelada empotrada directamente en el núcleo estructural de la columna C-1, vulnerando la armadura de confinamiento (estribos #3). Se debe reubicar 20 cm a muro adyacente de albañilería.',
    status: 'Active',
    type: 'Clash',
    priority: 'Critical',
    discipline: 'Estructuras',
    author: 'Auditor Estructural',
    creationDate: '2026-11-04T14:00:00Z',
    assignedTo: 'Modelador Eléctrico/TIC',
    gridLocation: 'Eje 1-A / Vestíbulo',
    level: 'Nivel 01',
    clearanceMm: 0,
    snapshotUrl: createArchitecturalClashSvg(
      'Caja COM vs Columna C-1',
      'Caja F°G° 100x100',
      '451315',
      'Columna C-1 0.50x0.50',
      '198420',
      'Comunicaciones',
      'Estructuras',
      'Eje 1-A / Nivel 01',
      '#2B58C6',
      '#C85A32'
    ),
    viewpoint: {
      position: { x: 4.5, y: 12.0, z: 1.5 },
      target: { x: 4.0, y: 12.0, z: 1.2 },
      up: { x: 0, y: 0, z: 1 }
    },
    elementIds: ['451315', '198420'],
    ifcGuids: ['4q8W2E1R3T5Y7U9I0O2P4A', '8k3L5M7N9B1V3C5X7Z9Q0W'],
    commentsCount: 4,
    labels: ['Comunicaciones', 'Estructuras', 'Seguridad Estructural']
  },
  {
    guid: 'bcf-com-004-hvac',
    index: 4,
    title: 'Bandeja de Fibra Óptica vs Ducto de Retorno HVAC 600x400',
    description: 'Interferencia física en el pleno del falso cielo raso del Data Center. El ducto de inyección de aire acondicionado colisiona frontalmente con el tendido primario de fibra óptica monomodo.',
    status: 'In Review',
    type: 'Clash',
    priority: 'High',
    discipline: 'Comunicaciones',
    author: 'Especialista Climatización',
    creationDate: '2026-11-04T16:20:00Z',
    assignedTo: 'Modelador TIC / HVAC',
    gridLocation: 'Eje 4-D / Sala RACK',
    level: 'Nivel 02',
    clearanceMm: 0,
    snapshotUrl: createArchitecturalClashSvg(
      'Bandeja FO vs Ducto HVAC',
      'Bandeja FO 150mm',
      '451328',
      'Ducto HVAC 600x400',
      '512044',
      'Comunicaciones',
      'Mecánicas',
      'Eje 4-D / RACK',
      '#2B58C6',
      '#D48822'
    ),
    viewpoint: {
      position: { x: 18.0, y: 14.2, z: 3.4 },
      target: { x: 16.5, y: 14.0, z: 3.1 },
      up: { x: 0, y: 0, z: 1 }
    },
    elementIds: ['451328', '512044'],
    ifcGuids: ['7v9B1N3M5L7K9J1H3G5F7D', '2x4C6V8B0N2M4L6K8J0H2G'],
    commentsCount: 1,
    labels: ['Comunicaciones', 'Mecánicas', 'HVAC', 'Data Center']
  },
  {
    guid: 'bcf-com-005-tabique',
    index: 5,
    title: 'Salida de Voz/Data RJ45 en Tabique Drywall vs Montante Pluvial',
    description: 'Punto de red doble RJ45 en tabique de yeso colisiona con el montante pluvial vertical de 3" embebido en el mismo vano de montantes de acero galvanizado.',
    status: 'Resolved',
    type: 'Clash',
    priority: 'Normal',
    discipline: 'Arquitectura',
    author: 'Coordinador BIM General',
    creationDate: '2026-11-03T09:00:00Z',
    assignedTo: 'Modelador Arquitectura',
    gridLocation: 'Eje 2-C / Aula 204',
    level: 'Nivel 02',
    clearanceMm: 0,
    snapshotUrl: createArchitecturalClashSvg(
      'Salida RJ45 vs Montante',
      'Salida RJ45 Doble',
      '451340',
      'Tubería Pluvial 3"',
      '312890',
      'Comunicaciones',
      'Arquitectura',
      'Eje 2-C / Aula 204',
      '#2B58C6',
      '#8E75C4'
    ),
    viewpoint: {
      position: { x: 10.5, y: 15.0, z: 1.8 },
      target: { x: 10.0, y: 14.8, z: 1.2 },
      up: { x: 0, y: 0, z: 1 }
    },
    elementIds: ['451340', '312890'],
    ifcGuids: ['5n7M9K1J3H5G7F9D1S3A5P', '1q3W5E7R9T1Y3U5I7O9P1A'],
    commentsCount: 5,
    labels: ['Comunicaciones', 'Arquitectura', 'Coordinado']
  }
];
