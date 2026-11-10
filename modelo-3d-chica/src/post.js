import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Posprocesado: render HDR con antialiasing MSAA, bloom sutil y salida con tone mapping. */
export function crearPost(renderer, escena, camara) {
  const tam = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(tam.x, tam.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(escena, camara));
  const bloom = new UnrealBloomPass(new THREE.Vector2(tam.x, tam.y), 0.12, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    composer,
    bloom,
    calidad(nivel) {
      bloom.enabled = nivel !== 'Baja';
    },
    tamano(w, h) {
      composer.setSize(w, h);
    },
  };
}
