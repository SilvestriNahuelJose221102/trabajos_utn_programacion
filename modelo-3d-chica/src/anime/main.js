import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { VRMLoaderPlugin, VRMUtils, VRMSpringBoneCollider, VRMSpringBoneColliderShapeSphere } from '@pixiv/three-vrm';
import { Pelotas, Resorte, FisicaPollera, opcionesFisica } from '../fisica.js';
import { huesosVRM, huesosGenericos, Posador, ColisionadorHuesos } from './esqueleto.js';
import { aplicarProporciones } from './proporciones.js';
import { vestir } from './ropa.js';
import { POSES, CICLOS, ACCIONES } from './animaciones.js';

const MODELO_DEFECTO = './modelos/chica-anime.glb';

/** Bytes del modelo incluido. */
async function bytesModeloDefecto() {
  const r = await fetch(MODELO_DEFECTO);
  if (!r.ok) throw new Error(`no se encontró ${MODELO_DEFECTO}`);
  return r.arrayBuffer();
}

const EDADES = {
  'Adulta (≈28 años)': { altura: 1.68, cabeza: 0.86, cuello: 1.15, piernas: 1.1, cadera: 1.1, busto: 1.2, iris: 0.86 },
  'Original del modelo': { altura: 1.62, cabeza: 1, cuello: 1, piernas: 1, cadera: 1, busto: 1, iris: 1 },
};

const P = {
  edad: 'Adulta (≈28 años)',
  ...EDADES['Adulta (≈28 años)'],
  arriba: 'Remera',
  abajo: 'Pantalón largo',
  calzado: 'Zapatillas',
  colorArriba: '#ffffff',
  colorAbajo: '#3d5a80',
  colorCalzado: '#ffffff',
  pelo: '#f2d48c',
  ojos: '#4f86c6',
  contorno: 1,
  expresion: 'Neutral',
  intensidad: 1,
  pose: 'Relajada',
  ciclo: 'Ninguno',
  animar: true,
  viento: 0.2,
  dirViento: 200,
  rigidez: 1,
};
const COLOR_PRENDA = { colorArriba: '#f4f4f4', colorAbajo: '#25272e', colorCalzado: '#4a3226' };

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
camara.position.set(0.6, 1.25, 3.6);
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
let actual = null;
let fuente = null; // { buffer, ext, nombre }
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

/** Arma el personaje desde los bytes del archivo. nuevo = true centra la cámara. */
async function construir(nuevo) {
  const { buffer, ext, nombre } = fuente;
  mostrarEstado(`Cargando ${nombre}…`);
  try {
    let raiz;
    let vrm = null;
    if (ext === 'fbx') {
      raiz = cargadorFBX.parse(buffer, '');
    } else {
      const gltf = await cargadorGLTF.parseAsync(buffer, '');
      vrm = gltf.userData.vrm || null;
      raiz = vrm ? vrm.scene : gltf.scene;
      if (vrm) {
        VRMUtils.removeUnnecessaryVertices(raiz);
        VRMUtils.combineSkeletons(raiz);
        VRMUtils.rotateVRM0(vrm);
        aplicarProporciones(vrm, P);
      }
    }
    quitarModelo();
    if (nuevo) pelotas.limpiar();

    // Escala: el VRM a la altura elegida; otros formatos a una altura humana si vienen en cm, etc.
    raiz.updateMatrixWorld(true);
    let caja = new THREE.Box3().setFromObject(raiz);
    let alto = caja.max.y - caja.min.y;
    const objetivo = vrm ? P.altura : alto > 3 || alto < 0.5 ? 1.65 : alto;
    if (Math.abs(objetivo - alto) > 1e-3) {
      raiz.scale.multiplyScalar(objetivo / alto);
      raiz.updateMatrixWorld(true);
      caja = new THREE.Box3().setFromObject(raiz);
      alto = caja.max.y - caja.min.y;
    }
    const centro = caja.getCenter(new THREE.Vector3());
    const pivote = new THREE.Group();
    pivote.name = 'Modelo';
    raiz.position.x -= centro.x * (vrm ? 0 : 1);
    raiz.position.z -= centro.z * (vrm ? 0 : 1);
    raiz.position.y -= caja.min.y;
    pivote.add(raiz);
    escena.add(pivote);
    pivote.updateMatrixWorld(true);
    vrm?.springBoneManager?.setInitState();

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
    const ropa = vrm ? vestir(vrm, { ...P, ...coloresPrendas() }) : { pollera: null, materiales: [] };
    if (vrm) vrm.update(0);
    const colisionador = new ColisionadorHuesos(huesos ? huesos.reales : {}, pivote, alto);

    // Largo de pierna (para agacharse sin que los pies atraviesen el piso).
    let pierna = 0.8 * (alto / 1.6);
    if (huesos?.reales.leftUpperLeg && huesos.reales.leftFoot) {
      pierna = huesos.reales.leftUpperLeg.getWorldPosition(new THREE.Vector3()).distanceTo(huesos.reales.leftFoot.getWorldPosition(new THREE.Vector3()));
    }

    // Pelo y ropa del VRM con física (spring bones).
    let resortes = null;
    if (vrm?.springBoneManager) {
      const grupo = { colliders: [], name: 'pelotas' };
      const juntas = [...vrm.springBoneManager.joints];
      for (const j of juntas) j.colliderGroups.push(grupo);
      resortes = {
        juntas,
        grupo,
        original: juntas.map((j) => ({ dir: j.settings.gravityDir.clone(), fuerza: j.settings.gravityPower, rigidez: j.settings.stiffness })),
        porPelota: new Map(),
      };
    }
    if (vrm?.lookAt) vrm.lookAt.target = camara;
    const simPollera = ropa.pollera ? new FisicaPollera(ropa.pollera, ropa.pollera.userData.ancla) : null;

    actual = { raiz: pivote, vrm, posador, colisionador, alto, pierna, tipo: vrm ? 'vrm' : 'generico', resortes, ropa, simPollera, materiales: new Map() };

    escena.environment = vrm ? null : envAmbiente;
    renderer.toneMapping = vrm ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    hemi.intensity = vrm ? 1.1 : 0.4;
    for (const f of carpetasVRM) f.show(!!vrm);
    if (vrm) aplicarApariencia();
    mostrarEstado(
      vrm
        ? ''
        : huesos
          ? `${nombre}: modelo sin física de pelo propia (el pelo se mueve solo en archivos VRM).`
          : `${nombre}: el archivo no trae esqueleto, así que no se puede posar ni animar.`,
    );
    if (nuevo) vistaCuerpo();
  } catch (err) {
    console.error(err);
    mostrarEstado(`No se pudo abrir ${nombre}: ${err.message || err}. Probá con un archivo .vrm, .glb, .gltf o .fbx.`, true);
  }
}

async function cargarBytes(buffer, ext, nombre) {
  fuente = { buffer, ext, nombre };
  await construir(true);
}
let reconstruyendo = null;
function reconstruir() {
  if (!fuente) return;
  reconstruyendo = (reconstruyendo || Promise.resolve()).then(() => construir(false));
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
  ['colorArriba', /tops?_/i],
  ['colorAbajo', /bottoms?_|skirt/i],
  ['colorCalzado', /shoes?_/i],
];
/** Color de las prendas nuevas: si se deja "original" (blanco) se usa un tono que combine. */
function coloresPrendas() {
  const r = {};
  for (const k of Object.keys(COLOR_PRENDA)) r[k] = P[k].toLowerCase() === '#ffffff' ? COLOR_PRENDA[k] : P[k];
  return r;
}

function aplicarApariencia() {
  if (!actual?.vrm) return;
  actual.vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const cat = CATEGORIAS.find(([, re]) => re.test(m.name));
      if (cat && m.map) {
        if (!actual.materiales.has(m)) actual.materiales.set(m, { mapa: m.map, gris: texturaGris(m.map), sombra: m.shadeColorFactor?.clone() });
        const info = actual.materiales.get(m);
        const original = P[cat[0]].toLowerCase() === '#ffffff';
        const color = new THREE.Color(P[cat[0]]);
        m.map = original ? info.mapa : info.gris;
        if (m.shadeMultiplyTexture) m.shadeMultiplyTexture = m.map;
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
  // Prendas agregadas.
  const c = coloresPrendas();
  for (const m of actual.ropa?.materiales || []) {
    if (m.userData.clave) m.color.set(c[m.userData.clave]);
  }
}

const EXPRESIONES = { Neutral: null, Feliz: 'happy', Enojada: 'angry', Triste: 'sad', Relajada: 'relaxed', Sorprendida: 'surprised' };

// ---------- Acciones ----------
const reloj = new THREE.Clock();
let accion = null; // { nombre, inicio }
let proxParpadeo = 1.5;
let vistaObjetivo = null;

function irA(pos, target) {
  vistaObjetivo = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) };
}
function vistaCuerpo() {
  const a = actual?.alto ?? 1.6;
  irA([0.6, a * 0.78, a * 2.25], [0, a * 0.55, 0]);
}
function vistaCara() {
  const a = actual?.alto ?? 1.6;
  irA([0.15, a * 0.93, 0.6], [0, a * 0.92, 0]);
}

function lanzarHacia(destino) {
  const dir = new THREE.Vector3().subVectors(destino, camara.position).normalize();
  const origen = camara.position.clone().addScaledVector(dir, 0.35).add(new THREE.Vector3(0, -0.08, 0));
  const T = Math.max(0.18, origen.distanceTo(destino) / 9);
  const vel = new THREE.Vector3().subVectors(destino, origen).divideScalar(T).addScaledVector(opcionesFisica.gravedad, -0.5 * T);
  pelotas.lanzar(origen, vel, 0.05 + Math.random() * 0.04);
}

const iniciar = (nombre) => () => (accion = { nombre, inicio: reloj.elapsedTime });
const acciones = {
  lanzar: () => {
    const a = actual?.alto ?? 1.6;
    lanzarHacia(new THREE.Vector3((Math.random() - 0.5) * 0.2, a * (0.62 + Math.random() * 0.3), 0));
  },
  quitar: () => pelotas.limpiar(),
  cara: vistaCara,
  cuerpo: vistaCuerpo,
  abrir: () => selector.click(),
  defecto: async () => {
    mostrarEstado('Cargando la chica anime…');
    try {
      await cargarBytes(await bytesModeloDefecto(), 'vrm', 'la chica anime');
    } catch (err) {
      mostrarEstado(`No se pudo cargar el modelo incluido: ${err.message || err}.`, true);
    }
  },
};
for (const n of Object.keys(ACCIONES)) acciones[n] = iniciar(n);

// ---------- Panel ----------
const gui = new GUI({ title: 'Personalizar' });
const fModelo = gui.addFolder('Modelo');
fModelo.add(acciones, 'abrir').name('📂 Abrir mi modelo (.vrm .glb .fbx)');
fModelo.add(acciones, 'defecto').name('Volver a la chica anime');

const fCuerpo = gui.addFolder('Cuerpo');
fCuerpo.add(P, 'edad', Object.keys(EDADES)).name('Edad aparente').onChange((v) => {
  Object.assign(P, EDADES[v]);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  reconstruir();
});
fCuerpo.add(P, 'altura', 1.5, 1.85, 0.01).name('Altura (m)').onFinishChange(reconstruir);
fCuerpo.add(P, 'cabeza', 0.75, 1.1, 0.01).name('Tamaño de cabeza').onFinishChange(reconstruir);
fCuerpo.add(P, 'cuello', 0.9, 1.4, 0.01).name('Largo del cuello').onFinishChange(reconstruir);
fCuerpo.add(P, 'piernas', 0.9, 1.25, 0.01).name('Largo de piernas').onFinishChange(reconstruir);
fCuerpo.add(P, 'cadera', 0.9, 1.3, 0.01).name('Ancho de cadera').onFinishChange(reconstruir);
fCuerpo.add(P, 'busto', 0.85, 1.4, 0.01).name('Busto').onFinishChange(reconstruir);
fCuerpo.add(P, 'iris', 0.75, 1.05, 0.01).name('Tamaño del iris').onFinishChange(reconstruir);

const fRopa = gui.addFolder('Ropa');
fRopa.add(P, 'arriba', ['Remera', 'Remera manga larga']).name('Arriba').onChange(reconstruir);
fRopa.addColor(P, 'colorArriba').name('Color arriba').onChange(aplicarApariencia);
fRopa.add(P, 'abajo', ['Short', 'Pantalón largo', 'Pollera corta', 'Pollera larga']).name('Abajo').onChange(reconstruir);
fRopa.addColor(P, 'colorAbajo').name('Color abajo').onChange(aplicarApariencia);
fRopa.add(P, 'calzado', ['Zapatillas', 'Botas']).name('Calzado').onChange(reconstruir);
fRopa.addColor(P, 'colorCalzado').name('Color calzado').onChange(aplicarApariencia);

const fApar = gui.addFolder('Cara y pelo');
fApar.addColor(P, 'pelo').name('Pelo').onChange(aplicarApariencia);
fApar.addColor(P, 'ojos').name('Ojos').onChange(aplicarApariencia);
fApar.add(P, 'contorno', 0, 3, 0.05).name('Grosor del contorno').onChange(aplicarApariencia);
fApar.add(P, 'expresion', Object.keys(EXPRESIONES)).name('Expresión');
fApar.add(P, 'intensidad', 0, 1, 0.01).name('Intensidad');
fApar.add({ original: () => {
  for (const k of ['pelo', 'ojos', 'colorArriba', 'colorAbajo', 'colorCalzado']) P[k] = '#ffffff';
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  aplicarApariencia();
} }, 'original').name('Colores originales del modelo');
const carpetasVRM = [fCuerpo, fRopa, fApar];

const fAnim = gui.addFolder('Animaciones');
fAnim.add(P, 'pose', Object.keys(POSES)).name('Pose');
fAnim.add(P, 'ciclo', Object.keys(CICLOS)).name('Repetir');
const iconos = { Saludar: '👋 ', Aplaudir: '👏 ', Saltar: '⬆️ ', Girar: '🌀 ' };
for (const n of Object.keys(ACCIONES)) fAnim.add(acciones, n).name((iconos[n] || '') + n);
fAnim.add(P, 'animar').name('Movimiento en reposo');

const fFis = gui.addFolder('Física');
fFis.add(P, 'viento', 0, 1, 0.01).name('Viento');
fFis.add(P, 'dirViento', 0, 360, 1).name('Dirección viento (°)');
fFis.add(P, 'rigidez', 0.2, 2, 0.01).name('Rigidez pelo/ropa');
fFis.add(acciones, 'lanzar').name('⚽ Lanzar pelota');
fFis.add(acciones, 'quitar').name('Quitar pelotas');

const fCam = gui.addFolder('Cámara');
fCam.add(acciones, 'cara').name('Ver cara');
fCam.add(acciones, 'cuerpo').name('Ver cuerpo entero');
for (const f of [fCuerpo, fApar, fFis, fCam]) f.close();
if (window.innerWidth < 700) gui.close();

// Abrir archivos propios (botón o arrastrar y soltar).
const selector = document.createElement('input');
selector.type = 'file';
selector.accept = '.vrm,.glb,.gltf,.fbx';
selector.hidden = true;
document.body.appendChild(selector);
async function abrirArchivo(archivo) {
  if (!archivo) return;
  const ext = archivo.name.split('.').pop().toLowerCase();
  if (!['vrm', 'glb', 'gltf', 'fbx'].includes(ext)) {
    mostrarEstado(`"${archivo.name}" no es un formato compatible. Usá .vrm, .glb, .gltf o .fbx.`, true);
    return;
  }
  await cargarBytes(await archivo.arrayBuffer(), ext, archivo.name);
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
  const hit = ray.intersectObjects(actual ? [actual.raiz, piso] : [piso], true)[0];
  lanzarHacia(hit ? hit.point : ray.ray.at(4, new THREE.Vector3()));
});

// ---------- Bucle ----------
const PASO = 1 / 90;
let acumulado = 0;

function alGolpear(punto, impulso, zona) {
  const h = (punto.y - actual.raiz.position.y) / actual.alto;
  resorteCuerpo.impulso(impulso.z * h * 0.2, -impulso.x * h * 0.2);
  if (zona === 'cabeza') resorteCabeza.impulso(impulso.z * 0.35, -impulso.x * 0.35);
}

/** Pone la pose del cuadro y devuelve efectos sobre la raíz y la expresión. */
function posar(t) {
  const ps = actual.posador;
  const r = { y: 0, rotY: 0, expr: null };
  if (!ps) return r;
  const ctx = { pierna: actual.pierna };
  ps.reiniciar();
  POSES[P.pose]?.(ps);
  if (actual.ropa?.pollera) {
    ps.rotar('leftUpperArm', 0, 0, 0.09);
    ps.rotar('rightUpperArm', 0, 0, -0.09);
  }
  ps.dedos('left', 0.25);
  ps.dedos('right', 0.25);
  if (P.animar && P.ciclo === 'Ninguno') {
    ps.rotar('hips', 0, Math.sin(t * 0.5) * 0.03, Math.sin(t * 0.5) * 0.015);
    ps.rotar('spine', Math.sin(t * 1.7) * 0.012, 0, -Math.sin(t * 0.5) * 0.012);
    ps.rotar('chest', Math.sin(t * 1.7) * 0.015, 0, 0);
    ps.rotar('neck', Math.sin(t * 0.43) * 0.03, Math.sin(t * 0.31) * 0.12, Math.sin(t * 0.27) * 0.03);
    for (const [l, s] of [['left', 1], ['right', -1]]) ps.rotar(l + 'UpperArm', Math.sin(t * 0.6 + s) * 0.03, 0, s * Math.sin(t * 1.7) * 0.01);
  }
  const sumar = (res) => {
    if (!res) return;
    if (res.y) r.y += res.y;
    if (res.rotY) r.rotY += res.rotY;
    if (res.expr && (!r.expr || res.expr[1] > r.expr[1])) r.expr = res.expr;
    if (res.aterriza) resorteCuerpo.impulso(0.3, 0);
  };
  const ciclo = CICLOS[P.ciclo];
  if (ciclo) sumar(ciclo(ps, t, ctx));
  if (accion) {
    const a = ACCIONES[accion.nombre];
    const f = (t - accion.inicio) / a.dur;
    if (f >= 1) accion = null;
    else sumar(a.fn(ps, f, t, ctx));
  }
  ps.rotar('spine', resorteCuerpo.x.x * 0.6, 0, resorteCuerpo.x.y * 0.6);
  ps.rotar('neck', resorteCabeza.x.x, 0, resorteCabeza.x.y);
  return r;
}

function viento(t) {
  const a = THREE.MathUtils.degToRad(P.dirViento);
  opcionesFisica.viento.set(Math.sin(a), 0.05, Math.cos(a)).multiplyScalar(P.viento * 9);
  opcionesFisica.rigidez = THREE.MathUtils.clamp((P.rigidez - 0.2) / 1.8, 0, 1);
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

function expresar(t, efecto) {
  const em = actual.vrm?.expressionManager;
  if (!em) return;
  const base = EXPRESIONES[P.expresion];
  for (const n of Object.values(EXPRESIONES)) {
    if (!n) continue;
    let v = n === base ? P.intensidad : 0;
    if (efecto && efecto[0] === n) v = Math.max(v, efecto[1]);
    else if (efecto) v *= 1 - efecto[1];
    em.setValue(n, v);
  }
  let cierre = 0;
  if (t > proxParpadeo) {
    const f = (t - proxParpadeo) / 0.16;
    if (f >= 1) proxParpadeo = t + 2.5 + Math.random() * 3;
    else cierre = Math.sin(f * Math.PI);
  }
  const ojosCerrados = ['happy', 'relaxed'].includes(efecto?.[0]) || P.expresion === 'Feliz' || P.expresion === 'Relajada';
  em.setValue('blink', ojosCerrados ? 0 : cierre);
}

function animar() {
  requestAnimationFrame(animar);
  const dt = Math.min(reloj.getDelta(), 0.05);
  const t = window.__tiempoFijo ?? reloj.elapsedTime;
  if (actual && !window.__congelar) {
    const raiz = actual.raiz;
    resorteCuerpo.paso(dt);
    resorteCabeza.paso(dt);
    raiz.position.y = 0;
    raiz.rotation.set(resorteCuerpo.x.x * 0.4, 0, resorteCuerpo.x.y * 0.4);
    raiz.updateMatrixWorld(true);
    const efecto = posar(t);
    raiz.position.y = efecto.y;
    raiz.rotation.y = efecto.rotY;
    raiz.updateMatrixWorld(true);
    expresar(t, efecto.expr);
    viento(t);
    actual.vrm?.update(dt);

    escena.updateMatrixWorld(true);
    actual.colisionador.actualizar();
    acumulado += dt;
    let n = 0;
    while (acumulado >= PASO && n < 5) {
      acumulado -= PASO;
      n++;
      actual.simPollera?.paso(PASO, actual.colisionador, pelotas, t);
      pelotas.paso(PASO, actual.colisionador, alGolpear);
    }
    if (n === 5) acumulado = 0;
    actual.simPollera?.aplicar();
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
window.__anime = {
  P,
  acciones,
  camara,
  controles,
  pelotas,
  lanzarHacia,
  aplicarApariencia,
  reconstruir,
  cargarBytes,
  detenerVista: () => (vistaObjetivo = null),
  iniciarAccion: (n, t0) => (accion = { nombre: n, inicio: t0 ?? reloj.elapsedTime }),
  reloj,
  get actual() {
    return actual;
  },
};
