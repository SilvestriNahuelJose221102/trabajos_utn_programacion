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

/** Convierte un mapa de alturas (canvas en grises) en un mapa de normales. */
function alturaANormal(canvas, fuerza, repeticion) {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * fuerza;
      const dy = (H(x, y + 1) - H(x, y - 1)) * fuerza;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeticion, repeticion);
  return t;
}

/** Alturas de poros y microrrelieve de la piel. */
function canvasPoros() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const rand = mulberry32(11);
  g.fillStyle = 'rgb(140,140,140)';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = Math.round(110 + rand() * 60);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.beginPath();
    g.arc(rand() * 512, rand() * 512, 2 + rand() * 7, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(60,60,60,${0.3 + rand() * 0.4})`;
    g.beginPath();
    g.arc(rand() * 512, rand() * 512, 0.6 + rand() * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Iris en coordenadas polares: x = ángulo, y = radio (arriba = pupila, abajo = borde). */
function texturaIris() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  const rand = mulberry32(21);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#f6e2b8');
  grad.addColorStop(0.25, '#f2e8d6');
  grad.addColorStop(0.7, '#e6e6e6');
  grad.addColorStop(0.86, '#a9a9a9');
  grad.addColorStop(1, '#3a3a3a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 700; i++) {
    const x = rand() * 512;
    const v = Math.round(rand() < 0.5 ? 255 : 90 + rand() * 80);
    g.strokeStyle = `rgba(${v},${v},${v},${0.15 + rand() * 0.35})`;
    g.lineWidth = 0.6 + rand() * 1.6;
    g.beginPath();
    g.moveTo(x, 6 + rand() * 20);
    g.bezierCurveTo(x + (rand() - 0.5) * 10, 50, x + (rand() - 0.5) * 10, 80, x + (rand() - 0.5) * 6, 100 + rand() * 20);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(40,30,25,${0.2 + rand() * 0.3})`;
    g.beginPath();
    g.ellipse(rand() * 512, 30 + rand() * 60, 2 + rand() * 4, 3 + rand() * 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Pestañas: pelos curvos y finos sobre fondo transparente. */
function texturaPestanas() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  const rand = mulberry32(31);
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = rand() * 256;
    const largo = 0.5 + rand() * 0.5;
    g.strokeStyle = `rgba(20,14,12,${0.75 + rand() * 0.25})`;
    g.lineWidth = 0.8 + rand() * 0.9;
    g.beginPath();
    g.moveTo(x, 64);
    g.quadraticCurveTo(x + (rand() - 0.5) * 8, 64 - 40 * largo, x + (rand() - 0.5) * 14, 64 - 62 * largo);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function crearMateriales() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const fis = (o) => new THREE.MeshPhysicalMaterial(o);
  const poros = canvasPoros();
  const normalPiel = alturaANormal(poros, 2.2, 6);
  const normalCara = alturaANormal(poros, 1.6, 3);
  const telaArriba = texturaTela(false);
  const telaAbajo = texturaTela(true);
  const normalArriba = alturaANormal(telaArriba.image, 1.5, 4);
  const normalAbajo = alturaANormal(telaAbajo.image, 3, 4);
  const piel = fis({
    roughness: 0.5,
    normalMap: normalPiel,
    normalScale: new THREE.Vector2(0.25, 0.25),
    sheen: 0.25,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#ff9f87'),
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
    specularIntensity: 0.6,
  });
  const pielCara = piel.clone();
  pielCara.vertexColors = true;
  pielCara.normalMap = normalCara;
  pielCara.normalScale = new THREE.Vector2(0.18, 0.18);
  pielCara.roughness = 0.46;
  return {
    piel,
    pielCara,
    fosa: std({ roughness: 0.9 }),
    labios: fis({ roughness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color('#ffd0d0') }),
    boca: std({ color: '#5b2a2c', roughness: 0.8 }),
    ojoBlanco: fis({ color: '#e6dcd4', roughness: 0.25 }),
    iris: fis({ map: texturaIris(), roughness: 0.45 }),
    pupila: fis({ color: '#050505', roughness: 0.3 }),
    cornea: fis({
      color: '#ffffff',
      transmission: 1,
      thickness: 0.0015,
      ior: 1.376,
      roughness: 0.02,
      specularIntensity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
    delineado: std({ color: '#2a1d18', roughness: 0.8 }),
    pestanas: std({ map: texturaPestanas(), alphaTest: 0.4, side: THREE.DoubleSide, color: '#ffffff', roughness: 0.7 }),
    cejas: std({ roughness: 0.85 }),
    peloMechones: fis({
      map: texturaMechones(),
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.38,
      specularIntensity: 0.4,
      sheen: 0.12,
      sheenRoughness: 0.35,
    }),
    peloBase: fis({ map: texturaCasquete(), roughness: 0.55, specularIntensity: 0.4, sheen: 0.12, sheenRoughness: 0.5 }),
    gomita: std({ color: '#222222', roughness: 0.4 }),
    superior: std({ map: telaArriba, normalMap: normalArriba, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.85, side: THREE.DoubleSide }),
    inferior: std({ map: telaAbajo, normalMap: normalAbajo, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92, side: THREE.DoubleSide }),
    calzado: fis({ roughness: 0.5, clearcoat: 0.2 }),
    suela: std({ color: '#ececec', roughness: 0.7 }),
  };
}

/** Aplica los colores del panel a los materiales (sin reconstruir geometría). */
export function aplicarColores(m, p) {
  m.piel.color.set(p.piel);
  m.pielCara.color.set(p.piel);
  m.fosa.color.set(p.piel).multiplyScalar(0.3);
  m.labios.color.set(p.labios);
  m.iris.color.set(p.ojos);
  m.peloMechones.color.set(p.peloColor);
  m.peloBase.color.set(p.peloColor).multiplyScalar(0.85);
  const brillo = new THREE.Color(p.peloColor).lerp(new THREE.Color('#ffffff'), 0.15);
  m.peloMechones.sheenColor.copy(brillo);
  m.peloBase.sheenColor.copy(brillo);
  m.cejas.color.set(p.peloColor).multiplyScalar(0.42).lerp(new THREE.Color('#4a3a30'), 0.35);
  m.superior.color.set(p.colorSuperior);
  m.inferior.color.set(p.colorInferior);
  m.calzado.color.set(p.calzado);
}
