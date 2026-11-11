export interface ClashElementRef {
  id: string; // Revit Element ID or IfcGuid
  name?: string;
  category?: string;
  discipline?: string;
}

export interface BcfViewpointCamera {
  projection?: 'Perspective' | 'Orthographic';
  fieldOfView?: number;
  viewToWorldScale?: number;
  position?: { x: number; y: number; z: number };
  target?: { x: number; y: number; z: number };
  direction?: { x: number; y: number; z: number };
  up?: { x: number; y: number; z: number };
}

export interface ClashIssue {
  guid: string;
  index: number;
  title: string;
  description: string;
  status: 'Active' | 'Open' | 'In Review' | 'Resolved' | 'Closed';
  type: 'Clash' | 'Issue' | 'Clearance' | 'Duplicate' | 'Information';
  priority: 'Critical' | 'High' | 'Normal' | 'Low';
  discipline: 'Comunicaciones' | 'Estructuras' | 'Arquitectura' | 'Sanitarias' | 'Eléctricas' | 'General';
  author: string;
  creationDate: string;
  assignedTo?: string;
  snapshotUrl?: string;
  viewpoint?: BcfViewpointCamera;
  elementIds: string[]; // Revit Element IDs (e.g. ["451290", "209381"])
  ifcGuids: string[];   // IFC GUIDs (e.g. ["2f_O$W9yH50uYv2K50mK1k"])
  commentsCount: number;
  labels: string[];
  gridLocation?: string; // e.g. "Eje 3-C"
  level?: string;        // e.g. "Nivel 02 (+3.60m)"
  clearanceMm?: number;  // e.g. 0 (Hard Clash) or 85 mm (Clearance Violation)
}
