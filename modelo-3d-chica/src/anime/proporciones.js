import * as THREE from 'three';
import { smooth, clamp, lerp } from '../util.js';

/*
 * Cambia las proporciones de un VRM en su pose de enlace (bind pose): mueve los
 * vértices de las mallas y las posiciones de los huesos con la misma función y
 * después recalcula las matrices inversas del esqueleto. Así el modelo sigue
 * animándose bien con las nuevas medidas.
 *
 * op: { cabeza, cuello, piernas, cadera, busto, iris }  (1 = sin cambios)
 */
export function aplicarProporciones(vrm, op) {
  const escena = vrm.scene;
  escena.updateMatrixWorld(true);
  const H = (n) => vrm.humanoid.getRawBoneNode(n);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());

  const yPierna = (wp(H('leftUpperLeg')).y + wp(H('rightUpperLeg')).y) / 2;
  const yColumna = wp(H('spine')).y;
  const yCuello = wp(H('neck')).y;
  const cabeza = wp(H('head'));
  const extraCuello = (cabeza.y - yCuello) * (op.cuello - 1);
  const pivote = cabeza.clone().add(new THREE.Vector3(0, extraCuello, 0));

  // Huesos que cuelgan de la cabeza (incluye el pelo).
  const deCabeza = new Set();
  H('head').traverse((o) => deCabeza.add(o));

  // Cuerpo: caderas más anchas, piernas más largas y cuello más largo.
  const mapearCuerpo = (p) => {
    const q = p.clone();
    const tc = smooth(yColumna, yPierna - 0.02, q.y);
    q.x *= 1 + (op.cadera - 1) * tc;
    if (q.y < yPierna) q.y = yPierna - (yPierna - q.y) * op.piernas;
    if (q.y > yCuello) q.y += extraCuello * clamp((q.y - yCuello) / (cabeza.y - yCuello), 0, 1);
    return q;
  };
  // Cabeza: escala uniforme alrededor de su base, desplazada por el cuello.
  const mapearCabeza = (p) => pivote.clone().addScaledVector(p.clone().sub(cabeza), op.cabeza);
  const mapear = (p, t) => (t <= 0 ? mapearCuerpo(p) : t >= 1 ? mapearCabeza(p) : mapearCuerpo(p).lerp(mapearCabeza(p), t));

  // ---- Mallas ----
  const hechos = new Set();
  const v = new THREE.Vector3();
  escena.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    if (hechos.has(pos)) return;
    hechos.add(pos);
    const huesos = o.skeleton.bones;
    const esCabeza = huesos.map((b) => deCabeza.has(b));
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const m = o.bindMatrix;
    const mi = o.bindMatrixInverse;
    const tCab = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      let t = 0;
      for (let k = 0; k < 4; k++) if (esCabeza[si.getComponent(i, k)]) t += sw.getComponent(i, k);
      tCab[i] = t;
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const q = mapear(v, t).applyMatrix4(mi);
      pos.setXYZ(i, q.x, q.y, q.z);
    }
    pos.needsUpdate = true;
    // Las expresiones (morph targets) de la cara se escalan con la cabeza.
    for (const lista of Object.values(g.morphAttributes)) {
      for (const attr of lista) {
        if (hechos.has(attr)) continue;
        hechos.add(attr);
        for (let i = 0; i < attr.count; i++) {
          const f = lerp(1, op.cabeza, tCab[i]);
          attr.setXYZ(i, attr.getX(i) * f, attr.getY(i) * f, attr.getZ(i) * f);
        }
        attr.needsUpdate = true;
      }
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
  });

  // Iris un poco más chicos: mirada más adulta.
  if (op.iris !== 1) {
    escena.traverse((o) => {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!o.isMesh || !/iris/i.test(mat?.name || '')) return;
      const pos = o.geometry.attributes.position;
      for (const lado of [-1, 1]) {
        const idx = [];
        const c = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          if (Math.sign(pos.getX(i)) === lado) {
            idx.push(i);
            c.add(v.fromBufferAttribute(pos, i));
          }
        }
        if (!idx.length) continue;
        c.divideScalar(idx.length);
        for (const i of idx) {
          v.fromBufferAttribute(pos, i).sub(c);
          pos.setXYZ(i, c.x + v.x * op.iris, c.y + v.y * op.iris, c.z + v.z);
        }
      }
      pos.needsUpdate = true;
    });
  }

  // ---- Huesos ----
  const huesos = [];
  escena.traverse((o) => {
    if (o.isBone) huesos.push(o);
  });
  const nuevas = new Map(huesos.map((b) => [b, mapear(wp(b), deCabeza.has(b) ? 1 : 0)]));
  for (const b of huesos) {
    b.parent.updateWorldMatrix(true, false);
    b.position.copy(b.parent.worldToLocal(nuevas.get(b).clone()));
    b.updateMatrixWorld(true);
  }
  escena.updateMatrixWorld(true);
  const esqueletos = new Set();
  escena.traverse((o) => o.isSkinnedMesh && esqueletos.add(o.skeleton));
  for (const s of esqueletos) s.calculateInverses();

  // Busto: escala del hueso (después de fijar la pose de enlace).
  for (const n of ['J_Sec_L_Bust1', 'J_Sec_R_Bust1']) {
    const b = escena.getObjectByName(n);
    if (b) b.scale.setScalar(op.busto);
  }
  escena.updateMatrixWorld(true);

  // Colisionadores y mechones del pelo acompañan el nuevo tamaño de la cabeza.
  const sb = vrm.springBoneManager;
  if (sb) {
    for (const c of sb.colliders) {
      if (!deCabeza.has(c.parent)) continue;
      c.shape.radius *= op.cabeza;
      c.shape.offset?.multiplyScalar(op.cabeza);
      c.shape.tail?.multiplyScalar(op.cabeza);
    }
    for (const j of sb.joints) if (deCabeza.has(j.bone)) j.settings.hitRadius *= op.cabeza;
  }
  vrm.springBoneManager?.setInitState();
  vrm.nodeConstraintManager?.setInitState?.();
}
