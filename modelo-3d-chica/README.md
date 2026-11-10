# Modelo 3D de una chica (Three.js)

Personaje 3D estilizado (estilo chibi) construido 100% por código con primitivas de [Three.js](https://threejs.org/) r160. No necesita instalar nada ni hacer build.

## Cómo verlo

Los módulos ES no cargan desde `file://`, así que hay que levantar un servidor local:

```bash
cd modelo-3d-chica
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Funciones

- Cámara orbital: arrastrar para rotar, rueda para zoom, click derecho para mover.
- Animación idle: respiración, balanceo, parpadeo y movimiento de la colita.
- Botón **Saludar**: levanta el brazo y saluda con la mano.
- Selectores de color para el pelo y el vestido.
- **Exportar .glb**: descarga el modelo en formato glTF binario (se puede abrir en Blender, Unity, Godot, etc.).

## Estructura

```
modelo-3d-chica/
├── index.html     # Página, UI e importmap de Three.js (CDN unpkg)
└── src/
    ├── chica.js   # Construcción del personaje (geometrías y materiales)
    └── main.js    # Escena, luces, cámara, animación y exportación
```
