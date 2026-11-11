import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('@thatopen/components', () => ({ Components: class {} }));
vi.mock('@thatopen/fragments', () => ({}));
vi.mock('@thatopen/fragments/worker?url', () => ({ default: 'synthetic-worker' }));
import { BimViewer } from '../src/viewer/bimViewer';

function viewer() {
  const instance = new BimViewer(document.createElement('div'));
  instance.fragments = {
    baseCoordinationMatrix: new THREE.Matrix4(),
    core: { disposeModel: vi.fn().mockResolvedValue(undefined) },
  } as any;
  instance.clipper = { deleteAll: vi.fn() } as any;
  instance.world = { scene: { three: new THREE.Scene() } } as any;
  return instance;
}
test('failed replacement retains the old model', async () => {
  const v = viewer();
  (v as any).models.set('old', { model: {}, info: { id: 'old', name: 'synthetic.ifc' } });
  v.ifcLoader = { load: vi.fn().mockRejectedValue(new Error('invalid IFC')) } as any;
  await expect(v.loadIfc(new Uint8Array(), 'synthetic.ifc', () => {})).rejects.toThrow('invalid IFC');
  expect(v.getModels().map(m => m.id)).toEqual(['old']);
  expect(v.fragments.core.disposeModel).not.toHaveBeenCalled();
});
test('failed disposal retains model tracking for retry', async () => {
  const v = viewer();
  (v as any).models.set('old', { model: {}, info: { id: 'old' } });
  vi.mocked(v.fragments.core.disposeModel).mockRejectedValue(new Error('worker unavailable'));
  await expect(v.removeModel('old')).rejects.toThrow();
  expect(v.modelCount).toBe(1);
});
test('last removal clears coordination state and clipping planes', async () => {
  const v = viewer();
  (v as any).models.set('old', { model: { object: new THREE.Group() }, info: { id: 'old' } });
  v.fragments.baseCoordinationMatrix.makeTranslation(100, 200, 300);
  await v.removeModel('old');
  expect(v.modelCount).toBe(0);
  expect(v.fragments.baseCoordinationMatrix.equals(new THREE.Matrix4())).toBe(true);
  expect(v.clipper.deleteAll).toHaveBeenCalled();
});
test('camera position and direction share one transform; translation never affects direction', () => {
  const v = viewer() as any;
  v.fragments.baseCoordinationMatrix.makeRotationX(-Math.PI / 2).setPosition(100, 200, 300);
  const position = v.bcfPointToScene({ x: 1, y: 2, z: 3 });
  const direction = v.bcfDirectionToScene({ direction: { x: 0, y: 0, z: 1 } });
  expect(position.x).toBeCloseTo(101);
  expect(position.y).toBeCloseTo(203);
  expect(position.z).toBeCloseTo(298);
  expect(direction.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-10);
});
test('portrait viewport gets enough distance to frame the same geometry', () => {
  const v = viewer() as any;
  const camera = new THREE.PerspectiveCamera(60, 2);
  const lookAt = vi.fn();
  v.world.camera = { three: camera, projection: { current: 'Perspective' }, controls: { setLookAt: lookAt } };
  const box = new THREE.Box3(new THREE.Vector3(-1,-1,-1), new THREE.Vector3(1,1,1));
  v.frameBox(box);
  const wideDistance = Math.hypot(...lookAt.mock.calls[0].slice(0, 3));
  camera.aspect = 0.5;
  v.frameBox(box);
  expect(Math.hypot(...lookAt.mock.calls[1].slice(0, 3))).toBeGreaterThan(wideDistance);
});

for (const projection of ['Perspective', 'Orthographic']) {
  test(`applies ${projection} projection and reconnects model cameras`, async () => {
    const v = viewer() as any;
    const perspective = new THREE.PerspectiveCamera();
    const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10);
    const active = projection === 'Perspective' ? perspective : ortho;
    const useCamera = vi.fn();
    const zoomTo = vi.fn().mockResolvedValue(undefined);
    v.models.set('model', { model: { useCamera } });
    v.world.camera = {
      three: active, threePersp: perspective, threeOrtho: ortho,
      projection: { set: vi.fn().mockResolvedValue(undefined) },
      controls: { updateCameraUp: vi.fn(), zoomTo },
    };
    await v.applyBcfProjection({ projection, fieldOfView: 75, viewToWorldScale: 5, up: { x: 0, y: 0, z: 1 } });
    expect(v.world.camera.projection.set).toHaveBeenCalledWith(projection);
    expect(useCamera).toHaveBeenCalledWith(active);
    expect(active.up.toArray()).toEqual([0, 0, 1]);
    if (projection === 'Perspective') expect(perspective.fov).toBe(75);
    else expect(zoomTo).toHaveBeenCalledWith(4, false);
  });
}
