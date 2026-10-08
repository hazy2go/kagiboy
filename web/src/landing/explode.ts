import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * A technical exploded view for the demo video (the site doesn't use it): the console and the
 * cartridge lying flat, seen through an isometric orthographic camera, every layer lifted straight
 * up with dashed guides down to where it came from.
 *
 * The model is the console's outside only, so the inside is built here: the body is split into a
 * front and a back shell with clipping planes, and a main board (CPU, RAM, cartridge connector,
 * speaker) and four AA batteries sit between them, stacked the way a real DMG is.
 */

// how high each console part rises (metres), top to bottom: lens, front shell, buttons, screen,
// board, batteries, back shell. Uneven on purpose: the front shell clears the buttons and the
// screen by enough that both stay in view under it.
const GB_LIFT: Record<string, number> = {
  BackShell: 0,
  Batteries: 0.026,
  Board: 0.058,
  Screen: 0.098,
  DPad: 0.122,
  ButtonA: 0.122,
  ButtonB: 0.122,
  Start: 0.122,
  Select: 0.122,
  FrontShell: 0.19,
  FacePrint: 0.19,
  Speaker: 0.19,
  Bezel: 0.25,
  BezelPrint: 0.25,
  LED: 0.25,
};
const CART_LEVELS: Record<string, number> = { CartBack: 0, CartPCB: 1, SecureElement: 2, MCU: 2, BLE: 2, Accel: 2, CartFront: 3 };
const CART_STEP = 0.05; // metres per cartridge level
const GUIDED = ["Bezel", "FacePrint", "DPad", "ButtonA", "Screen", "CPU", "Batteries", "CartFront", "CartPCB", "SecureElement", "MCU", "BLE", "Accel"];

export type ExplodeAnchor =
  | "gb:Bezel"
  | "gb:FacePrint"
  | "gb:Screen"
  | "gb:DPad"
  | "gb:CPU"
  | "gb:Batteries"
  | "cart:CartFront"
  | "cart:SecureElement"
  | "cart:MCU"
  | "cart:BLE"
  | "cart:Accel"
  | "cart:CartPCB"
  | "cart:CartBack";

type Part = { obj: THREE.Object3D; home: THREE.Vector3; dir: THREE.Vector3; level: number; step: number; group: "gb" | "cart" };

export class ExplodeScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private parts: Part[] = [];
  private guides: { line: THREE.Line; part: Part }[] = [];
  private gbRoot = new THREE.Group();
  private cartRoot = new THREE.Group();
  private screenMat: THREE.MeshStandardMaterial | null = null;
  private frontPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private backPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private bodyMid = 0;
  private w = 1;
  private h = 1;

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.localClippingEnabled = true;
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
      const box = new THREE.Box3().setFromObject(holder);
      const c = box.getCenter(new THREE.Vector3());
      holder.position.set(-c.x, -box.min.y, -c.z);
    }
    // side by side: the console left, the cartridge right
    this.gbRoot.position.set(-0.075, 0, 0.02);
    this.cartRoot.position.set(0.085, 0, -0.035);
    this.scene.updateMatrixWorld(true);

    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (o.name === "Screen" && m) this.screenMat = m;
    });

    this.buildShells(gb);
    this.buildInside(gb);

    const up = new THREE.Vector3(0, 1, 0);
    const add = (obj: THREE.Object3D, level: number, step: number, group: "gb" | "cart") => {
      // world up, in the part's parent space (the parents only rotate and move)
      const q = obj.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
      const part: Part = { obj, home: obj.position.clone(), dir: up.clone().applyQuaternion(q), level, step, group };
      this.parts.push(part);
      if (level * step > 0 && GUIDED.includes(obj.name)) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), DASH);
        this.scene.add(line);
        this.guides.push({ line, part });
      }
    };
    for (const [n, lift] of Object.entries(GB_LIFT)) {
      const obj = this.gbRoot.getObjectByName(n);
      if (obj) add(obj, 1, lift, "gb");
    }
    for (const [n, level] of Object.entries(CART_LEVELS)) {
      const obj = cart.getObjectByName(n);
      if (obj) add(obj, level, CART_STEP, "cart");
    }
  }

  /** The one-piece body becomes a front and a back shell: the same mesh drawn twice, clipped at its middle. */
  private buildShells(gb: THREE.Object3D) {
    const body = gb.getObjectByName("Body") as THREE.Mesh;
    const box = new THREE.Box3().setFromObject(body);
    this.bodyMid = (box.min.y + box.max.y) / 2;
    const front = body.material as THREE.MeshStandardMaterial;
    front.side = THREE.DoubleSide; // the inside of a cut shell shows
    front.clippingPlanes = [this.frontPlane];
    const back = body.clone();
    back.name = "BackShell";
    back.material = front.clone();
    (back.material as THREE.MeshStandardMaterial).clippingPlanes = [this.backPlane];
    body.parent!.add(back);
    body.name = "FrontShell";
  }

  /** The inside the model doesn't have: a main board and four AA batteries, in the console's footprint. */
  private buildInside(gb: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(gb.getObjectByName("FrontShell")!);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const screen = new THREE.Box3().setFromObject(gb.getObjectByName("Screen")!).getCenter(new THREE.Vector3());
    const topSign = Math.sign(screen.z - c.z) || -1; // which way the cartridge slot end lies, along z
    const local = (x: number, y: number, z: number) => this.gbRoot.worldToLocal(new THREE.Vector3(x, y, z));
    const mat = (color: number, rough = 0.55, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

    // main board: green, with the DMG's big chips, its cartridge connector and the speaker
    const board = new THREE.Group();
    board.name = "Board";
    const pcbW = size.x * 0.84;
    const pcbD = size.z * 0.86;
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(pcbW, 0.0016, pcbD), mat(0x2f6b4c, 0.6));
    board.add(pcb);
    const chip = (name: string, w: number, d: number, x: number, z: number, color = 0x1d1f24, h = 0.0014) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, 0.4));
      m.name = name;
      m.position.set(x, 0.0008 + h / 2, z);
      board.add(m);
      return m;
    };
    chip("CPU", 0.016, 0.016, -0.004, topSign * 0.01);
    chip("RAM", 0.012, 0.007, 0.016, topSign * 0.012);
    chip("VRAM", 0.012, 0.007, 0.016, topSign * 0.022);
    chip("Connector", pcbW * 0.62, 0.006, 0, topSign * (pcbD / 2 - 0.006), 0x3a3d45, 0.004);
    for (let i = 0; i < 6; i++) chip(`SMD${i}`, 0.004, 0.002, -0.026 + i * 0.006, topSign * -0.012, 0x6b6f78, 0.0008);
    const speaker = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.003, 40), mat(0x8d8f96, 0.35, 0.5));
    speaker.position.set(pcbW / 2 - 0.016, 0.0023, topSign * -(pcbD / 2 - 0.018));
    board.add(speaker);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.0034, 40), mat(0xd7914a, 0.5));
    cone.position.copy(speaker.position);
    board.add(cone);
    board.position.copy(local(c.x, this.bodyMid + 0.002, c.z));
    this.gbRoot.add(board);

    // four AA batteries side by side, in the lower half like the real battery bay
    const bats = new THREE.Group();
    bats.name = "Batteries";
    const len = 0.05;
    const r = 0.0072;
    for (let i = 0; i < 4; i++) {
      const cell = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len * 0.82, 32), mat(i % 2 ? 0xe8893a : 0x23252b, 0.45));
      const capA = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len * 0.09, 32), mat(0xc9ccd2, 0.25, 0.8));
      const capB = capA.clone();
      capA.position.y = len * 0.455;
      capB.position.y = -len * 0.455;
      cell.add(body, capA, capB);
      cell.rotation.z = Math.PI / 2; // lying along x
      cell.position.set(0, 0, (i - 1.5) * r * 2.15);
      bats.add(cell);
    }
    bats.position.copy(local(c.x, this.bodyMid - 0.004, c.z - topSign * size.z * 0.22));
    this.gbRoot.add(bats);
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
    for (const part of this.parts) {
      const q = part.group === "gb" ? Math.min(1, p / 0.85) : cartP;
      part.obj.position.copy(part.home).addScaledVector(part.dir, part.level * part.step * q);
    }
    // the shells part at the body's middle: the front keeps what's above it as it rises
    const frontLift = GB_LIFT.FrontShell * Math.min(1, p / 0.85);
    this.frontPlane.constant = -(this.bodyMid + frontLift);
    this.backPlane.constant = this.bodyMid;
    this.scene.updateMatrixWorld(true);
    for (const { line, part } of this.guides) {
      const top = new THREE.Box3().setFromObject(part.obj).getCenter(new THREE.Vector3());
      const lift = part.level * part.step * (part.group === "gb" ? Math.min(1, p / 0.85) : cartP);
      (line.geometry as THREE.BufferGeometry).setFromPoints([top.clone().setY(top.y - lift), top]);
      line.computeLineDistances();
      line.visible = lift > 0.002;
    }
    // isometric-ish orthographic camera around the centre
    const c = this.camera;
    const target = new THREE.Vector3(view.cx, view.cy, view.cz);
    c.position.set(target.x + Math.cos(view.el) * Math.sin(view.az), target.y + Math.sin(view.el), target.z + Math.cos(view.el) * Math.cos(view.az));
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

const DASH = new THREE.LineDashedMaterial({ color: 0x8a90b8, dashSize: 0.003, gapSize: 0.0025, transparent: true, opacity: 0.9 });
