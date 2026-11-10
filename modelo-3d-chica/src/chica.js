import * as THREE from 'three';

/**
 * Construye un personaje estilizado (estilo "chibi") a partir de primitivas.
 * Devuelve el grupo raíz y referencias a las partes animables y materiales.
 */
export function crearChica() {
  const mat = {
    piel: new THREE.MeshStandardMaterial({ color: 0xf6d2b8, roughness: 0.7 }),
    pelo: new THREE.MeshStandardMaterial({ color: 0x5a3420, roughness: 0.6 }),
    vestido: new THREE.MeshStandardMaterial({ color: 0xe2557a, roughness: 0.55 }),
    blanco: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
    ojo: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.2 }),
    brillo: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mejilla: new THREE.MeshStandardMaterial({ color: 0xff9aa8, roughness: 0.9, transparent: true, opacity: 0.6 }),
    boca: new THREE.MeshStandardMaterial({ color: 0xb2404f, roughness: 0.6 }),
    zapato: new THREE.MeshStandardMaterial({ color: 0x2d2a3e, roughness: 0.4 }),
    media: new THREE.MeshStandardMaterial({ color: 0xfaf7f2, roughness: 0.8 }),
    mono: new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 }),
  };

  const raiz = new THREE.Group();
  raiz.name = 'Chica';

  const malla = (geo, m, nombre) => {
    const o = new THREE.Mesh(geo, m);
    o.name = nombre;
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };

  // ---------- Cuerpo ----------
  const cuerpo = new THREE.Group();
  cuerpo.name = 'Cuerpo';
  cuerpo.position.y = 1.0;
  raiz.add(cuerpo);

  // Torso
  const torso = malla(new THREE.CylinderGeometry(0.2, 0.26, 0.45, 24), mat.vestido, 'Torso');
  torso.position.y = 0.35;
  cuerpo.add(torso);

  // Falda
  const falda = malla(new THREE.ConeGeometry(0.52, 0.55, 32, 1, true), mat.vestido, 'Falda');
  falda.material = mat.vestido.clone();
  falda.material.side = THREE.DoubleSide;
  falda.position.y = 0.0;
  cuerpo.add(falda);
  // borde blanco de la falda
  const borde = malla(new THREE.TorusGeometry(0.505, 0.025, 8, 48), mat.blanco, 'BordeFalda');
  borde.rotation.x = Math.PI / 2;
  borde.position.y = -0.27;
  cuerpo.add(borde);

  // Cuello
  const cuello = malla(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 16), mat.piel, 'Cuello');
  cuello.position.y = 0.62;
  cuerpo.add(cuello);

  // Cuello de la camisa
  const collar = malla(new THREE.TorusGeometry(0.11, 0.035, 8, 24), mat.blanco, 'Collar');
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.57;
  cuerpo.add(collar);

  // ---------- Cabeza ----------
  const cabeza = new THREE.Group();
  cabeza.name = 'Cabeza';
  cabeza.position.y = 0.95;
  cuerpo.add(cabeza);

  const craneo = malla(new THREE.SphereGeometry(0.36, 48, 32), mat.piel, 'Craneo');
  craneo.scale.set(1, 1.02, 0.95);
  cabeza.add(craneo);

  // Orejas
  for (const s of [-1, 1]) {
    const oreja = malla(new THREE.SphereGeometry(0.06, 16, 12), mat.piel, 'Oreja');
    oreja.scale.set(0.6, 1, 0.8);
    oreja.position.set(0.345 * s, -0.02, 0);
    cabeza.add(oreja);
  }

  // Pelo: casquete superior
  const casquete = malla(
    new THREE.SphereGeometry(0.385, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat.pelo,
    'PeloCasquete'
  );
  casquete.position.y = 0.02;
  casquete.rotation.x = -0.25;
  cabeza.add(casquete);

  // Pelo: parte trasera
  const nuca = malla(new THREE.SphereGeometry(0.38, 32, 24), mat.pelo, 'PeloNuca');
  nuca.scale.set(1, 1.05, 0.85);
  nuca.position.set(0, -0.02, -0.07);
  cabeza.add(nuca);

  // Flequillo: segmento de esfera sobre la frente + puntas redondeadas
  const flequillo = malla(
    new THREE.SphereGeometry(0.378, 40, 20, Math.PI / 2 - 0.95, 1.9, 0, 1.12),
    mat.pelo,
    'Flequillo'
  );
  cabeza.add(flequillo);
  for (let i = -4; i <= 4; i++) {
    const ang = i * 0.21;
    const puntaFleq = malla(new THREE.SphereGeometry(0.05, 12, 10), mat.pelo, 'FlequilloPunta');
    puntaFleq.scale.set(1, 1.3, 0.45);
    const r = 0.355;
    puntaFleq.position.set(Math.sin(ang) * r * 0.9, 0.15 - Math.abs(i) * 0.008, Math.cos(ang) * r * 0.9);
    puntaFleq.rotation.y = ang;
    cabeza.add(puntaFleq);
  }

  // Mechones laterales
  for (const s of [-1, 1]) {
    const lateral = malla(new THREE.CapsuleGeometry(0.06, 0.3, 8, 16), mat.pelo, 'MechonLateral');
    lateral.position.set(0.31 * s, -0.12, 0.1);
    lateral.rotation.z = 0.12 * s;
    cabeza.add(lateral);
  }

  // Colita (ponytail) con pivote para animarla
  const colitaPivote = new THREE.Group();
  colitaPivote.name = 'ColitaPivote';
  colitaPivote.position.set(0, 0.12, -0.33);
  cabeza.add(colitaPivote);
  const colita = malla(new THREE.CapsuleGeometry(0.1, 0.42, 8, 16), mat.pelo, 'Colita');
  colita.position.set(0, -0.25, -0.08);
  colita.rotation.x = 0.35;
  colitaPivote.add(colita);
  const punta = malla(new THREE.ConeGeometry(0.09, 0.2, 12), mat.pelo, 'ColitaPunta');
  punta.position.set(0, -0.55, -0.18);
  punta.rotation.x = Math.PI + 0.35;
  colitaPivote.add(punta);
  // Moño
  const mono = new THREE.Group();
  mono.name = 'Mono';
  mono.position.set(0, 0.0, 0.0);
  colitaPivote.add(mono);
  for (const s of [-1, 1]) {
    const lazo = malla(new THREE.ConeGeometry(0.08, 0.16, 4), mat.mono, 'Lazo');
    lazo.rotation.z = (Math.PI / 2) * s;
    lazo.position.x = 0.08 * s;
    mono.add(lazo);
  }
  mono.add(malla(new THREE.SphereGeometry(0.04, 12, 8), mat.mono, 'NudoMono'));

  // Ojos
  const ojos = [];
  for (const s of [-1, 1]) {
    const ojo = new THREE.Group();
    ojo.name = 'Ojo';
    ojo.position.set(0.13 * s, -0.02, 0.305);
    cabeza.add(ojo);

    const blanco = malla(new THREE.SphereGeometry(0.075, 24, 16), mat.blanco, 'OjoBlanco');
    blanco.scale.set(0.9, 1.15, 0.45);
    ojo.add(blanco);

    const iris = malla(new THREE.SphereGeometry(0.055, 24, 16), mat.ojo, 'Iris');
    iris.scale.set(0.9, 1.15, 0.4);
    iris.position.z = 0.02;
    ojo.add(iris);

    const brillo = malla(new THREE.SphereGeometry(0.016, 8, 8), mat.brillo, 'Brillo');
    brillo.position.set(0.02 * s, 0.03, 0.045);
    ojo.add(brillo);

    // Pestañas
    const pestana = malla(new THREE.TorusGeometry(0.07, 0.008, 6, 16, Math.PI), mat.ojo, 'Pestana');
    pestana.position.set(0, 0.02, 0.02);
    pestana.scale.set(1, 1.2, 1);
    ojo.add(pestana);

    ojos.push(ojo);

    // Cejas
    const ceja = malla(new THREE.CapsuleGeometry(0.01, 0.07, 4, 8), mat.pelo, 'Ceja');
    ceja.rotation.z = Math.PI / 2 + 0.15 * s;
    ceja.position.set(0.13 * s, 0.1, 0.31);
    cabeza.add(ceja);

    // Mejillas
    const mejilla = malla(new THREE.CircleGeometry(0.045, 20), mat.mejilla, 'Mejilla');
    mejilla.position.set(0.2 * s, -0.11, 0.29);
    mejilla.rotation.y = 0.55 * s;
    cabeza.add(mejilla);
  }

  // Nariz
  const nariz = malla(new THREE.SphereGeometry(0.018, 12, 8), mat.piel, 'Nariz');
  nariz.position.set(0, -0.08, 0.34);
  cabeza.add(nariz);

  // Boca (sonrisa)
  const boca = malla(new THREE.TorusGeometry(0.04, 0.009, 6, 16, Math.PI), mat.boca, 'Boca');
  boca.rotation.z = Math.PI;
  boca.position.set(0, -0.14, 0.325);
  cabeza.add(boca);

  // ---------- Brazos ----------
  const crearBrazo = (s) => {
    const hombro = new THREE.Group();
    hombro.name = s < 0 ? 'HombroDer' : 'HombroIzq';
    hombro.position.set(0.25 * s, 0.52, 0);
    cuerpo.add(hombro);

    const manga = malla(new THREE.SphereGeometry(0.09, 16, 12), mat.blanco, 'Manga');
    manga.scale.set(1, 0.9, 1);
    hombro.add(manga);

    const brazo = malla(new THREE.CapsuleGeometry(0.05, 0.36, 8, 16), mat.piel, 'Brazo');
    brazo.position.y = -0.24;
    hombro.add(brazo);

    const mano = malla(new THREE.SphereGeometry(0.065, 16, 12), mat.piel, 'Mano');
    mano.position.y = -0.47;
    hombro.add(mano);

    hombro.rotation.z = 0.18 * s;
    return hombro;
  };
  const brazoIzq = crearBrazo(1);
  const brazoDer = crearBrazo(-1);

  // ---------- Piernas ----------
  for (const s of [-1, 1]) {
    const pierna = new THREE.Group();
    pierna.name = 'Pierna';
    pierna.position.set(0.12 * s, -0.2, 0);
    cuerpo.add(pierna);

    const muslo = malla(new THREE.CapsuleGeometry(0.065, 0.45, 8, 16), mat.piel, 'Muslo');
    muslo.position.y = -0.3;
    pierna.add(muslo);

    const media = malla(new THREE.CylinderGeometry(0.072, 0.07, 0.28, 16), mat.media, 'Media');
    media.position.y = -0.55;
    pierna.add(media);

    const zapato = malla(new THREE.SphereGeometry(0.1, 20, 14), mat.zapato, 'Zapato');
    zapato.scale.set(0.85, 0.55, 1.35);
    zapato.position.set(0, -0.76, 0.05);
    pierna.add(zapato);
  }

  return {
    raiz,
    partes: { cuerpo, cabeza, colitaPivote, ojos, brazoIzq, brazoDer },
    materiales: mat,
    falda,
    torso,
  };
}
