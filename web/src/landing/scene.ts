import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * The hero: the Blender model of the Game Boy and cartridge, with the ROM's
 * screen as a live texture. Scroll progress (0..1) drives one choreography:
 * cartridge hovers, slides in, lifts out and comes apart, goes back in, and the
 * camera settles on the screen.
 */

interface Pose {
  az: number; // camera azimuth around the console, radians (0 = facing the screen)
  el: number; // camera elevation, radians
  dist: number; // metres from target
  tx: number;
  ty: number; // camera target
  lift: number; // cartridge raised out of the slot, metres
  tilt: number; // cartridge tipped back so its layers stack toward the camera, 0..1
  apart: number; // exploded view, 0..1
  shift: number; // console pushed right of centre on wide screens, as a share of width
}

// keyframes along the stage's scroll, in metres and radians
const KEYS: [number, Pose][] = [
  [0.0, { az: -0.5, el: 0.12, dist: 0.52, tx: 0.004, ty: 0.03, lift: 0.045, tilt: 0, apart: 0, shift: 0 }],
  [0.12, { az: -0.5, el: 0.12, dist: 0.52, tx: 0.004, ty: 0.03, lift: 0.045, tilt: 0, apart: 0, shift: 0 }],
  [0.3, { az: -2.45, el: 0.2, dist: 0.4, tx: 0, ty: 0.04, lift: 0, tilt: 0, apart: 0, shift: 0.2 }],
  [0.36, { az: -2.55, el: 0.2, dist: 0.4, tx: 0, ty: 0.04, lift: 0, tilt: 0, apart: 0, shift: 0.2 }],
  [0.52, { az: -3.0, el: 0.32, dist: 0.3, tx: 0, ty: 0.13, lift: 0.085, tilt: 1, apart: 1, shift: 0.17 }],
  [0.6, { az: -3.1, el: 0.32, dist: 0.3, tx: 0, ty: 0.13, lift: 0.085, tilt: 1, apart: 1, shift: 0.17 }],
  [0.72, { az: -0.4, el: 0.12, dist: 0.46, tx: 0, ty: 0.02, lift: 0, tilt: 0, apart: 0, shift: 0.18 }],
  [0.84, { az: 0, el: 0.02, dist: 0.24, tx: -0.0005, ty: 0.012, lift: 0, tilt: 0, apart: 0, shift: 0.12 }],
  [0.88, { az: 0, el: 0.02, dist: 0.24, tx: -0.0005, ty: 0.012, lift: 0, tilt: 0, apart: 0, shift: 0.12 }],
  [0.95, { az: 0, el: 0.04, dist: 0.68, tx: 0, ty: -0.062, lift: 0, tilt: 0, apart: 0, shift: 0.12 }],
  [1.0, { az: 0, el: 0.04, dist: 0.68, tx: 0, ty: -0.062, lift: 0, tilt: 0, apart: 0, shift: 0.12 }],
];

const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function poseAt(p: number): Pose {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, pa] = KEYS[i];
    const [b, pb] = KEYS[i + 1];
    if (p <= b) {
      const t = smooth(Math.min(1, Math.max(0, (p - a) / (b - a))));
      const out = {} as Pose;
      for (const k of Object.keys(pa) as (keyof Pose)[]) out[k] = pa[k] + (pb[k] - pa[k]) * t;
      return out;
    }
  }
  return KEYS[KEYS.length - 1][1];
}

export const PARTS = ["SecureElement", "MCU", "BLE", "Accel"] as const;
export type Part = (typeof PARTS)[number];

export class HeroScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  private gb = new THREE.Group();
  private cart: THREE.Object3D | null = null;
  private body: THREE.Object3D | null = null;
  private cartHome = new THREE.Vector3();
  private cartQuat = new THREE.Quaternion();
  private pieces: Record<string, { obj: THREE.Object3D; home: THREE.Vector3 }> = {};
  private screen: THREE.MeshStandardMaterial | null = null;
  private texture: THREE.Texture | null = null;
  private target = 0;
  private current = 0;
  private clock = new THREE.Clock();
  private still: boolean;
  private needs = true;
  private canvas: HTMLCanvasElement;
  private w = 1;
  private h = 1;

  private fixed: Pose | null = null;
  private pressed = new Map<string, { obj: THREE.Object3D; home: THREE.Vector3 }>();
  private wobble = 0;

  private plainFraming = false;

  constructor(canvas: HTMLCanvasElement, opts: { still?: boolean; fixed?: Partial<Pose>; plainFraming?: boolean } = {}) {
    this.canvas = canvas;
    this.still = !!opts.still;
    this.plainFraming = !!opts.plainFraming;
    if (opts.fixed) this.fixed = { ...KEYS[0][1], ...opts.fixed };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-0.5, 0.9, 0.7);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.3); // cool edge light from behind
    rim.position.set(0.6, 0.4, -0.8);
    const fill = new THREE.DirectionalLight(0xffe6ee, 0.6); // warm pink fill from the right
    fill.position.set(0.9, -0.1, 0.4);
    this.scene.add(key, rim, fill, new THREE.HemisphereLight(0xf4f6ff, 0xffeef3, 0.55));
    this.scene.add(this.gb);
    this.scene.add(contactShadow());
  }

  async load(url: string) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = gltf.scene;
    this.gb.add(root);
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name === "Screen") {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        this.screen = m;
      }
    });
    this.cart = root.getObjectByName("Cartridge") ?? null;
    this.body = root.getObjectByName("GameBoy") ?? null;
    if (this.cart) {
      this.cartHome.copy(this.cart.position);
      this.cartQuat.copy(this.cart.quaternion);
      for (const n of ["CartFront", "CartBack", "CartPCB", ...PARTS]) {
        const obj = this.cart.getObjectByName(n);
        if (obj) this.pieces[n] = { obj, home: obj.position.clone() };
      }
    }
    this.needs = true;
  }

  /** The ROM's screen: a canvas (live) or an image (still). */
  setScreen(source: HTMLCanvasElement | HTMLImageElement) {
    if (!this.screen) return;
    const tex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
    tex.flipY = false; // glTF UVs
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.texture?.dispose();
    this.texture = tex;
    this.screen.map = tex;
    this.screen.emissiveMap = tex;
    this.screen.emissive = new THREE.Color(0xffffff);
    this.screen.emissiveIntensity = 0.38;
    this.screen.color = new THREE.Color(0xffffff);
    this.screen.needsUpdate = true;
    this.needs = true;
  }

  screenChanged() {
    if (this.texture) this.texture.needsUpdate = true;
    this.needs = true;
  }

  setProgress(p: number) {
    this.target = Math.min(1, Math.max(0, p));
    this.needs = true;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the console framed on tall phones
    this.camera.fov = w / h < 0.8 && !this.plainFraming ? 42 : 30;
    this.camera.updateProjectionMatrix();
    this.needs = true;
  }

  /** Screen-space position (px) of a point on the console, in metres. */
  projectPoint(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.gb.localToWorld(new THREE.Vector3(x, y, z)).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  /** Push a button mesh in (DPad, ButtonA, ButtonB, Start, Select). */
  press(name: string, down: boolean) {
    let entry = this.pressed.get(name);
    if (!entry) {
      const obj = this.gb.getObjectByName(name);
      if (!obj) return;
      entry = { obj, home: obj.position.clone() };
      this.pressed.set(name, entry);
    }
    entry.obj.position.z = entry.home.z - (down ? 0.0016 : 0);
    this.needs = true;
  }

  /** 0..1: how hard the console is being shaken. */
  shake(amount: number) {
    this.wobble = amount;
    this.needs = true;
  }

  /** Screen-space position (px) of any named part (cartridge pieces or console buttons). */
  project(name: string): { x: number; y: number } | null {
    const obj = this.pieces[name]?.obj ?? this.gb.getObjectByName(name);
    if (!obj) return null;
    const v = obj.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  get progress() {
    return this.current;
  }

  /** Render one frame; returns the eased progress. */
  frame(): number {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    // ease toward the scroll position, so scrubbing feels weighted
    const diff = this.target - this.current;
    this.current = Math.abs(diff) < 1e-4 ? this.target : this.current + diff * (1 - Math.exp(-dt * 7));
    const pose = this.fixed ?? poseAt(this.current);

    // a slow breath while the hero is at rest
    const rest = this.still || this.fixed ? 0 : Math.max(0, 1 - this.current / 0.12); // the demo console holds still so its buttons are easy to hit
    const breathe = Math.sin(t * 0.9) * 0.004 * rest;
    const jolt = this.wobble ? (Math.random() - 0.5) * 0.06 * this.wobble : 0;
    this.gb.position.y = breathe + jolt * 0.04;
    this.gb.rotation.y = Math.sin(t * 0.45) * 0.05 * rest + jolt;
    this.gb.rotation.z = jolt * 0.6;

    const c = this.camera;
    const tall = c.aspect < 0.8 && !this.plainFraming;
    const r = pose.dist * (tall ? 1.7 : 1);
    c.position.set(
      pose.tx + r * Math.cos(pose.el) * Math.sin(pose.az),
      pose.ty + r * Math.sin(pose.el),
      r * Math.cos(pose.el) * Math.cos(pose.az),
    );
    c.lookAt(pose.tx, pose.ty, 0);
    // wide screens: console right of the copy; tall screens: console in the upper half
    if (this.plainFraming) c.clearViewOffset();
    else if (!tall) c.setViewOffset(this.w, this.h, -pose.shift * this.w, 0, this.w, this.h);
    else c.setViewOffset(this.w, this.h, 0, this.h * 0.3, this.w, this.h);

    // on tall screens the console body steps aside while the cartridge is apart, so nothing sits behind the copy
    if (this.body) this.body.visible = !(tall && pose.apart > 0.5);

    if (this.cart) {
      const bob = Math.sin(t * 1.3) * 0.003 * rest;
      this.cart.position.set(this.cartHome.x, this.cartHome.y + pose.lift + bob, this.cartHome.z - pose.tilt * 0.02);
      // tip the cartridge back (label side up) so its layers stack toward the camera when it comes apart
      this.cart.quaternion
        .setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.tilt * 0.95)
        .multiply(this.cartQuat);
      const s = pose.apart;
      // offsets in the cartridge's own frame: z = through its thickness (label side +), x = sideways
      // shells slide well clear to either side so the board and its chips are in plain view
      const z: Record<string, number> = { CartFront: 0.03, CartBack: -0.026, CartPCB: 0, SecureElement: 0.008, MCU: 0.008, BLE: 0.008, Accel: 0.008 };
      const x: Record<string, number> = { CartFront: 0.05, CartBack: -0.05 };
      for (const [n, { obj, home }] of Object.entries(this.pieces)) {
        obj.position.set(home.x + (x[n] ?? 0) * s, home.y, home.z + (z[n] ?? 0) * s);
      }
    }

    this.renderer.render(this.scene, c);
    this.needs = false;
    return this.current;
  }

  get dirty() {
    return this.needs || this.wobble > 0 || Math.abs(this.target - this.current) > 1e-4;
  }

  dispose() {
    this.texture?.dispose();
    this.renderer.dispose();
  }
}

/** A soft round shadow under the console, so it sits on the page instead of floating. */
function contactShadow(): THREE.Mesh {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(92,96,140,0.28)");
  grad.addColorStop(0.55, "rgba(120,110,160,0.10)");
  grad.addColorStop(1, "rgba(120,110,160,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.0755;
  return mesh;
}
