import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * The hero: the Blender model of the Game Boy and cartridge, with the ROM's
 * screen as a live texture. Scroll progress (0..1) drives one choreography:
 * cartridge hovers, slides in, lifts out and comes apart, goes back in, and the
 * camera settles on the screen.
 */

export interface Pose {
  az: number; // camera azimuth around the console, radians (0 = facing the screen)
  el: number; // camera elevation, radians
  dist: number; // metres from target
  tx: number;
  ty: number; // camera target
  lift: number; // cartridge raised out of the slot, metres
  tilt: number; // cartridge tipped back so its layers stack toward the camera, 0..1
  apart: number; // exploded view, 0..1
  shift: number; // wide screens: console pushed right, share of width. Phones: console centre, share of height from the top
  gbApart?: number; // the console itself in an exploded view, 0..1 (video only; the site never sets it)
}

// keyframes along the stage's scroll, in metres and radians
const KEYS: [number, Pose][] = [
  [0.0, { az: -0.5, el: 0.12, dist: 0.52, tx: 0.004, ty: 0.03, lift: 0.012, tilt: 0, apart: 0, shift: 0 }],
  [0.12, { az: -0.5, el: 0.12, dist: 0.52, tx: 0.004, ty: 0.03, lift: 0.012, tilt: 0, apart: 0, shift: 0 }],
  [0.3, { az: -2.45, el: 0.2, dist: 0.4, tx: 0, ty: 0.04, lift: 0, tilt: 0, apart: 0, shift: 0.2 }],
  [0.36, { az: -2.55, el: 0.2, dist: 0.4, tx: 0, ty: 0.04, lift: 0, tilt: 0, apart: 0, shift: 0.2 }],
  // the cartridge comes straight up out of the slot first, and only tips and opens once it's clear
  [0.44, { az: -2.8, el: 0.26, dist: 0.36, tx: 0, ty: 0.09, lift: 0.085, tilt: 0, apart: 0, shift: 0.18 }],
  [0.52, { az: -3.0, el: 0.32, dist: 0.3, tx: 0, ty: 0.13, lift: 0.085, tilt: 1, apart: 1, shift: 0.17 }],
  [0.6, { az: -3.1, el: 0.32, dist: 0.3, tx: 0, ty: 0.13, lift: 0.085, tilt: 1, apart: 1, shift: 0.17 }],
  // and closes up above the console before sliding back in
  [0.66, { az: -1.9, el: 0.22, dist: 0.38, tx: 0, ty: 0.07, lift: 0.085, tilt: 0, apart: 0, shift: 0.18 }],
  [0.72, { az: -0.4, el: 0.12, dist: 0.46, tx: 0, ty: 0.02, lift: 0, tilt: 0, apart: 0, shift: 0.18 }],
  [0.84, { az: 0, el: 0.02, dist: 0.24, tx: -0.0005, ty: 0.012, lift: 0, tilt: 0, apart: 0, shift: 0.12 }],
  [0.88, { az: 0, el: 0.02, dist: 0.24, tx: -0.0005, ty: 0.012, lift: 0, tilt: 0, apart: 0, shift: 0.12 }],
  [0.95, { az: 0, el: 0.04, dist: 0.68, tx: 0, ty: -0.062, lift: 0, tilt: 0, apart: 0, shift: 0.12 }],
  [1.0, { az: 0, el: 0.04, dist: 0.68, tx: 0, ty: -0.062, lift: 0, tilt: 0, apart: 0, shift: 0.12 }],
];

// phones (portrait): the console fills the top two thirds and the copy sits below it, never on top.
// `shift` is reused as the console's vertical centre, as a share of the height from the top.
const TALL_KEYS: [number, Pose][] = [
  [0.0, { az: -0.5, el: 0.1, dist: 0.64, tx: 0.002, ty: 0.045, lift: 0.012, tilt: 0, apart: 0, shift: 0.34 }],
  [0.12, { az: -0.5, el: 0.1, dist: 0.64, tx: 0.002, ty: 0.045, lift: 0.012, tilt: 0, apart: 0, shift: 0.34 }],
  [0.3, { az: -2.45, el: 0.2, dist: 0.5, tx: 0, ty: 0.05, lift: 0, tilt: 0, apart: 0, shift: 0.34 }],
  [0.36, { az: -2.55, el: 0.2, dist: 0.5, tx: 0, ty: 0.05, lift: 0, tilt: 0, apart: 0, shift: 0.34 }],
  [0.44, { az: -2.8, el: 0.3, dist: 0.46, tx: -0.002, ty: 0.09, lift: 0.085, tilt: 0, apart: 0, shift: 0.33 }],
  [0.52, { az: -3.0, el: 0.42, dist: 0.37, tx: -0.004, ty: 0.13, lift: 0.085, tilt: 1, apart: 1, shift: 0.32 }],
  [0.6, { az: -3.1, el: 0.42, dist: 0.37, tx: -0.004, ty: 0.13, lift: 0.085, tilt: 1, apart: 1, shift: 0.32 }],
  [0.66, { az: -1.9, el: 0.26, dist: 0.46, tx: 0, ty: 0.07, lift: 0.085, tilt: 0, apart: 0, shift: 0.33 }],
  [0.72, { az: -0.4, el: 0.12, dist: 0.5, tx: 0, ty: 0.02, lift: 0, tilt: 0, apart: 0, shift: 0.34 }],
  [0.84, { az: 0, el: 0.02, dist: 0.22, tx: -0.0005, ty: 0.03, lift: 0, tilt: 0, apart: 0, shift: 0.3 }],
  [0.88, { az: 0, el: 0.02, dist: 0.22, tx: -0.0005, ty: 0.03, lift: 0, tilt: 0, apart: 0, shift: 0.3 }],
  [0.95, { az: 0, el: 0.04, dist: 0.66, tx: 0, ty: -0.03, lift: 0, tilt: 0, apart: 0, shift: 0.31 }],
  [1.0, { az: 0, el: 0.04, dist: 0.66, tx: 0, ty: -0.03, lift: 0, tilt: 0, apart: 0, shift: 0.31 }],
];

const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function poseAt(p: number, keys = KEYS): Pose {
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, pa] = keys[i];
    const [b, pb] = keys[i + 1];
    if (p <= b) {
      const t = smooth(Math.min(1, Math.max(0, (p - a) / (b - a))));
      const out = {} as Pose;
      for (const k of Object.keys(pa) as (keyof Pose)[]) out[k] = (pa[k] ?? 0) + ((pb[k] ?? 0) - (pa[k] ?? 0)) * t;
      return out;
    }
  }
  return keys[keys.length - 1][1];
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
  private clock = new THREE.Timer();
  private still: boolean;
  private needs = true;
  private w = 1;
  private h = 1;

  private fixed: Pose | null = null;
  private pressed = new Map<string, { obj: THREE.Object3D; home: THREE.Vector3 }>();
  private wobble = 0;

  private plainFraming = false;

  // adaptive resolution: full sharpness while the GPU keeps up, a step down when frames start dropping
  private maxRatio = 2;
  private ratio = 2;
  private slow = 0;
  private fast = 0;
  private lastRender = 0;
  private lastPose = "";
  /** Phones: the strip of the canvas (px) left free between the nav and the hero's headline. */
  private band: { top: number; bottom: number } | null = null;
  /** The console's bounds in its own frame, cartridge included, measured once it loads. */
  private box: THREE.Box3 | null = null;

  constructor(canvas: HTMLCanvasElement, opts: { still?: boolean; fixed?: Partial<Pose>; plainFraming?: boolean; offline?: boolean } = {}) {
    this.still = !!opts.still;
    this.plainFraming = !!opts.plainFraming;
    if (opts.fixed) this.fixed = { ...KEYS[0][1], ...opts.fixed };
    // offline (the pitch video): frames are read back from the canvas after rendering
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.offline });
    // phones have 3x screens and less GPU: 1.75x keeps it sharp and the scroll smooth
    this.maxRatio = Math.min(window.devicePixelRatio, window.matchMedia("(pointer: coarse)").matches ? 1.75 : 2);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
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

  /** A URL, or the model's bytes already downloaded (see model.ts). */
  async load(source: string | ArrayBuffer) {
    // the model ships meshopt-compressed: npx @gltf-transform/cli meshopt in.glb kagiboy.glb (2.8 MB -> 1 MB)
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = typeof source === "string" ? await loader.loadAsync(source) : await loader.parseAsync(source, "/3d/");
    const root = gltf.scene;
    this.gb.add(root);
    // left the page while the model was downloading: free it straight away
    if (this.disposed) return freeObject(root);
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (o.name === "Screen") {
        // the LCD sits a hair above the recess floor; bias it forward so the two never fight
        m.polygonOffset = true;
        m.polygonOffsetFactor = -1;
        m.polygonOffsetUnits = -4;
        this.screen = m;
      } else if (m.name === "Prints") {
        // printed ink: blend over the face without hiding the LCD behind the bezel decal
        m.depthWrite = false;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -1;
        m.polygonOffsetUnits = -2;
        o.renderOrder = 2;
      }
    });
    this.box = new THREE.Box3().setFromObject(this.gb);
    this.box.max.y += 0.015; // the hero's lift and bob
    this.cart = root.getObjectByName("Cartridge") ?? null;
    this.body = root.getObjectByName("GameBoy") ?? null;
    if (this.body) {
      for (const n of Object.keys(GB_APART)) {
        const obj = this.body.getObjectByName(n);
        if (obj) this.gbPieces[n] = { obj, home: obj.position.clone() };
      }
    }
    if (this.cart) {
      this.cartHome.copy(this.cart.position);
      this.cartQuat.copy(this.cart.quaternion);
      for (const n of ["CartFront", "CartBack", "CartPCB", ...PARTS]) {
        const obj = this.cart.getObjectByName(n);
        if (obj) this.pieces[n] = { obj, home: obj.position.clone() };
      }
    }
    // compile the shaders now, in parallel where the GPU driver allows, instead of stalling the first frame
    await this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
    if (this.disposed) return;
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
    this.camera.fov = w / h < 0.8 && !this.plainFraming ? 34 : 30;
    this.camera.updateProjectionMatrix();
    this.needs = true;
  }

  /** Phones: where the hero's copy starts, so the console at rest fits above it instead of behind it. */
  setBand(top: number, bottom: number) {
    this.band = bottom - top > 80 ? { top, bottom } : null;
    this.needs = true;
  }

  /** Screen-space position (px) of a point on the console, in metres. */
  projectPoint(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.gb.localToWorld(new THREE.Vector3(x, y, z)).project(this.camera);
    const r = { width: this.w, height: this.h }; // kept current by resize(); no layout read per frame
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
    const r = { width: this.w, height: this.h }; // kept current by resize(); no layout read per frame
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  /**
   * Where a part's outline ends on screen: its projected vertices' extreme on one side (sx: -1 left,
   * 1 right), at the part's vertical middle. Exact for a rotated console, unlike a bounding box.
   */
  projectCorner(name: string, sx: number, _sy = 0): { x: number; y: number } | null {
    const obj = this.gb.getObjectByName(name);
    if (!obj) return null;
    this.gb.updateMatrixWorld(true);
    const r = { width: this.w, height: this.h }; // kept current by resize(); no layout read per frame
    const v = new THREE.Vector3();
    let best = sx > 0 ? -Infinity : Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 4000)); // a few thousand points is plenty
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(this.camera);
        const x = ((v.x + 1) / 2) * r.width;
        const y = ((1 - v.y) / 2) * r.height;
        best = sx > 0 ? Math.max(best, x) : Math.min(best, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    });
    if (!Number.isFinite(best)) return null;
    return { x: best, y: (top + bottom) / 2 };
  }

  get progress() {
    return this.current;
  }

  /**
   * Offline rendering for the pitch video: progress `p` along the same choreography (or an explicit
   * pose) at time `t` seconds, with no easing toward a target and no adaptive resolution, so every
   * frame is the same on every render.
   */
  renderAt(p: number, t: number, pose?: Partial<Pose>) {
    this.target = this.current = p;
    const tall = this.camera.aspect < 0.8 && !this.plainFraming;
    const at = pose ? { ...poseAt(p, tall ? TALL_KEYS : KEYS), ...pose } : poseAt(p, tall ? TALL_KEYS : KEYS);
    this.place(at, t, tall, pose ? 0 : Math.max(0, 1 - p / 0.12));
    this.renderer.render(this.scene, this.camera);
    this.needs = false;
  }

  /** Render one frame; returns the eased progress. */
  frame(): number {
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.getElapsed();
    // ease toward the scroll position, so scrubbing feels weighted
    const diff = this.target - this.current;
    this.current = Math.abs(diff) < 1e-4 ? this.target : this.current + diff * (1 - Math.exp(-dt * 7));
    const tall = this.camera.aspect < 0.8 && !this.plainFraming;
    const pose = this.fixed ?? poseAt(this.current, tall ? TALL_KEYS : KEYS);

    // a slow breath while the hero is at rest
    const rest = this.still || this.fixed ? 0 : Math.max(0, 1 - this.current / 0.12); // the demo console holds still so its buttons are easy to hit
    this.place(pose, t, tall, rest, this.fixed ? 0 : this.current <= 0.12 ? 1 : Math.max(0, 1 - (this.current - 0.12) / 0.18));

    // nothing moved and the screen didn't change: keep the last frame on the canvas
    const c = this.camera;
    const key = `${c.position.x.toFixed(6)},${c.position.y.toFixed(6)},${c.position.z.toFixed(6)},${this.gb.position.y.toFixed(6)},${this.gb.rotation.y.toFixed(6)},${pose.apart.toFixed(4)},${pose.lift.toFixed(5)}`;
    if (!this.needs && key === this.lastPose) return this.current;
    this.lastPose = key;
    this.adapt();
    this.renderer.render(this.scene, c);
    this.needs = false;
    return this.current;
  }

  /**
   * Phones, hero at rest: the console's real on-screen height decides the framing. When the copy below
   * leaves less room than the keyframes assume (short screens, browser bars, big type), the camera
   * backs off until the console fits the free band, and the console moves within the band only as far as
   * it has to. `hero` fades this out as the first scroll move takes over. Returns the vertical view offset.
   */
  private fitBand(pose: Pose, aim: (r: number) => void, hero: number): number {
    const plain = (0.5 - pose.shift) * this.h;
    if (!this.band || !this.box || hero <= 0) return plain;
    const c = this.camera;
    const pad = Math.max(12, this.h * 0.025);
    const top = this.band.top + pad;
    const bottom = this.band.bottom - pad;
    const span = () => {
      c.clearViewOffset();
      c.updateMatrixWorld();
      this.gb.updateMatrixWorld();
      let lo = Infinity;
      let hi = -Infinity;
      const v = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? this.box!.max.x : this.box!.min.x, i & 2 ? this.box!.max.y : this.box!.min.y, i & 4 ? this.box!.max.z : this.box!.min.z);
        const y = ((1 - v.applyMatrix4(this.gb.matrixWorld).project(c).y) / 2) * this.h;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      return { lo, hi };
    };
    let dist = pose.dist;
    let s = span();
    // on-screen size goes roughly as 1/distance; two passes land it inside the band
    for (let i = 0; i < 2 && s.hi - s.lo > bottom - top; i++) {
      dist *= (s.hi - s.lo) / (bottom - top);
      aim(pose.dist + (dist - pose.dist) * hero);
      s = span();
    }
    // keep the designed position unless the console would cross the band's edges
    const fit = Math.min(Math.max(plain, s.hi - bottom), s.lo - top);
    return plain + (fit - plain) * hero;
  }

  /** Puts the console, the cartridge and the camera where a pose says, at time `t`. */
  private place(pose: Pose, t: number, tall: boolean, rest: number, hero = 0) {
    const breathe = Math.sin(t * 0.9) * 0.004 * rest;
    const jolt = this.wobble ? (Math.random() - 0.5) * 0.06 * this.wobble : 0;
    this.gb.position.y = breathe + jolt * 0.04;
    this.gb.rotation.y = Math.sin(t * 0.45) * 0.05 * rest + jolt;
    this.gb.rotation.z = jolt * 0.6;

    const c = this.camera;
    const aim = (r: number) => {
      c.position.set(
        pose.tx + r * Math.cos(pose.el) * Math.sin(pose.az),
        pose.ty + r * Math.sin(pose.el),
        r * Math.cos(pose.el) * Math.cos(pose.az),
      );
      c.lookAt(pose.tx, pose.ty, 0);
    };
    aim(pose.dist);
    // wide screens: console right of the copy; tall screens: console in the upper half
    if (this.plainFraming) c.clearViewOffset();
    else if (!tall) c.setViewOffset(this.w, this.h, -pose.shift * this.w, 0, this.w, this.h);
    else c.setViewOffset(this.w, this.h, 0, this.fitBand(pose, aim, hero), this.w, this.h);

    // on tall screens the console body steps aside while the cartridge is apart, so nothing sits behind the copy
    if (this.body) this.body.visible = !(tall && pose.apart > 0.5);

    // the console's own exploded view: its layers float forward off the body (video only)
    const g = pose.gbApart ?? 0;
    for (const [n, { obj, home }] of Object.entries(this.gbPieces)) {
      obj.position.set(home.x, home.y, home.z + GB_APART[n] * g);
    }

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
  }

  /** Watch the time between rendered frames; trade a little resolution for smoothness only when needed. */
  private adapt() {
    const now = performance.now();
    const dt = now - this.lastRender;
    this.lastRender = now;
    if (dt > 100) return; // first frame after an idle stretch says nothing about the GPU
    if (dt > 22) this.slow++;
    else this.slow = Math.max(0, this.slow - 1);
    if (dt < 14) this.fast++;
    else this.fast = 0;
    let next = this.ratio;
    if (this.slow > 24 && this.ratio > 1) next = Math.max(1, this.ratio - 0.25);
    else if (this.fast > 240 && this.ratio < this.maxRatio) next = Math.min(this.maxRatio, this.ratio + 0.25);
    if (next !== this.ratio) {
      this.ratio = next;
      this.slow = 0;
      this.fast = 0;
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(this.w, this.h, false);
    }
  }

  get dirty() {
    return this.needs || this.wobble > 0 || Math.abs(this.target - this.current) > 1e-4;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.texture?.dispose();
    this.scene.environment?.dispose();
    freeObject(this.scene);
    this.renderer.dispose();
    // hand the GPU context back now; browsers cap live contexts and drop the oldest
    this.renderer.forceContextLoss();
  }

  private disposed = false;
  private gbPieces: Record<string, { obj: THREE.Object3D; home: THREE.Vector3 }> = {};
}

/** How far each console part floats forward (metres, along its front axis) when `gbApart` is 1. */
const GB_APART: Record<string, number> = {
  Body: 0,
  FacePrint: 0,
  Speaker: 0.03,
  DPad: 0.06,
  ButtonA: 0.06,
  ButtonB: 0.06,
  Start: 0.06,
  Select: 0.06,
  Bezel: 0.095,
  BezelPrint: 0.095,
  LED: 0.095,
  Screen: 0.125,
};

/** Free every geometry, material and texture under an object. */
function freeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
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
