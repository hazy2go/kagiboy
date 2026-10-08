import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * A technical exploded view for the demo video (the site doesn't use it): the console and the
 * cartridge lying flat, seen through an isometric orthographic camera, every layer lifted
 * straight up on one axis, with dashed guides down to where it came from.
 */

type Layer = { names: string[]; level: number };
// level 0 stays put; each level above rises one step. Order follows how the parts really stack.
const GB_LAYERS: Layer[] = [
  { names: ["Body", "FacePrint", "Speaker"], level: 0 },
  { names: ["DPad", "ButtonA", "ButtonB", "Start", "Select"], level: 1 },
  { names: ["Screen"], level: 2 },
  { names: ["Bezel", "BezelPrint", "LED"], level: 3 },
];
const CART_LAYERS: Layer[] = [
  { names: ["CartBack"], level: 0 },
  { names: ["CartPCB"], level: 1 },
  { names: ["SecureElement", "MCU", "BLE", "Accel"], level: 2 },
  { names: ["CartFront"], level: 3 },
];
const GB_STEP = 0.05; // metres per level
const CART_STEP = 0.052;

export type ExplodeAnchor = "gb:Bezel" | "gb:Screen" | "gb:DPad" | "gb:Body" | "cart:CartFront" | "cart:SecureElement" | "cart:MCU" | "cart:BLE" | "cart:Accel" | "cart:CartPCB" | "cart:CartBack";

export class ExplodeScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private parts: { obj: THREE.Object3D; home: THREE.Vector3; level: number; step: number; group: "gb" | "cart" }[] = [];
  private guides: { line: THREE.Line; obj: THREE.Object3D; home: THREE.Vector3; level: number; step: number; group: THREE.Object3D }[] = [];
  private gbRoot = new THREE.Group();
  private cartRoot = new THREE.Group();
  private screenMat: THREE.MeshStandardMaterial | null = null;
  private w = 1;
  private h = 1;

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.w = w;
    this.h = h;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.8;
    // lit from above now that everything lies flat
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(-0.4, 1, 0.5);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.0);
    rim.position.set(0.7, 0.5, -0.6);
    const fill = new THREE.DirectionalLight(0xffe6ee, 0.5);
    fill.position.set(0.8, 0.3, 0.8);
    this.scene.add(key, rim, fill, new THREE.HemisphereLight(0xf4f6ff, 0xffeef3, 0.6));
    this.scene.add(this.gbRoot, this.cartRoot);
  }

  async load(url: string) {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const gb = gltf.scene.getObjectByName("GameBoy")!;
    const cart = gltf.scene.getObjectByName("Cartridge")!;
    // lay both flat, face up: their fronts point along +z, so a quarter turn about x turns +z into +y
    for (const [node, root] of [
      [gb, this.gbRoot],
      [cart, this.cartRoot],
    ] as const) {
      node.removeFromParent();
      node.position.set(0, 0, 0);
      node.quaternion.identity();
      const holder = new THREE.Group();
      holder.rotation.x = -Math.PI / 2;
      holder.add(node);
      root.add(holder);
      // centre it on its own footprint
      const box = new THREE.Box3().setFromObject(holder);
      const c = box.getCenter(new THREE.Vector3());
      holder.position.set(-c.x, -box.min.y, -c.z);
    }
    // side by side: the console left, the cartridge right
    this.gbRoot.position.set(-0.07, 0, 0.02);
    this.cartRoot.position.set(0.075, 0, -0.03);
    this.cartRoot.rotation.y = 0;

    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (o.name === "Screen" && m) this.screenMat = m;
    });
    const dash = new THREE.LineDashedMaterial({ color: 0x8a90b8, dashSize: 0.003, gapSize: 0.0025, transparent: true, opacity: 0.9 });
    for (const [node, layers, step, group] of [
      [gb, GB_LAYERS, GB_STEP, "gb"],
      [cart, CART_LAYERS, CART_STEP, "cart"],
    ] as const) {
      for (const { names, level } of layers) {
        for (const n of names) {
          const obj = node.getObjectByName(n);
          if (!obj) continue;
          this.parts.push({ obj, home: obj.position.clone(), level, step, group });
          // one guide per moving part, from its centre straight down to where it sits
          if (level > 0 && ["Bezel", "Screen", "DPad", "ButtonA", "CartFront", "CartPCB", "SecureElement", "MCU", "BLE", "Accel"].includes(n)) {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
            const line = new THREE.Line(geo, dash);
            this.scene.add(line);
            this.guides.push({ line, obj, home: obj.position.clone(), level, step, group: node });
          }
        }
      }
    }
    this.scene.updateMatrixWorld(true);
  }

  setScreen(img: HTMLImageElement) {
    if (!this.screenMat) return;
    const tex = new THREE.Texture(img);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.screenMat.map = tex;
    this.screenMat.emissiveMap = tex;
    this.screenMat.emissive = new THREE.Color(0xffffff);
    this.screenMat.emissiveIntensity = 0.55;
    this.screenMat.needsUpdate = true;
  }

  /** p: 0 assembled .. 1 fully apart (the cartridge follows a beat later). view: the camera. */
  pose(p: number, view: { az: number; el: number; zoom: number; cx: number; cy: number; cz: number }) {
    const cartP = Math.min(1, Math.max(0, (p - 0.15) / 0.85));
    // the parts' local +z is world up (see load); a level rises level × step
    for (const part of this.parts) {
      const q = part.group === "gb" ? Math.min(1, p / 0.85) : cartP;
      part.obj.position.set(part.home.x, part.home.y, part.home.z + part.level * part.step * q);
    }
    this.scene.updateMatrixWorld(true);
    for (const g of this.guides) {
      const top = new THREE.Vector3();
      new THREE.Box3().setFromObject(g.obj).getCenter(top);
      // where the same point sits with the part at home: straight below
      const lift = (g.obj.position.z - g.home.z);
      const bottom = top.clone().setY(top.y - lift);
      const geo = g.line.geometry as THREE.BufferGeometry;
      geo.setFromPoints([bottom, top]);
      g.line.computeLineDistances();
      g.line.visible = lift > 0.002;
    }
    // isometric-ish orthographic camera around the centre
    const c = this.camera;
    const r = 1;
    const target = new THREE.Vector3(view.cx, view.cy, view.cz);
    c.position.set(target.x + r * Math.cos(view.el) * Math.sin(view.az), target.y + r * Math.sin(view.el), target.z + r * Math.cos(view.el) * Math.cos(view.az));
    c.lookAt(target);
    const half = view.zoom / 2;
    const aspect = this.w / this.h;
    c.left = -half * aspect;
    c.right = half * aspect;
    c.top = half;
    c.bottom = -half;
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** where a part's centre lands on screen, in px (call after pose) */
  project(anchor: ExplodeAnchor): { x: number; y: number } {
    const [group, name] = anchor.split(":");
    const root = group === "gb" ? this.gbRoot : this.cartRoot;
    const obj = root.getObjectByName(name);
    if (!obj) return { x: -999, y: -999 };
    const v = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
