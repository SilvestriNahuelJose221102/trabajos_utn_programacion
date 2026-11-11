import * as THREE from 'three';

/*
 * Esqueleto genérico: encuentra los huesos principales de un modelo (VRM o de
 * otros programas como MakeHuman, Mixamo o Blender), permite rotarlos en ejes
 * del personaje (sin depender de cómo esté orientado cada hueso) y arma
 * colisionadores de cápsulas para la física.
 */

export const PARTES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];

/** Huesos de un VRM: normalizados para posar, reales para colisionar. */
export function huesosVRM(vrm) {
  const pose = {};
  const reales = {};
  for (const p of PARTES) {
    const nombre = p === 'chest' && !vrm.humanoid.getRawBoneNode('chest') ? 'spine' : p;
    pose[p] = vrm.humanoid.getNormalizedBoneNode(nombre) || vrm.humanoid.getNormalizedBoneNode(p === 'chest' ? 'upperChest' : p);
    reales[p] = vrm.humanoid.getRawBoneNode(nombre);
  }
  // Dedos (solo para posar): falanges de cada dedo.
  for (const lado of ['left', 'right']) {
    for (const [dedo, partes] of [['Thumb', ['Metacarpal', 'Proximal', 'Distal']], ...['Index', 'Middle', 'Ring', 'Little'].map((d) => [d, ['Proximal', 'Intermediate', 'Distal']])]) {
      for (const parte of partes) {
        const n = lado + dedo + parte;
        const nodo = vrm.humanoid.getNormalizedBoneNode(n);
        if (nodo) pose[n] = nodo;
      }
    }
  }
  return { pose, reales };
}

/** Busca huesos por nombre en un modelo cualquiera. */
export function huesosGenericos(raiz) {
  const huesos = [];
  raiz.traverse((o) => {
    if (o.isBone) huesos.push(o);
  });
  if (!huesos.length) return null;
  raiz.updateMatrixWorld(true);
  const y = (b) => b.getWorldPosition(new THREE.Vector3()).y;
  const lado = (n) => {
    if (/left|(^|[^a-z])l($|[^a-z])|_l\d*$|\.l\d*$/.test(n)) return 'left';
    if (/right|(^|[^a-z])r($|[^a-z])|_r\d*$|\.r\d*$/.test(n)) return 'right';
    return null;
  };
  const tipo = (n) => {
    if (/end|top|nub|twist|roll|toe|finger|thumb|index|middle|ring|pinky|eye|jaw|breast|clavicle|shoulder|metacarpal|tongue|teeth|brow|lip/.test(n)) return null;
    if (/forearm|lowerarm|lower_arm/.test(n)) return 'LowerArm';
    if (/hand|wrist/.test(n)) return 'Hand';
    if (/upperarm|upper_arm|arm/.test(n)) return 'UpperArm';
    if (/upleg|upperleg|upper_leg|thigh/.test(n)) return 'UpperLeg';
    if (/foot|ankle/.test(n)) return 'Foot';
    if (/lowerleg|lower_leg|calf|shin|knee|leg/.test(n)) return 'LowerLeg';
    if (/head/.test(n)) return 'head';
    if (/neck/.test(n)) return 'neck';
    if (/hips|pelvis/.test(n)) return 'hips';
    if (/spine|chest/.test(n)) return 'spine*';
    return null;
  };
  const r = {};
  const columna = [];
  for (const b of huesos) {
    const n = b.name.toLowerCase();
    const t = tipo(n);
    if (!t) continue;
    if (t === 'spine*') columna.push(b);
    else if (['head', 'neck', 'hips'].includes(t)) r[t] ??= b;
    else {
      const l = lado(n);
      if (l) r[l + t] ??= b;
    }
  }
  if (columna.length) {
    columna.sort((a, b) => y(a) - y(b));
    r.spine = columna[0];
    r.chest = columna[columna.length - 1];
  }
  r.hips ??= r.spine?.parent?.isBone ? r.spine.parent : r.spine;
  return { pose: r, reales: r };
}

const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Rota huesos en los ejes del personaje (x: derecha, y: arriba, z: adelante). */
export class Posador {
  constructor(raiz, huesos) {
    this.raiz = raiz;
    this.h = huesos;
    this.reposo = new Map();
    for (const p of Object.keys(huesos)) if (huesos[p]) this.reposo.set(huesos[p], huesos[p].quaternion.clone());
  }

  /** Vuelve todos los huesos a la pose de reposo. */
  reiniciar() {
    for (const [b, q] of this.reposo) b.quaternion.copy(q);
  }

  /** Aplica una rotación (cuaternión en ejes del personaje) sobre la pose actual del hueso. */
  rotarQ(parte, qPersonaje) {
    const b = this.h[parte];
    if (!b) return;
    b.parent.updateWorldMatrix(true, false);
    b.parent.getWorldQuaternion(_qp);
    this.raiz.getWorldQuaternion(_qr);
    _qp.premultiply(_qr.invert()); // padre relativo a la raíz
    _q.copy(_qp).invert().multiply(qPersonaje).multiply(_qp);
    b.quaternion.premultiply(_q);
  }

  rotar(parte, x = 0, y = 0, z = 0) {
    this.rotarQ(parte, new THREE.Quaternion().setFromEuler(_e.set(x, y, z)));
  }

  /** Rotación en el marco propio del hueso (para manos y dedos). */
  local(parte, x = 0, y = 0, z = 0) {
    const b = this.h[parte];
    if (b) b.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z)));
  }

  /** Gira un hueso sobre su propio eje (por ejemplo, rotar el antebrazo). */
  girarEje(parte, hijo, ang) {
    const d = this.direccion(parte, hijo);
    if (d) this.rotarQ(parte, new THREE.Quaternion().setFromAxisAngle(d, ang));
  }

  /** Dedos: flexión (0 = rectos, 1 = puño) y apertura entre dedos. */
  dedos(lado, flexion, apertura = 0) {
    const s = lado === 'left' ? -1 : 1;
    const curva = { Index: 1, Middle: 1.08, Ring: 1.16, Little: 1.24 };
    const abre = { Index: -1, Middle: -0.3, Ring: 0.4, Little: 1 };
    for (const d of ['Index', 'Middle', 'Ring', 'Little']) {
      const a = flexion * 1.25 * curva[d];
      this.local(lado + d + 'Proximal', 0, apertura * 0.18 * abre[d] * -s, s * a * 0.8);
      this.local(lado + d + 'Intermediate', 0, 0, s * a);
      this.local(lado + d + 'Distal', 0, 0, s * a * 0.7);
    }
    this.local(lado + 'ThumbProximal', 0, s * flexion * 0.5, s * flexion * 0.25);
    this.local(lado + 'ThumbDistal', 0, s * flexion * 0.6, 0);
  }

  /** Dirección actual de un hueso hacia su hijo, en ejes del personaje. */
  direccion(parte, hijo) {
    const a = this.h[parte];
    const b = this.h[hijo];
    if (!a || !b) return null;
    this.raiz.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.raiz.matrixWorld).invert();
    const pa = a.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const pb = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    return pb.sub(pa).normalize();
  }

  /** Baja los brazos si el modelo viene en pose T o A, y guarda esa pose como reposo. */
  relajarBrazos() {
    for (const [lado, s] of [['left', 1], ['right', -1]]) {
      const d = this.direccion(lado + 'UpperArm', lado + 'LowerArm');
      if (!d || d.y < -0.85) continue;
      const objetivo = new THREE.Vector3(s * 0.16, -1, 0.04).normalize();
      this.rotarQ(lado + 'UpperArm', new THREE.Quaternion().setFromUnitVectors(d, objetivo));
      const d2 = this.direccion(lado + 'LowerArm', lado + 'Hand');
      if (d2) {
        const obj2 = new THREE.Vector3(s * 0.08, -1, 0.22).normalize();
        this.rotarQ(lado + 'LowerArm', new THREE.Quaternion().setFromUnitVectors(d2, obj2));
      }
    }
    for (const [b] of this.reposo) this.reposo.set(b, b.quaternion.clone());
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Colisionador del cuerpo con cápsulas entre huesos (compatible con Pelotas de ../fisica.js). */
export class ColisionadorHuesos {
  constructor(huesos, raiz, alto) {
    this.h = huesos;
    this.raiz = raiz;
    this.alto = alto;
    this.capsulas = [];
    this.escala = 1;
  }

  actualizar() {
    const h = this.h;
    const f = this.alto / 1.6;
    const W = (b) => (b ? b.getWorldPosition(new THREE.Vector3()) : null);
    const caps = (this.capsulas = []);
    const cap = (a, b, r, zona = 'cuerpo') => {
      if (a && b) caps.push([a, b, r * f, zona]);
    };
    const hips = W(h.hips);
    const chest = W(h.chest);
    const neck = W(h.neck);
    const head = W(h.head);
    cap(hips, chest, 0.12);
    cap(chest, neck, 0.11);
    if (head) {
      const arriba = new THREE.Vector3(0, 0.08 * f, 0.01 * f).applyQuaternion(this.raiz.getWorldQuaternion(new THREE.Quaternion()));
      const c = head.clone().add(arriba);
      cap(c, c, 0.1, 'cabeza');
    }
    for (const l of ['left', 'right']) {
      const ua = W(h[l + 'UpperArm']);
      const la = W(h[l + 'LowerArm']);
      const ha = W(h[l + 'Hand']);
      cap(ua, la, 0.045);
      cap(la, ha, 0.036);
      if (la && ha) cap(ha, ha.clone().add(ha.clone().sub(la).setLength(0.08 * f)), 0.035);
      const ul = W(h[l + 'UpperLeg']);
      const ll = W(h[l + 'LowerLeg']);
      const ft = W(h[l + 'Foot']);
      cap(ul, ll, 0.075);
      cap(ll, ft, 0.05);
    }
    // Sin esqueleto: una cápsula que envuelve el modelo.
    if (!caps.length) {
      const bb = new THREE.Box3().setFromObject(this.raiz);
      const c = bb.getCenter(new THREE.Vector3());
      const r = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.35;
      caps.push([new THREE.Vector3(c.x, bb.min.y + r, c.z), new THREE.Vector3(c.x, bb.max.y - r, c.z), r, 'cuerpo']);
    }
  }

  resolver(p, r, n = _n) {
    let zona = null;
    for (const [a, b, rc, z] of this.capsulas) {
      _a.subVectors(b, a);
      const t = Math.max(0, Math.min(1, _b.subVectors(p, a).dot(_a) / Math.max(_a.lengthSq(), 1e-12)));
      _p.copy(a).addScaledVector(_a, t);
      const d = p.distanceTo(_p);
      const R = rc + r;
      if (d < R) {
        if (d > 1e-6) n.subVectors(p, _p).divideScalar(d);
        else n.set(0, 1, 0);
        p.copy(_p).addScaledVector(n, R);
        if (!zona || z === 'cabeza') zona = z;
      }
    }
    return zona;
  }
}
