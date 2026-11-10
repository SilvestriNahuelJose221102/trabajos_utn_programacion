import * as THREE from 'three';
import { V3, lerp, smooth, mulberry32, deformarCabeza, CABEZA } from './util.js';

// Casquete: casquete esférico inclinado hacia atrás (nacimiento del pelo alto
// en la frente y bajo en la nuca).
const INCLINACION = 0.635;
const ANG_CASQUETE = 1.635;
const EJE_CASQUETE = new V3(0, Math.cos(INCLINACION), -Math.sin(INCLINACION));

const puntoCuero = (d, k) => deformarCabeza(d).multiplyScalar(k);
const nlerp = (a, b, t) => a.clone().lerp(b, t).normalize();

function dirAleatoria(rand) {
  const u = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return new V3(r * Math.cos(a), u, r * Math.sin(a));
}

/** Acumula "hair cards": cintas con textura de mechones, en una sola geometría. */
class Mechones {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
  }

  agregar(puntos, ancho, centroDe, brillo) {
    const curva = new THREE.CatmullRomCurve3(puntos, false, 'centripetal');
    const seg = Math.max(6, Math.min(70, Math.round(curva.getLength() / 0.012)));
    const ps = curva.getSpacedPoints(seg);
    const base = this.n;
    const t = new V3();
    const o = new V3();
    const lado = new V3();
    const nrm = new V3();
    for (let i = 0; i <= seg; i++) {
      const p = ps[i];
      if (i < seg) t.subVectors(ps[i + 1], p);
      else t.subVectors(p, ps[i - 1]);
      t.normalize();
      o.copy(p).sub(centroDe(p)).normalize();
      lado.crossVectors(t, o);
      if (lado.lengthSq() < 1e-8) lado.set(1, 0, 0);
      lado.normalize();
      nrm.crossVectors(lado, t).normalize();
      const u = i / seg;
      const w = ancho * (1 - 0.75 * Math.pow(u, 2.2)) * 0.5;
      const c = brillo * (0.78 + 0.22 * smooth(0, 0.3, u));
      for (const sg of [-1, 1]) {
        this.pos.push(p.x + lado.x * w * sg, p.y + lado.y * w * sg, p.z + lado.z * w * sg);
        this.nor.push(nrm.x, nrm.y, nrm.z);
        this.uv.push(sg < 0 ? 0 : 1, 1 - u);
        this.col.push(c, c, c);
      }
      if (i < seg) {
        const a = base + i * 2;
        this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.n += (seg + 1) * 2;
  }

  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/**
 * Crea el pelo en coordenadas locales de la cabeza.
 * @param p   parámetros del panel
 * @param m   modelo del cuerpo (para que el pelo no atraviese hombros/espalda/busto)
 * @param C   centro de la cabeza en coordenadas del personaje (pose de reposo)
 */
export function crearPelo(p, m, mats, C) {
  const rand = mulberry32(20261110);
  const grupo = new THREE.Group();
  grupo.name = 'Pelo';

  // ---- Casquete base ----
  const gc = new THREE.SphereGeometry(1, 72, 36, 0, Math.PI * 2, 0, ANG_CASQUETE);
  gc.rotateX(-INCLINACION);
  const pc = gc.attributes.position;
  const v = new V3();
  for (let i = 0; i < pc.count; i++) {
    v.fromBufferAttribute(pc, i).normalize();
    const q = puntoCuero(v, 1.02);
    pc.setXYZ(i, q.x, q.y, q.z);
  }
  gc.computeVertexNormals();
  const casquete = new THREE.Mesh(gc, mats.peloBase);
  casquete.name = 'PeloCasquete';
  casquete.castShadow = true;
  grupo.add(casquete);

  const mech = new Mechones();
  const dentro = (d, margen = 0.06) => d.angleTo(EJE_CASQUETE) < ANG_CASQUETE - margen;
  const centroCabeza = (q) => (q.y > -0.02 ? new V3(0, 0, -0.01) : new V3(0, q.y, -0.01));
  const N = Math.round(lerp(300, 900, p.volumen));

  // Empuja un punto (coords del personaje) fuera del torso, hacia adelante o atrás.
  const despejar = (q, adelante, mg) => {
    const zf = m.zFrente(q.x, q.y);
    if (zf === null) return;
    const zb = m.zAtras(q.x, q.y);
    if (q.z < zf + mg && q.z > zb - mg) q.z = adelante ? zf + mg : zb - mg;
  };
  // Empuja un punto (coords de la cabeza) fuera del cráneo.
  const despejarCabeza = (q, k = 1.06) => {
    const e = (q.x / (CABEZA.x * k)) ** 2 + (q.y / (CABEZA.y * k)) ** 2 + (q.z / (CABEZA.z * k * 1.07)) ** 2;
    if (e < 1) q.multiplyScalar(1 / Math.sqrt(e));
  };

  // Pelo que cae desde el último punto del cuero cabelludo.
  const colgar = (pts, largo, adelante) => {
    const ini = pts[pts.length - 1].clone().add(C);
    const n = Math.max(1, Math.ceil(largo / 0.02));
    const fase = rand() * 6.283;
    const radial = new V3(ini.x, 0, ini.z - C.z).normalize();
    const tang = new V3(-radial.z, 0, radial.x);
    const mg = 0.008 + rand() * 0.02;
    const caida = [];
    const q = ini.clone();
    for (let i = 1; i <= n; i++) {
      q.y -= largo / n;
      const f = Math.exp(-i / 5) * 0.004;
      q.x += radial.x * f;
      q.z += radial.z * f;
      const onda = p.ondas * 0.014 * Math.sin(i * 0.6 + fase);
      const r = q.clone();
      r.x += radial.x * onda * 0.5 + tang.x * onda;
      r.z += radial.z * onda * 0.5 + tang.z * onda;
      despejar(r, adelante, mg);
      caida.push(r);
    }
    // Suaviza la caída para que el pelo "cuelgue" sobre hombros y busto.
    const sg = adelante ? 1 : -1;
    for (let i = caida.length - 2; i >= 0; i--) {
      const lim = caida[i + 1].z - sg * 0.015;
      caida[i].z = adelante ? Math.max(caida[i].z, lim) : Math.min(caida[i].z, lim);
    }
    for (let i = 1; i < caida.length; i++) {
      const lim = caida[i - 1].z - sg * 0.004;
      caida[i].z = adelante ? Math.max(caida[i].z, lim) : Math.min(caida[i].z, lim);
    }
    for (const c of caida) pts.push(c.sub(C));
  };

  // Mechones que van del cuero cabelludo a un punto de atadura (colita / rodete).
  const haciaAtadura = (D, cant) => {
    for (let n = 0; n < cant; ) {
      const d = dirAleatoria(rand);
      if (!dentro(d)) continue;
      n++;
      const capa = 1.02 + rand() * 0.012;
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push(puntoCuero(nlerp(d, D, i / 8), lerp(1.012, capa, Math.min(1, i / 2))));
      mech.agregar(pts, lerp(0.016, 0.024, rand()), centroCabeza, lerp(0.85, 1.12, rand()));
    }
  };

  if (p.peinado === 'Colita') {
    const D = new V3(0, 0.3, -1).normalize();
    haciaAtadura(D, N);
    const atadura = puntoCuero(D, 1.05);
    const Lt = 0.12 + p.largo;
    const ejeCola = new V3(0, -0.6, -0.8).normalize();
    for (let n = 0; n < Math.round(N * 0.4); n++) {
      const ang = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand());
      const nT = Math.ceil(Lt / 0.02);
      const fase = rand() * 6.283;
      const pts = [atadura.clone()];
      for (let i = 1; i <= nT; i++) {
        const t = i / nT;
        const ab = (0.008 + 0.03 * Math.sin(Math.min(1, t * 1.8) * Math.PI / 2) * (1 - 0.45 * t)) * rr;
        const onda = p.ondas * 0.01 * Math.sin(t * 9 + fase);
        const q = atadura.clone().add(new V3(
          Math.cos(ang) * ab + onda,
          -t * Lt,
          -0.035 * Math.sin(Math.min(1, t * 2) * Math.PI / 2) + Math.sin(ang) * ab,
        ));
        despejarCabeza(q);
        const r = q.clone().add(C);
        despejar(r, false, 0.01);
        pts.push(r.sub(C));
      }
      const eje = atadura.clone().add(new V3(0, -Lt * 0.5, -0.04));
      mech.agregar(pts, lerp(0.014, 0.022, rand()), (q) => new V3(eje.x, q.y, eje.z), lerp(0.85, 1.12, rand()));
    }
    const gomita = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0055, 10, 24), mats.gomita);
    gomita.name = 'Gomita';
    gomita.position.copy(atadura).add(new V3(0, -0.004, -0.004));
    gomita.quaternion.setFromUnitVectors(new V3(0, 0, 1), ejeCola);
    grupo.add(gomita);
  } else if (p.peinado === 'Rodete') {
    const D = new V3(0, 0.75, -0.66).normalize();
    haciaAtadura(D, N);
    const Cb = puntoCuero(D, 1.03).add(D.clone().multiplyScalar(0.03));
    const bola = new THREE.Mesh(new THREE.SphereGeometry(0.031, 24, 16), mats.peloBase);
    bola.name = 'Rodete';
    bola.position.copy(Cb);
    grupo.add(bola);
    for (let n = 0; n < 120; n++) {
      const eje = dirAleatoria(rand);
      const e1 = new V3().crossVectors(eje, new V3(0.3, 1, 0.2)).normalize();
      const e2 = new V3().crossVectors(eje, e1);
      const rr = 0.028 + rand() * 0.012;
      const a0 = rand() * Math.PI * 2;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = a0 + (i / 12) * Math.PI * 1.4;
        pts.push(Cb.clone().addScaledVector(e1, Math.cos(a) * rr).addScaledVector(e2, Math.sin(a) * rr));
      }
      mech.agregar(pts, 0.02, () => Cb, lerp(0.85, 1.12, rand()));
    }
  } else {
    // Suelto, con raya al medio.
    for (let n = 0; n < N; ) {
      const d = dirAleatoria(rand);
      if (!dentro(d)) continue;
      n++;
      const s = Math.abs(d.x) < 0.05 ? (rand() < 0.5 ? -1 : 1) : Math.sign(d.x);
      const w = smooth(-0.4, 0.3, d.z); // 1 = adelante, 0 = atrás
      const T = new V3(lerp(d.x * 1.1, s * 0.9 + d.x * 0.3, w), lerp(-0.62, -0.35, w), lerp(Math.min(d.z, 0) - 0.2, 0.15, w)).normalize();
      const capa = 1.025 + rand() * 0.04;
      const dirs = [];
      if (w > 0.2) {
        const M = new V3(s * 0.95, Math.max(d.y, 0.3), d.z * 0.5 - 0.25).normalize();
        for (let i = 0; i <= 4; i++) dirs.push(nlerp(d, M, i / 4));
        for (let i = 1; i <= 5; i++) dirs.push(nlerp(M, T, i / 5));
      } else {
        for (let i = 0; i <= 8; i++) dirs.push(nlerp(d, T, i / 8));
      }
      const pts = dirs.map((q, i) => puntoCuero(q, lerp(1.012, capa, Math.min(1, i / 3))));
      const adelante = w > 0.6 && rand() < 0.75;
      colgar(pts, Math.max(0.02, p.largo * (0.72 + rand() * 0.5) - (1 - w) * 0.03), adelante);
      mech.agregar(pts, lerp(0.018, 0.03, rand()), centroCabeza, lerp(0.85, 1.12, rand()));
    }
  }

  // Flequillo opcional.
  if (p.flequillo) {
    for (let n = 0; n < Math.round(N * 0.2); ) {
      const d = dirAleatoria(rand);
      if (!(d.z > 0.35 && d.y > 0.45 && dentro(d))) continue;
      n++;
      const F = new V3(d.x * 0.9, 0.36, 0.93).normalize();
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push(puntoCuero(nlerp(d, F, i / 6), lerp(1.03, 1.075, i / 6)));
      pts.push(pts[6].clone().add(new V3(0, -0.008, 0.002)));
      mech.agregar(pts, lerp(0.016, 0.024, rand()), centroCabeza, lerp(0.9, 1.12, rand()));
    }
  }

  const mallaMechones = new THREE.Mesh(mech.geometria(), mats.peloMechones);
  mallaMechones.name = 'PeloMechones';
  mallaMechones.receiveShadow = true;
  grupo.add(mallaMechones);
  return grupo;
}
