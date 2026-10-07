"""Render the kagiboy stills from kagiboy.blend.

    blender -b -P ~/gb-wallet/assets/3d/render.py -- [shot ...] [--preview] [--samples N]

Shots: hero-front34 hero-sign back34-label cart-hero cart-exploded front-ortho pair-link check-front
(no shot names = all). Output: ~/gb-wallet/assets/renders/3d/*.png
Raw RGBA renders are composited over the pastel backdrop by post.py (system python3 + Pillow).
"""
import bpy
import os
import sys
import math
import time
import subprocess
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, "kagiboy.blend")
OUT = os.path.expanduser("~/gb-wallet/assets/renders/3d")
RAW = os.path.join(HERE, "raw")
SCREENS = os.path.expanduser("~/gb-wallet/web/public/screens")
PY = "/opt/homebrew/bin/python3" if os.path.exists("/opt/homebrew/bin/python3") else "python3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(RAW, exist_ok=True)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = "--preview" in argv
SAMPLES = 256
if "--samples" in argv:
    SAMPLES = int(argv[argv.index("--samples") + 1])
SHOTS = [a for a in argv if not a.startswith("--") and not a.isdigit()]
ALL = ["hero-front34", "hero-sign", "back34-label", "cart-hero", "cart-exploded", "front-ortho", "pair-link", "check-front"]
SHOTS = SHOTS or ALL
TIMES = {}

mm = 0.001


def srgb(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple([x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0])


# ------------------------------------------------------------------ setup
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
    c.samples = 48 if PREVIEW else SAMPLES
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02 if PREVIEW else 0.006
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    try:
        c.denoising_use_gpu = True
    except Exception:
        pass
    c.max_bounces = 10
    c.glossy_bounces = 6
    c.transmission_bounces = 6
    c.transparent_max_bounces = 8
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.blur_glossy = 0.5
    s.render.film_transparent = True
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.render.image_settings.color_depth = "8"
    vs = s.view_settings
    vs.view_transform = "AgX"
    vs.look = os.environ.get("KB_LOOK", "AgX - Punchy")
    vs.exposure = float(os.environ.get("KB_EXPOSURE", "-0.55"))
    vs.gamma = 1.0
    s.display_settings.display_device = "sRGB"


def world():
    w = bpy.data.worlds.new("Studio")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    # soft vertical gradient: brighter above, warm white below
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = srgb("#E9E5E1")
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = srgb("#FFFFFF")
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = float(os.environ.get("KB_WORLD", "0.15"))


def area(name, loc, target, size, energy, color="#FFFFFF", shape="RECTANGLE", size_y=None, spread=180):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.energy = energy
    ld.color = srgb(color)[:3]
    ld.spread = math.radians(spread)
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return ob


def studio():
    world()
    L = {}
    ls = float(os.environ.get("KB_LIGHT", "0.35"))
    E = lambda k, d: float(os.environ.get(k, d)) * ls  # noqa: E731
    L["key"] = area("Key", (-0.50, -0.38, 0.46), (0, 0, 0.07), 0.8, E("KB_KEY", "135"), "#FFF8F0", size_y=0.6)
    L["fill"] = area("Fill", (0.65, -0.45, 0.18), (0, 0, 0.07), 0.9, E("KB_FILL", "28"), "#F1F4FF", size_y=0.6)
    L["top"] = area("Top", (0.05, 0.15, 0.75), (0, 0, 0.0), 0.9, E("KB_TOP", "30"), "#FFFFFF")
    L["rim"] = area("Rim", (0.40, 0.55, 0.30), (0, 0, 0.07), 0.5, E("KB_RIM", "40"), "#FFF2F6")
    # shadow catcher floor
    bpy.ops.mesh.primitive_plane_add(size=6.0, location=(0, 0, 0))
    fl = bpy.context.active_object
    fl.name = "Floor"
    fl.is_shadow_catcher = True
    m = bpy.data.materials.new("Floor")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = srgb("#FBFAF8")
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    fl.data.materials.append(m)
    return L, fl


def camera(name, loc, target, lens=85, ortho=None, shift=(0, 0)):
    cd = bpy.data.cameras.new(name)
    cd.sensor_width = 36
    cd.clip_start = 0.01
    cd.clip_end = 20
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho
    else:
        cd.lens = lens
    cd.shift_x, cd.shift_y = shift
    ob = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = ob
    return ob


# Render-only albedo compensation: AgX lifts darks and desaturates, so these
# authored values make the *rendered* pixels land near the spec colours.
RENDER_COLORS = {"DPad": "#0D0D10", "ButtonAB": "#74103C", "Bezel": "#3C3D50", "Rubber": "#6A6866",
                 "Body": "#CBC4B8", "SpeakerBack": "#111112"}


def render_tweaks():
    """Render-only material tweaks (the GLB keeps the plain spec values)."""
    for n, c in RENDER_COLORS.items():
        bpy.data.materials[n].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = srgb(c)
    for n, kv in {"ButtonAB": {"Roughness": 0.42, "Coat Weight": 0.25, "Coat Roughness": 0.25},
                  "DPad": {"Roughness": 0.55, "Specular IOR Level": 0.35}}.items():
        b = bpy.data.materials[n].node_tree.nodes["Principled BSDF"]
        for k, v in kv.items():
            b.inputs[k].default_value = v
    m = bpy.data.materials["Label"]
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    img = nt.nodes["BaseImage"]
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    mul.inputs[7].default_value = (LABEL_TONE, LABEL_TONE, LABEL_TONE, 1.0)
    hs = nt.nodes.new("ShaderNodeHueSaturation")
    hs.inputs["Saturation"].default_value = LABEL_SAT
    nt.links.new(img.outputs["Color"], hs.inputs["Color"])
    nt.links.new(hs.outputs["Color"], mul.inputs[6])
    # keep the white ink white: mask = low saturation pixels
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    sep.mode = "HSV"
    nt.links.new(img.outputs["Color"], sep.inputs["Color"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 0.07
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.0
    nt.links.new(sep.outputs[1], mr.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(mr.outputs["Result"], mix.inputs["Factor"])
    nt.links.new(mul.outputs[2], mix.inputs[6])
    mix.inputs[7].default_value = (0.97, 0.97, 0.97, 1.0)
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])


LABEL_TONE = float(os.environ.get("KB_LABEL", "0.84"))
LABEL_SAT = float(os.environ.get("KB_LABEL_SAT", "2.3"))


def set_screen(name):
    m = bpy.data.materials["Screen"]
    n = m.node_tree.nodes["BaseImage"]
    n.image = bpy.data.images.load(os.path.join(SCREENS, name), check_existing=True)
    n.interpolation = "Closest"


def render(name, w, h, post_args=()):
    s = bpy.context.scene
    scale = 0.5 if PREVIEW else 1.0
    s.render.resolution_x = int(w * scale)
    s.render.resolution_y = int(h * scale)
    s.render.resolution_percentage = 100
    raw = os.path.join(RAW, name + ".png")
    s.render.filepath = raw
    t = time.time()
    if os.environ.get("KB_DEBUG"):
        for o in bpy.data.objects:
            if o.type == "MESH" and not o.hide_render:
                print("   vis", o.name, tuple(round(x, 3) for x in o.matrix_world.translation), o.visible_camera)
    bpy.ops.render.render(write_still=True)
    TIMES[name] = time.time() - t
    print("[render] %s %dx%d %.1fs" % (name, s.render.resolution_x, s.render.resolution_y, TIMES[name]), flush=True)
    subprocess.run([PY, os.path.join(HERE, "post.py"), raw, os.path.join(OUT, name + ".png"), *post_args], check=True)


# ------------------------------------------------------------------ scene helpers
def objs():
    return bpy.data.objects


def reset_pose():
    gb = objs()["GameBoy"]
    ca = objs()["Cartridge"]
    gb.location = (0, 0, 0)
    gb.rotation_euler = (0, 0, 0)
    ca.parent = None
    ca.location = CART_POSE
    ca.rotation_euler = (0, 0, math.pi)
    for o in list(bpy.data.collections["KagiBoy"].all_objects):
        o.hide_render = False
    for n, off in EXPLODE_HOME.items():
        objs()[n].location = off


def stand_gb(rot_z):
    """Game Boy standing on its bottom edge; cartridge inserted (parented for the move)."""
    gb = objs()["GameBoy"]
    ca = objs()["Cartridge"]
    ca.parent = gb
    ca.matrix_parent_inverse.identity()
    gb.location = (0, 0, 74 * mm + 0.0002)
    gb.rotation_euler = (0, 0, math.radians(rot_z))


def hide_gb(hide=True):
    gb = objs()["GameBoy"]
    for o in [gb] + list(gb.children_recursive):
        if o.name.startswith("Cart") or o.name in ("MCU", "SecureElement", "BLE", "Accel", "Cartridge"):
            continue
        o.hide_render = hide


def hide_cart(hide=True):
    ca = objs()["Cartridge"]
    for o in [ca] + list(ca.children_recursive):
        o.hide_render = hide


def light_energy(L, **kw):
    for k, v in kw.items():
        L[k].data.energy = v


# ------------------------------------------------------------------ shots
def shot_hero(L, fl, name, screen, dist=0.82, w=2400, h=1350, lens=85, tz=0.084):
    reset_pose()
    set_screen(screen)
    stand_gb(26)
    fl.hide_render = False
    tgt = (0.0, 0, tz)
    az, el = math.radians(-90 - 0), math.radians(13)
    cam_loc = (tgt[0] + dist * math.cos(el) * math.cos(az), tgt[1] + dist * math.cos(el) * math.sin(az), tgt[2] + dist * math.sin(el))
    camera("Cam_" + name, cam_loc, tgt, lens=lens)
    render(name, w, h)


def shot_back(L, fl):
    reset_pose()
    set_screen("home.png")
    stand_gb(180 + 36)
    fl.hide_render = False
    tgt = (0.0, 0, 0.086)
    dist = 0.80
    az, el = math.radians(-90), math.radians(21)
    camera("Cam_back", (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), tgt[2] + dist * math.sin(el)), tgt, lens=85)
    render("back34-label", 2400, 1800)


def shot_cart(L, fl):
    reset_pose()
    hide_gb(True)
    ca = objs()["Cartridge"]
    ca.location = (0, 0, 32.5 * mm + 0.0002)
    ca.rotation_euler = (0, 0, math.radians(-28))
    fl.hide_render = False
    tgt = (0.0, 0.0, 0.0335)
    dist = 0.29
    az, el = math.radians(-90), math.radians(11)
    camera("Cam_cart", (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), tgt[2] + dist * math.sin(el)), tgt, lens=85)
    render("cart-hero", 2400, 1600)


def shot_exploded(L, fl):
    reset_pose()
    hide_gb(True)
    ca = objs()["Cartridge"]
    # lying flat, label up, then spread the layers vertically
    ca.location = (0, 0, 0.0)
    ca.rotation_euler = (math.radians(-90), 0, math.radians(-30))
    gap = 25 * mm
    slide = 20 * mm
    bpy.context.view_layer.update()
    R = ca.rotation_euler.to_matrix()
    off_f = R.transposed() @ Vector((0, slide, gap))
    off_b = R.transposed() @ Vector((0, -slide, -gap))
    objs()["CartFront"].location = Vector(EXPLODE_HOME["CartFront"]) + off_f
    objs()["CartBack"].location = Vector(EXPLODE_HOME["CartBack"]) + off_b
    ca.location = (0, 0, gap + 7.7 * mm + 0.006)
    fl.hide_render = False
    tgt = (0.0, 0.0, ca.location.z)
    dist = 0.46
    az, el = math.radians(-90), math.radians(42)
    camera("Cam_expl", (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), tgt[2] + dist * math.sin(el)), tgt, lens=85)
    render("cart-exploded", 1600, 2400)


def shot_front_ortho(L, fl):
    reset_pose()
    set_screen("home.png")
    fl.hide_render = True
    # GB at origin, upright; frame -2..92 x, -17..150 y (mm)
    H = 168.0
    W = H * 900 / 1600
    cx, cy = 45.0, (-17 + 151) / 2
    camera("Cam_ortho", ((cx - 45) * mm, -0.5, (74 - cy) * mm), ((cx - 45) * mm, 0, (74 - cy) * mm), ortho=H * mm * 1.0)
    bpy.context.scene.camera.data.sensor_fit = "VERTICAL"
    render("front-ortho", 900, 1600, post_args=("--transparent",))


def shot_check(L, fl):
    """Orthographic front at the drawing's 5.92 px/mm, console only, for overlay vs gb-dims.png."""
    reset_pose()
    hide_cart(True)
    set_screen("home.png")
    fl.hide_render = True
    S = 5.92
    Wpx, Hpx = 1600, 1100
    cx_mm = (Wpx / 2 - 178) / S
    cy_mm = (Hpx / 2 - 88) / S
    cam = camera("Cam_check", ((cx_mm - 45) * mm, -0.5, (74 - cy_mm) * mm), ((cx_mm - 45) * mm, 0, (74 - cy_mm) * mm), ortho=Wpx / S * mm)
    cam.data.sensor_fit = "HORIZONTAL"
    global PREVIEW
    keep = PREVIEW
    PREVIEW = False
    bpy.context.scene.cycles.samples = 64
    render("check-front-raw", Wpx, Hpx, post_args=("--check", os.path.expanduser("~/gb-wallet/assets/ref/gb-dims.png")))
    PREVIEW = keep
    bpy.context.scene.cycles.samples = 48 if PREVIEW else SAMPLES
    hide_cart(False)


def shot_pair(L, fl):
    reset_pose()
    set_screen("home.png")
    fl.hide_render = False
    src = bpy.data.collections["KagiBoy"]
    # hide originals, use two collection instances lying face-up
    for o in list(src.all_objects):
        o.hide_render = True
    inst = []
    for i, x in enumerate((-0.07, 0.07)):
        e = bpy.data.objects.new("Pair%d" % i, None)
        e.instance_type = "COLLECTION"
        e.instance_collection = src
        e.location = (x, 0.0, (33.8 - 16) * mm + 0.0002)
        e.rotation_euler = (math.radians(-90), 0, 0)
        bpy.context.scene.collection.objects.link(e)
        inst.append(e)
    # collection instances render children even if the source objects are hidden_render? -> unhide source objects
    # but exclude the source collection from the view layer instead
    for o in list(src.all_objects):
        o.hide_render = False
    lc = bpy.context.view_layer.layer_collection.children["KagiBoy"]
    lc.exclude = True
    cable = link_cable()
    saved = {k: (tuple(v.location), tuple(v.rotation_euler), v.data.energy) for k, v in L.items()}
    ls = float(os.environ.get("KB_LIGHT", "0.35"))
    for k, loc, tgtl, en in (("key", (-0.45, -0.15, 0.85), (0, 0.01, 0), 150), ("fill", (0.55, -0.35, 0.55), (0, 0.01, 0), 30),
                             ("top", (0.0, 0.55, 0.8), (0, 0.01, 0), 45), ("rim", (0.3, 0.6, 0.5), (0, 0.01, 0), 15)):
        L[k].location = loc
        L[k].rotation_euler = (Vector(tgtl) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        L[k].data.energy = en * ls
    tgt = (0.0, 0.022, 0.0)
    camera("Cam_pair", (0.0, 0.022 - 0.015, 1.08), tgt, lens=70)
    render("pair-link", 2400, 1350)
    for k, (loc, rot, en) in saved.items():
        L[k].location, L[k].rotation_euler, L[k].data.energy = loc, rot, en
    lc.exclude = False
    for e in inst + cable:
        bpy.data.objects.remove(e, do_unlink=True)


def link_cable():
    """Grey link cable from the left GB's left port, over the top, into the right GB's left port."""
    made = []
    # port on the left side: drawing (x=0, y=24.4, d=20.0) -> lying face-up GB at X offset
    def port(xoff):
        # local Blender of the port centre (x=0,y=24.4,d=20) : X=-45, Y=4, Z=49.6 mm; after Rx(-90): (X, Z, -Y) -> (X, 49.6, ... )
        return Vector((xoff - 45 * mm, 49.6 * mm, (33.8 - 16) * mm + 0.0002 - 4.0 * mm))
    p1 = port(-0.07)
    p2 = port(0.07)
    zc = p1.z
    plug_len = 9 * mm
    a = p1 + Vector((-plug_len, 0, 0))
    b = p2 + Vector((-plug_len, 0, 0))
    cd = bpy.data.curves.new("LinkCable", "CURVE")
    cd.dimensions = "3D"
    cd.bevel_depth = 1.7 * mm
    cd.bevel_resolution = 6
    cd.resolution_u = 32
    sp = cd.splines.new("BEZIER")
    pts = [a, Vector((-0.165, 0.105, zc)), Vector((-0.01, 0.118, zc)), b]
    sp.bezier_points.add(len(pts) - 1)
    handles = [Vector((-0.03, 0.0, 0)), Vector((0.0, 0.05, 0)), Vector((0.06, 0, 0)), Vector((-0.03, 0.0, 0))]
    for bp, p, hd in zip(sp.bezier_points, pts, handles):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "FREE"
        bp.handle_left = p - hd
        bp.handle_right = p + hd
    sp.bezier_points[0].handle_right = a + Vector((-0.035, 0, 0))
    sp.bezier_points[0].handle_left = a + Vector((0.035, 0, 0))
    sp.bezier_points[-1].handle_left = b + Vector((-0.04, 0.0, 0))
    sp.bezier_points[-1].handle_right = b + Vector((0.04, 0, 0))
    sp.bezier_points[1].handle_left = pts[1] + Vector((0.0, -0.05, 0))
    sp.bezier_points[1].handle_right = pts[1] + Vector((0.0, 0.03, 0))
    sp.bezier_points[2].handle_left = pts[2] + Vector((-0.06, 0.0, 0))
    sp.bezier_points[2].handle_right = pts[2] + Vector((0.05, 0.0, 0))
    ob = bpy.data.objects.new("LinkCable", cd)
    bpy.context.scene.collection.objects.link(ob)
    m = bpy.data.materials.new("Cable")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = srgb("#9A9894")
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.55
    cd.materials.append(m)
    made.append(ob)
    for p in (p1, p2):
        bpy.ops.mesh.primitive_cube_add(size=1, location=p + Vector((-plug_len / 2 - 0.5 * mm, 0, 0)))
        pl = bpy.context.active_object
        pl.scale = (plug_len, 9.5 * mm, 7.0 * mm)
        bv = pl.modifiers.new("bv", "BEVEL")
        bv.width = 1.6 * mm
        bv.segments = 5
        pl.data.materials.append(m)
        bpy.ops.object.shade_smooth()
        made.append(pl)
        # strain relief
        bpy.ops.mesh.primitive_cylinder_add(radius=2.6 * mm, depth=6 * mm, location=p + Vector((-plug_len - 2.5 * mm, 0, 0)),
                                            rotation=(0, math.radians(90), 0))
        sr = bpy.context.active_object
        bv = sr.modifiers.new("bv", "BEVEL")
        bv.width = 0.8 * mm
        bv.segments = 4
        sr.data.materials.append(m)
        bpy.ops.object.shade_smooth()
        made.append(sr)
    return made


# ------------------------------------------------------------------ main
bpy.ops.wm.open_mainfile(filepath=BLEND)
setup_render()
render_tweaks()
L, FLOOR = studio()
CART_POSE = tuple(objs()["Cartridge"].location)
EXPLODE_HOME = {n: tuple(objs()[n].location) for n in ("CartFront", "CartBack", "CartPCB", "MCU", "SecureElement", "BLE", "Accel")}

for sname in SHOTS:
    if sname == "hero-front34":
        shot_hero(L, FLOOR, "hero-front34", "home.png")
    elif sname == "hero-sign":
        shot_hero(L, FLOOR, "hero-sign", "sign.png", dist=0.68, tz=0.104)
    elif sname == "back34-label":
        shot_back(L, FLOOR)
    elif sname == "cart-hero":
        shot_cart(L, FLOOR)
    elif sname == "cart-exploded":
        shot_exploded(L, FLOOR)
    elif sname == "front-ortho":
        shot_front_ortho(L, FLOOR)
    elif sname == "pair-link":
        shot_pair(L, FLOOR)
    elif sname == "qa":
        # QA closeups (not deliverables) -> raw/qa-*.png
        reset_pose()
        stand_gb(26)
        for nm, tgt, dist, el, az in (("qa-buttons", (0.02, -0.02, 0.05), 0.22, 20, -90),
                                      ("qa-top", (0.0, 0.0, 0.15), 0.25, 35, -60),
                                      ("qa-backtop", (0.0, 0.0, 0.14), 0.25, 30, 100),
                                      ("qa-side", (-0.04, 0.0, 0.11), 0.22, 10, -160)):
            a, e = math.radians(az), math.radians(el)
            camera("Cam_" + nm, (tgt[0] + dist * math.cos(e) * math.cos(a), tgt[1] + dist * math.cos(e) * math.sin(a), tgt[2] + dist * math.sin(e)), tgt, lens=85)
            bpy.context.scene.render.resolution_x = 1200
            bpy.context.scene.render.resolution_y = 900
            bpy.context.scene.render.filepath = os.path.join(RAW, nm + ".png")
            bpy.ops.render.render(write_still=True)
    elif sname == "check-front":
        shot_check(L, FLOOR)
print("[render] times:", {k: round(v, 1) for k, v in TIMES.items()})
