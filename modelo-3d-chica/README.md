# Modelo 3D personalizable (Three.js)

Personaje femenino adulto en 3D, generado 100% por código con [Three.js](https://threejs.org/) r160 (sin modelos externos). No requiere instalar nada ni compilar.

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
| Acciones | Saludar, pausar animación, vista de cara/cuerpo, aleatorio, restablecer, exportar `.glb` |

La configuración se guarda en el navegador (`localStorage`) y se recupera al volver a abrir la página.

## Cómo está hecho

- **Torso**: superficie paramétrica con secciones elípticas interpoladas por splines (Catmull-Rom) a lo largo de la altura, más deformaciones gaussianas para busto y glúteos. La misma función genera la ropa (inflada levemente) y la usa el pelo para no atravesar el cuerpo.
- **Extremidades**: superficies de revolución (`LatheGeometry`) con perfiles de radio anatómicos; la pierna es una sola pieza (sin costura en la rodilla).
- **Cabeza**: esfera deformada (mandíbula, mentón, nuca) con cuencas de los ojos, arco superciliar, pómulos, nariz y aletas modelados por desplazamiento. Ojos con esclerótica, iris y pupila con *clearcoat*, párpados animados (parpadeo), cejas y labios como tubos afinados.
- **Pelo**: casquete con textura + cientos de *hair cards* (cintas con textura de mechones y *alpha test*), igual que en los videojuegos. Cada mechón se calcula sobre el cuero cabelludo y cae con gravedad, apoyándose sobre hombros, espalda y busto.
- **Materiales**: piel con `MeshPhysicalMaterial` (sheen + clearcoat), denim y tejido con texturas procedurales en `canvas`, iluminación con entorno PMREM, sombras suaves y *tone mapping* ACES.

## Estructura

```
modelo-3d-chica/
├── index.html          # Página e importmap de Three.js (CDN unpkg)
└── src/
    ├── main.js         # Escena, luces, cámara, panel (lil-gui), animación, exportación
    ├── personaje.js    # Modelo del cuerpo, cara, manos, zapatillas y ropa
    ├── pelo.js         # Casquete y mechones para cada peinado
    ├── materiales.js   # Materiales y texturas procedurales
    └── util.js         # Splines, deformación de la cabeza, tubos afinados
```

## Limitaciones

Es un modelo procedural hecho con primitivas matemáticas: se ve mucho más realista que un muñeco de formas básicas, pero no llega al nivel fotorrealista de un personaje esculpido a mano (por ejemplo, con MakeHuman, Blender o MetaHuman). El archivo `.glb` exportado se puede abrir y retocar en Blender.
