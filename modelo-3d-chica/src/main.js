import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { crearPersonaje, ALTURA_BASE } from './personaje.js';
import { crearMateriales, aplicarColores } from './materiales.js';
import { Colisionador, FisicaPelo, FisicaPollera, Pelotas, Resorte, opcionesFisica } from './fisica.js';
import { crearPost } from './post.js';

// ---------- Presets ----------
const PIELES = { Clara: '#f0d0bb', 'Clara rosada': '#e9c0a8', Media: '#d6a687', Trigueña: '#c08f6c', Morena: '#8d5d40', Oscura: '#5b3c2a' };
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
  fisica: true,
  viento: 0.15,
  dirViento: 200,
  rigidez: 0.45,
  calidad: 'Alta',
  exposicion: 1,
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
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = P.exposicion;
document.body.appendChild(renderer.domElement);

const escena = new THREE.Scene();
escena.background = (() => {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#3a4256');
  grad.addColorStop(0.5, '#262a36');
  grad.addColorStop(1, '#262a36');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
escena.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
escena.environmentIntensity = 0.45;

const camara = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 50);
camara.position.set(1.1, 1.35, 3.3);
const controles = new OrbitControls(camara, renderer.domElement);
controles.target.set(0, 1.0, 0);
controles.enableDamping = true;
controles.minDistance = 0.35;
controles.maxDistance = 7;
controles.update();

// Iluminación de estudio: principal cálida, relleno frío y contraluz para separar el pelo.
const sol = new THREE.DirectionalLight('#fff1e0', 2.1);
sol.position.set(2.2, 4.2, 3.2);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.camera.left = -1.1;
sol.shadow.camera.right = 1.1;
sol.shadow.camera.top = 2.1;
sol.shadow.camera.bottom = -0.3;
sol.shadow.camera.near = 1;
sol.shadow.camera.far = 10;
sol.shadow.bias = -0.0003;
sol.shadow.normalBias = 0.015;
escena.add(sol);
const relleno = new THREE.DirectionalLight('#c4d4ff', 0.45);
relleno.position.set(-3, 2, 2);
escena.add(relleno);
const contra = new THREE.DirectionalLight('#ffe6cc', 1.2);
contra.position.set(-1.2, 3.2, -3.5);
escena.add(contra);
const contra2 = new THREE.DirectionalLight('#d8e4ff', 0.8);
contra2.position.set(2.5, 2.5, -3);
escena.add(contra2);

// Piso amplio que se funde con el fondo gracias a la niebla.
escena.fog = new THREE.Fog('#262a36', 5, 16);
const piso = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: '#5a5f72', roughness: 0.8 }));
piso.rotation.x = -Math.PI / 2;
piso.receiveShadow = true;
escena.add(piso);

// Sombra de contacto: mancha suave bajo los pies que asienta al personaje en el piso.
const sombraContacto = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.55),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
})();
escena.add(sombraContacto);

const post = crearPost(renderer, escena, camara);
function aplicarCalidad() {
  const pr = Math.min(window.devicePixelRatio, P.calidad === 'Alta' ? 2 : P.calidad === 'Media' ? 1.5 : 1);
  sol.shadow.mapSize.setScalar(P.calidad === 'Alta' ? 4096 : 2048);
  sol.shadow.map?.dispose();
  sol.shadow.map = null;
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.composer.setPixelRatio(pr);
  post.tamano(window.innerWidth, window.innerHeight);
  post.calidad(P.calidad);
}
aplicarCalidad();

// ---------- Personaje ----------
const mats = crearMateriales();
aplicarColores(mats, P);
let personaje = null;
let pendiente = false;
let col = null;
let simPelo = null;
let simPollera = null;
const pelotas = new Pelotas(escena);
const resorteCuerpo = new Resorte(45, 6);
const resorteCabeza = new Resorte(90, 9);

function reconstruir() {
  if (personaje) {
    escena.remove(personaje.raiz);
    personaje.raiz.traverse((o) => o.isMesh && o.geometry.dispose());
  }
  personaje = crearPersonaje(P, mats);
  escena.add(personaje.raiz);
  aplicarAltura();
  col = new Colisionador(personaje);
  const datosPelo = personaje.partes.pelo.userData.fisica;
  simPelo = datosPelo ? new FisicaPelo(datosPelo, personaje.partes.cabeza) : null;
  simPollera = personaje.partes.pollera ? new FisicaPollera(personaje.partes.pollera, personaje.raiz) : null;
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
let giroInicio = -1;
let saltoInicio = -1;
let sacudidaInicio = -1;
const raycaster = new THREE.Raycaster();

/** Lanza una pelota desde la cámara para que llegue al punto `destino` (tiro parabólico). */
function lanzarHacia(destino) {
  const dir = new THREE.Vector3().subVectors(destino, camara.position).normalize();
  const origen = camara.position.clone().addScaledVector(dir, 0.35).add(new THREE.Vector3(0, -0.08, 0));
  const dist = origen.distanceTo(destino);
  const T = Math.max(0.18, dist / 9);
  const vel = new THREE.Vector3().subVectors(destino, origen).divideScalar(T).addScaledVector(opcionesFisica.gravedad, -0.5 * T);
  pelotas.lanzar(origen, vel, 0.05 + Math.random() * 0.04);
}

const acciones = {
  saludar: () => (saludoInicio = reloj.elapsedTime),
  girar: () => (giroInicio = reloj.elapsedTime),
  saltar: () => (saltoInicio = reloj.elapsedTime),
  sacudir: () => (sacudidaInicio = reloj.elapsedTime),
  lanzarPelota: () => {
    const e = esc();
    lanzarHacia(new THREE.Vector3((Math.random() - 0.5) * 0.25 * e, (1.05 + Math.random() * 0.5) * e, 0));
  },
  limpiarPelotas: () => pelotas.limpiar(),
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

const fFis = gui.addFolder('Física');
fFis.add(P, 'fisica').name('Activar física').onChange((v) => {
  if (!v) {
    simPelo?.reiniciar();
    simPollera?.reiniciar();
  }
  guardar();
});
fFis.add(P, 'viento', 0, 1, 0.01).name('Viento').onChange(guardar);
fFis.add(P, 'dirViento', 0, 360, 1).name('Dirección viento (°)').onChange(guardar);
fFis.add(P, 'rigidez', 0, 1, 0.01).name('Rigidez pelo/tela').onChange(guardar);
fFis.add(acciones, 'lanzarPelota').name('⚽ Lanzar pelota');
fFis.add(acciones, 'limpiarPelotas').name('Quitar pelotas');
fFis.add(acciones, 'girar').name('🌀 Girar');
fFis.add(acciones, 'saltar').name('⬆️ Saltar');
fFis.add(acciones, 'sacudir').name('Sacudir la cabeza');

const fGraf = gui.addFolder('Gráficos');
fGraf.add(P, 'calidad', ['Alta', 'Media', 'Baja']).name('Calidad').onChange(() => (aplicarCalidad(), guardar()));
fGraf.add(P, 'exposicion', 0.5, 1.6, 0.01).name('Exposición').onChange((v) => {
  renderer.toneMappingExposure = v;
  guardar();
});

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

const PASO = 1 / 90;
let acumulado = 0;

function pasoFisica(t) {
  if (P.fisica) {
    simPelo?.paso(PASO, col, pelotas, t);
    simPollera?.paso(PASO, col, pelotas, t);
  }
  pelotas.paso(PASO, col, alGolpear);
}
function aplicarFisica() {
  if (P.fisica) {
    simPelo?.aplicar();
    simPollera?.aplicar();
  }
}

function alGolpear(punto, impulso, zona) {
  const h = (punto.y - personaje.raiz.position.y) / esc();
  resorteCuerpo.impulso(impulso.z * h * 0.12, -impulso.x * h * 0.12);
  if (zona === 'cabeza') resorteCabeza.impulso(impulso.z * 0.35, -impulso.x * 0.35);
}

function animar() {
  requestAnimationFrame(animar);
  if (window.__congelar) {
    // Modo de prueba: solo dibuja el estado actual.
    controles.update();
    if (P.calidad === 'Baja') renderer.render(escena, camara);
    else post.composer.render();
    return;
  }
  if (pendiente) {
    pendiente = false;
    reconstruir();
  }
  const dtCuadro = Math.min(reloj.getDelta(), 0.05);
  const t = reloj.elapsedTime;
  const pt = personaje.partes;
  const raiz = personaje.raiz;
  const abd = personaje.modelo.abdReposo;
  const suave = (x) => x * x * (3 - 2 * x);

  // ---- Pose base ----
  let balanceo = 0;
  if (P.animar) {
    balanceo = Math.sin(t * 0.5) * 0.006;
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
      const ee = suave(e);
      const h = pt.hombros[1];
      const c = pt.codos[1];
      h.rotation.z = THREE.MathUtils.lerp(-abd, -1.2, ee);
      h.rotation.x = THREE.MathUtils.lerp(0, -0.25, ee);
      c.rotation.z = THREE.MathUtils.lerp(0, -1.45, ee) + Math.sin(t * 11) * 0.3 * ee;
      c.rotation.x = THREE.MathUtils.lerp(-0.18, 0, ee);
    } else saludoInicio = -1;
  }

  // Giro completo
  raiz.rotation.y = 0;
  if (giroInicio >= 0) {
    const f = (t - giroInicio) / 1.3;
    if (f < 1) raiz.rotation.y = Math.PI * 2 * suave(f);
    else giroInicio = -1;
  }
  // Salto
  raiz.position.y = 0;
  if (saltoInicio >= 0) {
    const f = (t - saltoInicio) / 0.55;
    if (f < 1) raiz.position.y = 0.16 * esc() * 4 * f * (1 - f);
    else {
      saltoInicio = -1;
      resorteCuerpo.impulso(0.25, 0);
    }
  }
  // Sacudir la cabeza
  if (sacudidaInicio >= 0) {
    const f = (t - sacudidaInicio) / 1.2;
    if (f < 1) pt.cuello.rotation.y += Math.sin(f * Math.PI * 7) * 0.4 * Math.sin(f * Math.PI);
    else sacudidaInicio = -1;
  }

  const alto = raiz.position.y / esc();
  sombraContacto.scale.setScalar(esc() * (1 - alto * 2));
  sombraContacto.material.opacity = 1 - alto * 3;

  // Reacción a impactos (resortes)
  resorteCuerpo.paso(dtCuadro);
  resorteCabeza.paso(dtCuadro);
  raiz.rotation.x = resorteCuerpo.x.x;
  raiz.rotation.z = balanceo + resorteCuerpo.x.y;
  pt.cuello.rotation.x += resorteCabeza.x.x;
  pt.cuello.rotation.z += resorteCabeza.x.y;
  pt.ojos.forEach((o) => (o.rotation.y = o.userData.yawBase - pt.cuello.rotation.y * 0.5));

  // ---- Física ----
  const a = THREE.MathUtils.degToRad(P.dirViento);
  opcionesFisica.viento.set(Math.sin(a), 0.05, Math.cos(a)).multiplyScalar(P.viento * 9);
  opcionesFisica.rigidez = P.rigidez;
  raiz.updateMatrixWorld(true);
  col.actualizar();
  acumulado += dtCuadro;
  let pasos = 0;
  while (acumulado >= PASO && pasos < 5) {
    acumulado -= PASO;
    pasos++;
    pasoFisica(t);
  }
  if (pasos === 5) acumulado = 0;
  aplicarFisica();

  if (vistaObjetivo) {
    camara.position.lerp(vistaObjetivo.pos, 0.08);
    controles.target.lerp(vistaObjetivo.target, 0.08);
    if (camara.position.distanceTo(vistaObjetivo.pos) < 0.005) vistaObjetivo = null;
  }
  controles.update();
  if (P.calidad === 'Baja') renderer.render(escena, camara);
  else post.composer.render();
}
controles.addEventListener('start', () => (vistaObjetivo = null));
animar();

window.addEventListener('resize', () => {
  camara.aspect = window.innerWidth / window.innerHeight;
  camara.updateProjectionMatrix();
  aplicarCalidad();
});

// Doble clic (o doble toque): lanzar una pelota hacia ese punto.
renderer.domElement.addEventListener('dblclick', (ev) => {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camara);
  const hit = raycaster.intersectObjects([personaje.raiz, piso], true)[0];
  const destino = hit ? hit.point : raycaster.ray.at(4, new THREE.Vector3());
  lanzarHacia(destino);
});

// Acceso para pruebas desde la consola.
window.__chica = { P, post, resorteCuerpo, resorteCabeza, acciones, reconstruir: () => reconstruir(), camara, controles, refrescarPanel, pelotas, lanzarHacia, aplicarCalidad, reloj,
  /** Avanza la simulación `seg` segundos sin dibujar (para pruebas). */
  simular(seg, alPaso) {
    for (let i = 0; i < seg / PASO; i++) {
      alPaso?.(i * PASO);
      personaje.raiz.updateMatrixWorld(true);
      col.actualizar();
      pasoFisica(i * PASO);
    }
    aplicarFisica();
  },
  get personaje() { return personaje; } };
