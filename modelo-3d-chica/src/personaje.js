import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, lerp, gauss, smooth, interp, deformarCabeza, tuboAfinado } from './util.js';
import { crearPelo } from './pelo.js';

/** Todas las medidas están en metros para una altura base de 1,68 m. */
export const ALTURA_BASE = 1.68;

// Perfiles de radio de las extremidades: [distancia desde la articulación, radio].
const PERFIL_MUSLO = [[-0.06, 0], [-0.055, 0.04], [-0.035, 0.066], [0, 0.08], [0.06, 0.084], [0.1, 0.082], [0.18, 0.072], [0.28, 0.06], [0.36, 0.05], [0.4, 0.047], [0.43, 0]];
const PERFIL_PANTORRILLA = [[-0.04, 0], [-0.03, 0.04], [0, 0.048], [0.06, 0.053], [0.12, 0.054], [0.2, 0.046], [0.3, 0.035], [0.37, 0.029], [0.4, 0.028], [0.42, 0]];
const Y_RODILLA = 0.385;
// Pierna completa (muslo + pantorrilla) en una sola superficie, sin costura en la rodilla.
const PERFIL_PIERNA = [
  ...PERFIL_MUSLO.filter(([t]) => t < 0.33),
  [0.385, 0.048],
  ...PERFIL_PANTORRILLA.filter(([t]) => t > 0.03).map(([t, r]) => [t + Y_RODILLA, r]),
];
const PERFIL_BRAZO = [[-0.04, 0], [-0.032, 0.028], [-0.01, 0.04], [0.05, 0.042], [0.15, 0.038], [0.25, 0.032], [0.29, 0.03], [0.31, 0.025], [0.32, 0]];
const PERFIL_ANTEBRAZO = [[-0.025, 0], [-0.02, 0.025], [0, 0.03], [0.05, 0.034], [0.12, 0.03], [0.2, 0.024], [0.25, 0.021], [0.26, 0]];

const Y_HOMBRO = 1.338;
const Y_CADERA = 0.865;
const POS_CUELLO = new V3(0, 1.46, 0.01);
const CENTRO_CABEZA = new V3(0, 1.575, 0.015);

/**
 * Modelo paramétrico del torso: radios elípticos por altura + busto y glúteos.
 * Lo usan la geometría del torso, la ropa y el pelo (para no atravesar el cuerpo).
 */
export function modeloCuerpo(p) {
  const k = p.contextura;
  const mC = lerp(0.9, 1.13, p.cadera);
  const mW = lerp(0.86, 1.14, p.cintura);
  const mH = lerp(0.92, 1.08, p.hombros);
  const claves = [
    [0.76, 0.04 * mC, 0.035, 1],
    [0.79, 0.09 * mC, 0.07, 1],
    [0.84, 0.17 * mC, 0.106, 1],
    [0.9, 0.168 * mC, 0.104, 1],
    [0.97, (0.148 * (mC + mW)) / 2, 0.096, 1],
    [1.04, 0.126 * mW, 0.086 * (1 + (mW - 1) * 0.5), 1],
    [1.12, (0.137 * (1 + mW)) / 2, 0.09, 1],
    [1.2, 0.148, 0.094, 1],
    [1.28, 0.156 * mH, 0.092, 1],
    [1.355, 0.158 * mH, 0.08, 1],
    [1.395, 0.118 * mH, 0.068, 1],
    [1.425, 0.058, 0.054, 0],
    [1.53, 0.052, 0.049, 0],
  ].map(([y, rx, rz, f]) => {
    const kk = f ? k : Math.sqrt(k);
    return [y, rx * kk, rz * kk];
  });

  const B = (0.01 + 0.045 * p.busto) * k;
  const xb = 0.058 * k;
  const G = (0.01 + 0.03 * p.cadera) * k;
  const xg = 0.062 * k * mC;

  const radios = (y) => interp(claves, y);
  const zc = (y) => (y > 1.36 ? (y - 1.36) * 0.12 : 0);
  // El busto se "puentea" en el centro, como lo hace la tela.
  const busto = (x, y) => {
    const ax = Math.abs(x);
    const dx = ax < xb ? (xb - ax) * 0.35 : ax - xb;
    const dy = y - 1.205;
    return B * gauss(dx, 0.04 * k) * gauss(dy, dy > 0 ? 0.065 : 0.036);
  };
  const gluteo = (x, y) => {
    const dy = y - 0.85;
    return G * gauss(Math.abs(x) - xg, 0.05 * k) * gauss(dy, dy > 0 ? 0.07 : 0.04);
  };

  // theta = 0 en la espalda, PI en el frente.
  function punto(theta, y, off = 0) {
    const [rx, rz] = radios(y);
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const x0 = rx * s;
    let z = -rz * c * (1 + off);
    if (c < 0) z += busto(x0, y) * smooth(0, 1, -c) * (1 + off * 2);
    else z -= gluteo(x0, y) * smooth(0, 1, c) * (1 + off * 2);
    return new V3(x0 * (1 + off), y, z + zc(y));
  }
  function zFrente(x, y) {
    const [rx, rz] = radios(y);
    if (Math.abs(x) >= rx) return null;
    const u = Math.sqrt(1 - (x / rx) ** 2);
    return rz * u + busto(x, y) * smooth(0, 1, u) + zc(y);
  }
  function zAtras(x, y) {
    const [rx, rz] = radios(y);
    if (Math.abs(x) >= rx) return null;
    const u = Math.sqrt(1 - (x / rx) ** 2);
    return -(rz * u + gluteo(x, y) * smooth(0, 1, u)) + zc(y);
  }

  const hombroX = 0.163 * k * mH;
  const caderaX = 0.085 * k * mC;
  // Separación de los brazos en reposo para que no atraviesen la cadera.
  const xCadera = radios(0.88)[0] * 1.03 + 0.012;
  const abd = Math.asin(Math.min(0.9, Math.max(0, (xCadera - hombroX + 0.035 * k) / 0.47)));
  const abdReposo = Math.max(0.1, abd);

  return { k, mC, mW, mH, radios, punto, zFrente, zAtras, busto, gluteo, hombroX, caderaX, abdReposo };
}

/** Malla del torso entre y0 e y1; off > 0 la infla (para ropa). */
function geoTorso(m, y0, y1, off = 0, segA = 72) {
  const segY = Math.max(2, Math.ceil((y1 - y0) / 0.006));
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= segY; j++) {
    const y = y0 + ((y1 - y0) * j) / segY;
    for (let i = 0; i <= segA; i++) {
      const P = m.punto((i / segA) * Math.PI * 2, y, off);
      pos.push(P.x, P.y, P.z);
      uv.push((i / segA) * 3, y * 4);
    }
  }
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * (segA + 1) + i;
      const b = a + 1;
      const c = a + segA + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Unir normales en la costura (centro de la espalda).
  const n = g.attributes.normal;
  const a = new V3();
  const b = new V3();
  for (let j = 0; j <= segY; j++) {
    const i0 = j * (segA + 1);
    const i1 = i0 + segA;
    a.fromBufferAttribute(n, i0);
    b.fromBufferAttribute(n, i1);
    a.add(b).normalize();
    n.setXYZ(i0, a.x, a.y, a.z);
    n.setXYZ(i1, a.x, a.y, a.z);
  }
  return g;
}

/** Extremidad por revolución entre t0 y t1 del perfil; extra engrosa (ropa). */
function geoMiembro(perfil, t0, t1, k = 1, extra = 0, radial = 28) {
  const a = Math.max(t0, perfil[0][0]);
  const b = Math.min(t1, perfil[perfil.length - 1][0]);
  const n = Math.max(2, Math.ceil((b - a) / 0.006));
  const pts = [];
  for (let i = n; i >= 0; i--) {
    const t = a + ((b - a) * i) / n;
    const r = Math.max(0, interp(perfil, t)[0]) * k + extra;
    pts.push(new THREE.Vector2(Math.max(r, 1e-4), -t));
  }
  const g = new THREE.LatheGeometry(pts, radial);
  g.scale(1, 1, 0.93);
  return g;
}

function geoCabeza(segW, segH) {
  let g = new THREE.SphereGeometry(1, segW, segH);
  const pos = g.attributes.position;
  const v = new V3();
  const out = new V3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    deformarCabeza(v, out);
    pos.setXYZ(i, out.x, out.y, out.z);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}

export function crearPersonaje(p, mats) {
  const m = modeloCuerpo(p);
  const k = m.k;
  const raiz = new THREE.Group();
  raiz.name = 'Personaje';

  const add = (padre, geo, mat, nombre, sombra = true) => {
    const o = new THREE.Mesh(geo, mat);
    o.name = nombre;
    o.castShadow = sombra;
    o.receiveShadow = true;
    padre.add(o);
    return o;
  };

  const conMangas = p.superior !== 'Musculosa';
  const mangaLarga = p.superior === 'Manga larga';

  // ---------- Torso y ropa ----------
  const torso = new THREE.Group();
  torso.name = 'Torso';
  raiz.add(torso);
  add(torso, geoTorso(m, 0.76, 1.53, 0), mats.piel, 'TorsoPiel');
  const yCintura = 0.985;
  if (p.inferior !== 'Pollera') add(torso, geoTorso(m, 0.762, yCintura, 0.022), mats.inferior, 'Pantalon');
  add(torso, geoTorso(m, mangaLarga ? 0.92 : 0.95, 1.405, 0.032), mats.superior, 'Remera');

  if (p.inferior === 'Pollera') {
    const zEsc = 0.8;
    const perfil = [];
    let rPrev = 0;
    for (let y = 0.995; y >= 0.58; y -= 0.01) {
      const yy = Math.max(y, 0.76);
      const [rx, rz] = m.radios(yy);
      let r = Math.max(rx * 1.05, ((rz + m.gluteo(0.06 * k, yy)) * 1.07) / zEsc);
      if (y < 0.76) r = 0;
      r = Math.max(r, rPrev + 0.0008);
      rPrev = r;
      perfil.push(new THREE.Vector2(r, y));
    }
    perfil.reverse();
    const g = new THREE.LatheGeometry(perfil, 56);
    g.scale(1, 1, zEsc);
    add(torso, g, mats.inferior, 'Pollera');
  }

  // ---------- Cabeza ----------
  const cuello = new THREE.Group();
  cuello.name = 'Cuello';
  cuello.position.copy(POS_CUELLO);
  raiz.add(cuello);
  const cabeza = new THREE.Group();
  cabeza.name = 'Cabeza';
  cabeza.position.copy(CENTRO_CABEZA).sub(POS_CUELLO);
  cuello.add(cabeza);
  const cara = crearCara(p, mats, cabeza, add);
  cabeza.add(crearPelo(p, m, mats, CENTRO_CABEZA));

  // ---------- Brazos ----------
  const hombros = [];
  const codos = [];
  for (const s of [1, -1]) {
    const hombro = new THREE.Group();
    hombro.name = s > 0 ? 'HombroIzq' : 'HombroDer';
    hombro.position.set(s * m.hombroX, Y_HOMBRO, -0.004);
    hombro.rotation.z = s * m.abdReposo;
    raiz.add(hombro);
    const delt = add(hombro, new THREE.SphereGeometry(0.043 * k, 28, 20), mats.piel, 'Deltoides');
    delt.scale.set(0.95, 1, 0.92);
    delt.position.y = -0.01;
    add(hombro, geoMiembro(PERFIL_BRAZO, -1, 1, k), mats.piel, 'Brazo');
    if (conMangas) {
      const hb = add(hombro, new THREE.SphereGeometry(0.043 * k + 0.006, 28, 20), mats.superior, 'Hombrera');
      hb.scale.set(0.95, 1, 0.92);
      hb.position.y = -0.01;
      add(hombro, geoMiembro(PERFIL_BRAZO, -1, mangaLarga ? 1 : 0.11, k, 0.008), mats.superior, 'Manga');
    }
    const codo = new THREE.Group();
    codo.name = 'Codo';
    codo.position.y = -0.29;
    codo.rotation.x = -0.18;
    hombro.add(codo);
    add(codo, geoMiembro(PERFIL_ANTEBRAZO, -1, 1, k), mats.piel, 'Antebrazo');
    if (mangaLarga) add(codo, geoMiembro(PERFIL_ANTEBRAZO, -1, 0.235, k, 0.008), mats.superior, 'MangaAntebrazo');
    const muneca = new THREE.Group();
    muneca.name = 'Muneca';
    muneca.position.y = -0.25;
    codo.add(muneca);
    crearMano(muneca, s, mats.piel, k, add);
    hombros.push(hombro);
    codos.push(codo);
  }

  // ---------- Piernas ----------
  for (const s of [1, -1]) {
    const cadera = new THREE.Group();
    cadera.name = 'Cadera';
    cadera.position.set(s * m.caderaX, Y_CADERA, 0);
    cadera.rotation.z = 0;
    raiz.add(cadera);
    add(cadera, geoMiembro(PERFIL_PIERNA, -1, 1, k, 0, 32), mats.piel, 'Pierna');
    if (p.inferior === 'Jean') add(cadera, geoMiembro(PERFIL_PIERNA, -1, Y_RODILLA + 0.37, k, 0.008, 32), mats.inferior, 'Jean');
    if (p.inferior === 'Short') add(cadera, geoMiembro(PERFIL_PIERNA, -1, 0.12, k, 0.01, 32), mats.inferior, 'Short');
    const rodilla = new THREE.Group();
    rodilla.name = 'Rodilla';
    rodilla.position.y = -Y_RODILLA;
    cadera.add(rodilla);
    const tobillo = new THREE.Group();
    tobillo.name = 'Tobillo';
    tobillo.position.y = -0.4;
    rodilla.add(tobillo);
    crearZapatilla(tobillo, mats, k, add);
  }

  return {
    raiz,
    modelo: m,
    partes: { cuello, cabeza, hombros, codos, ...cara },
  };
}

function crearMano(padre, s, mat, k, add) {
  const mano = new THREE.Group();
  mano.name = 'Mano';
  mano.scale.setScalar(Math.sqrt(k));
  padre.add(mano);
  const palma = add(mano, new THREE.SphereGeometry(1, 24, 16), mat, 'Palma');
  palma.scale.set(0.014, 0.045, 0.036);
  palma.position.y = -0.045;
  const largos = [0.05, 0.056, 0.053, 0.043];
  const zs = [0.022, 0.008, -0.006, -0.02];
  for (let i = 0; i < 4; i++) {
    const L = largos[i];
    const dedo = add(mano, new THREE.CapsuleGeometry(0.0072 - i * 0.0004, L - 0.014, 6, 12), mat, 'Dedo');
    dedo.position.set(-s * 0.003, -0.083 - L / 2 + 0.01, zs[i]);
    dedo.rotation.z = -s * 0.14;
  }
  const pulgar = add(mano, new THREE.CapsuleGeometry(0.0085, 0.028, 6, 12), mat, 'Pulgar');
  pulgar.position.set(-s * 0.008, -0.04, 0.034);
  pulgar.rotation.set(-0.4, 0, -s * 0.25);
}

function crearZapatilla(padre, mats, k, add) {
  const g = new THREE.Group();
  g.name = 'Zapatilla';
  g.scale.setScalar(Math.sqrt(k));
  padre.add(g);
  const forma = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const x = 0.044 * Math.cos(a) * (Math.sin(a) < 0 ? 0.82 : 1);
    const z = 0.045 + 0.125 * Math.sin(a);
    if (i === 0) forma.moveTo(x, -z);
    else forma.lineTo(x, -z);
  }
  const geoSuela = new THREE.ExtrudeGeometry(forma, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  geoSuela.rotateX(-Math.PI / 2);
  add(g, geoSuela, mats.suela, 'Suela').position.y = -0.076;
  const capellada = add(g, new THREE.SphereGeometry(1, 32, 20), mats.calzado, 'Capellada');
  capellada.scale.set(0.041, 0.034, 0.108);
  capellada.position.set(0, -0.045, 0.048);
  const cuello = add(g, new THREE.CylinderGeometry(0.036, 0.04, 0.05, 24), mats.calzado, 'CuelloZapatilla');
  cuello.position.set(0, -0.035, -0.012);
}

function crearCara(p, mats, cabeza, add) {
  add(cabeza, geoCabeza(220, 160), mats.piel, 'Craneo');

  // Malla auxiliar para ubicar rasgos sobre la superficie de la cara.
  const proxy = new THREE.Mesh(geoCabeza(96, 64), new THREE.MeshBasicMaterial());
  proxy.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const sup = (x, y) => {
    rc.set(new V3(x, y, 0.3), new V3(0, 0, -1));
    const h = rc.intersectObject(proxy, false)[0];
    return h ? h.point.z : 0.08;
  };

  // ---- Ojos ----
  const ojos = [];
  const parpados = [];
  const r = 0.0125;
  for (const s of [1, -1]) {
    const ex = s * 0.032;
    const ey = -0.008;
    const centro = new V3(ex, ey, sup(ex, ey) - 0.0068);

    const ojo = new THREE.Group();
    ojo.name = 'Ojo';
    ojo.position.copy(centro);
    ojo.userData.yawBase = s * 0.04;
    ojo.scale.set(1.12, 1, 1);
    cabeza.add(ojo);
    add(ojo, new THREE.SphereGeometry(r, 32, 24), mats.ojoBlanco, 'Esclerotica', false);
    add(ojo, new THREE.SphereGeometry(r * 1.004, 32, 6, 0, Math.PI * 2, 0, 0.5), mats.iris, 'Iris', false).rotation.x = Math.PI / 2;
    add(ojo, new THREE.SphereGeometry(r * 1.008, 24, 4, 0, Math.PI * 2, 0, 0.21), mats.pupila, 'Pupila', false).rotation.x = Math.PI / 2;
    ojos.push(ojo);

    const pg = new THREE.Group();
    pg.name = 'Parpados';
    pg.position.copy(centro);
    pg.scale.set(1.12, 1, 1);
    cabeza.add(pg);
    const parpado = add(pg, new THREE.SphereGeometry(r * 1.06, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.piel, 'ParpadoSup', false);
    parpado.rotation.x = -0.27;
    add(parpado, new THREE.SphereGeometry(r * 1.09, 32, 2, Math.PI / 2 - 1.35, 2.7, Math.PI / 2 - 0.13, 0.13), mats.pestanas, 'Pestanas', false);
    add(pg, new THREE.SphereGeometry(r * 1.05, 32, 8, 0, Math.PI * 2, Math.PI - 1.1, 1.1), mats.piel, 'ParpadoInf', false).rotation.x = 0.05;
    parpados.push(parpado);

    // Cejas
    const cejas = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const xx = 0.013 + 0.04 * u;
      const yy = 0.011 + 0.006 * Math.sin(Math.PI * Math.pow(u, 0.75)) - 0.004 * u;
      cejas.push(new V3(s * xx, yy, sup(s * xx, yy) + 0.0012));
    }
    const afinarCeja = (u) => lerp(1, 0.35, u) * (0.4 + 0.6 * smooth(0, 0.15, u)) * (0.4 + 0.6 * smooth(1, 0.85, u));
    add(cabeza, tuboAfinado(cejas, 0.0016, afinarCeja, 0.5), mats.cejas, 'Ceja', false);

    // Aletas de la nariz y fosas
    const fosa = add(cabeza, new THREE.SphereGeometry(0.0024, 10, 8), mats.fosa, 'Fosa', false);
    fosa.position.set(s * 0.0045, -0.0457, sup(s * 0.0045, -0.0457) - 0.0015);
    fosa.scale.set(1.3, 0.55, 1.3);

    // Orejas (ocultas bajo el pelo suelto)
    if (!(p.peinado === 'Suelto' && p.largo > 0.06)) {
      const oreja = add(cabeza, new THREE.SphereGeometry(0.03, 20, 16), mats.piel, 'Oreja');
      oreja.position.set(s * 0.07, -0.01, -0.008);
      oreja.scale.set(0.3, 1, 0.62);
      oreja.rotation.y = s * 0.35;
    }
  }

  // ---- Boca ----
  const son = p.sonrisa;
  const labioSup = [];
  const labioInf = [];
  const linea = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    let x = lerp(-0.024, 0.024, u);
    let e = (x / 0.024) ** 2;
    let y = -0.0635 - 0.0012 * gauss(x, 0.0035) + 0.001 * gauss(Math.abs(x) - 0.0065, 0.0035) - 0.0035 * e + son * 0.004 * e;
    labioSup.push(new V3(x, y, sup(x, y) - 0.0004 - 0.003 * e));

    x = lerp(-0.021, 0.021, u);
    e = (x / 0.021) ** 2;
    y = -0.0727 + 0.0035 * e + son * 0.0045 * e;
    labioInf.push(new V3(x, y, sup(x, y) - 0.0002 - 0.003 * e));

    x = lerp(-0.0225, 0.0225, u);
    e = (x / 0.0225) ** 2;
    y = -0.0681 - 0.0015 * e + son * 0.005 * e;
    linea.push(new V3(x, y, sup(x, y) - 0.0005));
  }
  const afinarLabio = (u) => 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * u), 0.5);
  add(cabeza, tuboAfinado(labioSup, 0.0035, afinarLabio, 0.6), mats.labios, 'LabioSup', false);
  add(cabeza, tuboAfinado(labioInf, 0.0043, afinarLabio, 0.6), mats.labios, 'LabioInf', false);
  add(cabeza, tuboAfinado(linea, 0.0011, (u) => Math.pow(Math.sin(Math.PI * u), 0.7), 1, 6), mats.boca, 'LineaBoca', false);

  proxy.geometry.dispose();
  return { ojos, parpados };
}
