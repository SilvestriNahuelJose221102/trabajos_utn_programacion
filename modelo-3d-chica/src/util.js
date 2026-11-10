import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;

/** Campana de Gauss sin normalizar (vale 1 en d = 0). */
export const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));

/** Interpolación suave entre a y b (funciona también con a > b). */
export function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Interpola una tabla de claves [[x, v1, v2, ...], ...] ordenada por x
 * con splines Catmull-Rom. Devuelve [v1, v2, ...].
 */
export function interp(claves, x) {
  const n = claves.length;
  if (x <= claves[0][0]) return claves[0].slice(1);
  if (x >= claves[n - 1][0]) return claves[n - 1].slice(1);
  let i = 0;
  while (claves[i + 1][0] < x) i++;
  const k0 = claves[Math.max(i - 1, 0)];
  const k1 = claves[i];
  const k2 = claves[i + 1];
  const k3 = claves[Math.min(i + 2, n - 1)];
  const t = (x - k1[0]) / (k2[0] - k1[0]);
  const out = [];
  for (let j = 1; j < k1.length; j++) out.push(catmull(k0[j], k1[j], k2[j], k3[j], t));
  return out;
}

/** Generador pseudoaleatorio con semilla (resultados repetibles). */
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semiejes de la cabeza en metros (ancho, alto, profundidad). */
export const CABEZA = { x: 0.074, y: 0.112, z: 0.095 };

/**
 * Convierte un punto de la esfera unitaria en un punto de la superficie de la cabeza:
 * mandíbula afinada, nuca más amplia, cuencas de los ojos, arco superciliar,
 * pómulos, nariz y mentón.
 */
export function deformarCabeza(v, out = new V3()) {
  let { x, y, z } = v;
  if (y < 0) {
    const t = -y;
    x *= 1 - 0.3 * t * t;
    z *= 1 - 0.1 * t * t;
    if (z > 0) z += 0.06 * t * t * t * z;
  }
  if (z < 0) z *= 1 + 0.07 * smooth(-0.5, -0.1, y);

  out.set(x * CABEZA.x, y * CABEZA.y, z * CABEZA.z);

  if (out.z > 0) {
    const w = smooth(0.03, 0.07, out.z);
    let d = 0;
    for (const s of [-1, 1]) {
      d -= 0.0085 * gauss(out.x - s * 0.032, 0.016) * gauss(out.y + 0.008, 0.011); // cuencas
      d += 0.0042 * gauss(out.x - s * 0.0095, 0.0045) * gauss(out.y + 0.0425, 0.004); // aletas de la nariz
      d += 0.0028 * gauss(out.x - s * 0.03, 0.02) * gauss(out.y - 0.013, 0.006); // arco superciliar
      d += 0.0035 * gauss(out.x - s * 0.046, 0.018) * gauss(out.y + 0.036, 0.018); // pómulos
    }
    // Nariz: tabique que crece hasta la punta y cae rápido debajo.
    const yArriba = 0.004;
    const yPunta = -0.04;
    let h;
    let sg;
    if (out.y > yArriba) {
      h = 0.0025 * gauss(out.y - yArriba, 0.01);
      sg = 0.0045;
    } else if (out.y >= yPunta) {
      const u = (yArriba - out.y) / (yArriba - yPunta);
      h = 0.0025 + 0.0155 * Math.pow(u, 1.5);
      sg = 0.0045 + 0.0045 * u;
    } else {
      h = 0.018 * gauss(out.y - yPunta, 0.0055);
      sg = 0.009;
    }
    d += h * gauss(out.x, sg);
    d += 0.004 * gauss(out.x, 0.018) * gauss(out.y + 0.1, 0.012); // mentón
    out.z += d * w;
  }
  return out;
}

/**
 * Tubo que sigue una curva con radio variable (afinar(u) con u en [0, 1])
 * y aplastado en Z por escalaZ. Útil para cejas y labios.
 */
export function tuboAfinado(puntos, radio, afinar, escalaZ = 1, radial = 10, segs = 32) {
  const curva = new THREE.CatmullRomCurve3(puntos);
  const g = new THREE.TubeGeometry(curva, segs, radio, radial, false);
  const pos = g.attributes.position;
  const v = new V3();
  for (let i = 0; i <= segs; i++) {
    const c = curva.getPointAt(i / segs);
    const f = afinar(i / segs);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c);
      v.z *= escalaZ;
      v.multiplyScalar(f).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
