import { IfcAPI, FlatMesh } from 'web-ifc';

// The shipped WASM binding uses three parameters. Its JS facade also passes
// a fourth, optional scaling flag. Older bindings already apply default scaling.
export function supportBundledIfcBinding(): void {
  const streamMeshes = IfcAPI.prototype.StreamMeshes;
  IfcAPI.prototype.StreamMeshes = function (
    this: IfcAPI,
    model: number,
    ids: number[],
    visit: (mesh: FlatMesh, index: number, total: number) => void,
    scale: boolean = true
  ): void {
    try {
      return streamMeshes.call(this, model, ids, visit, scale);
    } catch (error) {
      if (scale && error instanceof Error &&
          error.message.includes('StreamMeshes called with 4 arguments, expected 3')) {
        return (this as any).wasmModule.StreamMeshes(model, ids, visit);
      }
      throw error;
    }
  };
}
