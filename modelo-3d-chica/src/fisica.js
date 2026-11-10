import * as THREE from 'three';
import { V3, CABEZA } from './util.js';

/*
 * Físicas propias (sin librerías):
 *  - Colisionador: cuerpo del personaje como elipsoide (cabeza), torso paramétrico
 *    y cápsulas (brazos y piernas), actualizado cada cuadro según la pose.
 *  - FisicaPelo: mechones guía simulados con integración de Verlet, restricciones
 *    de distancia, retorno a la forma del peinado, gravedad, viento y colisiones.
 *  - FisicaPollera: tela como malla de partículas (anillos y columnas).
 *  - Pelotas: cuerpos rígidos esféricos con rebote, fricción y choques entre sí.
 *  - Resorte: reacción del cuerpo a los impactos.
 */

const _a = new V3();
const _b = new V3();
const _p = new V3();
const _n = new V3();
const _m = new THREE.Matrix4();

function puntoEnSegmento(p, a, b, out) {
  _a.subVectors(b, a);
  const t = Math.max(0, Math.min(1, _b.subVectors(p, a).dot(_a) / Math.max(_a.lengthSq(), 1e-12)));
  return out.copy(a).addScaledVector(_a, t);
}

export class Colisionador {
  constructor(pj) {
    this.pj = pj;
    this.m = pj.modelo;
    this.capsulas = [];
    this.invRaiz = new THREE.Matrix4();
    this.invCabeza = new THREE.Matrix4();
    this.escala = 1;
  }

  actualizar() {
    const pt = this.pj.partes;
    this.pj.raiz.updateMatrixWorld(true);
    this.invRaiz.copy(this.pj.raiz.matrixWorld).invert();
    this.invCabeza.copy(pt.cabeza.matrixWorld).invert();
    this.escala = this.pj.raiz.scale.x;
    const k = this.m.k;
    const e = this.escala;
    const W = (obj, x, y, z) => new V3(x, y, z).applyMatrix4(obj.matrixWorld);
    const caps = (this.capsulas = []);
    for (let i = 0; i < 2; i++) {
      caps.push([W(pt.hombros[i], 0, 0, 0), W(pt.codos[i], 0, 0, 0), 0.042 * k * e]);
      caps.push([W(pt.codos[i], 0, 0, 0), W(pt.munecas[i], 0, 0, 0), 0.032 * k * e]);
      caps.push([W(pt.munecas[i], 0, -0.03, 0), W(pt.munecas[i], 0, -0.15, 0), 0.03 * e]);
      caps.push([W(pt.caderas[i], 0, 0, 0), W(pt.rodillas[i], 0, 0, 0), 0.078 * k * e]);
      caps.push([W(pt.rodillas[i], 0, 0, 0), W(pt.tobillos[i], 0, 0, 0), 0.048 * k * e]);
      caps.push([W(pt.tobillos[i], 0, -0.05, -0.03), W(pt.tobillos[i], 0, -0.05, 0.14), 0.04 * e]);
    }
  }

  /**
   * Saca el punto p (coordenadas de mundo) del cuerpo, considerando un radio r.
   * Devuelve 'cabeza', 'cuerpo' o null; si hubo contacto deja la normal en n.
   */
  resolver(p, r, n = _n) {
    let golpe = null;
    const pt = this.pj.partes;
    const rl = r / this.escala;

    // Cabeza (elipsoide)
    _p.copy(p).applyMatrix4(this.invCabeza);
    const ax = CABEZA.x * 1.03 + rl;
    const ay = CABEZA.y * 1.03 + rl;
    const az = CABEZA.z * 1.08 + rl;
    let e = (_p.x / ax) ** 2 + (_p.y / ay) ** 2 + (_p.z / az) ** 2;
    if (e < 1) {
      n.set(_p.x / (ax * ax), _p.y / (ay * ay), _p.z / (az * az)).transformDirection(pt.cabeza.matrixWorld);
      _p.multiplyScalar(1 / Math.sqrt(Math.max(e, 1e-6)));
      p.copy(_p).applyMatrix4(pt.cabeza.matrixWorld);
      golpe = 'cabeza';
    }

    // Torso y cuello (secciones elípticas del modelo paramétrico)
    _p.copy(p).applyMatrix4(this.invRaiz);
    if (_p.y > 0.77 && _p.y < 1.5) {
      const [rx, rz] = this.m.radios(_p.y);
      const zc = this.m.zc(_p.y);
      const dz = _p.z - zc;
      const bulto = dz > 0 ? this.m.busto(_p.x, _p.y) : this.m.gluteo(_p.x, _p.y);
      const Rx = rx * 1.04 + rl;
      const Rz = (rz + bulto) * 1.04 + rl;
      e = (_p.x / Rx) ** 2 + (dz / Rz) ** 2;
      if (e < 1) {
        n.set(_p.x / (Rx * Rx), 0, dz / (Rz * Rz)).transformDirection(this.pj.raiz.matrixWorld);
        const s = 1 / Math.sqrt(Math.max(e, 1e-6));
        _p.x *= s;
        _p.z = zc + dz * s;
        p.copy(_p).applyMatrix4(this.pj.raiz.matrixWorld);
        golpe = golpe || 'cuerpo';
      }
    }

    // Extremidades (cápsulas)
    for (const [a, b, rc] of this.capsulas) {
      puntoEnSegmento(p, a, b, _p);
      const d = p.distanceTo(_p);
      const R = rc + r;
      if (d < R) {
        if (d > 1e-6) n.subVectors(p, _p).divideScalar(d);
        else n.set(0, 1, 0);
        p.copy(_p).addScaledVector(n, R);
        golpe = golpe || 'cuerpo';
      }
    }
    return golpe;
  }
}

/** Opciones compartidas por las simulaciones. */
export const opcionesFisica = {
  gravedad: new V3(0, -9.8, 0),
  viento: new V3(),
  rigidez: 0.5,
  amortiguacion: 0.988,
  iteraciones: 3,
};

/** Empuja la partícula p fuera de las pelotas. */
function chocarPelotas(p, pelotas, r) {
  if (!pelotas) return;
  for (const b of pelotas.lista) {
    const R = b.r + r;
    const d2 = p.distanceToSquared(b.pos);
    if (d2 < R * R) {
      const d = Math.sqrt(d2) || 1e-6;
      p.sub(b.pos).multiplyScalar(R / d).add(b.pos);
    }
  }
}

/** Cadenas de partículas (Verlet) ancladas a un objeto que se mueve. */
class Cadenas {
  constructor(cadenas, ancla) {
    // cadenas: [{ rest: V3[] (coords locales del ancla), fijas: n° de partículas fijas }]
    this.ancla = ancla;
    this.cadenas = [];
    let n = 0;
    for (const c of cadenas) {
      this.cadenas.push({ inicio: n, cant: c.rest.length, fijas: c.fijas });
      n += c.rest.length;
    }
    this.n = n;
    this.rest = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.desp = new Float32Array(n * 3);
    this.largo = new Float32Array(n);
    this.fija = new Uint8Array(n);
    let i = 0;
    for (const c of cadenas) {
      c.rest.forEach((q, j) => {
        this.rest.set([q.x, q.y, q.z], i * 3);
        this.largo[i] = j > 0 ? q.distanceTo(c.rest[j - 1]) : 0;
        this.fija[i] = j < c.fijas ? 1 : 0;
        i++;
      });
    }
    this.vecinos = []; // restricciones extra [i, j, largo]
    this.listo = false;
  }

  reiniciar() {
    this.ancla.updateMatrixWorld(true);
    const M = this.ancla.matrixWorld;
    for (let i = 0; i < this.n; i++) {
      _p.fromArray(this.rest, i * 3).applyMatrix4(M);
      _p.toArray(this.pos, i * 3);
      _p.toArray(this.prev, i * 3);
    }
    this.desp.fill(0);
    this.listo = true;
  }

  paso(dt, col, pelotas, rForma, rColision, t) {
    if (!this.listo) this.reiniciar();
    const o = opcionesFisica;
    const M = this.ancla.matrixWorld;
    const esc = col.escala;
    const amort = o.amortiguacion;
    const kForma = rForma;
    const pos = this.pos;
    const prev = this.prev;
    const dt2 = dt * dt;
    const objetivo = new V3();
    const actual = new V3();
    const anterior = new V3();

    for (let i = 0; i < this.n; i++) {
      objetivo.fromArray(this.rest, i * 3).applyMatrix4(M);
      if (this.fija[i]) {
        objetivo.toArray(pos, i * 3);
        objetivo.toArray(prev, i * 3);
        continue;
      }
      actual.fromArray(pos, i * 3);
      anterior.fromArray(prev, i * 3);
      const vx = (actual.x - anterior.x) * amort;
      const vy = (actual.y - anterior.y) * amort;
      const vz = (actual.z - anterior.z) * amort;
      // Ráfagas: el viento varía en el tiempo y entre partículas.
      const rafaga = 0.6 + 0.4 * Math.sin(t * 1.7 + i * 0.37) * Math.sin(t * 0.63 + i * 0.11);
      actual.x += vx + (o.gravedad.x + o.viento.x * rafaga) * dt2;
      actual.y += vy + (o.gravedad.y + o.viento.y * rafaga) * dt2;
      actual.z += vz + (o.gravedad.z + o.viento.z * rafaga) * dt2;
      actual.lerp(objetivo, kForma);
      anterior.fromArray(pos, i * 3).toArray(prev, i * 3);
      actual.toArray(pos, i * 3);
    }

    const pa = new V3();
    const pb = new V3();
    for (let it = 0; it < o.iteraciones; it++) {
      for (const c of this.cadenas) {
        for (let j = 1; j < c.cant; j++) {
          const ia = c.inicio + j - 1;
          const ib = ia + 1;
          this._restringir(ia, ib, this.largo[ib] * esc, pa, pb);
        }
      }
      for (const [ia, ib, L] of this.vecinos) this._restringir(ia, ib, L * esc, pa, pb);
      for (let i = 0; i < this.n; i++) {
        if (this.fija[i]) continue;
        pa.fromArray(pos, i * 3);
        col.resolver(pa, rColision * esc);
        chocarPelotas(pa, pelotas, rColision * esc);
        pa.toArray(pos, i * 3);
      }
    }
  }

  _restringir(ia, ib, L, pa, pb) {
    const fa = this.fija[ia];
    const fb = this.fija[ib];
    if (fa && fb) return;
    pa.fromArray(this.pos, ia * 3);
    pb.fromArray(this.pos, ib * 3);
    _a.subVectors(pb, pa);
    const d = _a.length();
    if (d < 1e-9) return;
    const dif = (d - L) / d;
    if (fa) pb.addScaledVector(_a, -dif);
    else if (fb) pa.addScaledVector(_a, dif);
    else {
      pa.addScaledVector(_a, dif * 0.5);
      pb.addScaledVector(_a, -dif * 0.5);
    }
    pa.toArray(this.pos, ia * 3);
    pb.toArray(this.pos, ib * 3);
  }

  /** Calcula el desplazamiento de cada partícula en coordenadas locales del ancla. */
  calcularDesplazamientos() {
    _m.copy(this.ancla.matrixWorld).invert();
    for (let i = 0; i < this.n; i++) {
      _p.fromArray(this.pos, i * 3).applyMatrix4(_m);
      this.desp[i * 3] = _p.x - this.rest[i * 3];
      this.desp[i * 3 + 1] = _p.y - this.rest[i * 3 + 1];
      this.desp[i * 3 + 2] = _p.z - this.rest[i * 3 + 2];
    }
  }
}

export class FisicaPelo {
  constructor(datos, cabeza) {
    this.d = datos;
    this.cad = new Cadenas(
      datos.guias.map((g) => ({ rest: g.rest, fijas: 2 })),
      cabeza,
    );
  }

  reiniciar() {
    this.cad.reiniciar();
    this.aplicar();
  }

  paso(dt, col, pelotas, t) {
    const kForma = THREE.MathUtils.lerp(0.0015, 0.035, opcionesFisica.rigidez);
    this.cad.paso(dt, col, pelotas, kForma, 0.007, t);
  }

  aplicar() {
    const cad = this.cad;
    cad.calcularDesplazamientos();
    const pos = this.d.malla.geometry.attributes.position;
    const arr = pos.array;
    const rep = this.d.reposo;
    const desp = cad.desp;
    const g = this.d.guias;
    const dispEn = (gi, s, out) => {
      const c = cad.cadenas[gi];
      const f = Math.min(c.cant - 1, Math.max(0, (s + g[gi].ds) / g[gi].ds));
      const i = Math.min(c.cant - 2, Math.floor(f));
      const u = f - i;
      const a = (c.inicio + i) * 3;
      const b = a + 3;
      out[0] = desp[a] + (desp[b] - desp[a]) * u;
      out[1] = desp[a + 1] + (desp[b + 1] - desp[a + 1]) * u;
      out[2] = desp[a + 2] + (desp[b + 2] - desp[a + 2]) * u;
    };
    const d1 = [0, 0, 0];
    const d2 = [0, 0, 0];
    for (const c of this.d.cartas) {
      for (let i = 0; i <= c.seg; i++) {
        const s = c.s[i];
        const v = (c.v0 + i * 2) * 3;
        if (s <= 0) continue;
        dispEn(c.g1, s, d1);
        dispEn(c.g2, s, d2);
        const f = Math.min(1, s / 0.05);
        const w = f * f * (3 - 2 * f);
        const dx = (d1[0] * c.w1 + d2[0] * c.w2) * w;
        const dy = (d1[1] * c.w1 + d2[1] * c.w2) * w;
        const dz = (d1[2] * c.w1 + d2[2] * c.w2) * w;
        arr[v] = rep[v] + dx;
        arr[v + 1] = rep[v + 1] + dy;
        arr[v + 2] = rep[v + 2] + dz;
        arr[v + 3] = rep[v + 3] + dx;
        arr[v + 4] = rep[v + 4] + dy;
        arr[v + 5] = rep[v + 5] + dz;
      }
    }
    pos.needsUpdate = true;
  }
}

export class FisicaPollera {
  constructor(malla, raiz) {
    this.malla = malla;
    const { perfil, zEsc } = malla.userData; // perfil: [[y, r]] de arriba hacia abajo
    const C = 32;
    const R = 11;
    const y0 = perfil[0][0];
    const y1 = perfil[perfil.length - 1][0];
    const rEn = (y) => {
      for (let i = 1; i < perfil.length; i++) {
        if (perfil[i][0] <= y) {
          const [ya, ra] = perfil[i - 1];
          const [yb, rb] = perfil[i];
          return ra + ((rb - ra) * (y - ya)) / (yb - ya);
        }
      }
      return perfil[perfil.length - 1][1];
    };
    this.filasY = [];
    const cadenas = [];
    for (let j = 0; j < C; j++) {
      const phi = (j / C) * Math.PI * 2;
      const rest = [];
      for (let i = 0; i < R; i++) {
        const y = y0 + ((y1 - y0) * i) / (R - 1);
        if (j === 0) this.filasY.push(y);
        const r = rEn(y);
        rest.push(new V3(Math.sin(phi) * r, y, Math.cos(phi) * r * zEsc));
      }
      cadenas.push({ rest, fijas: 1 });
    }
    this.C = C;
    this.R = R;
    this.cad = new Cadenas(cadenas, raiz);
    // Restricciones horizontales (anillos) para que la tela no se abra.
    for (let j = 0; j < C; j++) {
      const jn = (j + 1) % C;
      for (let i = 1; i < R; i++) {
        const a = j * R + i;
        const b = jn * R + i;
        _a.fromArray(this.cad.rest, a * 3);
        _b.fromArray(this.cad.rest, b * 3);
        this.cad.vecinos.push([a, b, _a.distanceTo(_b)]);
      }
    }
    // Mapeo de cada vértice de la malla a la grilla (interpolación bilineal).
    const pos = malla.geometry.attributes.position;
    this.reposo = Float32Array.from(pos.array);
    this.mapa = [];
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v) / zEsc;
      let fc = ((Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * C;
      const fr = Math.max(0, Math.min(R - 1.0001, ((y - y0) / (y1 - y0)) * (R - 1)));
      const c0 = Math.floor(fc) % C;
      const c1 = (c0 + 1) % C;
      const r0 = Math.floor(fr);
      fc -= Math.floor(fc);
      const fr2 = fr - r0;
      this.mapa.push([c0 * R + r0, c1 * R + r0, c0 * R + r0 + 1, c1 * R + r0 + 1, fc, fr2]);
    }
  }

  reiniciar() {
    this.cad.reiniciar();
    this.aplicar();
  }

  paso(dt, col, pelotas, t) {
    const kForma = THREE.MathUtils.lerp(0.004, 0.04, opcionesFisica.rigidez);
    this.cad.paso(dt, col, pelotas, kForma, 0.01, t);
  }

  aplicar() {
    this.cad.calcularDesplazamientos();
    const d = this.cad.desp;
    const pos = this.malla.geometry.attributes.position;
    const arr = pos.array;
    for (let v = 0; v < this.mapa.length; v++) {
      const [a, b, c, e, u, w] = this.mapa[v];
      for (let k = 0; k < 3; k++) {
        const top = d[a * 3 + k] * (1 - u) + d[b * 3 + k] * u;
        const bot = d[c * 3 + k] * (1 - u) + d[e * 3 + k] * u;
        arr[v * 3 + k] = this.reposo[v * 3 + k] + top * (1 - w) + bot * w;
      }
    }
    pos.needsUpdate = true;
    this.malla.geometry.computeVertexNormals();
  }
}

export class Pelotas {
  constructor(escena, max = 14) {
    this.escena = escena;
    this.max = max;
    this.lista = [];
    this.geo = new THREE.SphereGeometry(1, 32, 20);
  }

  lanzar(origen, vel, r = 0.07) {
    const color = new THREE.Color().setHSL(Math.random(), 0.65, 0.55);
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const malla = new THREE.Mesh(this.geo, mat);
    malla.scale.setScalar(r);
    malla.castShadow = true;
    malla.receiveShadow = true;
    malla.position.copy(origen);
    this.escena.add(malla);
    this.lista.push({ malla, pos: origen.clone(), vel: vel.clone(), r, masa: 0.35 * (r / 0.07) ** 3 });
    if (this.lista.length > this.max) this._quitar(this.lista[0]);
  }

  _quitar(b) {
    this.escena.remove(b.malla);
    b.malla.material.dispose();
    this.lista.splice(this.lista.indexOf(b), 1);
  }

  limpiar() {
    while (this.lista.length) this._quitar(this.lista[0]);
  }

  /** alGolpear(punto, impulso, zona) se llama cuando una pelota choca con el cuerpo. */
  paso(dt, col, alGolpear) {
    const g = opcionesFisica.gravedad;
    const n = new V3();
    for (const b of this.lista) {
      b.vel.addScaledVector(g, dt);
      b.vel.addScaledVector(opcionesFisica.viento, dt * 0.02);
      b.pos.addScaledVector(b.vel, dt);
      // Piso
      if (b.pos.y < b.r) {
        b.pos.y = b.r;
        if (b.vel.y < 0) b.vel.y = -b.vel.y * 0.62;
        if (Math.abs(b.vel.y) < 0.15) b.vel.y = 0;
        b.vel.x *= 1 - 1.2 * dt;
        b.vel.z *= 1 - 1.2 * dt;
      }
      // Cuerpo
      const zona = col.resolver(b.pos, b.r, n);
      if (zona) {
        const vn = b.vel.dot(n);
        if (vn < 0) {
          const j = -(1 + 0.25) * vn;
          b.vel.addScaledVector(n, j);
          b.vel.multiplyScalar(0.8);
          if (j > 0.6) alGolpear(b.pos.clone(), n.clone().multiplyScalar(-j * b.masa), zona);
        }
      }
    }
    // Choques entre pelotas
    for (let i = 0; i < this.lista.length; i++) {
      for (let k = i + 1; k < this.lista.length; k++) {
        const A = this.lista[i];
        const B = this.lista[k];
        const R = A.r + B.r;
        _a.subVectors(B.pos, A.pos);
        const d = _a.length();
        if (d > 0 && d < R) {
          _a.divideScalar(d);
          const mt = A.masa + B.masa;
          A.pos.addScaledVector(_a, -(R - d) * (B.masa / mt));
          B.pos.addScaledVector(_a, (R - d) * (A.masa / mt));
          const vrel = _b.subVectors(B.vel, A.vel).dot(_a);
          if (vrel < 0) {
            const j = (-(1 + 0.8) * vrel) / (1 / A.masa + 1 / B.masa);
            A.vel.addScaledVector(_a, -j / A.masa);
            B.vel.addScaledVector(_a, j / B.masa);
          }
        }
      }
    }
    // Rodar visualmente
    for (const b of this.lista) {
      b.malla.position.copy(b.pos);
      const v = Math.hypot(b.vel.x, b.vel.z);
      if (v > 1e-3 && b.pos.y <= b.r + 0.002) {
        _a.set(b.vel.z, 0, -b.vel.x).normalize();
        b.malla.rotateOnWorldAxis(_a, (v * dt) / b.r);
      }
    }
  }
}

/** Resorte amortiguado de 2 ejes (inclinación del cuerpo o de la cabeza). */
export class Resorte {
  constructor(k = 55, c = 7) {
    this.k = k;
    this.c = c;
    this.x = new THREE.Vector2();
    this.v = new THREE.Vector2();
  }
  impulso(ix, iz) {
    this.v.x += ix;
    this.v.y += iz;
  }
  paso(dt) {
    this.v.x += (-this.k * this.x.x - this.c * this.v.x) * dt;
    this.v.y += (-this.k * this.x.y - this.c * this.v.y) * dt;
    this.x.addScaledVector(this.v, dt);
    this.x.clampScalar(-0.5, 0.5);
  }
  reiniciar() {
    this.x.set(0, 0);
    this.v.set(0, 0);
  }
}
