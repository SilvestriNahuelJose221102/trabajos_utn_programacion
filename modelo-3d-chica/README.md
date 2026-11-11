# Modelo 3D personalizable (Three.js)

Personaje femenino adulto en 3D, generado 100% por código con [Three.js](https://threejs.org/) r170 (sin modelos externos), con físicas en tiempo real. No requiere instalar nada ni compilar.

## Dos versiones

| Página | Qué es |
|---|---|
| `index.html` | Personaje hecho 100% por código (cuerpo paramétrico, pelo con mechones, físicas propias). |
| `anime.html` | Visor de modelos VRM/GLB/FBX. Arranca con una chica anime (sombreado *toon* con contorno) y permite **abrir tu propio modelo**: uno anime hecho en VRoid Studio (`.vrm`) o uno realista exportado desde MakeHuman 2 (`.glb`), Blender, Mixamo, etc. |

## Cómo verlo

Los módulos ES no cargan desde `file://`; hace falta un servidor local:

```bash
cd modelo-3d-chica
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Qué se puede personalizar (panel de la derecha)

| Sección | Opciones |
|---|---|
| Cuerpo | Altura (1,50–1,85 m), contextura, busto, cintura, cadera, hombros, tono de piel (presets + color libre) |
| Cara | Color de ojos (presets + libre), color de labios, sonrisa |
| Pelo | Tono (rubio por defecto, platinado, miel, castaño, morocho, pelirrojo o libre), peinado (suelto, colita, rodete), largo, ondas, volumen, flequillo |
| Ropa | Arriba: remera, musculosa o manga larga · Abajo: jean, short o pollera · Colores de cada prenda y de las zapatillas |
| Física | Activar/desactivar, viento (fuerza y dirección), rigidez del pelo y la tela, lanzar pelotas, quitar pelotas, girar, saltar, sacudir la cabeza |
| Gráficos | Calidad (Alta: bloom, sombras 4096 px y resolución completa; Media: bloom; Baja: sin posprocesado), exposición |
| Acciones | Saludar, pausar animación, vista de cara/cuerpo, aleatorio, restablecer, exportar `.glb` |

**Doble clic** sobre la escena lanza una pelota hacia ese punto.

La configuración se guarda en el navegador (`localStorage`) y se recupera al volver a abrir la página.

## Cómo está hecho

- **Torso**: superficie paramétrica con secciones elípticas interpoladas por splines (Catmull-Rom) a lo largo de la altura, más deformaciones gaussianas para busto y glúteos. La misma función genera la ropa (inflada levemente) y la usa el pelo para no atravesar el cuerpo.
- **Extremidades**: superficies de revolución (`LatheGeometry`) con perfiles de radio anatómicos; la pierna es una sola pieza (sin costura en la rodilla).
- **Cabeza**: esfera deformada (mandíbula, mentón, nuca) con cuencas de los ojos, arco superciliar, pómulos, nariz y aletas modelados por desplazamiento. Ojos con esclerótica, iris y pupila con *clearcoat*, párpados animados (parpadeo), cejas y labios como tubos afinados.
- **Pelo**: casquete con textura + cientos de *hair cards* (cintas con textura de mechones y *alpha test*), igual que en los videojuegos. Cada mechón se calcula sobre el cuero cabelludo y cae con gravedad, apoyándose sobre hombros, espalda y busto.
- **Materiales**: piel con `MeshPhysicalMaterial` (sheen + clearcoat), denim y tejido con texturas procedurales en `canvas`, iluminación con entorno PMREM, sombras suaves y *tone mapping* ACES.

## Versión anime y modelos propios (`anime.html`)

- **Modelo incluido**: `modelos/chica-anime.glb` es el modelo de ejemplo `VRM1_Constraint_Twist_Sample` de pixiv Inc. (repositorio [pixiv/three-vrm](https://github.com/pixiv/three-vrm)), en formato VRM 1.0 dentro de un contenedor GLB. Su licencia embebida ([VRM Public License 1.0](https://vrm.dev/licenses/1.0/)) permite redistribuirlo y modificarlo, sin obligación de crédito. Ver `modelos/LICENCIA.md`.
- **Se carga con** [three-vrm](https://github.com/pixiv/three-vrm) 3.3.3 (MIT): sombreado MToon (estilo anime con contorno), expresiones, mirada que sigue a la cámara y física de pelo y ropa (*spring bones*).
- **Personalización**: color de pelo, ojos y ropa (la textura se pasa a escala de grises y se tiñe), grosor del contorno, expresión (feliz, enojada, triste, relajada, sorprendida) e intensidad.
- **Física**: viento con ráfagas aplicado a los *spring bones*, rigidez del pelo y la ropa, pelotas que chocan contra el cuerpo (cápsulas armadas sobre los huesos) y también empujan el pelo, reacción del torso y la cabeza a los golpes, giro, salto y sacudida de cabeza.
- **Tu propio modelo**: botón "Abrir mi modelo" o arrastrar el archivo a la página (`.vrm`, `.glb`, `.gltf`, `.fbx`). Se detectan los huesos de los esqueletos más comunes (VRM, MakeHuman, Mixamo, Unreal/Unity) para bajar los brazos si viene en pose T, animarlo y armar las colisiones. Los modelos que no son VRM no traen física de pelo; las pelotas y la reacción a golpes funcionan igual.

### Cómo hacer tu propio modelo

- **Anime**: [VRoid Studio](https://vroid.com/en/studio) (gratis). Creá el personaje con los controles deslizantes y exportá en **VRM**.
- **Realista**: [MakeHuman 2](https://www.makehumancommunity.org/) (gratis). Elegí cuerpo, cara, pelo y ropa, y exportá en **glTF (.glb)** con esqueleto.

## Físicas

Motor propio en `src/fisica.js`, sin librerías:

- **Pelo**: ~48 mechones guía simulados con integración de Verlet (gravedad, inercia, viento con ráfagas, amortiguación y retorno suave a la forma del peinado). Cada mechón visible sigue a sus 2 guías más cercanas. Choca contra la cabeza, el torso, los brazos y las pelotas.
- **Pollera**: tela simulada como grilla de partículas (columnas + anillos) anclada a la cintura; choca con las piernas y con las pelotas.
- **Pelotas**: gravedad, rebote contra el piso y el cuerpo, fricción, choques entre pelotas y rodadura.
- **Reacción a impactos**: cuando una pelota la golpea, el cuerpo (y la cabeza si el golpe es ahí) se inclina con un resorte amortiguado y vuelve a su posición.
- La simulación corre a paso fijo (90 Hz), independiente de los FPS.

## Gráficos

- Tone mapping neutro, iluminación de estudio (principal cálida, relleno frío y dos contraluces), sombras suaves.
- Posprocesado: render HDR con antialiasing MSAA y bloom sutil; sombra de contacto bajo los pies; piso que se funde con el fondo mediante niebla.
- Piel con mapa de normales de poros, brillo (sheen) rojizo y tonos en la cara (rubor, párpados, ojeras).
- Ojos con iris texturizado, córnea transparente con refracción y pestañas reales.
- Pelo con sombras propias (los mechones proyectan sombra sobre el cuerpo); telas con relieve (sarga del jean y tejido de punto).

## Estructura

```
modelo-3d-chica/
├── index.html          # Versión hecha por código
├── anime.html          # Versión anime / visor de modelos propios
├── modelos/            # Modelo VRM de ejemplo y su licencia
└── src/
    ├── main.js         # Escena, luces, cámara, panel (lil-gui), animación, exportación
    ├── fisica.js       # Colisiones, pelo, pollera, pelotas y resortes
    ├── post.js         # Posprocesado (MSAA, bloom)
    ├── personaje.js    # Modelo del cuerpo, cara, manos, zapatillas y ropa
    ├── pelo.js         # Casquete y mechones para cada peinado
    ├── materiales.js   # Materiales y texturas procedurales
    ├── util.js         # Splines, deformación de la cabeza, tubos afinados
    └── anime/
        ├── main.js     # Visor VRM/GLB/FBX: carga, apariencia, física, animación
        └── esqueleto.js# Detección de huesos, poses y colisiones por cápsulas
```

## Limitaciones

Es un modelo procedural hecho con primitivas matemáticas: se ve mucho más realista que un muñeco de formas básicas, pero no llega al nivel fotorrealista de un personaje esculpido a mano (por ejemplo, con MakeHuman, Blender o MetaHuman). El archivo `.glb` exportado se puede abrir y retocar en Blender.
