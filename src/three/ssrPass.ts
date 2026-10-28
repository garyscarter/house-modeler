import { Pass } from "postprocessing";
import * as THREE from "three";
import { SSRPass } from "three/examples/jsm/postprocessing/SSRPass.js";

/** Window glass (see textures.ts glassMaterial): real transmission on high, or the film with its lit-room mask. */
const isGlass = (m: THREE.Material) => ((m as THREE.MeshPhysicalMaterial).transmission ?? 0) > 0 || m.userData?.litMask !== undefined;

/** How strongly window glass reflects; real glass is about 4% face on, rising at grazing angles (the pass's Fresnel term). */
const GLASS = 0.25;

/**
 * How strongly a surface takes screen-space reflections, 0 (not at all) to 1:
 * polished metal and mirrors most, then gloss finishes by their roughness
 * (gloss units, porcelain and tiled floors), and, with `glass`, the window
 * panes. Matt and satin finishes, walls, the lawn and anything that isn't a
 * standard material (the sky dome) get none. Rounded to twentieths, so the
 * mask needs only a handful of materials.
 */
export function reflectance(m: THREE.Material, glass: boolean): number {
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial || !s.visible) return 0;
  let k = 0;
  if (isGlass(s)) k = glass ? GLASS : 0;
  else if (s.metalness >= 0.6 && s.roughness <= 0.4) k = 0.9 - s.roughness;
  else if (s.roughness <= 0.3) k = 0.1 + (0.3 - s.roughness) * 2;
  return Math.round(Math.min(1, k) * 20) / 20;
}

interface SSRInternals {
  _renderOverride(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget, clearColor: number, clearAlpha: number): void;
  _renderPass(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null, clearColor?: number, clearAlpha?: number): void;
  blurRenderTarget2: THREE.WebGLRenderTarget;
  blurMaterial2: THREE.ShaderMaterial;
}

export interface ReflectionOptions {
  /**
   * Reflect in the window glass too (default off). Glass is transmissive, so the depth and normals are the pane's
   * while the colour is the room seen through it: a ray off the pane picks up the floor beside it and lays a milky
   * ghost of it over the view through the glass. The panes keep their environment reflection of the sky either way.
   */
  glass?: boolean;
  /** Overall strength, multiplying each surface's own (see `reflectance`), before the Fresnel term. */
  opacity?: number;
  /** Longest ray, metres (view space). */
  maxDistance?: number;
  /** How thick a surface is taken to be when a ray passes behind it, metres. */
  thickness?: number;
  /** Ray-march resolution relative to the frame. */
  resolutionScale?: number;
}

/**
 * Three's SSRPass inside a pmndrs composer. The pass's own render draws the
 * scene again for its colour and depth; here the composer's buffers stand in
 * for them (the frame so far, ambient occlusion included, and the composer's
 * depth texture), so only the normals and the mask are extra scene draws. The
 * mask holds each mesh's strength (see `reflectance`), drawn with flat
 * stand-in materials; they and the normal material take the section cut's
 * clipping planes from the scene, so geometry above the cut neither reflects
 * nor hides the rooms below it. Everything is linear HDR, as the composer
 * is: the ray-march and blur targets are half float so bright sky and sun
 * keep their range until the tone mapping at the end. Reflections are worked
 * out afresh every frame (nothing accumulates), so a frame on demand is
 * complete. Like any screen-space reflection, only what is on screen can be
 * reflected: the sky and the garden behind the camera come from the
 * environment map, as before.
 */
export class ReflectionsPass extends Pass {
  readonly ssr: SSRPass;
  private depth: THREE.Texture | null = null;
  private glass: boolean;
  private reflectiveMeshes: THREE.Mesh[] = [];
  private strengths: number[] = [];
  private others: THREE.Mesh[] = [];
  /** Mask materials by strength (see `reflectance`). */
  private maskMaterials = new Map<number, THREE.MeshBasicMaterial>();
  private hidden: THREE.Object3D[] = [];
  private saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private clearColor = new THREE.Color();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, options: ReflectionOptions = {}) {
    super("ReflectionsPass", scene, camera);
    this.needsDepthTexture = true;
    this.glass = options.glass ?? false;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    // An empty list turns on SELECTIVE: only pixels lit in the mask reflect.
    this.ssr = new SSRPass({ renderer, scene, camera, width: size.x, height: size.y, selects: [], groundReflector: null });
    const ssr = this.ssr as SSRPass & SSRInternals;
    // The ray-march and blur targets are half float here (three's are 8-bit), which keeps two of its NaNs that 8-bit
    // storage hid: a pixel that misses returns from main() without writing a colour (undefined in GLSL), and the blur
    // divides by the summed alpha, 0 wherever nothing reflects. Either NaN then survives the blend over the frame.
    // The mask holds each surface's strength, not just on or off: scale each reflection by it.
    ssr.ssrMaterial.fragmentShader = ssr.ssrMaterial.fragmentShader
      .replace("void main(){", "void main(){\n\t\t\tgl_FragColor = vec4(0.0);")
      .replace("float op=opacity;", "float op=opacity*metalness;");
    ssr.ssrMaterial.needsUpdate = true;
    for (const blur of [ssr.blurMaterial, ssr.blurMaterial2]) {
      blur.fragmentShader = blur.fragmentShader.replace("ct.rgb*ct.a*coeSide)/a;", "ct.rgb*ct.a*coeSide)/max(a,1e-4);");
      blur.needsUpdate = true;
    }
    // Half float keeps the frame's range; linear filtering smooths the half-resolution result as it is laid over the frame.
    for (const rt of [ssr.ssrRenderTarget, ssr.blurRenderTarget, ssr.blurRenderTarget2]) {
      rt.texture.type = THREE.HalfFloatType;
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
    }
    ssr.opacity = options.opacity ?? 1;
    ssr.maxDistance = options.maxDistance ?? 12;
    ssr.thickness = options.thickness ?? 0.08;
    ssr.resolutionScale = options.resolutionScale ?? 0.5;
  }

  setGlass(glass: boolean) {
    this.glass = glass;
  }

  override setDepthTexture(depthTexture: THREE.Texture) {
    this.depth = depthTexture;
  }

  override setSize(width: number, height: number) {
    this.ssr.setSize(width, height);
  }

  /** Sorts the visible meshes into reflective (with their strength) and not, and finds the clipping planes the section cut put on their materials. */
  private survey(): THREE.Plane[] | null {
    this.reflectiveMeshes.length = 0;
    this.strengths.length = 0;
    this.others.length = 0;
    this.hidden.length = 0;
    let planes: THREE.Plane[] | null = null;
    this.scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) {
        // Lines, points and sprites have no normals to draw: left out of both passes.
        if ((o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) this.hidden.push(o);
        return;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!planes) for (const m of mats) if (m.clippingPlanes?.length) planes = m.clippingPlanes;
      let k = 0;
      for (const m of mats) k = Math.max(k, reflectance(m, this.glass));
      if (k > 0) {
        this.reflectiveMeshes.push(mesh);
        this.strengths.push(k);
      } else this.others.push(mesh);
    });
    return planes;
  }

  /**
   * Draws the visible meshes into `target` with stand-in materials (normals, or the mask), swapped in per mesh
   * rather than through `scene.overrideMaterial`: an override still sends the glass down three's transmission
   * path, which then draws the scene again into the shared transmission buffer.
   */
  private drawWith(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, reflectiveMat: (i: number) => THREE.Material, otherMat: THREE.Material) {
    const scene = this.scene;
    const background = scene.background;
    const saved = this.saved;
    this.reflectiveMeshes.forEach((m, i) => {
      saved.set(m, m.material);
      m.material = reflectiveMat(i);
    });
    for (const m of this.others) {
      saved.set(m, m.material);
      m.material = otherMat;
    }
    for (const o of this.hidden) o.visible = false;
    const clearColor = renderer.getClearColor(this.clearColor);
    const clearAlpha = renderer.getClearAlpha();
    scene.background = null;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    try {
      renderer.render(scene, this.camera);
    } finally {
      for (const [m, mat] of saved) m.material = mat;
      saved.clear();
      for (const o of this.hidden) o.visible = true;
      scene.background = background;
      renderer.setClearColor(clearColor, clearAlpha);
    }
  }

  private maskFor(k: number, planes: THREE.Plane[] | null) {
    let m = this.maskMaterials.get(k);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(k) });
      m.clippingPlanes = planes;
      this.maskMaterials.set(k, m);
    }
    return m;
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, outputBuffer: THREE.WebGLRenderTarget | null) {
    const ssr = this.ssr as SSRPass & SSRInternals;
    const camera = this.camera as THREE.PerspectiveCamera;
    const planes = this.survey();
    const target = this.renderToScreen ? null : outputBuffer;
    // Nothing glossy on screen: pass the frame through.
    if (!this.reflectiveMeshes.length || !this.depth) {
      ssr.copyMaterial.uniforms.tDiffuse.value = inputBuffer.texture;
      ssr.copyMaterial.blending = THREE.NoBlending;
      ssr._renderPass(renderer, ssr.copyMaterial, target);
      return;
    }
    for (const m of [ssr.normalMaterial, ssr.metalnessOffMaterial, ...this.maskMaterials.values()]) {
      if (m.clippingPlanes !== planes) {
        m.clippingPlanes = planes;
        m.needsUpdate = true;
      }
    }
    const u = ssr.ssrMaterial.uniforms;
    u.tDiffuse.value = inputBuffer.texture;
    u.tDepth.value = this.depth;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    u.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
    u.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    u.opacity.value = ssr.opacity;
    u.maxDistance.value = ssr.maxDistance;
    u.thickness.value = ssr.thickness;

    const normal = ssr.normalMaterial;
    this.drawWith(renderer, ssr.normalRenderTarget, () => normal, normal);
    this.drawWith(renderer, ssr.metalnessRenderTarget, (i) => this.maskFor(this.strengths[i], planes), ssr.metalnessOffMaterial);
    ssr._renderPass(renderer, ssr.ssrMaterial, ssr.ssrRenderTarget, 0, 0);
    ssr._renderPass(renderer, ssr.blurMaterial, ssr.blurRenderTarget);
    ssr._renderPass(renderer, ssr.blurMaterial2, ssr.blurRenderTarget2);

    // The frame, then the blurred reflections over it by their alpha.
    ssr.copyMaterial.uniforms.tDiffuse.value = inputBuffer.texture;
    ssr.copyMaterial.blending = THREE.NoBlending;
    ssr._renderPass(renderer, ssr.copyMaterial, target);
    ssr.copyMaterial.uniforms.tDiffuse.value = ssr.blurRenderTarget2.texture;
    ssr.copyMaterial.blending = THREE.NormalBlending;
    ssr._renderPass(renderer, ssr.copyMaterial, target);
  }

  override dispose() {
    // pmndrs' dispose frees every texture the pass holds: the depth texture is the composer's.
    this.depth = null;
    this.ssr.dispose();
    this.ssr.ssrMaterial.dispose();
    this.ssr.blurMaterial2.dispose();
    for (const m of this.maskMaterials.values()) m.dispose();
    this.maskMaterials.clear();
    super.dispose();
  }
}
