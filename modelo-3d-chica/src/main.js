import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { crearChica } from './chica.js';

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x1d1f2b);
escena.fog = new THREE.Fog(0x1d1f2b, 6, 14);

const camara = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camara.position.set(1.6, 1.7, 3.6);

const controles = new OrbitControls(camara, renderer.domElement);
controles.target.set(0, 1.25, 0);
controles.enableDamping = true;
controles.minDistance = 1.2;
controles.maxDistance = 8;
controles.update();

// ---------- Luces ----------
escena.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2f45, 0.9));
const sol = new THREE.DirectionalLight(0xffffff, 2.2);
sol.position.set(3, 5, 4);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.camera.left = -3;
sol.shadow.camera.right = 3;
sol.shadow.camera.top = 3;
sol.shadow.camera.bottom = -3;
escena.add(sol);
const contra = new THREE.DirectionalLight(0xff9ad5, 1.0);
contra.position.set(-3, 3, -4);
escena.add(contra);

// ---------- Piso ----------
const piso = new THREE.Mesh(
  new THREE.CircleGeometry(4, 64),
  new THREE.MeshStandardMaterial({ color: 0x2b2e40, roughness: 0.95 })
);
piso.rotation.x = -Math.PI / 2;
piso.receiveShadow = true;
escena.add(piso);

// ---------- Personaje ----------
const chica = crearChica();
escena.add(chica.raiz);
const { cuerpo, cabeza, colitaPivote, ojos, brazoIzq, brazoDer } = chica.partes;

// ---------- UI ----------
let animando = true;
let saludoInicio = -1;

document.getElementById('btnAnim').addEventListener('click', (e) => {
  animando = !animando;
  e.target.textContent = animando ? 'Pausar animación' : 'Reanudar animación';
});
document.getElementById('btnSaludo').addEventListener('click', () => {
  saludoInicio = reloj.getElapsedTime();
});
document.getElementById('colorPelo').addEventListener('input', (e) => {
  chica.materiales.pelo.color.set(e.target.value);
});
document.getElementById('colorVestido').addEventListener('input', (e) => {
  chica.materiales.vestido.color.set(e.target.value);
  chica.falda.material.color.set(e.target.value);
});
document.getElementById('btnExportar').addEventListener('click', () => {
  new GLTFExporter().parse(
    chica.raiz,
    (glb) => {
      const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chica.glb';
      a.click();
      URL.revokeObjectURL(url);
    },
    (err) => console.error('Error exportando GLB:', err),
    { binary: true }
  );
});

// ---------- Animación ----------
const reloj = new THREE.Clock();
const DURACION_SALUDO = 2.2;

function animar() {
  const t = reloj.getElapsedTime();

  if (animando) {
    // Respiración y balanceo suave
    cuerpo.position.y = 1.0 + Math.sin(t * 2) * 0.01;
    cuerpo.rotation.y = Math.sin(t * 0.6) * 0.12;
    cabeza.rotation.z = Math.sin(t * 0.9) * 0.05;
    cabeza.rotation.x = Math.sin(t * 0.7) * 0.03;
    colitaPivote.rotation.z = Math.sin(t * 1.8) * 0.15;
    colitaPivote.rotation.x = Math.sin(t * 1.3) * 0.06;

    // Parpadeo cada ~3.5 s
    const fase = t % 3.5;
    const escalaY = fase < 0.12 ? Math.abs(Math.cos((fase / 0.12) * Math.PI)) * 0.9 + 0.1 : 1;
    ojos.forEach((o) => (o.scale.y = escalaY));

    // Brazos en reposo
    brazoIzq.rotation.z = 0.18 + Math.sin(t * 2) * 0.03;
    brazoDer.rotation.z = -0.18 - Math.sin(t * 2) * 0.03;
    brazoDer.rotation.x = 0;
  }

  // Saludo con la mano derecha
  if (saludoInicio >= 0) {
    const p = (t - saludoInicio) / DURACION_SALUDO;
    if (p < 1) {
      const subir = Math.sin(Math.min(p * 4, 1) * Math.PI / 2) * (p > 0.8 ? (1 - p) / 0.2 : 1);
      brazoDer.rotation.z = -0.18 - subir * 2.6 + Math.sin(t * 14) * 0.25 * subir;
      cabeza.rotation.z = -0.12 * subir;
    } else {
      saludoInicio = -1;
    }
  }

  controles.update();
  renderer.render(escena, camara);
  requestAnimationFrame(animar);
}
animar();

window.addEventListener('resize', () => {
  camara.aspect = window.innerWidth / window.innerHeight;
  camara.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
