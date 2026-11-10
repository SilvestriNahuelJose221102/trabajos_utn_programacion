import * as THREE from 'three';
import { mulberry32 } from './util.js';

/** Textura de mechones: líneas finas sobre fondo transparente (RGBA). */
function texturaMechones() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d');
  const rand = mulberry32(42);
  g.clearRect(0, 0, c.width, c.height);
  for (let i = 0; i < 80; i++) {
    const x = rand() * c.width;
    const largo = (0.65 + 0.35 * rand()) * c.height;
    const v = Math.round(150 + rand() * 105);
    const fase = rand() * 6.28;
    g.strokeStyle = `rgba(${v},${v},${v},${0.75 + rand() * 0.25})`;
    g.lineWidth = 1 + rand() * 1.8;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 16; y <= largo; y += 16) g.lineTo(x + Math.sin(y * 0.015 + fase) * 2.5, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Textura para el casquete: base gris con vetas, opaca. */
function texturaCasquete() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(7);
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    const x = rand() * c.width;
    const v = Math.round(150 + rand() * 105);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1 + rand() * 1.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (rand() - 0.5) * 6, c.height);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  return t;
}

/** Textura de tela (denim con sarga diagonal, o tejido de punto suave). */
function texturaTela(denim) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(denim ? 3 : 5);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = Math.round((denim ? 195 : 225) + rand() * (denim ? 60 : 30));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1);
  }
  if (denim) {
    g.strokeStyle = 'rgba(0,0,0,0.13)';
    for (let i = -256; i < 512; i += 4) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 256, 256);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

export function crearMateriales() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const fis = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    piel: fis({
      roughness: 0.52,
      sheen: 0.15,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color('#ffb7a0'),
      clearcoat: 0.05,
      clearcoatRoughness: 0.6,
    }),
    fosa: std({ roughness: 0.9 }),
    labios: fis({ roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.35 }),
    boca: std({ color: '#5b2a2c', roughness: 0.8 }),
    ojoBlanco: fis({ color: '#e4dad2', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    iris: fis({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 }),
    pupila: fis({ color: '#080808', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
    pestanas: std({ color: '#1a120e', roughness: 0.7 }),
    cejas: std({ roughness: 0.85 }),
    peloMechones: fis({
      map: texturaMechones(),
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.42,
      sheen: 0.8,
      sheenRoughness: 0.35,
    }),
    peloBase: fis({ map: texturaCasquete(), roughness: 0.5, sheen: 0.6, sheenRoughness: 0.4 }),
    gomita: std({ color: '#222222', roughness: 0.4 }),
    superior: std({ map: texturaTela(false), roughness: 0.85, side: THREE.DoubleSide }),
    inferior: std({ map: texturaTela(true), roughness: 0.92, side: THREE.DoubleSide }),
    calzado: std({ roughness: 0.55 }),
    suela: std({ color: '#ececec', roughness: 0.7 }),
  };
}

/** Aplica los colores del panel a los materiales (sin reconstruir geometría). */
export function aplicarColores(m, p) {
  m.piel.color.set(p.piel);
  m.fosa.color.set(p.piel).multiplyScalar(0.3);
  m.labios.color.set(p.labios);
  m.iris.color.set(p.ojos);
  m.peloMechones.color.set(p.peloColor);
  m.peloBase.color.set(p.peloColor).multiplyScalar(0.85);
  const brillo = new THREE.Color(p.peloColor).lerp(new THREE.Color('#ffffff'), 0.55);
  m.peloMechones.sheenColor.copy(brillo);
  m.peloBase.sheenColor.copy(brillo);
  m.cejas.color.set(p.peloColor).multiplyScalar(0.42).lerp(new THREE.Color('#4a3a30'), 0.35);
  m.superior.color.set(p.colorSuperior);
  m.inferior.color.set(p.colorInferior);
  m.calzado.color.set(p.calzado);
}
