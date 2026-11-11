import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { VRMLoaderPlugin, VRMUtils, VRMSpringBoneCollider, VRMSpringBoneColliderShapeSphere } from '@pixiv/three-vrm';
import { Pelotas, Resorte, opcionesFisica } from '../fisica.js';
import { huesosVRM, huesosGenericos, Posador, ColisionadorHuesos } from './esqueleto.js';

const MODELO_DEFECTO = './modelos/chica-anime.glb';

const P = {
  viento: 0.2,
  dirViento: 200,
  rigidez: 1,
  expresion: 'Neutral',
  intensidad: 1,
  contorno: 1,
  pelo: '#f2d48c',
  ojos: '#4f86c6',
  arriba: '#ffffff',
  abajo: '#ffffff',
  zapatos: '#ffffff',
  animar: true,
};

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const escena = new THREE.Scene();
escena.background = (() => {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#9cc4e8');
  grad.addColorStop(0.55, '#d9e6f2');
  grad.addColorStop(1, '#d9e6f2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
escena.fog = new THREE.Fog('#d9e6f2', 6, 18);
const envAmbiente = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camara = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 50);
camara.position.set(0.6, 1.25, 3.4);
const controles = new OrbitControls(camara, renderer.domElement);
controles.target.set(0, 0.9, 0);
controles.enableDamping = true;
controles.minDistance = 0.3;
controles.maxDistance = 8;
controles.update();

const luz = new THREE.DirectionalLight('#ffffff', 2.2);
luz.position.set(1.5, 3.5, 2.5);
luz.castShadow = true;
luz.shadow.mapSize.set(2048, 2048);
Object.assign(luz.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -0.3, near: 0.5, far: 10 });
luz.shadow.bias = -0.0003;
luz.shadow.normalBias = 0.02;
escena.add(luz);
const hemi = new THREE.HemisphereLight('#ffffff', '#b8c4d6', 1.1);
escena.add(hemi);

const piso = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: '#c9d3e0', roughness: 0.9 }));
piso.rotation.x = -Math.PI / 2;
piso.receiveShadow = true;
escena.add(piso);

// ---------- Estado del modelo ----------
let actual = null; // { raiz, vrm, posador, colisionador, alto, tipo }
const pelotas = new Pelotas(escena);
const resorteCuerpo = new Resorte(45, 6);
const resorteCabeza = new Resorte(90, 9);
const estado = document.getElementById('estado');

function mostrarEstado(texto, error = false) {
  if (!estado) return;
  estado.textContent = texto;
  estado.hidden = !texto;
  estado.classList.toggle('error', error);
}

const cargadorGLTF = new GLTFLoader();
cargadorGLTF.register((parser) => new VRMLoaderPlugin(parser));
const cargadorFBX = new FBXLoader();

function quitarModelo() {
  if (!actual) return;
  escena.remove(actual.raiz);
  if (actual.vrm) VRMUtils.deepDispose(actual.vrm.scene);
  actual = null;
}

/** Carga un modelo desde una URL. ext: 'glb' | 'gltf' | 'vrm' | 'fbx'. */
async function cargar(url, ext, nombre) {
  mostrarEstado(`Cargando ${nombre}…`);
  try {
    let raiz;
    let vrm = null;
    if (ext === 'fbx') {
      raiz = await cargadorFBX.loadAsync(url);
    } else {
      const gltf = await cargadorGLTF.loadAsync(url);
      vrm = gltf.userData.vrm || null;
      raiz = vrm ? vrm.scene : gltf.scene;
      if (vrm) {
        VRMUtils.removeUnnecessaryVertices(raiz);
        VRMUtils.combineSkeletons(raiz);
        VRMUtils.rotateVRM0(vrm);
      }
    }
    quitarModelo();
    pelotas.limpiar();

    // Escalar a una altura humana si el archivo viene en otra unidad (cm, pulgadas…).
    raiz.updateMatrixWorld(true);
    let caja = new THREE.Box3().setFromObject(raiz);
    let alto = caja.max.y - caja.min.y;
    if (!vrm && (alto > 3 || alto < 0.5)) {
      raiz.scale.multiplyScalar(1.65 / alto);
      raiz.updateMatrixWorld(true);
      caja = new THREE.Box3().setFromObject(raiz);
      alto = caja.max.y - caja.min.y;
    }
    // Apoyar en el piso y centrar.
    const centro = caja.getCenter(new THREE.Vector3());
    const pivote = new THREE.Group();
    pivote.name = 'Modelo';
    raiz.position.x -= centro.x;
    raiz.position.z -= centro.z;
    raiz.position.y -= caja.min.y;
    pivote.add(raiz);
    escena.add(pivote);

    raiz.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });

    const huesos = vrm ? huesosVRM(vrm) : huesosGenericos(raiz);
    const posador = huesos ? new Posador(pivote, huesos.pose) : null;
    if (posador) posador.relajarBrazos();
    if (vrm) vrm.update(0);
    const colisionador = new ColisionadorHuesos(huesos ? huesos.reales : {}, pivote, alto);

    // Pelo y ropa con física (spring bones del VRM).
    let resortes = null;
    if (vrm?.springBoneManager) {
      const grupo = { colliders: [], name: 'pelotas' };
      const juntas = [...vrm.springBoneManager.joints];
      for (const j of juntas) j.colliderGroups.push(grupo);
      resortes = {
        juntas,
        grupo,
        original: juntas.map((j) => ({
          dir: j.settings.gravityDir.clone(),
          fuerza: j.settings.gravityPower,
          rigidez: j.settings.stiffness,
        })),
        porPelota: new Map(),
      };
    }

    vrm?.lookAt && (vrm.lookAt.target = camara);
    actual = { raiz: pivote, modelo: raiz, vrm, posador, colisionador, alto, tipo: vrm ? 'vrm' : 'generico', resortes, materiales: new Map() };

    // Iluminación según el tipo: anime (sombreado plano) o realista (PBR con entorno).
    escena.environment = vrm ? null : envAmbiente;
    renderer.toneMapping = vrm ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    hemi.intensity = vrm ? 1.1 : 0.4;
    panelAnime.show(!!vrm);
    if (vrm) aplicarApariencia();
    mostrarEstado(
      vrm
        ? ''
        : huesos
          ? `${nombre}: modelo sin física de pelo propia (el pelo se mueve solo en archivos VRM).`
          : `${nombre}: el archivo no trae esqueleto, así que no se puede posar ni animar.`,
    );
    vistaCuerpo();
  } catch (err) {
    console.error(err);
    mostrarEstado(`No se pudo abrir ${nombre}: ${err.message || err}. Probá con un archivo .vrm, .glb, .gltf o .fbx.`, true);
  }
}

// ---------- Apariencia (solo VRM) ----------
/** Convierte la textura en escala de grises para poder teñirla con cualquier color. */
function texturaGris(tex) {
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  let suma = 0;
  let n = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] < 10) continue;
    suma += 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    n++;
  }
  const k = n ? 215 / (suma / n) : 1;
  for (let i = 0; i < d.data.length; i += 4) {
    const l = Math.min(255, (0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]) * k);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = l;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = tex.flipY;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.repeat.copy(tex.repeat);
  t.offset.copy(tex.offset);
  return t;
}

const CATEGORIAS = [
  ['pelo', /hair/i],
  ['ojos', /iris/i],
  ['arriba', /tops?_/i],
  ['abajo', /bottoms?_|skirt/i],
  ['zapatos', /shoes?_/i],
];

function aplicarApariencia() {
  if (!actual?.vrm) return;
  actual.vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const cat = CATEGORIAS.find(([, re]) => re.test(m.name));
      if (cat && m.map) {
        if (!actual.materiales.has(m)) actual.materiales.set(m, { mapa: m.map, gris: texturaGris(m.map), sombra: m.shadeColorFactor?.clone() });
        const info = actual.materiales.get(m);
        const color = new THREE.Color(P[cat[0]]);
        const original = P[cat[0]].toLowerCase() === '#ffffff';
        m.map = original ? info.mapa : info.gris;
        if (m.shadeMultiplyTexture !== undefined && m.shadeMultiplyTexture) m.shadeMultiplyTexture = m.map;
        m.color.copy(color);
        if (m.shadeColorFactor && info.sombra) m.shadeColorFactor.copy(original ? info.sombra : color.clone().multiplyScalar(0.72));
        m.needsUpdate = true;
      }
      if (m.isMToonMaterial) {
        if (m.userData.contornoBase === undefined) m.userData.contornoBase = m.outlineWidthFactor;
        m.outlineWidthFactor = m.userData.contornoBase * P.contorno;
      }
    }
  });
}

const EXPRESIONES = { Neutral: null, Feliz: 'happy', Enojada: 'angry', Triste: 'sad', Relajada: 'relaxed', Sorprendida: 'surprised' };

// ---------- Acciones ----------
const reloj = new THREE.Clock();
let saludo = -1;
let giro = -1;
let salto = -1;
let sacudida = -1;
let proxParpadeo = 1.5;
let vistaObjetivo = null;

function irA(pos, target) {
  vistaObjetivo = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) };
}
function vistaCuerpo() {
  const a = actual?.alto ?? 1.6;
  irA([0.6, a * 0.8, a * 2.2], [0, a * 0.55, 0]);
}
function vistaCara() {
  const a = actual?.alto ?? 1.6;
  irA([0.15, a * 0.93, 0.55], [0, a * 0.92, 0]);
}

function lanzarHacia(destino) {
  const dir = new THREE.Vector3().subVectors(destino, camara.position).normalize();
  const origen = camara.position.clone().addScaledVector(dir, 0.35).add(new THREE.Vector3(0, -0.08, 0));
  const T = Math.max(0.18, origen.distanceTo(destino) / 9);
  const vel = new THREE.Vector3().subVectors(destino, origen).divideScalar(T).addScaledVector(opcionesFisica.gravedad, -0.5 * T);
  pelotas.lanzar(origen, vel, 0.05 + Math.random() * 0.04);
}

const acciones = {
  saludar: () => (saludo = reloj.elapsedTime),
  girar: () => (giro = reloj.elapsedTime),
  saltar: () => (salto = reloj.elapsedTime),
  sacudir: () => (sacudida = reloj.elapsedTime),
  lanzar: () => {
    const a = actual?.alto ?? 1.6;
    lanzarHacia(new THREE.Vector3((Math.random() - 0.5) * 0.2, a * (0.62 + Math.random() * 0.3), 0));
  },
  quitar: () => pelotas.limpiar(),
  cara: vistaCara,
  cuerpo: vistaCuerpo,
  abrir: () => selector.click(),
  defecto: () => cargar(MODELO_DEFECTO, 'vrm', 'la chica anime'),
};

// ---------- Panel ----------
const gui = new GUI({ title: 'Personalizar' });
const fModelo = gui.addFolder('Modelo');
fModelo.add(acciones, 'abrir').name('📂 Abrir mi modelo (.vrm .glb .fbx)');
fModelo.add(acciones, 'defecto').name('Volver a la chica anime');

const panelAnime = gui.addFolder('Apariencia (anime)');
for (const [clave, nombre] of [['pelo', 'Pelo'], ['ojos', 'Ojos'], ['arriba', 'Ropa de arriba'], ['abajo', 'Ropa de abajo'], ['zapatos', 'Zapatos']]) {
  panelAnime.addColor(P, clave).name(nombre).onChange(aplicarApariencia);
}
panelAnime.add({ original: () => {
  for (const k of ['pelo', 'ojos', 'arriba', 'abajo', 'zapatos']) P[k] = '#ffffff';
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  aplicarApariencia();
} }, 'original').name('Colores originales');
panelAnime.add(P, 'contorno', 0, 3, 0.05).name('Grosor del contorno').onChange(aplicarApariencia);
panelAnime.add(P, 'expresion', Object.keys(EXPRESIONES)).name('Expresión');
panelAnime.add(P, 'intensidad', 0, 1, 0.01).name('Intensidad');

const fFis = gui.addFolder('Física');
fFis.add(P, 'viento', 0, 1, 0.01).name('Viento');
fFis.add(P, 'dirViento', 0, 360, 1).name('Dirección viento (°)');
fFis.add(P, 'rigidez', 0.2, 2, 0.01).name('Rigidez pelo/ropa');
fFis.add(acciones, 'lanzar').name('⚽ Lanzar pelota');
fFis.add(acciones, 'quitar').name('Quitar pelotas');
fFis.add(acciones, 'girar').name('🌀 Girar');
fFis.add(acciones, 'saltar').name('⬆️ Saltar');
fFis.add(acciones, 'sacudir').name('Sacudir la cabeza');

const fAcc = gui.addFolder('Acciones');
fAcc.add(acciones, 'saludar').name('👋 Saludar');
fAcc.add(P, 'animar').name('Animación');
fAcc.add(acciones, 'cara').name('Ver cara');
fAcc.add(acciones, 'cuerpo').name('Ver cuerpo entero');
if (window.innerWidth < 700) gui.close();

// Abrir archivos propios (botón o arrastrar y soltar).
const selector = document.createElement('input');
selector.type = 'file';
selector.accept = '.vrm,.glb,.gltf,.fbx';
selector.hidden = true;
document.body.appendChild(selector);
function abrirArchivo(archivo) {
  if (!archivo) return;
  const ext = archivo.name.split('.').pop().toLowerCase();
  if (!['vrm', 'glb', 'gltf', 'fbx'].includes(ext)) {
    mostrarEstado(`"${archivo.name}" no es un formato compatible. Usá .vrm, .glb, .gltf o .fbx.`, true);
    return;
  }
  const url = URL.createObjectURL(archivo);
  cargar(url, ext, archivo.name).finally(() => URL.revokeObjectURL(url));
}
selector.addEventListener('change', () => abrirArchivo(selector.files[0]));
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  abrirArchivo(e.dataTransfer.files[0]);
});

renderer.domElement.addEventListener('dblclick', (ev) => {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camara);
  const objetivos = actual ? [actual.raiz, piso] : [piso];
  const hit = ray.intersectObjects(objetivos, true)[0];
  lanzarHacia(hit ? hit.point : ray.ray.at(4, new THREE.Vector3()));
});

// ---------- Bucle ----------
const PASO = 1 / 90;
let acumulado = 0;
const suave = (x) => x * x * (3 - 2 * x);

function alGolpear(punto, impulso, zona) {
  const a = actual?.alto ?? 1.6;
  const h = (punto.y - actual.raiz.position.y) / a;
  resorteCuerpo.impulso(impulso.z * h * 0.2, -impulso.x * h * 0.2);
  if (zona === 'cabeza') resorteCabeza.impulso(impulso.z * 0.35, -impulso.x * 0.35);
}

function posar(t) {
  const ps = actual.posador;
  if (!ps) return;
  ps.reiniciar();
  if (P.animar) {
    ps.rotar('hips', 0, Math.sin(t * 0.5) * 0.03, Math.sin(t * 0.5) * 0.015);
    ps.rotar('spine', Math.sin(t * 1.7) * 0.012, 0, -Math.sin(t * 0.5) * 0.012);
    ps.rotar('chest', Math.sin(t * 1.7) * 0.015, 0, 0);
    ps.rotar('neck', Math.sin(t * 0.43) * 0.03, Math.sin(t * 0.31) * 0.12, Math.sin(t * 0.27) * 0.03);
    for (const [l, s] of [['left', 1], ['right', -1]]) ps.rotar(l + 'UpperArm', Math.sin(t * 0.6 + s) * 0.03, 0, s * Math.sin(t * 1.7) * 0.01);
  }
  if (sacudida >= 0) {
    const f = (t - sacudida) / 1.2;
    if (f < 1) ps.rotar('neck', 0, Math.sin(f * Math.PI * 7) * 0.45 * Math.sin(f * Math.PI), 0);
    else sacudida = -1;
  }
  if (saludo >= 0) {
    const f = (t - saludo) / 2.6;
    if (f < 1) {
      const e = suave(Math.min(1, f * 5) * Math.min(1, (1 - f) * 5));
      ps.rotar('rightUpperArm', -0.25 * e, 0, -1.15 * e);
      ps.rotar('rightLowerArm', 0, 0, (-1.4 + Math.sin(t * 11) * 0.3) * e);
    } else saludo = -1;
  }
  ps.rotar('spine', resorteCuerpo.x.x * 0.6, 0, resorteCuerpo.x.y * 0.6);
  ps.rotar('neck', resorteCabeza.x.x, 0, resorteCabeza.x.y);
}

function viento(t) {
  const a = THREE.MathUtils.degToRad(P.dirViento);
  opcionesFisica.viento.set(Math.sin(a), 0.05, Math.cos(a)).multiplyScalar(P.viento * 9);
  const r = actual?.resortes;
  if (!r) return;
  const g = new THREE.Vector3();
  r.juntas.forEach((j, i) => {
    const o = r.original[i];
    const rafaga = 0.6 + 0.4 * Math.sin(t * 1.7 + i * 0.37) * Math.sin(t * 0.63 + i * 0.11);
    g.copy(o.dir).multiplyScalar(o.fuerza).addScaledVector(opcionesFisica.viento, P.viento > 0 ? (0.12 * rafaga) / 9 : 0);
    const f = g.length();
    j.settings.gravityPower = f;
    if (f > 1e-6) j.settings.gravityDir.copy(g).divideScalar(f);
    j.settings.stiffness = o.rigidez * P.rigidez;
  });
  // Las pelotas también empujan el pelo y la ropa.
  const vivos = new Set(pelotas.lista);
  for (const [b, col] of r.porPelota) {
    if (!vivos.has(b)) {
      escena.remove(col);
      r.porPelota.delete(b);
    }
  }
  for (const b of pelotas.lista) {
    if (!r.porPelota.has(b)) {
      const col = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeSphere({ radius: b.r }));
      escena.add(col);
      r.porPelota.set(b, col);
    }
    const col = r.porPelota.get(b);
    col.position.copy(b.pos);
    col.updateWorldMatrix(true, false);
  }
  r.grupo.colliders = [...r.porPelota.values()];
}

function animar() {
  requestAnimationFrame(animar);
  const dt = Math.min(reloj.getDelta(), 0.05);
  const t = reloj.elapsedTime;
  if (actual && !window.__congelar) {
    const raiz = actual.raiz;
    const a = actual.alto;
    raiz.rotation.y = 0;
    if (giro >= 0) {
      const f = (t - giro) / 1.3;
      if (f < 1) raiz.rotation.y = Math.PI * 2 * suave(f);
      else giro = -1;
    }
    raiz.position.y = 0;
    if (salto >= 0) {
      const f = (t - salto) / 0.55;
      if (f < 1) raiz.position.y = 0.16 * (a / 1.6) * 4 * f * (1 - f);
      else {
        salto = -1;
        resorteCuerpo.impulso(0.25, 0);
      }
    }
    resorteCuerpo.paso(dt);
    resorteCabeza.paso(dt);
    raiz.rotation.x = resorteCuerpo.x.x * 0.4;
    raiz.rotation.z = resorteCuerpo.x.y * 0.4;
    raiz.updateMatrixWorld(true);
    posar(t);

    const vrm = actual.vrm;
    if (vrm) {
      // Expresión y parpadeo.
      const em = vrm.expressionManager;
      if (em) {
        for (const n of Object.values(EXPRESIONES)) if (n) em.setValue(n, n === EXPRESIONES[P.expresion] ? P.intensidad : 0);
        let cierre = 0;
        if (t > proxParpadeo) {
          const f = (t - proxParpadeo) / 0.16;
          if (f >= 1) proxParpadeo = t + 2.5 + Math.random() * 3;
          else cierre = Math.sin(f * Math.PI);
        }
        em.setValue('blink', P.expresion === 'Feliz' || P.expresion === 'Relajada' ? 0 : cierre);
      }
      viento(t);
      vrm.update(dt);
    } else viento(t);

    escena.updateMatrixWorld(true);
    actual.colisionador.actualizar();
    acumulado += dt;
    let n = 0;
    while (acumulado >= PASO && n < 5) {
      acumulado -= PASO;
      n++;
      pelotas.paso(PASO, actual.colisionador, alGolpear);
    }
    if (n === 5) acumulado = 0;
  }
  if (vistaObjetivo) {
    camara.position.lerp(vistaObjetivo.pos, 0.08);
    controles.target.lerp(vistaObjetivo.target, 0.08);
    if (camara.position.distanceTo(vistaObjetivo.pos) < 0.005) vistaObjetivo = null;
  }
  controles.update();
  renderer.render(escena, camara);
}
controles.addEventListener('start', () => (vistaObjetivo = null));

window.addEventListener('resize', () => {
  camara.aspect = window.innerWidth / window.innerHeight;
  camara.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animar();
acciones.defecto();

// Acceso para pruebas desde la consola.
window.__anime = { P, acciones, detenerVista: () => (vistaObjetivo = null), camara, controles, pelotas, lanzarHacia, aplicarApariencia, cargar, get actual() { return actual; } };
