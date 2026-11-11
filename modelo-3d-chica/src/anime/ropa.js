import * as THREE from 'three';

/*
 * Ropa extra para el VRM. Las prendas ajustadas (mangas, pantalón, botas) se
 * generan como "cáscaras" del cuerpo: se copian los triángulos de la zona, se
 * inflan un poco hacia afuera y se enlazan al mismo esqueleto, así siguen cada
 * movimiento. Las polleras son tela simulada (ver FisicaPollera) colgada de la cadera.
 */

let gradiente = null;
/** Mapa de 3 tonos para sombreado anime (toon). */
function mapaToon() {
  if (gradiente) return gradiente;
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradiente = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  gradiente.minFilter = gradiente.magFilter = THREE.NearestFilter;
  gradiente.needsUpdate = true;
  return gradiente;
}

export function materialToon(color, doble = false) {
  return new THREE.MeshToonMaterial({ color, gradientMap: mapaToon(), side: doble ? THREE.DoubleSide : THREE.FrontSide });
}
const materialContorno = new THREE.MeshBasicMaterial({ color: '#1d1a22', side: THREE.BackSide });

function buscarMalla(escena, re) {
  let r = null;
  escena.traverse((o) => {
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!r && o.isMesh && re.test(m?.name || '')) r = o;
  });
  return r;
}

/** Puntos de la malla en el espacio de enlace (pose T). */
function puntosEnlace(malla) {
  const pos = malla.geometry.attributes.position;
  const usados = new Set(malla.geometry.index ? malla.geometry.index.array : [...Array(pos.count).keys()]);
  const pts = [];
  for (const i of usados) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(malla.bindMatrix));
  return pts;
}

/** Posición de un hueso en la pose de enlace. */
function posEnlace(malla, hueso) {
  const i = malla.skeleton.bones.indexOf(hueso);
  if (i < 0) return hueso.getWorldPosition(new THREE.Vector3());
  return new THREE.Vector3().setFromMatrixPosition(malla.skeleton.boneInverses[i].clone().invert());
}

/** Crea una prenda ajustada a partir de los triángulos del cuerpo que cumplen `zona(p)`. */
function cascara(cuerpo, zona, espesor, material, nombre) {
  const g0 = cuerpo.geometry;
  const pos = g0.attributes.position;
  const nor = g0.attributes.normal;
  const enZona = new Uint8Array(pos.count);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) enZona[i] = zona(p.fromBufferAttribute(pos, i).applyMatrix4(cuerpo.bindMatrix)) ? 1 : 0;
  const idx = [];
  const src = g0.index.array;
  for (let i = 0; i < src.length; i += 3) {
    if (enZona[src[i]] && enZona[src[i + 1]] && enZona[src[i + 2]]) idx.push(src[i], src[i + 1], src[i + 2]);
  }
  const crear = (esp, mat, n) => {
    const g = new THREE.BufferGeometry();
    const arr = Float32Array.from(pos.array);
    for (let i = 0; i < pos.count; i++) {
      arr[i * 3] += nor.getX(i) * esp;
      arr[i * 3 + 1] += nor.getY(i) * esp;
      arr[i * 3 + 2] += nor.getZ(i) * esp;
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.setAttribute('normal', nor);
    g.setAttribute('skinIndex', g0.attributes.skinIndex);
    g.setAttribute('skinWeight', g0.attributes.skinWeight);
    g.setIndex(idx);
    const m = new THREE.SkinnedMesh(g, mat);
    m.name = n;
    m.bind(cuerpo.skeleton, cuerpo.bindMatrix);
    m.position.copy(cuerpo.position);
    m.quaternion.copy(cuerpo.quaternion);
    m.scale.copy(cuerpo.scale);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    cuerpo.parent.add(m);
    return m;
  };
  return [crear(espesor, material, nombre), crear(espesor + 0.0035, materialContorno, nombre + 'Contorno')];
}

/**
 * Viste al VRM según op = { arriba, abajo, calzado, colorArriba, colorAbajo, colorCalzado }.
 * Devuelve { pollera } (malla con datos para la física) o { pollera: null }.
 */
export function vestir(vrm, op) {
  const escena = vrm.scene;
  const cuerpo = buscarMalla(escena, /body.*skin/i);
  if (!cuerpo?.isSkinnedMesh) return { pollera: null, materiales: [] };
  const remera = buscarMalla(escena, /tops?_/i);
  const short = buscarMalla(escena, /bottoms?_/i);
  const zapatos = buscarMalla(escena, /shoes?_/i);
  const H = (n) => vrm.humanoid.getRawBoneNode(n);
  const materiales = [];

  const ptsRemera = remera ? puntosEnlace(remera) : [];
  const ptsShort = short ? puntosEnlace(short) : [];
  const finManga = ptsRemera.reduce((m, q) => Math.max(m, Math.abs(q.x)), 0.25);
  const ruedo = ptsShort.reduce((m, q) => Math.min(m, q.y), 0.75);
  const cintura = ptsShort.reduce((m, q) => Math.max(m, q.y), 1.0);
  const xMano = Math.abs(posEnlace(cuerpo, H('leftHand')).x);
  const yHombro = posEnlace(cuerpo, H('leftUpperArm')).y;
  const yRodilla = posEnlace(cuerpo, H('leftLowerLeg')).y;
  const yTobillo = posEnlace(cuerpo, H('leftFoot')).y;

  if (op.arriba === 'Remera manga larga') {
    const mat = materialToon(op.colorArriba);
    mat.userData.clave = 'colorArriba';
    materiales.push(mat);
    cascara(cuerpo, (q) => Math.abs(q.x) > finManga - 0.03 && Math.abs(q.x) < xMano - 0.004 && Math.abs(q.y - yHombro) < 0.12, 0.006, mat, 'MangaLarga');
  }
  if (op.abajo === 'Pantalón largo') {
    const mat = materialToon(op.colorAbajo);
    mat.userData.clave = 'colorAbajo';
    materiales.push(mat);
    cascara(cuerpo, (q) => q.y < ruedo + 0.03 && q.y > yTobillo + 0.03 && Math.abs(q.x) < 0.3, 0.007, mat, 'Pantalon');
  }
  if (op.calzado === 'Botas') {
    const mat = materialToon(op.colorCalzado);
    mat.userData.clave = 'colorCalzado';
    materiales.push(mat);
    if (zapatos) zapatos.visible = false;
    cascara(cuerpo, (q) => q.y < yRodilla - 0.04 && Math.abs(q.x) < 0.3, 0.011, mat, 'Botas');
  }

  let pollera = null;
  if (op.abajo === 'Pollera corta' || op.abajo === 'Pollera larga') {
    // Medidas tomadas del short y de las piernas en la pose de enlace.
    const ptsCuerpo = puntosEnlace(cuerpo).filter((q) => Math.abs(q.x) < 0.3 && q.y < cintura + 0.02);
    const todos = [...ptsShort, ...ptsCuerpo];
    const cadera = todos.filter((q) => q.y > ruedo && q.y < cintura && Math.abs(q.x) < 0.25);
    const zMin = cadera.reduce((m, q) => Math.min(m, q.z), 0);
    const zMax = cadera.reduce((m, q) => Math.max(m, q.z), 0);
    const xMax = cadera.reduce((m, q) => Math.max(m, Math.abs(q.x)), 0.1);
    const cz = (zMin + zMax) / 2;
    const zEsc = Math.min(1, (zMax - zMin) / 2 / xMax);
    // Empieza justo debajo del ruedo de la remera (que queda por fuera).
    const ruedoRemera = ptsRemera.reduce((m, q) => Math.min(m, q.y), cintura);
    const yArriba = Math.min(cintura - 0.005, ruedoRemera + 0.04);
    const yAbajo = op.abajo === 'Pollera corta' ? yRodilla + 0.1 : (yRodilla + yTobillo) / 2;
    const perfil = [];
    let rPrev = 0;
    for (let y = yArriba; y >= yAbajo - 1e-6; y -= 0.01) {
      let r = 0;
      for (const q of todos) {
        if (Math.abs(q.y - y) < 0.02) r = Math.max(r, Math.hypot(q.x, (q.z - cz) / zEsc));
      }
      r = Math.max(r * 1.03 + 0.005, rPrev + 0.0012);
      // Donde se superpone con la remera, la pollera queda por dentro.
      if (y > ruedoRemera - 0.005) {
        let rr = Infinity;
        for (const q of ptsRemera) {
          if (Math.abs(q.y - y) < 0.015 && Math.abs(q.x) < 0.3) rr = Math.min(rr, Math.max(Math.abs(q.x), Math.abs((q.z - cz) / zEsc)));
        }
        if (rr < Infinity) r = Math.min(r, rr * 0.97);
      }
      rPrev = r;
      perfil.push([y, r]);
    }
    const pts = perfil.map(([y, r]) => new THREE.Vector2(r, y)).reverse();
    const g = new THREE.LatheGeometry(pts, 64);
    g.scale(1, 1, zEsc);
    const mat = materialToon(op.colorAbajo, true);
    mat.userData.clave = 'colorAbajo';
    materiales.push(mat);
    pollera = new THREE.Mesh(g, mat);
    pollera.name = 'Pollera';
    pollera.castShadow = true;
    pollera.receiveShadow = true;
    pollera.frustumCulled = false;
    pollera.userData.perfil = perfil;
    pollera.userData.zEsc = zEsc;
    const contorno = new THREE.Mesh(g, materialContorno);
    contorno.scale.setScalar(1.012);
    contorno.frustumCulled = false;
    pollera.add(contorno);

    // Ancla colgada de la cadera: en reposo coincide con el espacio del cuerpo.
    const cadHueso = H('hips');
    const enlaceCadera = cuerpo.skeleton.boneInverses[cuerpo.skeleton.bones.indexOf(cadHueso)].clone().invert();
    const local = enlaceCadera.invert().multiply(cuerpo.bindMatrix).multiply(new THREE.Matrix4().makeTranslation(0, 0, cz));
    const ancla = new THREE.Object3D();
    ancla.name = 'AnclaPollera';
    local.decompose(ancla.position, ancla.quaternion, ancla.scale);
    cadHueso.add(ancla);
    ancla.add(pollera);
    pollera.userData.ancla = ancla;
  }
  return { pollera, materiales };
}
