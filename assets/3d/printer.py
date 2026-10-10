"""kagiboy thermal printer, for the waitlist: modelled like the Game Boy (SDF + OpenVDB), rendered in Cycles.

    python3 make_printer_face.py && blender -b -P ~/gb-wallet/assets/3d/printer.py -- [--preview]

The paper is a holdout: the render has a hole exactly where paper would be seen, so the page's own
HTML ticket sits behind the image and appears to come out of the slot (the cutter's teeth and the
slot's front lip stay in front of it). Writes web/public/printer/printer.webp and printer.json
(where the paper and the slot land, in image pixels) for the CSS.

Printer coords (mm): x right 0..W, y from the front face (0) to the back (D), z up 0..H.
-> Blender (metres): X = x - W/2, Y = y - D/2, Z = z   (front faces -Y, like the Game Boy)
"""
import bpy
import os
import sys
import json
import math
import subprocess
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sdflib import Field, rI, rU, rD, smax, slab, rbox2, circle2, pill2, tri2  # noqa: E402
from build import principled, new_mesh, srgb, box_uv, planar_uv, make_noise_normal  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = "--preview" in argv
OUT_DIR = os.path.expanduser("~/gb-wallet/web/public/printer")
RAW = os.path.join(HERE, "raw")
PY = "/opt/homebrew/bin/python3" if os.path.exists("/opt/homebrew/bin/python3") else "python3"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(RAW, exist_ok=True)

# =============================================================== dimensions (mm)
W, D, H = 96.0, 140.0, 50.0
CX = W / 2
PW = 62.0                 # paper width (wider than the real 38 mm roll, so the ticket reads)
SY0, SY1 = 46.0, 50.0     # paper slot, front and back edge
PY_ = (SY0 + SY1) / 2     # the paper's plane
CUT = (39.0, SY0)         # cutter bar, front and back edge
DECK = 44.0               # printed front deck
LED = (14.0, 24.0)
FEED = (78.0, 24.0)
SEAM = 37.0
VS = 2.0 if os.environ.get("KB_QUICK") == "1" else 1.0


def to_bl(P):
    return np.stack([P[:, 0] - CX, P[:, 1] - D / 2, P[:, 2]], 1) / 1000.0


def n_to_bl(N):
    return N


def mesh_field(name, field, mats, coll, adapt=0.012, uv=None):
    p, t, q = field.polygons(adapt)
    me = new_mesh(name, to_bl(p), t, q, field.normals(p))
    if uv:
        uv(me)
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


# =============================================================== parts
def body_field():
    f = Field((-2, -2, -2), (W + 2, D + 2, H + 3), 0.22 * VS)
    k = 0.8

    def base(X, Y, Z):
        F2 = rbox2(X, Z, 0, 0, W, H, 4.0)
        S2 = rbox2(Y, Z, 0, 0, D, H, 3.0, 3.0, 6.0, 11.0)  # front-top (bl) rolls over generously
        T2 = rbox2(X, Y, 0, 0, W, D, 7.0)
        return smax(smax(F2, S2, k), T2, k)

    f.base(base)
    # paper slot, with the bar's seat in front of it
    f.sub(lambda X, Y, Z: np.maximum(np.maximum(slab(X, CX - PW / 2 - 1.4, CX + PW / 2 + 1.4), slab(Y, SY0, SY1)), H - 16 - Z),
          ((CX - PW / 2 - 4, SY0 - 3, H - 18), (CX + PW / 2 + 4, SY1 + 3, H + 3)), 0.5)
    f.sub(lambda X, Y, Z: np.maximum(rbox2(X, Y, CX - 38.4, CUT[0] - 0.4, CX + 38.4, CUT[1], 1.8), H - 0.8 - Z),
          ((CX - 41, CUT[0] - 3, H - 2), (CX + 41, CUT[1] + 1, H + 3)), 0.2)
    # rear paper door: seam and thumb scoop
    f.groove(lambda X, Y, Z: np.maximum(np.abs(rbox2(X, Y, 7.0, 56.0, W - 7.0, D - 7.0, 4.0)) - 0.22, H - 4 - Z), 0.4,
             ((4, 53, H - 5), (W - 4, D - 4, H + 3)))
    f.sub(lambda X, Y, Z: np.maximum(circle2(X, Y, CX, 57.0, 7.0), np.maximum(56.0 - Y, H - 1.4 - Z)),
          ((CX - 9, 54, H - 3), (CX + 9, 66, H + 3)), 0.9)
    # LED hole and FEED button well
    f.sub(lambda X, Y, Z: np.maximum(circle2(X, Y, *LED, 1.9), H - 2.5 - Z), ((LED[0] - 4, LED[1] - 4, H - 4), (LED[0] + 4, LED[1] + 4, H + 3)), 0.25)
    f.sub(lambda X, Y, Z: np.maximum(pill2(X, Y, *FEED, 15.0, 7.6, 0.0), H - 2.0 - Z),
          ((FEED[0] - 10, FEED[1] - 6, H - 3), (FEED[0] + 10, FEED[1] + 6, H + 3)), 0.35)
    # split line round the body, and a grip of shallow ribs down the front face
    f.groove(lambda X, Y, Z: np.abs(Z - SEAM) - 0.22, 0.35, ((-3, -3, SEAM - 1.5), (W + 3, D + 3, SEAM + 1.5)))
    for i in range(5):
        zc = 9.0 + i * 2.6
        f.groove(lambda X, Y, Z, zc=zc: np.maximum(np.abs(Z - zc) - 0.5, np.abs(X - CX) - 30.0), 0.35,
                 ((CX - 33, -3, zc - 2), (CX + 33, 4, zc + 2)), r=0.25)
    return f


def cutter_field():
    f = Field((CX - 41, CUT[0] - 2, H - 2), (CX + 41, CUT[1] + 1, H + 5), 0.08 * VS)
    top = H + 1.3

    def base(X, Y, Z):
        bar = rI(rbox2(X, Y, CX - 38, CUT[0], CX + 38, CUT[1] - 0.05, 1.5), slab(Z, H - 0.8, top), 0.45)
        # serrated tear edge along the back, its teeth leaning over the paper
        tooth = 2.0
        u = np.mod(X - (CX - 36.0), tooth)
        tz = top + 1.15 * (1.0 - np.abs(u - tooth / 2) / (tooth / 2))
        teeth = np.maximum(np.maximum(Z - tz, top - 0.6 - Z), np.maximum(slab(Y, CUT[1] - 1.2, CUT[1] - 0.05), np.abs(X - CX) - 36.0))
        return rU(bar, teeth, 0.3)

    f.base(base)
    return f


def button_field():
    f = Field((FEED[0] - 9, FEED[1] - 6, H - 3), (FEED[0] + 9, FEED[1] + 6, H + 4), 0.06 * VS)
    f.base(lambda X, Y, Z: rI(pill2(X, Y, *FEED, 14.0, 6.6, 0.0), slab(Z, H - 2.5, H + 1.3), 1.1))
    return f


def led_field():
    f = Field((LED[0] - 3, LED[1] - 3, H - 3), (LED[0] + 3, LED[1] + 3, H + 2), 0.04 * VS)
    f.base(lambda X, Y, Z: rI(circle2(X, Y, *LED, 1.6), slab(Z, H - 2.4, H + 0.5), 0.9))
    return f


# =============================================================== scene
def materials():
    npath = os.path.join(HERE, "tex", "abs_noise_n.png")
    if not os.path.exists(npath):
        make_noise_normal(npath)
    M = {}
    M["Body"] = principled("PBody", "#CBC4B8", 0.55, normal_img=npath, normal_strength=0.35, spec=0.45)
    M["Cutter"] = principled("PCutter", "#202128", 0.18, coat=0.6, coat_rough=0.05, spec=0.6)
    M["Button"] = principled("PButton", "#1A1A1F", 0.55, spec=0.35)
    M["LED"] = principled("PLED", "#FF2A1F", 0.2, emis_color="#FF4A3A", emis_strength=7.0, coat=1.0)
    M["Prints"] = principled("PPrints", "#2B2F77", 0.5, base_img=os.path.join(HERE, "printer_face.png"), spec=0.4)
    nt = M["Prints"].node_tree
    nt.links.new(nt.nodes["BaseImage"].outputs["Alpha"], nt.nodes["Principled BSDF"].inputs["Alpha"])
    hold = bpy.data.materials.new("PaperHoldout")
    hold.use_nodes = True
    hn = hold.node_tree
    hn.nodes.remove(hn.nodes["Principled BSDF"])
    h = hn.nodes.new("ShaderNodeHoldout")
    hn.links.new(h.outputs[0], hn.nodes["Material Output"].inputs["Surface"])
    M["Paper"] = hold
    return M


def quad(name, corners, mat, coll, uvs=((0, 0), (1, 0), (1, 1), (0, 1))):
    V = np.array(corners, float)
    me = new_mesh(name, V, np.zeros((0, 3), np.int64), np.array([[0, 1, 2, 3]]))
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", np.array(uvs, np.float32).ravel())
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def setup_render():
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    c = s.cycles
    c.device = "GPU"
    c.samples = 64 if PREVIEW else 384
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02 if PREVIEW else 0.005
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.max_bounces = 10
    c.glossy_bounces = 6
    c.blur_glossy = 0.5
    s.render.film_transparent = True
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    vs = s.view_settings
    vs.view_transform = "AgX"
    vs.look = "AgX - Punchy"
    vs.exposure = float(os.environ.get("KB_EXPOSURE", "-0.55"))
    s.display_settings.display_device = "sRGB"


def area(name, loc, target, size, energy, color="#FFFFFF", size_y=None):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "RECTANGLE"
    ld.size = size
    ld.size_y = size_y or size
    ld.energy = energy
    ld.color = srgb(color)[:3]
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


def studio():
    w = bpy.data.worlds.new("Studio")
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = srgb("#F4F2F0")
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.15
    ls = 0.35
    area("Key", (-0.50, -0.38, 0.46), (0, 0, 0.04), 0.8, 135 * ls, "#FFF8F0", 0.6)
    area("Fill", (0.65, -0.45, 0.18), (0, 0, 0.04), 0.9, 28 * ls, "#F1F4FF", 0.6)
    area("Top", (0.05, 0.15, 0.75), (0, 0, 0.0), 0.9, 30 * ls, "#FFFFFF")
    area("Rim", (0.40, 0.55, 0.30), (0, 0, 0.04), 0.5, 40 * ls, "#FFF2F6")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    coll = bpy.context.scene.collection
    M = materials()
    mesh_field("PrinterBody", body_field(), [M["Body"]], coll, uv=lambda me: box_uv(me, 40.0))
    mesh_field("Cutter", cutter_field(), [M["Cutter"]], coll, adapt=0.0)
    mesh_field("Feed", button_field(), [M["Button"]], coll, adapt=0.0)
    mesh_field("Led", led_field(), [M["LED"]], coll, adapt=0.0)
    z = (H + 0.04) / 1000
    quad("Prints", [((0 - CX) / 1000, (0 - D / 2) / 1000, z), ((W - CX) / 1000, (0 - D / 2) / 1000, z),
                    ((W - CX) / 1000, (DECK - D / 2) / 1000, z), ((0 - CX) / 1000, (DECK - D / 2) / 1000, z)],
         M["Prints"], coll, uvs=((0, 0), (1, 0), (1, 1), (0, 1)))
    py = (PY_ - D / 2) / 1000
    paper = quad("Paper", [(-PW / 2000, py, (H - 14) / 1000), (PW / 2000, py, (H - 14) / 1000),
                           (PW / 2000, py, 0.6), (-PW / 2000, py, 0.6)], M["Paper"], coll)
    setup_render()
    studio()

    # camera: level (no pitch), so the upright paper renders as a true rectangle, like the HTML ticket
    lens = 100.0
    dist = 0.36
    camz = (H + 115) / 1000
    span = dist * 36.0 / lens            # frame width at the paper's plane
    zc = 0.052                            # frame centre height at the paper
    cd = bpy.data.cameras.new("Cam")
    cd.lens = lens
    cd.sensor_width = 36
    cd.sensor_fit = "HORIZONTAL"
    cd.shift_y = (zc - camz) / span
    cam = bpy.data.objects.new("Cam", cd)
    coll.objects.link(cam)
    cam.location = (0, py - dist, camz)
    cam.rotation_euler = (math.radians(90), 0, 0)
    s = bpy.context.scene
    s.camera = cam
    s.render.resolution_x = 1000 if PREVIEW else 2000
    s.render.resolution_y = int(s.render.resolution_x * 0.56)
    # front layer: the paper as a hole; back layer: no paper at all (seen while the ticket is inside)
    for name, hide in (("printer-front", False), ("printer-back", True)):
        paper.hide_render = hide
        s.render.filepath = os.path.join(RAW, name + ".png")
        bpy.ops.render.render(write_still=True)
    paper.hide_render = False

    # where the paper and the slot land in the image, for the CSS
    rx, ry = s.render.resolution_x, s.render.resolution_y
    def px(p):
        v = world_to_camera_view(s, cam, Vector(p))
        return [v.x * rx, (1 - v.y) * ry]
    slot_front = (H / 1000)
    info = {
        "width": rx, "height": ry,
        "paperLeft": px((-PW / 2000, py, slot_front))[0], "paperRight": px((PW / 2000, py, slot_front))[0],
        "slotY": px((0, py, slot_front))[1],
        "bodyLeft": px((-CX / 1000, -D / 2000, H / 2000))[0], "bodyRight": px((CX / 1000, -D / 2000, H / 2000))[0],
    }
    print("[printer]", info, flush=True)
    json.dump(info, open(os.path.join(OUT_DIR, "printer.json"), "w"), indent=1)
    # web copies: 2x and 1x WebP with alpha
    code = (
        "from PIL import Image\n"
        "for n in ('printer-front','printer-back'):\n"
        "  im=Image.open(%r+'/'+n+'.png').convert('RGBA')\n"
        "  im.save(%r+'/'+n+'.webp',quality=88,method=6)\n"
        "  im.resize((im.width//2,im.height//2),Image.LANCZOS).save(%r+'/'+n+'-1x.webp',quality=88,method=6)\n"
    ) % (RAW, OUT_DIR, OUT_DIR)
    subprocess.run([PY, "-c", code], check=True)


main()
