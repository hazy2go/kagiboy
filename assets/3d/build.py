"""kagiboy: Game Boy DMG-01 + kagiboy cartridge, fully scripted.

    blender -b -P ~/gb-wallet/assets/3d/build.py

Builds the scene (SDF modelled, OpenVDB meshed), saves kagiboy.blend next to
this file and exports ~/gb-wallet/web/public/3d/kagiboy.glb.
Env: KB_QUICK=1 doubles all voxel sizes (fast preview build).

Coordinate conventions (all source numbers in mm):
  Game Boy drawing coords: x right, y down from the top-left of the front face,
  d = depth into the body from the front face (0..32).
  -> Blender (metres): X = x-45, Y = d-16, Z = 74-y   (front faces -Y)
  Cartridge coords: u right, v down, w depth from the label face (0..7.7).
  -> Cartridge local: X = u-28.5, Y = w-3.85, Z = 32.5-v (label faces -Y)
"""
import bpy
import bmesh
import os
import sys
import time
import math
import subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sdflib import (Field, rI, rU, rD, smax, slab, rbox2, circle2, capsule2,  # noqa: E402
                    pill2, tri2, plus2)

QUICK = os.environ.get("KB_QUICK") == "1"
VS = 2.0 if QUICK else 1.0
BLEND = os.path.join(HERE, "kagiboy.blend")
GLB = os.path.expanduser("~/gb-wallet/web/public/3d/kagiboy.glb")
TEX = os.path.join(HERE, "tex")
os.makedirs(TEX, exist_ok=True)
SCREEN_IMG = os.path.expanduser("~/gb-wallet/web/public/screens/home.png")
T0 = time.time()


def log(*a):
    print("[build %6.1fs]" % (time.time() - T0), *a, flush=True)


# =============================================================== dimensions
GB_W, GB_H, GB_D = 90.0, 148.0, 32.0
BEZEL = (6.9, 12.3, 82.6, 70.1, 3.4, 11.3)          # x0 y0 x1 y1 r r_br
LCD = (20.1, 19.1, 68.8, 63.0)
LED_C, LED_R = (12.3, 34.3), 1.22
DPAD_C, DPAD_SPAN, DPAD_ARM = (18.1, 100.9), 20.0, 6.3
BTN_B, BTN_A, BTN_R = (61.95, 103.35), (76.95, 96.4), 5.45
SEL_C, START_C, PILL_L, PILL_W, PILL_ANG = (31.85, 123.15), (47.2, 123.15), 10.6, 3.2, -24.0
BTN_TOP = 2.5            # height of D-pad / A / B tops above the face
SEAM_D = 14.5
# speaker slots (centre-line endpoints measured from the reference drawing)
_SDIR = np.array([0.479, 0.878])
_SUP = [(80.77, 125.31), (76.21, 127.70), (71.68, 130.13), (67.15, 132.53), (62.60, 134.93), (58.05, 137.33)]
SLOTS = [(np.array(c) + _SDIR * -4.6, np.array(c) + _SDIR * 9.45) for c in _SUP]
SLOT_R = 1.15
# bottom-right facet (front face rolls back below this line)
_FA, _FB = np.array([51.0, 148.3]), np.array([89.5, 128.4])
_FD = (_FB - _FA) / np.linalg.norm(_FB - _FA)
FACET_N = np.array([-_FD[1], _FD[0]])
if FACET_N[1] < 0:
    FACET_N = -FACET_N
FACET_C = float(FACET_N @ _FA)
FACET_K = 0.32
# rear
PANEL = (14.3, 30.7, 75.7, 144.0)
SLOT_BOX = (16.0, 74.0, 50.5, 23.2, 32.9)           # x0 x1 ybottom d0 d1

# cartridge
C_W, C_H, C_D = 57.0, 65.0, 7.7
C_SPLIT = C_D / 2
C_CHAMF = 8.0
C_WALL = 1.2
LABEL = (6.5, 15.5, 50.5, 53.5)
OPEN_U = (3.6, 53.4)
PCB_W = (3.35, 4.35)
SCREW = (28.5, 10.0)
FINGERS = [28.5 + (i - 15.5) * 1.5 for i in range(32)]
CHIPS = {  # name: (u, v, size_u, size_v, height)
    "MCU": (19.0, 31.0, 7.0, 7.0, 0.85),
    "SecureElement": (36.0, 24.0, 4.0, 4.0, 0.8),
    "BLE": (38.5, 42.5, 5.0, 4.0, 1.2),
    "Accel": (11.5, 45.0, 2.0, 2.0, 0.9),
}
# inserted pose: cart w=0 (label) at d=31.6, top edge 15 mm above the console
CART_POSE_LOC = (0.0, (31.6 - C_SPLIT - 16.0) / 1000.0, (74.0 + 15.0 - C_H / 2) / 1000.0)


# =============================================================== helpers
def srgb(hexstr, a=1.0):
    h = hexstr.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


def gb_to_bl(P):
    """drawing (x, y, d) mm -> Blender metres"""
    return np.stack([P[:, 0] - 45.0, P[:, 2] - 16.0, 74.0 - P[:, 1]], 1) / 1000.0


def gb_n_to_bl(N):
    return np.stack([N[:, 0], N[:, 2], -N[:, 1]], 1)


def cart_to_bl(P):
    return np.stack([P[:, 0] - 28.5, P[:, 2] - C_SPLIT, 32.5 - P[:, 1]], 1) / 1000.0


def cart_n_to_bl(N):
    return np.stack([N[:, 0], N[:, 2], -N[:, 1]], 1)


def new_mesh(name, V, tris, quads, N=None):
    me = bpy.data.meshes.new(name)
    nv = len(V)
    me.vertices.add(nv)
    me.vertices.foreach_set("co", V.astype(np.float32).ravel())
    nq, nt = len(quads), len(tris)
    idx = np.concatenate([quads.ravel(), tris.ravel()]).astype(np.int32)
    me.loops.add(len(idx))
    me.loops.foreach_set("vertex_index", idx)
    starts = np.concatenate([np.arange(nq) * 4, nq * 4 + np.arange(nt) * 3]).astype(np.int32)
    me.polygons.add(nq + nt)
    me.polygons.foreach_set("loop_start", starts)
    me.update(calc_edges=True)
    me.shade_smooth()
    if N is not None:
        me.normals_split_custom_set_from_vertices(N.astype(np.float32))
    return me


def box_uv(me, tile_mm, name="UVMap"):
    """Tri-planar style box projection (for the tiling micro-texture normal map)."""
    uv = me.uv_layers.new(name=name)
    npoly = len(me.polygons)
    pn = np.empty(npoly * 3, np.float32)
    me.polygons.foreach_get("normal", pn)
    pn = pn.reshape(-1, 3)
    tot = np.empty(npoly, np.int32)
    me.polygons.foreach_get("loop_total", tot)
    lp = np.repeat(np.arange(npoly), tot)
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", lv)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)[lv] * 1000.0 / tile_mm
    n = np.abs(pn[lp])
    ax = np.argmax(n, 1)
    U = np.where(ax == 0, co[:, 1], co[:, 0])
    V = np.where(ax == 2, co[:, 1], co[:, 2])
    uv.data.foreach_set("uv", np.stack([U, V], 1).astype(np.float32).ravel())


def planar_uv(me, fn, name="UVMap"):
    """UVs from a function of local vertex coords (metres) -> (u, v)."""
    uv = me.uv_layers.new(name=name)
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", lv)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)[lv]
    U, V = fn(co)
    uv.data.foreach_set("uv", np.stack([U, V], 1).astype(np.float32).ravel())


def link(obj, coll):
    coll.objects.link(obj)
    return obj


def sdf_object(name, field, to_bl, n_to_bl, coll, origin=None, adapt=0.015, glb_adapt=0.08,
               glb_coll=None, mats=(), uv=None, glb_target=None):
    """Mesh a field into a render object and (optionally) a lighter GLB twin."""
    out = []
    for kind, a, c in (("render", adapt, coll), ("glb", glb_adapt, glb_coll)):
        if c is None:
            continue
        p, t, q = field.polygons(a)
        N = n_to_bl(field.normals(p))
        V = to_bl(p)
        org = np.zeros(3) if origin is None else np.array(origin)
        V = V - org
        nm = name if kind == "render" else name + ".glb"
        me = new_mesh(nm, V, t, q, N)
        if uv:
            uv(me)
        for m in mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(nm, me)
        ob.location = org
        link(ob, c)
        if kind == "glb" and glb_target and len(t) + 2 * len(q) > glb_target:
            ratio = glb_target / float(len(t) + 2 * len(q))
            md = ob.modifiers.new("dec", "DECIMATE")
            md.ratio = ratio
            md.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = ob
            with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
                bpy.ops.object.modifier_apply(modifier="dec")
            # re-derive exact normals from the field after decimation
            vv = np.empty(len(ob.data.vertices) * 3, np.float32)
            ob.data.vertices.foreach_get("co", vv)
            vv = vv.reshape(-1, 3) + org
            if to_bl is gb_to_bl:
                P = np.stack([vv[:, 0] * 1000 + 45.0, 74.0 - vv[:, 2] * 1000, vv[:, 1] * 1000 + 16.0], 1)
            else:
                P = np.stack([vv[:, 0] * 1000 + 28.5, 32.5 - vv[:, 2] * 1000, vv[:, 1] * 1000 + C_SPLIT], 1)
            ob.data.normals_split_custom_set_from_vertices(n_to_bl(field.normals(P)).astype(np.float32))
        ntri = sum(len(pp.vertices) - 2 for pp in ob.data.polygons)
        log("  %-18s %-6s verts=%8d tris=%8d" % (name, kind, len(ob.data.vertices), ntri))
        out.append(ob)
    return out


def bm_object(name, bm, coll, mats=(), origin=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = origin
    link(ob, coll)
    return ob


def bm_box(bm, c, s, mat_index=0, bevel=0.0, segs=2):
    """Axis aligned box (Blender metres) centre c, size s; optional bevel."""
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    for v in verts:
        v.co.x = c[0] + v.co.x * s[0]
        v.co.y = c[1] + v.co.y * s[1]
        v.co.z = c[2] + v.co.z * s[2]
    faces = list({f for v in verts for f in v.link_faces})
    for f in faces:
        f.material_index = mat_index
        f.smooth = False
    if bevel > 0:
        edges = list({e for v in verts for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges + verts, offset=bevel, segments=segs, affect="EDGES",
                        profile=0.5, clamp_overlap=True)
    return verts


# =============================================================== textures
def make_noise_normal(path, n=256, strength=6.0, seed=11):
    rng = np.random.default_rng(seed)
    w = rng.standard_normal((n, n))
    fx = np.fft.fftfreq(n)
    k = np.sqrt(fx[:, None] ** 2 + fx[None, :] ** 2)
    filt = np.exp(-(k / 0.09) ** 2) * (k > 0.002) + 0.35 * np.exp(-(k / 0.02) ** 2) * (k > 0.002)
    h = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
    h = (h - h.mean()) / h.std()
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    N = np.stack([-dx * strength / n * 8, -dy * strength / n * 8, np.ones_like(h)], -1)
    N /= np.linalg.norm(N, axis=-1, keepdims=True)
    rgb = N * 0.5 + 0.5
    img = bpy.data.images.new("abs_noise_n", n, n, alpha=False)
    px = np.concatenate([rgb[::-1], np.ones((n, n, 1))], -1).astype(np.float32)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def ensure_textures():
    py = "/opt/homebrew/bin/python3" if os.path.exists("/opt/homebrew/bin/python3") else "python3"
    for script, out in (("make_label.py", "label.jpg"), ("make_pcb.py", "pcb.png")):
        if not os.path.exists(os.path.join(HERE, out)) or os.environ.get("KB_RETEX") == "1":
            subprocess.run([py, os.path.join(HERE, script)], check=True)
    npath = os.path.join(TEX, "abs_noise_n.png")
    if not os.path.exists(npath):
        make_noise_normal(npath)
    return npath


# =============================================================== materials
def principled(name, color, rough, metal=0.0, coat=0.0, coat_rough=0.05, spec=0.5,
               normal_img=None, normal_strength=0.25, base_img=None, closest=False,
               emis_img=False, emis_color=None, emis_strength=0.0, sss=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color) if isinstance(color, str) else color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = coat_rough
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Scale"].default_value = 0.0006
    if normal_img:
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = bpy.data.images.load(normal_img, check_existing=True)
        tx.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(tx.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        tx.location = (-700, -300)
        nm.location = (-350, -300)
    if base_img:
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.name = "BaseImage"
        tx.image = bpy.data.images.load(base_img, check_existing=True)
        tx.interpolation = "Closest" if closest else "Linear"
        tx.extension = "EXTEND"
        nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
        if emis_img:
            nt.links.new(tx.outputs["Color"], b.inputs["Emission Color"])
        tx.location = (-700, 200)
    if emis_color:
        b.inputs["Emission Color"].default_value = srgb(emis_color)
    if emis_strength:
        b.inputs["Emission Strength"].default_value = emis_strength
    return m


def build_materials(noise):
    M = {}
    M["Body"] = principled("Body", "#C9C6BF", 0.55, normal_img=noise, normal_strength=0.35, spec=0.45)
    M["Bezel"] = principled("Bezel", "#5E5F72", 0.22, coat=0.4, coat_rough=0.08, spec=0.5)
    M["Screen"] = principled("Screen", "#9BA040", 0.25, base_img=SCREEN_IMG, closest=True, emis_img=True,
                             emis_strength=0.55, coat=1.0, coat_rough=0.04)
    M["LED"] = principled("LED", "#FF2A1F", 0.2, emis_color="#FF2A1F", emis_strength=6.0, coat=1.0)
    M["DPad"] = principled("DPad", "#1E1E22", 0.42, spec=0.45)
    M["Buttons"] = principled("ButtonAB", "#9D2A5A", 0.32, coat=0.6, coat_rough=0.12)
    M["Rubber"] = principled("Rubber", "#8E8C8A", 0.78, spec=0.3)
    M["Speaker"] = principled("SpeakerBack", "#232325", 0.85)
    M["Shell"] = principled("CartShell", "#F2F0EC", 0.45, normal_img=noise, normal_strength=0.2, spec=0.5)
    M["Label"] = principled("Label", "#FFFFFF", 0.38, base_img=os.path.join(HERE, "label.jpg"),
                            coat=0.25, coat_rough=0.12)
    M["PCB"] = principled("PCB", "#1E4D2B", 0.32, base_img=os.path.join(HERE, "pcb.png"), spec=0.6)
    M["Gold"] = principled("Gold", "#E2BE76", 0.22, metal=1.0)
    M["Chip"] = principled("ChipEpoxy", "#141416", 0.5, spec=0.45)
    M["Can"] = principled("ShieldCan", "#C9CBCD", 0.28, metal=1.0)
    M["Passive"] = principled("Passive", "#6B5A47", 0.5)
    M["Tin"] = principled("Tin", "#B9BBBE", 0.3, metal=1.0)
    return M


# =============================================================== Game Boy parts
def body_field():
    h = 0.15 * VS
    f = Field((-2.0, -2.0, -2.0), (92.0, 150.0, 36.0), h)
    k = 0.6
    e = k / 4

    def base(X, Y, Z):
        F2 = rbox2(X, Y, -e, -e, GB_W + e, GB_H + e, 2.5 + e, 2.5 + e, 18.4 + e, 2.5 + e)
        S2 = rbox2(Z, Y, -e, -e, GB_D + e, GB_H + e, 2.5 + e, 6.0 + e, 4.0 + e, 2.5 + e)
        T2 = rbox2(X, Z, -e, -e, GB_W + e, GB_D + e, 2.0 + e, 2.0 + e, 13.0 + e, 13.0 + e)
        b = smax(smax(F2, S2, k), T2, k)
        # bottom-right facet: front face rolls back past the diagonal line
        P = X * FACET_N[0] + Y * FACET_N[1] - FACET_C
        g = (FACET_K * P - Z) / math.sqrt(1 + FACET_K ** 2)
        b = smax(b, g, 2.5)
        # raised rear panel
        pn = rI(rbox2(X, Y, *PANEL, 4.0), slab(Z, 20.0, GB_D + 1.8), 1.0)
        return rU(b, pn, 1.0)

    f.base(base)
    log("body base")
    # screen bezel recess
    x0, y0, x1, y1, r, rbr = BEZEL
    gap = 0.12
    f.sub(lambda X, Y, Z: np.maximum(rbox2(X, Y, x0 - gap, y0 - gap, x1 + gap, y1 + gap, r + gap, r + gap, rbr + gap, r + gap), Z - 0.6),
          ((x0 - 2, y0 - 2, -2), (x1 + 2, y1 + 2, 1.5)), 0.12)
    # D-pad hole
    cx, cy = DPAD_C
    f.sub(lambda X, Y, Z: np.maximum(plus2(X, Y, cx, cy, DPAD_SPAN, DPAD_ARM, 0.8, 0.8) - 0.5, Z - 4.0),
          ((cx - 12, cy - 12, -2), (cx + 12, cy + 12, 5)), 0.3)
    # A / B holes
    for (bx, by) in (BTN_A, BTN_B):
        f.sub(lambda X, Y, Z, bx=bx, by=by: np.maximum(circle2(X, Y, bx, by, BTN_R + 0.45), Z - 4.0),
              ((bx - 7, by - 7, -2), (bx + 7, by + 7, 5)), 0.3)
    # Start / Select recesses
    for (sx, sy) in (SEL_C, START_C):
        f.sub(lambda X, Y, Z, sx=sx, sy=sy: np.maximum(pill2(X, Y, sx, sy, PILL_L, PILL_W, PILL_ANG) - 0.75, Z - 1.0),
              ((sx - 8, sy - 6, -2), (sx + 8, sy + 6, 2)), 0.35)
    # speaker slots
    def slots(X, Y, Z):
        d = None
        for a, b in SLOTS:
            c = capsule2(X, Y, a[0], a[1], b[0], b[1], SLOT_R)
            d = c if d is None else np.minimum(d, c)
        return np.maximum(d, Z - 3.6)
    f.sub(slots, ((52, 116, -2), (92, 150, 5)), 0.35)
    log("body front features")
    # cartridge slot (open at top + back above the rear panel)
    sx0, sx1, syb, sd0, sd1 = SLOT_BOX
    f.sub(lambda X, Y, Z: np.maximum(np.maximum(slab(X, sx0, sx1), slab(Y, -10, syb)), slab(Z, sd0, sd1)),
          ((sx0 - 2, -3, sd0 - 2), (sx1 + 2, syb + 2, 36)), 0.5)
    # link port (left side): D-shaped shallow recess + round socket
    f.sub(lambda X, Y, Z: np.maximum(rbox2(Z, Y, 16.4, 20.6, 23.6, 28.2, 3.6, 0.8, 0.8, 3.6), X - 0.7),
          ((-2, 18, 14), (2, 31, 26)), 0.2)
    f.sub(lambda X, Y, Z: np.maximum(circle2(Z, Y, 20.0, 24.4, 2.2), X - 6.0), ((-2, 21, 17), (7, 28, 23.5)), 0.2)
    # contrast wheel (left side): recess, slot and knurled rim
    f.sub(lambda X, Y, Z: np.maximum(rbox2(Z, Y, 6.3, 35.8, 14.0, 54.1, 1.6, 0.6, 0.6, 1.6), X - 0.5),
          ((-2, 34, 4.5), (2, 56, 16)), 0.2)
    f.sub(lambda X, Y, Z: np.maximum(rbox2(Z, Y, 10.4, 38.9, 13.8, 50.7, 0.4), X - 3.5),
          ((-2, 37, 9), (5, 52, 15)), 0.15)

    def wheel(X, Y, Z):
        R = 7.0
        cxw, cyw = R - 0.9, 44.8
        ang = np.arctan2(Y - cyw, X - cxw)
        rr = np.sqrt((X - cxw) ** 2 + (Y - cyw) ** 2) - (R + 0.12 * np.cos(ang * 48))
        return rI(rr, slab(Z, 10.75, 13.45), 0.15)
    f.add(wheel, ((-2, 37, 9.5), (5, 52.5, 14.5)), 0.05)
    # power switch (top-left, behind the seam)
    f.sub(lambda X, Y, Z: np.maximum(rbox2(X, Z, 10.1, 14.95, 19.8, 19.6, 0.9), Y - 0.6),
          ((8, -2, 13), (22, 2, 21.5)), 0.15)
    f.add(lambda X, Y, Z: rI(rbox2(X, Z, 11.0, 15.6, 14.6, 18.95, 0.5), slab(Y, -0.35, 1.5), 0.25),
          ((9, -2, 14), (16, 2, 20.5)), 0.1)
    log("body side features")
    # grooves: side seam, top band, battery cover
    f.groove(lambda X, Y, Z: np.abs(Z - SEAM_D) - 0.2, 0.3, ((-3, -3, SEAM_D - 1), (93, 151, SEAM_D + 1)))
    f.groove(lambda X, Y, Z: np.maximum(np.abs(Y - 7.3) - 0.22, Z - SEAM_D), 0.3, ((-3, 5.5, -3), (93, 9, SEAM_D + 0.5)))
    for gx in (6.9, 83.1):
        f.groove(lambda X, Y, Z, gx=gx: np.maximum(np.maximum(np.abs(X - gx) - 0.22, Y - 7.3), Z - SEAM_D), 0.3,
                 ((gx - 1.5, -3, -3), (gx + 1.5, 8.5, SEAM_D + 0.5)))
    f.groove(lambda X, Y, Z: np.maximum(np.abs(rbox2(X, Y, 18.5, 84.0, 71.5, 140.5, 3.0)) - 0.2, 30.0 - Z), 0.35,
             ((16, 82, 30), (74, 143, 36)))
    for i in range(6):
        yc = 128.0 + i * 2.1
        f.add(lambda X, Y, Z, yc=yc: rI(np.sqrt((Y - yc) ** 2 + (Z - (GB_D + 1.8 - 0.3)) ** 2) - 0.75, np.abs(X - 45.0) - 14.0, 0.6),
              ((28, yc - 2.0, 32.0), (62, yc + 2.0, 35.5)), 0.25)
    # shallow sticker recess on the upper rear panel
    f.sub(lambda X, Y, Z: np.maximum(rbox2(X, Y, 21.0, 38.0, 69.0, 79.0, 2.0), (GB_D + 1.8 - 0.3) - Z),
          ((19, 36, 32), (71, 81, 36)), 0.15)
    log("body grooves")
    return f


def bezel_field():
    x0, y0, x1, y1, r, rbr = BEZEL
    f = Field((x0 - 0.6, y0 - 0.6, -0.5), (x1 + 0.6, y1 + 0.6, 0.8), 0.07 * VS)

    def base(X, Y, Z):
        plate = rI(rbox2(X, Y, x0, y0, x1, y1, r, r, rbr, r), slab(Z, -0.15, 0.55), 0.22)
        win = rbox2(X, Y, *LCD, 0.5)
        plate = rD(plate, win, 0.12)
        return rD(plate, circle2(X, Y, LED_C[0], LED_C[1], LED_R + 0.05), 0.06)
    f.base(base)
    return f


def led_field():
    cx, cy = LED_C
    f = Field((cx - 1.5, cy - 1.5, -0.4), (cx + 1.5, cy + 1.5, 0.7), 0.025 * VS)

    def base(X, Y, Z):
        R = 2.0
        sph = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2 + (Z - (-0.2 + R)) ** 2) - R
        return rI(circle2(X, Y, cx, cy, LED_R), np.maximum(sph, Z - 0.55), 0.08)
    f.base(base)
    return f


def dpad_field():
    cx, cy = DPAD_C
    f = Field((cx - 10.6, cy - 10.6, -BTN_TOP - 0.4), (cx + 10.6, cy + 10.6, 3.3), 0.06 * VS)

    def base(X, Y, Z):
        p = plus2(X, Y, cx, cy, DPAD_SPAN, DPAD_ARM, 0.8, 0.8)
        reach = np.maximum(np.abs(X - cx), np.abs(Y - cy))
        zt = -BTN_TOP + 0.2 * np.clip((reach - 3.15) / 6.85, 0, 1)
        dp = rI(p, np.maximum(zt - Z, Z - 3.0), 0.9)
        R = 6.0
        sph = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2 + (Z - (-BTN_TOP - R + 0.35)) ** 2) - R
        return rD(dp, sph, 0.35)
    f.base(base)
    return f


def button_field(c):
    cx, cy = c
    f = Field((cx - BTN_R - 0.4, cy - BTN_R - 0.4, -BTN_TOP - 0.3), (cx + BTN_R + 0.4, cy + BTN_R + 0.4, 3.2), 0.05 * VS)

    def base(X, Y, Z):
        R = 25.0
        sph = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2 + (Z - (-BTN_TOP + R)) ** 2) - R
        return rI(circle2(X, Y, cx, cy, BTN_R), np.maximum(sph, Z - 3.0), 0.75)
    f.base(base)
    return f


def pill_field(c):
    cx, cy = c
    f = Field((cx - 6.2, cy - 3.6, -0.6), (cx + 6.2, cy + 3.6, 1.2), 0.04 * VS)

    def base(X, Y, Z):
        return rI(pill2(X, Y, cx, cy, PILL_L, PILL_W, PILL_ANG), slab(Z, -0.35, 1.0), 1.0)
    f.base(base)
    return f


def speaker_field():
    f = Field((52.5, 116.5, 3.0), (91.0, 149.0, 3.9), 0.06 * VS)

    def base(X, Y, Z):
        d = None
        for a, b in SLOTS:
            c = capsule2(X, Y, a[0], a[1], b[0], b[1], SLOT_R - 0.03)
            d = c if d is None else np.minimum(d, c)
        return np.maximum(d, slab(Z, 3.2, 3.65))
    f.base(base)
    return f


# =============================================================== cartridge parts
def outline2(U, V):
    o = rbox2(U, V, 0.0, 0.0, C_W, C_H, 0.8)
    ch = ((U - V) - (C_W - C_CHAMF)) / math.sqrt(2)
    return rI(o, ch, 0.8)


def cart_half_field(front):
    h = 0.08 * VS
    if front:
        f = Field((-0.8, -0.8, -0.6), (C_W + 0.8, C_H + 0.8, C_SPLIT + 0.4), h)
    else:
        f = Field((-0.8, -0.8, C_SPLIT - 0.4), (C_W + 0.8, C_H + 0.8, C_D + 0.6), h)

    def base(U, V, W):
        O = outline2(U, V)
        if front:
            s = rI(rI(O, -W, 0.9), W - C_SPLIT, 0.25)
            cav = rI(O + C_WALL, C_WALL - W, 0.5)
        else:
            s = rI(rI(O, W - C_D, 0.9), C_SPLIT - W, 0.25)
            cav = rI(O + C_WALL, W - (C_D - C_WALL), 0.5)
        s = rD(s, cav, 0.15)
        # screw post
        if front:
            post = np.maximum(circle2(U, V, *SCREW, 2.0), slab(W, 1.0, PCB_W[0]))
        else:
            post = np.maximum(circle2(U, V, *SCREW, 2.0), slab(W, PCB_W[1], C_D - 0.7))
        s = rU(s, post, 0.3)
        return s
    f.base(base)
    if front:
        # connector opening through the bottom wall, near the split plane
        f.sub(lambda U, V, W: np.maximum(np.maximum(slab(U, *OPEN_U), 58.5 - V), 2.35 - W),
              ((OPEN_U[0] - 1, 57, 1.5), (OPEN_U[1] + 1, C_H + 1, C_SPLIT + 1)), 0.2)
        f.sub(lambda U, V, W: np.maximum(circle2(U, V, *SCREW, 0.9), slab(W, 1.6, 5.0)),
              ((SCREW[0] - 2, SCREW[1] - 2, 1), (SCREW[0] + 2, SCREW[1] + 2, 5)), 0.1)
        # grip grooves across the top of the front, wrapping round the sides
        for vc in (7.6, 9.4, 11.2, 13.0):
            def g(U, V, W, vc=vc):
                near_outer = np.minimum(W - 0.6, -(outline2(U, V) + 0.6))
                return np.maximum(np.maximum(np.abs(V - vc) - 0.3, W - 2.4), near_outer)
            f.groove(g, 0.35, ((-1, vc - 1, -1), (C_W + 1, vc + 1, 3.0)), 0.06)
        # label recess
        f.sub(lambda U, V, W: np.maximum(rbox2(U, V, *LABEL, 1.0), W - 0.4),
              ((LABEL[0] - 1, LABEL[1] - 1, -1), (LABEL[2] + 1, LABEL[3] + 1, 1)), 0.12)
        # stamped down-pointing triangle (debossed so it reads in raking light)
        t0, t1, t2 = (25.4, 57.0), (31.6, 57.0), (28.5, 60.6)
        f.sub(lambda U, V, W: np.maximum(tri2(U, V, t0, t1, t2) - 0.2, W - 0.32),
              ((24, 55.5, -1), (33, 61.5, 1)), 0.1)
    else:
        f.sub(lambda U, V, W: np.maximum(slab(U, *OPEN_U), 58.5 - V),
              ((OPEN_U[0] - 1, 57, C_SPLIT - 1), (OPEN_U[1] + 1, C_H + 1, C_D + 1)), 0.3)
        # screw recess + tri-wing head
        f.sub(lambda U, V, W: np.maximum(circle2(U, V, *SCREW, 2.3), (C_D - 0.7) - W),
              ((SCREW[0] - 3.5, SCREW[1] - 3.5, C_D - 1.5), (SCREW[0] + 3.5, SCREW[1] + 3.5, C_D + 1)), 0.2)
        f.add(lambda U, V, W: rI(circle2(U, V, *SCREW, 1.65), slab(W, C_D - 1.0, C_D - 0.3), 0.25),
              ((SCREW[0] - 2.5, SCREW[1] - 2.5, C_D - 1.5), (SCREW[0] + 2.5, SCREW[1] + 2.5, C_D + 0.5)), 0.1)

        def wings(U, V, W):
            d = None
            for k in range(3):
                a = math.radians(90 + 120 * k)
                c = capsule2(U, V, SCREW[0], SCREW[1], SCREW[0] + math.cos(a) * 1.15, SCREW[1] + math.sin(a) * 1.15, 0.2)
                d = c if d is None else np.minimum(d, c)
            return np.maximum(d, (C_D - 0.55) - W)
        f.sub(wings, ((SCREW[0] - 2, SCREW[1] - 2, C_D - 1.2), (SCREW[0] + 2, SCREW[1] + 2, C_D + 0.5)), 0.05)
    return f


def pcb_field():
    f = Field((0.5, 0.5, PCB_W[0] - 0.25), (C_W - 0.5, C_H + 0.2, PCB_W[1] + 0.25), 0.06 * VS)

    def base(U, V, W):
        o = np.minimum(outline2(U, V) + 1.45, rbox2(U, V, OPEN_U[0] + 0.3, 50.0, OPEN_U[1] - 0.3, C_H - 0.4, 0.3))
        p = rI(o, slab(W, *PCB_W), 0.1)
        return rD(p, circle2(U, V, *SCREW, 1.0), 0.06)
    f.base(base)
    return f


# =============================================================== assembly
def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"
    s.unit_settings.scale_length = 1.0
    s.unit_settings.length_unit = "MILLIMETERS"


def empty(name, coll, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.02
    e.location = loc
    e.rotation_euler = rot
    link(e, coll)
    if parent:
        e.parent = parent
    return e


def parent(ch, par):
    ch.parent = par
    ch.matrix_parent_inverse.identity()


def main():
    clean_scene()
    noise = ensure_textures()
    M = build_materials(noise)
    scene = bpy.context.scene
    root = scene.collection
    C_RENDER = bpy.data.collections.new("KagiBoy")
    C_GLB = bpy.data.collections.new("GLB_LOD")
    root.children.link(C_RENDER)
    root.children.link(C_GLB)

    def tree(prefix, coll):
        gb = empty(prefix + "GameBoy", coll)
        ca = empty(prefix + "Cartridge", coll, loc=CART_POSE_LOC, rot=(0, 0, math.pi))
        return gb, ca

    gb, ca = tree("", C_RENDER)
    gbL, caL = tree("LOD_", C_GLB)

    def to_gb(objs):
        parent(objs[0], gb)
        if len(objs) > 1:
            parent(objs[1], gbL)

    def to_ca(objs):
        parent(objs[0], ca)
        if len(objs) > 1:
            parent(objs[1], caL)

    def center_bl(p):  # drawing point -> Blender metres
        return tuple(gb_to_bl(np.array([p]))[0])

    gbuv = lambda me: box_uv(me, 7.0)  # noqa: E731

    log("Body ...")
    f = body_field()
    to_gb(sdf_object("Body", f, gb_to_bl, gb_n_to_bl, C_RENDER, mats=[M["Body"]], uv=gbuv,
                     glb_coll=C_GLB, adapt=0.02, glb_adapt=0.12, glb_target=36000))
    del f
    log("Bezel ...")
    f = bezel_field()
    to_gb(sdf_object("Bezel", f, gb_to_bl, gb_n_to_bl, C_RENDER, origin=center_bl(((BEZEL[0] + BEZEL[2]) / 2, (BEZEL[1] + BEZEL[3]) / 2, 0.0)),
                     mats=[M["Bezel"]], adapt=0.05, glb_coll=C_GLB, glb_adapt=0.2, glb_target=5000))
    f = led_field()
    to_gb(sdf_object("LED", f, gb_to_bl, gb_n_to_bl, C_RENDER, origin=center_bl((*LED_C, 0.0)), mats=[M["LED"]],
                     glb_coll=C_GLB, glb_adapt=0.2, glb_target=600))
    log("Buttons ...")
    f = dpad_field()
    to_gb(sdf_object("DPad", f, gb_to_bl, gb_n_to_bl, C_RENDER, origin=center_bl((*DPAD_C, 0.0)), mats=[M["DPad"]],
                     glb_coll=C_GLB, glb_adapt=0.15, glb_target=6000))
    for nm, c in (("ButtonA", BTN_A), ("ButtonB", BTN_B)):
        f = button_field(c)
        to_gb(sdf_object(nm, f, gb_to_bl, gb_n_to_bl, C_RENDER, origin=center_bl((*c, 0.0)), mats=[M["Buttons"]],
                         glb_coll=C_GLB, glb_adapt=0.15, glb_target=3000))
    for nm, c in (("Select", SEL_C), ("Start", START_C)):
        f = pill_field(c)
        to_gb(sdf_object(nm, f, gb_to_bl, gb_n_to_bl, C_RENDER, origin=center_bl((*c, 0.0)), mats=[M["Rubber"]],
                         glb_coll=C_GLB, glb_adapt=0.15, glb_target=1500))
    f = speaker_field()
    to_gb(sdf_object("Speaker", f, gb_to_bl, gb_n_to_bl, C_RENDER, origin=center_bl((72.0, 134.0, 3.4)), mats=[M["Speaker"]],
                     glb_coll=C_GLB, glb_adapt=0.3, glb_target=2500))
    del f

    # Screen: a single quad, UV 0..1 over the 160x144 display (v=1 at the top in Blender -> glTF v=0 at top)
    x0, y0, x1, y1 = LCD
    cS = np.array([(x0 + x1) / 2, (y0 + y1) / 2, 0.45])
    for coll, par in ((C_RENDER, gb), (C_GLB, gbL)):
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        pts = np.array([[x0, y1, 0.45], [x1, y1, 0.45], [x1, y0, 0.45], [x0, y0, 0.45]])
        V = gb_to_bl(pts) - gb_to_bl(cS[None])[0]
        vs = [bm.verts.new(tuple(v)) for v in V]
        face = bm.faces.new(vs)
        for lp, (u, v) in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            lp[uvl].uv = (u, v)
        face.normal_update()
        if face.normal.y > 0:
            face.normal_flip()
        nm = "Screen" if coll is C_RENDER else "Screen.glb"
        ob = bm_object(nm, bm, coll, [M["Screen"]], origin=tuple(gb_to_bl(cS[None])[0]))
        parent(ob, par)

    # ------------------------------------------------ cartridge
    log("Cartridge shells ...")
    cart_uv = lambda me: box_uv(me, 5.0)  # noqa: E731
    fF = cart_half_field(True)
    objsF = sdf_object("CartFront", fF, cart_to_bl, cart_n_to_bl, C_RENDER, mats=[M["Shell"], M["Label"]], uv=cart_uv,
                       adapt=0.02, glb_coll=C_GLB, glb_adapt=0.12, glb_target=14000)
    del fF
    fB = cart_half_field(False)
    objsB = sdf_object("CartBack", fB, cart_to_bl, cart_n_to_bl, C_RENDER, mats=[M["Shell"]], uv=cart_uv,
                       adapt=0.02, glb_coll=C_GLB, glb_adapt=0.12, glb_target=12000)
    del fB
    # label sticker in the recess (joined into CartFront as material 2)
    for ob in objsF:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        uvl = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
        L0, L1 = (LABEL[0] + 0.35, LABEL[1] + 0.35), (LABEL[2] - 0.35, LABEL[3] - 0.35)
        rr = 0.8
        pts = []
        corners = [(L1[0] - rr, L0[1] + rr, -90), (L1[0] - rr, L1[1] - rr, 0), (L0[0] + rr, L1[1] - rr, 90), (L0[0] + rr, L0[1] + rr, 180)]
        for (cx, cy, a0) in corners:
            for i in range(7):
                a = math.radians(a0 + i * 15)
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        wL = 0.33
        P = np.array([[u, v, wL] for u, v in pts])
        V = cart_to_bl(P)
        vs = [bm.verts.new(tuple(v)) for v in V]
        face = bm.faces.new(vs)
        face.material_index = 1
        face.smooth = False
        face.normal_update()
        if face.normal.y > 0:
            face.normal_flip()
        for lp in face.loops:
            u = (lp.vert.co.x * 1000 + 28.5 - L0[0]) / (L1[0] - L0[0])
            v = 1.0 - (32.5 - lp.vert.co.z * 1000 - L0[1]) / (L1[1] - L0[1])
            lp[uvl].uv = (u, v)
        bm.to_mesh(ob.data)
        bm.free()
    to_ca(objsF)
    to_ca(objsB)

    log("PCB ...")
    fP = pcb_field()
    pcb_uv = lambda me: planar_uv(me, lambda co: ((co[:, 0] * 1000 + 28.5) / C_W, 1.0 - (32.5 - co[:, 2] * 1000) / C_H))  # noqa: E731
    objsP = sdf_object("CartPCB", fP, cart_to_bl, cart_n_to_bl, C_RENDER, mats=[M["PCB"], M["Gold"], M["Passive"], M["Tin"]],
                       uv=pcb_uv, adapt=0.05, glb_coll=C_GLB, glb_adapt=0.2, glb_target=5000)
    del fP

    def cpt(u, v, w):
        return tuple(cart_to_bl(np.array([[u, v, w]]))[0])

    def add_fingers_and_passives(ob):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for fu in FINGERS:
            for w0, w1 in ((PCB_W[0] - 0.035, PCB_W[0] + 0.01), (PCB_W[1] - 0.01, PCB_W[1] + 0.035)):
                c = cpt(fu, 62.0, (w0 + w1) / 2)
                bm_box(bm, c, (1.0e-3, (w1 - w0) * 1e-3, 4.8e-3), mat_index=1)
        passives = [(24.2, 27.0, 0), (24.2, 29.0, 0), (24.2, 33.0, 0), (24.2, 35.0, 0), (13.8, 27.5, 1), (15.6, 27.5, 1),
                    (19.0, 36.2, 0), (21.2, 36.2, 0), (33.0, 21.0, 0), (39.2, 24.0, 1), (35.0, 45.8, 0), (37.5, 45.8, 0),
                    (11.5, 42.2, 0), (9.0, 45.0, 1), (44.5, 39.0, 1), (29.0, 37.0, 0)]
        hgt = 0.35
        for (u, v, rot) in passives:
            L, Wd = 1.0, 0.5
            wc = PCB_W[0] - hgt / 2 + 0.01
            if rot == 0:
                bm_box(bm, cpt(u, v, wc), (0.6e-3, hgt * 1e-3, Wd * 1e-3), mat_index=2)
                for s in (-1, 1):
                    bm_box(bm, cpt(u + s * 0.4, v, wc), (0.2e-3, (hgt + 0.02) * 1e-3, (Wd + 0.02) * 1e-3), mat_index=3)
            else:
                bm_box(bm, cpt(u, v, wc), (Wd * 1e-3, hgt * 1e-3, 0.6e-3), mat_index=2)
                for s in (-1, 1):
                    bm_box(bm, cpt(u, v + s * 0.4, wc), ((Wd + 0.02) * 1e-3, (hgt + 0.02) * 1e-3, 0.2e-3), mat_index=3)
        bm.to_mesh(ob.data)
        bm.free()
        # flat-shaded boxes: give their verts their face normals via custom normals reset
    for ob in objsP:
        add_fingers_and_passives(ob)
    to_ca(objsP)

    log("Chips ...")
    for name, (u, v, su, sv, hgt) in CHIPS.items():
        for coll, par in ((C_RENDER, ca), (C_GLB, caL)):
            bm = bmesh.new()
            c = cpt(u, v, PCB_W[0] - hgt / 2)
            org = cpt(u, v, PCB_W[0])
            cl = tuple(np.array(c) - np.array(org))
            if name == "BLE":
                # module substrate + shield can + meander antenna on the board beside it
                bm_box(bm, tuple(np.array(cpt(u, v, PCB_W[0] - 0.2)) - np.array(org)), (su * 1e-3, 0.4e-3, sv * 1e-3), 2, bevel=0.05e-3, segs=1)
                bm_box(bm, tuple(np.array(cpt(u - 0.6, v, PCB_W[0] - 0.4 - 0.4)) - np.array(org)), ((su - 1.6) * 1e-3, 0.8e-3, (sv - 0.4) * 1e-3), 0,
                       bevel=0.12e-3, segs=2)
                pts = []
                x = u + 3.2
                for i in range(7):
                    y0, y1 = v - 2.6, v + 2.6
                    pts += [(x, y0), (x, y1)] if i % 2 == 0 else [(x, y1), (x, y0)]
                    x += 0.9
                for (a, b) in zip(pts[:-1], pts[1:]):
                    cu, cv = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                    lu, lv = abs(a[0] - b[0]) + 0.3, abs(a[1] - b[1]) + 0.3
                    bm_box(bm, tuple(np.array(cpt(cu, cv, PCB_W[0] - 0.012)) - np.array(org)), (lu * 1e-3, 0.03e-3, lv * 1e-3), 1)
                bm_box(bm, tuple(np.array(cpt(u + 2.75, v + 2.6, PCB_W[0] - 0.012)) - np.array(org)), (0.9e-3, 0.03e-3, 0.3e-3), 1)
                mats = [M["Can"], M["Gold"], M["PCB"]]
            else:
                bm_box(bm, cl, (su * 1e-3, hgt * 1e-3, sv * 1e-3), 0, bevel=min(0.12, su * 0.04) * 1e-3, segs=2)
                mats = [M["Chip"]]
            nm = name if coll is C_RENDER else name + ".glb"
            ob = bm_object(nm, bm, coll, mats, origin=org)
            parent(ob, par)

    # ------------------------------------------------ tidy
    for ob in list(C_GLB.all_objects):
        ob.hide_render = True
    C_GLB.hide_render = True
    lc = bpy.context.view_layer.layer_collection.children["GLB_LOD"]
    lc.exclude = True
    for ob in C_RENDER.all_objects:
        if ob.type == "MESH":
            ob.data.update()
    scene.render.engine = "CYCLES"
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True, relative_remap=True)
    log("saved", BLEND)
    export_glb()


def export_glb():
    """Swap the LOD meshes in under the canonical names and export glTF binary."""
    lc = bpy.context.view_layer.layer_collection.children["GLB_LOD"]
    lc.exclude = False
    render = bpy.data.collections["KagiBoy"]
    keep = set()
    for ob in list(render.all_objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
    for ob in list(bpy.data.collections["GLB_LOD"].all_objects):
        ob.name = ob.name.replace("LOD_", "").replace(".glb", "")
        if ob.type == "MESH":
            ob.data.name = ob.name
        ob.hide_render = False
        keep.add(ob.name)
    bpy.ops.object.select_all(action="DESELECT")
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=GLB, export_format="GLB", use_selection=False, export_yup=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
        export_image_format="AUTO", export_cameras=False, export_lights=False, export_extras=False,
        use_active_collection=False, use_visible=False)
    log("exported", GLB, "%.2f MB" % (os.path.getsize(GLB) / 1e6), sorted(keep))


if __name__ == "__main__":
    main()
