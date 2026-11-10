import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { crearPersonaje, ALTURA_BASE } from './personaje.js';
import { crearMateriales, aplicarColores } from './materiales.js';

// ---------- Presets ----------
const PIELES = { Clara: '#eec3a6', 'Clara rosada': '#e3ac8e', Media: '#d29c78', Trigueña: '#c08c66', Morena: '#8d5a3b', Oscura: '#5b3a26' };
const PELOS = { Rubio: '#e2bd78', 'Rubio platinado': '#efe0bd', 'Rubio miel': '#c99a4b', Castaño: '#6b4429', Morocho: '#2a1d16', Pelirrojo: '#a8462a' };
const OJOS = { Azul: '#4f7fae', Verde: '#5e8a4f', Celeste: '#7fb0cf', Marrón: '#5b3a22', Miel: '#a5772e', Gris: '#8a949c' };

const DEFECTO = {
  altura: 1.68,
  contextura: 1,
  busto: 0.55,
  cintura: 0.4,
  cadera: 0.6,
  hombros: 0.45,
  piel: PIELES['Clara rosada'],
  // (los tonos se ven más claros por la iluminación)
  ojos: OJOS.Azul,
  labios: '#c4676d',
  sonrisa: 0.35,
  peloColor: PELOS.Rubio,
  peinado: 'Suelto',
  largo: 0.38,
  ondas: 0.35,
  volumen: 0.65,
  flequillo: false,
  superior: 'Remera',
  colorSuperior: '#f4f1ec',
  inferior: 'Jean',
  colorInferior: '#4a6a96',
  calzado: '#f5f5f5',
  animar: true,
};

const CLAVE_STORAGE = 'modelo-3d-chica:parametros';
const P = { ...DEFECTO };
try {
  Object.assign(P, JSON.parse(localStorage.getItem(CLAVE_STORAGE) || '{}'));
} catch {
  /* sin storage disponible */
}
const guardar = () => {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(P));
  } catch {
    /* sin storage disponible */
  }
};

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
document.body.appendChild(renderer.domElement);

const escena = new THREE.Scene();
escena.background = new THREE.Color('#1f222d');
escena.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
escena.environmentIntensity = 0.35;

const camara = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 50);
camara.position.set(1.1, 1.35, 3.3);
const controles = new OrbitControls(camara, renderer.domElement);
controles.target.set(0, 1.0, 0);
controles.enableDamping = true;
controles.minDistance = 0.35;
controles.maxDistance = 7;
controles.update();

const sol = new THREE.DirectionalLight('#fff4e8', 1.6);
sol.position.set(2.5, 4.5, 3.5);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.camera.left = -1.5;
sol.shadow.camera.right = 1.5;
sol.shadow.camera.top = 2.2;
sol.shadow.camera.bottom = -0.5;
sol.shadow.bias = -0.0004;
sol.shadow.normalBias = 0.02;
escena.add(sol);
const relleno = new THREE.DirectionalLight('#c9d8ff', 0.35);
relleno.position.set(-3, 2, 2);
escena.add(relleno);
const contra = new THREE.DirectionalLight('#ffe2c8', 0.9);
contra.position.set(-1.5, 3, -3.5);
escena.add(contra);

const piso = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: '#3a3d4c', roughness: 0.95 }));
piso.rotation.x = -Math.PI / 2;
piso.receiveShadow = true;
escena.add(piso);

// ---------- Personaje ----------
const mats = crearMateriales();
aplicarColores(mats, P);
let personaje = null;
let pendiente = false;

function reconstruir() {
  if (personaje) {
    escena.remove(personaje.raiz);
    personaje.raiz.traverse((o) => o.isMesh && o.geometry.dispose());
  }
  personaje = crearPersonaje(P, mats);
  escena.add(personaje.raiz);
  aplicarAltura();
}
function aplicarAltura() {
  if (personaje) personaje.raiz.scale.setScalar(P.altura / ALTURA_BASE);
}
const pedirReconstruir = () => {
  pendiente = true;
  guardar();
};
const colores = () => {
  aplicarColores(mats, P);
  guardar();
};
reconstruir();

// ---------- Cámara: vistas ----------
let vistaObjetivo = null;
function irA(pos, target) {
  vistaObjetivo = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) };
}
const esc = () => P.altura / ALTURA_BASE;

// ---------- Panel ----------
let saludoInicio = -1;
const acciones = {
  saludar: () => (saludoInicio = reloj.getElapsedTime()),
  vistaCuerpo: () => irA([1.1, 1.35 * esc(), 3.3], [0, 1.0 * esc(), 0]),
  vistaCara: () => irA([0.22, 1.58 * esc(), 0.8], [0, 1.56 * esc(), 0]),
  aleatorio: () => {
    const al = (o) => Object.values(o)[Math.floor(Math.random() * Object.values(o).length)];
    Object.assign(P, {
      altura: 1.55 + Math.random() * 0.25,
      contextura: 0.9 + Math.random() * 0.3,
      busto: Math.random(),
      cintura: Math.random(),
      cadera: Math.random(),
      hombros: Math.random(),
      piel: al(PIELES),
      ojos: al(OJOS),
      peloColor: al(PELOS),
      peinado: ['Suelto', 'Colita', 'Rodete'][Math.floor(Math.random() * 3)],
      largo: 0.1 + Math.random() * 0.5,
      ondas: Math.random(),
      flequillo: Math.random() < 0.4,
      sonrisa: Math.random(),
      superior: ['Remera', 'Musculosa', 'Manga larga'][Math.floor(Math.random() * 3)],
      inferior: ['Jean', 'Short', 'Pollera'][Math.floor(Math.random() * 3)],
      colorSuperior: '#' + new THREE.Color().setHSL(Math.random(), 0.5, 0.6).getHexString(),
      colorInferior: '#' + new THREE.Color().setHSL(Math.random(), 0.4, 0.4).getHexString(),
    });
    refrescarPanel();
  },
  restablecer: () => {
    Object.assign(P, DEFECTO);
    refrescarPanel();
  },
  exportar: () => {
    new GLTFExporter().parse(
      personaje.raiz,
      (glb) => {
        const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chica.glb';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      (err) => console.error('Error exportando GLB:', err),
      { binary: true },
    );
  },
};

const gui = new GUI({ title: 'Personalizar' });
const elegir = { piel: '—', pelo: '—', ojos: '—' };

const fCuerpo = gui.addFolder('Cuerpo');
fCuerpo.add(P, 'altura', 1.5, 1.85, 0.01).name('Altura (m)').onChange(() => (aplicarAltura(), guardar()));
fCuerpo.add(P, 'contextura', 0.85, 1.25, 0.01).name('Contextura').onFinishChange(pedirReconstruir);
fCuerpo.add(P, 'busto', 0, 1, 0.01).name('Busto').onFinishChange(pedirReconstruir);
fCuerpo.add(P, 'cintura', 0, 1, 0.01).name('Cintura').onFinishChange(pedirReconstruir);
fCuerpo.add(P, 'cadera', 0, 1, 0.01).name('Cadera').onFinishChange(pedirReconstruir);
fCuerpo.add(P, 'hombros', 0, 1, 0.01).name('Hombros').onFinishChange(pedirReconstruir);
fCuerpo.add(elegir, 'piel', ['—', ...Object.keys(PIELES)]).name('Tono de piel').onChange((v) => {
  if (PIELES[v]) (P.piel = PIELES[v]), refrescarPanel(false);
});
fCuerpo.addColor(P, 'piel').name('Piel (color)').onChange(colores);

const fCara = gui.addFolder('Cara');
fCara.add(elegir, 'ojos', ['—', ...Object.keys(OJOS)]).name('Ojos').onChange((v) => {
  if (OJOS[v]) (P.ojos = OJOS[v]), refrescarPanel(false);
});
fCara.addColor(P, 'ojos').name('Ojos (color)').onChange(colores);
fCara.addColor(P, 'labios').name('Labios').onChange(colores);
fCara.add(P, 'sonrisa', 0, 1, 0.01).name('Sonrisa').onFinishChange(pedirReconstruir);

const fPelo = gui.addFolder('Pelo');
fPelo.add(elegir, 'pelo', ['—', ...Object.keys(PELOS)]).name('Tono').onChange((v) => {
  if (PELOS[v]) (P.peloColor = PELOS[v]), refrescarPanel(false);
});
fPelo.addColor(P, 'peloColor').name('Color').onChange(colores);
fPelo.add(P, 'peinado', ['Suelto', 'Colita', 'Rodete']).name('Peinado').onFinishChange(pedirReconstruir);
fPelo.add(P, 'largo', 0.05, 0.65, 0.01).name('Largo').onFinishChange(pedirReconstruir);
fPelo.add(P, 'ondas', 0, 1, 0.01).name('Ondas').onFinishChange(pedirReconstruir);
fPelo.add(P, 'volumen', 0, 1, 0.01).name('Volumen').onFinishChange(pedirReconstruir);
fPelo.add(P, 'flequillo').name('Flequillo').onFinishChange(pedirReconstruir);

const fRopa = gui.addFolder('Ropa');
fRopa.add(P, 'superior', ['Remera', 'Musculosa', 'Manga larga']).name('Arriba').onFinishChange(pedirReconstruir);
fRopa.addColor(P, 'colorSuperior').name('Color arriba').onChange(colores);
fRopa.add(P, 'inferior', ['Jean', 'Short', 'Pollera']).name('Abajo').onFinishChange(pedirReconstruir);
fRopa.addColor(P, 'colorInferior').name('Color abajo').onChange(colores);
fRopa.addColor(P, 'calzado').name('Zapatillas').onChange(colores);

const fAcc = gui.addFolder('Acciones');
fAcc.add(acciones, 'saludar').name('👋 Saludar');
fAcc.add(P, 'animar').name('Animación').onChange(guardar);
fAcc.add(acciones, 'vistaCara').name('Ver cara');
fAcc.add(acciones, 'vistaCuerpo').name('Ver cuerpo entero');
fAcc.add(acciones, 'aleatorio').name('🎲 Aleatorio');
fAcc.add(acciones, 'restablecer').name('Restablecer');
fAcc.add(acciones, 'exportar').name('Exportar .glb');

if (window.innerWidth < 700) gui.close();

function refrescarPanel(reconstruirTambien = true) {
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  colores();
  aplicarAltura();
  if (reconstruirTambien) pedirReconstruir();
}

// ---------- Animación ----------
const reloj = new THREE.Clock();
let proxParpadeo = 2;
const DUR_SALUDO = 2.6;
const ABIERTO = -0.27;
const CERRADO = 0.35;

function animar() {
  requestAnimationFrame(animar);
  if (pendiente) {
    pendiente = false;
    reconstruir();
  }
  const t = reloj.getElapsedTime();
  const pt = personaje.partes;
  const abd = personaje.modelo.abdReposo;

  if (P.animar) {
    personaje.raiz.rotation.z = Math.sin(t * 0.5) * 0.006;
    pt.cuello.rotation.y = Math.sin(t * 0.31) * 0.1 + Math.sin(t * 0.83) * 0.02;
    pt.cuello.rotation.x = Math.sin(t * 0.43) * 0.03;
    pt.cuello.rotation.z = Math.sin(t * 0.27) * 0.02;
    const resp = Math.sin(t * 1.7);
    pt.hombros.forEach((h, i) => {
      const s = i === 0 ? 1 : -1;
      h.position.y = 1.338 + resp * 0.0015;
      h.rotation.z = s * (abd + resp * 0.008);
      h.rotation.x = Math.sin(t * 0.6 + i) * 0.03;
    });
    pt.codos.forEach((c) => {
      c.rotation.z = 0;
      c.rotation.x = -0.18;
    });
    pt.ojos.forEach((o) => (o.rotation.y = o.userData.yawBase - pt.cuello.rotation.y * 0.5));

    // Parpadeo
    let cierre = 0;
    if (t > proxParpadeo) {
      const f = (t - proxParpadeo) / 0.16;
      if (f >= 1) proxParpadeo = t + 2.5 + Math.random() * 3;
      else cierre = Math.sin(f * Math.PI);
    }
    pt.parpados.forEach((p) => (p.rotation.x = THREE.MathUtils.lerp(ABIERTO, CERRADO, cierre)));
  }

  // Saludo con el brazo derecho
  if (saludoInicio >= 0) {
    const f = (t - saludoInicio) / DUR_SALUDO;
    if (f < 1) {
      const e = Math.min(1, f * 5) * Math.min(1, (1 - f) * 5);
      const ee = e * e * (3 - 2 * e);
      const h = pt.hombros[1];
      const c = pt.codos[1];
      h.rotation.z = THREE.MathUtils.lerp(-abd, -1.2, ee);
      h.rotation.x = THREE.MathUtils.lerp(0, -0.25, ee);
      c.rotation.z = THREE.MathUtils.lerp(0, -1.45, ee) + Math.sin(t * 11) * 0.3 * ee;
      c.rotation.x = THREE.MathUtils.lerp(-0.18, 0, ee);
    } else saludoInicio = -1;
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
animar();

window.addEventListener('resize', () => {
  camara.aspect = window.innerWidth / window.innerHeight;
  camara.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Acceso para pruebas desde la consola.
window.__chica = { P, acciones, reconstruir: () => reconstruir(), camara, controles, refrescarPanel, get personaje() { return personaje; } };
