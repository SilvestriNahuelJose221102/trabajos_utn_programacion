/*
 * Animaciones procedurales. Ejes del personaje: x = su izquierda, y = arriba,
 * z = adelante. Convenciones de Posador.rotar (en ejes del personaje):
 *  - Brazo izquierdo hacia el costado: z positivo; derecho: z negativo.
 *  - Brazo o pierna hacia adelante: x negativo. Doblar rodilla: x positivo.
 * Cada función devuelve opcionalmente { y, rotY, expr: [nombre, intensidad] }.
 */

const suave = (x) => x * x * (3 - 2 * x);
const tramo = (f, a, b) => suave(Math.min(1, Math.max(0, (f - a) / (b - a))));

/** Flexiona las dos piernas (ángulo de muslo `a`) y devuelve cuánto baja la cadera. */
function agachar(ps, a, ctx, izq = 1, der = 1) {
  for (const [l, k] of [['left', izq], ['right', der]]) {
    ps.rotar(l + 'UpperLeg', -a * k, 0, 0);
    ps.rotar(l + 'LowerLeg', 2 * a * k, 0, 0);
    ps.rotar(l + 'Foot', -a * k, 0, 0);
  }
  return ctx.pierna * (1 - Math.cos(a * Math.max(izq, der)));
}

// ---------- Poses de base ----------
export const POSES = {
  Relajada: () => {},
  'Manos en la cintura': (ps) => {
    for (const [l, s] of [['left', 1], ['right', -1]]) {
      ps.rotar(l + 'UpperArm', 0.25, 0, s * 0.62);
      ps.rotar(l + 'LowerArm', 0, s * 0.35, -s * 1.75);
      ps.local(l + 'Hand', 0, 0, s * 0.35);
    }
  },
  'Brazos cruzados': (ps) => {
    ps.rotar('leftUpperArm', -0.42, 0, -0.12);
    ps.rotar('rightUpperArm', -0.42, 0, 0.12);
    ps.rotar('leftLowerArm', -1.45, -1.0, 0);
    ps.rotar('rightLowerArm', -1.35, 1.0, 0);
  },
  'Peso en una pierna': (ps) => {
    ps.rotar('hips', 0, 0.1, -0.06);
    ps.rotar('spine', 0, 0, 0.05);
    ps.rotar('chest', 0, -0.06, 0.03);
    ps.rotar('leftUpperLeg', -0.12, 0, 0.06);
    ps.rotar('leftLowerLeg', 0.3, 0, 0);
    ps.rotar('rightUpperLeg', 0, 0, 0.06);
  },
};

// ---------- Ciclos (se repiten mientras estén activos) ----------
export const CICLOS = {
  Ninguno: null,
  Bailar: (ps, t, ctx) => {
    const fase = t * Math.PI * 2 * 1.05;
    const golpe = Math.abs(Math.sin(fase));
    const baja = agachar(ps, 0.12 + 0.18 * golpe, ctx);
    ps.rotar('hips', 0, Math.sin(fase) * 0.18, Math.sin(fase) * 0.08);
    ps.rotar('spine', 0, -Math.sin(fase) * 0.1, -Math.sin(fase) * 0.06);
    ps.rotar('chest', 0.04 * golpe, 0, 0);
    ps.rotar('neck', 0.1 * Math.sin(fase * 2), 0, Math.sin(fase) * 0.08);
    const brazo = 0.6 + 0.5 * golpe;
    ps.rotar('leftUpperArm', -0.3, 0, brazo);
    ps.rotar('rightUpperArm', -0.3, 0, -brazo);
    ps.rotar('leftLowerArm', -1.2 - 0.4 * Math.sin(fase), 0, 0);
    ps.rotar('rightLowerArm', -1.2 + 0.4 * Math.sin(fase), 0, 0);
    ps.dedos('left', 0.45);
    ps.dedos('right', 0.45);
    return { y: -baja, expr: ['happy', 0.7] };
  },
  'Caminar en el lugar': (ps, t, ctx) => {
    const fase = t * Math.PI * 2 * 0.95;
    const s = Math.sin(fase);
    for (const [l, k] of [['left', 1], ['right', -1]]) {
      const paso = s * k;
      ps.rotar(l + 'UpperLeg', -0.35 * Math.max(0, paso) + 0.08 * Math.min(0, paso), 0, 0);
      ps.rotar(l + 'LowerLeg', 0.75 * Math.max(0, paso), 0, 0);
      ps.rotar(l + 'UpperArm', 0.3 * paso, 0, 0);
      ps.rotar(l + 'LowerArm', -0.25 - 0.2 * Math.max(0, -paso), 0, 0);
    }
    ps.rotar('hips', 0, 0.07 * s, 0.03 * s);
    ps.rotar('chest', 0, -0.1 * s, 0);
    return { y: 0.012 * Math.abs(Math.cos(fase)) * (ctx.pierna / 0.8) };
  },
};

// ---------- Acciones (duran un tiempo y terminan) ----------
export const ACCIONES = {
  Saludar: {
    dur: 3,
    fn: (ps, f, t) => {
      const e = tramo(f, 0, 0.15) * (1 - tramo(f, 0.85, 1));
      ps.rotar('rightUpperArm', -0.3 * e, 0, -1.2 * e);
      ps.rotar('rightLowerArm', 0, 0, -1.35 * e);
      ps.girarEje('rightLowerArm', 'rightHand', -1.3 * e);
      // La mano y los dedos se mueven: muñeca de lado a lado y dedos abiertos.
      const vaiven = Math.sin(t * 10) * e;
      ps.rotar('rightLowerArm', 0, 0, 0.18 * vaiven);
      ps.local('rightHand', 0, 0.45 * vaiven, 0);
      ps.dedos('right', -0.25 * e, 1.2 * e);
      ps.rotar('neck', 0, 0, -0.08 * e);
      return { expr: ['happy', 0.8 * e] };
    },
  },
  Aplaudir: {
    dur: 3,
    fn: (ps, f, t) => {
      const e = tramo(f, 0, 0.15) * (1 - tramo(f, 0.85, 1));
      const golpe = Math.max(0, Math.sin(t * 13)) * e;
      for (const [l, s] of [['left', 1], ['right', -1]]) {
        ps.rotar(l + 'UpperArm', -0.7 * e, 0, s * (-0.12 * e + 0.1 * golpe));
        ps.rotar(l + 'LowerArm', -0.9 * e, s * -0.12 * e, 0);
        ps.dedos(l, -0.2 * e, 0);
      }
      return { expr: ['happy', e] };
    },
  },
  Pensar: {
    dur: 3.6,
    fn: (ps, f) => {
      const e = tramo(f, 0, 0.18) * (1 - tramo(f, 0.85, 1));
      ps.rotar('rightUpperArm', -0.45 * e, 0, 0.22 * e);
      ps.rotar('rightLowerArm', -2.25 * e, 0, 0.15 * e);
      ps.dedos('right', 0.55 * e);
      ps.rotar('leftUpperArm', -0.3 * e, 0, -0.1 * e);
      ps.rotar('leftLowerArm', -1.45 * e, -1.05 * e, 0);
      ps.rotar('neck', -0.08 * e, 0.12 * e, 0.12 * e);
      return { expr: ['relaxed', 0.3 * e] };
    },
  },
  Estirarse: {
    dur: 3.4,
    fn: (ps, f) => {
      const e = tramo(f, 0, 0.3) * (1 - tramo(f, 0.75, 1));
      ps.rotar('leftUpperArm', 0, 0, 2.75 * e);
      ps.rotar('rightUpperArm', 0, 0, -2.75 * e);
      ps.rotar('leftLowerArm', 0, 0, 0.25 * e);
      ps.rotar('rightLowerArm', 0, 0, -0.25 * e);
      ps.rotar('spine', -0.1 * e, 0, Math.sin(f * Math.PI * 2) * 0.08 * e);
      ps.rotar('chest', -0.1 * e, 0, 0);
      ps.rotar('neck', -0.2 * e, 0, 0);
      ps.dedos('left', -0.25 * e, 1 * e);
      ps.dedos('right', -0.25 * e, 1 * e);
      return { expr: ['relaxed', e] };
    },
  },
  Reverencia: {
    dur: 2.6,
    fn: (ps, f) => {
      const e = tramo(f, 0, 0.3) * (1 - tramo(f, 0.7, 1));
      ps.rotar('spine', 0.3 * e, 0, 0);
      ps.rotar('chest', 0.2 * e, 0, 0);
      ps.rotar('neck', 0.2 * e, 0, 0);
      ps.rotar('leftUpperArm', -0.3 * e, 0, -0.2 * e);
      ps.rotar('rightUpperArm', -0.3 * e, 0, 0.2 * e);
      ps.rotar('leftLowerArm', -0.3 * e, 0, -0.3 * e);
      ps.rotar('rightLowerArm', -0.3 * e, 0, 0.3 * e);
      return { expr: ['relaxed', 0.6 * e] };
    },
  },
  Saltar: {
    dur: 1.25,
    fn: (ps, f, t, ctx) => {
      // Se agacha, salta con los brazos arriba y amortigua al caer.
      const agache = tramo(f, 0, 0.22) * (1 - tramo(f, 0.22, 0.32)) + tramo(f, 0.78, 0.86) * (1 - tramo(f, 0.86, 1));
      const aire = f > 0.3 && f < 0.8 ? (f - 0.3) / 0.5 : -1;
      const baja = agachar(ps, 0.55 * agache, ctx);
      ps.rotar('spine', 0.25 * agache, 0, 0);
      const brazos = aire >= 0 ? Math.sin(aire * Math.PI) : 0;
      ps.rotar('leftUpperArm', 0.5 * agache - 2.2 * brazos, 0, 0.3 * brazos);
      ps.rotar('rightUpperArm', 0.5 * agache - 2.2 * brazos, 0, -0.3 * brazos);
      if (aire >= 0) agachar(ps, 0.12 * Math.sin(aire * Math.PI), ctx);
      const y = aire >= 0 ? 0.32 * (ctx.pierna / 0.8) * 4 * aire * (1 - aire) : -baja;
      return { y, expr: ['happy', brazos], aterriza: f > 0.78 && f < 0.8 };
    },
  },
  Girar: {
    dur: 1.4,
    fn: (ps, f) => {
      const e = Math.sin(f * Math.PI);
      ps.rotar('leftUpperArm', 0, 0, 0.9 * e);
      ps.rotar('rightUpperArm', 0, 0, -0.9 * e);
      return { rotY: Math.PI * 2 * suave(f), expr: ['happy', e] };
    },
  },
  'Sacudir la cabeza': {
    dur: 1.2,
    fn: (ps, f) => {
      ps.rotar('neck', 0, Math.sin(f * Math.PI * 7) * 0.45 * Math.sin(f * Math.PI), 0);
      return {};
    },
  },
};
