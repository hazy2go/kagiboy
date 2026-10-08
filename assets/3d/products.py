"""Product shots for the pitch video's four cards, rendered from kagiboy.blend with the same studio.

    blender -b -P ~/gb-wallet/assets/3d/products.py -- [prod-cart prod-limited prod-japan prod-bundle] [--samples N]

Reuses render.py's setup (Cycles, AgX, lights, shadow-catcher floor). Output: transparent PNGs in
~/gb-wallet/assets/renders/3d/ (prod-*.png), square, the subject centred with room around it.
"""
import os
import sys
import math

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "render.py")).read()
# everything before render.py's main block: setup, studio, camera, pose helpers
exec(compile(src.split("# ------------------------------------------------------------------ main")[0], "render.py", "exec"))

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PROD = [a for a in argv if a.startswith("prod-")] or ["prod-cart", "prod-limited", "prod-japan", "prod-bundle"]
SIZE = 1400

bpy.ops.wm.open_mainfile(filepath=BLEND)
setup_render()
render_tweaks()
L, FLOOR = studio()
CART_POSE = tuple(objs()["Cartridge"].location)
EXPLODE_HOME = {n: tuple(objs()[n].location) for n in ("CartFront", "CartBack", "CartPCB", "MCU", "SecureElement", "BLE", "Accel")}
BASE_ENERGY = {k: v.data.energy for k, v in L.items()}


def look_at(tgt, dist, az_deg, el_deg, lens=85, name="Cam_prod"):
    az, el = math.radians(az_deg), math.radians(el_deg)
    loc = (tgt[0] + dist * math.cos(el) * math.cos(az), tgt[1] + dist * math.cos(el) * math.sin(az), tgt[2] + dist * math.sin(el))
    camera(name, loc, tgt, lens=lens)


def cart_standing(ca, x=0.0, y=0.0, rot=-28):
    ca.parent = None
    ca.location = (x, y, 32.5 * mm + 0.0002)
    ca.rotation_euler = (0, 0, math.radians(rot))


def restore_lights():
    for k, e in BASE_ENERGY.items():
        L[k].data.energy = e
    bpy.context.scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.15


def shell_material(name, color, transmission=0.0, roughness=0.32, alpha_tint=None):
    m = bpy.data.materials["CartShell"].copy()
    m.name = name
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color)
    b.inputs["Roughness"].default_value = roughness
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
        b.inputs["IOR"].default_value = 1.49
    return m


def duplicate_cart():
    """A full copy of the cartridge (shell, label, board) with its own shell material slots."""
    ca = objs()["Cartridge"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in [ca] + list(ca.children_recursive):
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = ca
    bpy.ops.object.duplicate(linked=False)
    new = [o for o in bpy.context.selected_objects]
    root = next(o for o in new if o.parent is None or o.parent not in new)
    return root, new


def set_shell(objs_, mat):
    for o in objs_:
        if o.type != "MESH":
            continue
        for i, slot in enumerate(o.material_slots):
            if slot.material and (slot.material.name.startswith("CartShell") or slot.material.name.startswith("Shell_")):
                o.material_slots[i].link = "OBJECT"
                o.material_slots[i].material = mat


for name in PROD:
    reset_pose()
    restore_lights()
    FLOOR.hide_render = False
    ca = objs()["Cartridge"]
    if name == "prod-cart":
        hide_gb(True)
        cart_standing(ca, rot=-24)
        look_at((0.0, 0.0, 0.034), 0.30, -90, 10)
        render(name, SIZE, SIZE, post_args=("--transparent",))

    elif name == "prod-limited":
        hide_gb(True)
        # three numbered colourways in a fan: atomic purple, clear teal, a soft pink
        # copies first, while every shell still uses the shared material; then each gets its own
        left, lparts = duplicate_cart()
        right, rparts = duplicate_cart()
        cart_standing(left, x=-0.06, y=0.035, rot=-38)
        cart_standing(ca, x=0.0, y=0.0, rot=-12)
        cart_standing(right, x=0.06, y=0.035, rot=14)
        set_shell(lparts, shell_material("Shell_Purple", "#6E46B8", transmission=0.6, roughness=0.16))
        set_shell(rparts, shell_material("Shell_Teal", "#3FA9A4", transmission=0.55, roughness=0.16))
        set_shell([ca] + list(ca.children_recursive), shell_material("Shell_Pink", "#F0A3C0", roughness=0.33))
        look_at((0.0, 0.02, 0.036), 0.42, -90, 12)
        render(name, SIZE, SIZE, post_args=("--transparent",))
        for o in lparts + rparts:
            bpy.data.objects.remove(o, do_unlink=True)
        # the original cartridge goes back to its own shell
        for o in [ca] + list(ca.children_recursive):
            if o.type == "MESH":
                for slot in o.material_slots:
                    slot.link = "DATA"

    elif name == "prod-japan":
        hide_gb(True)
        cart_standing(ca, rot=-6)
        # lit only from behind: a dark shape with a cool rim of light
        for k in ("key", "fill", "top", "rim"):
            L[k].data.energy = 0.0
        # two strips behind and to the sides graze the edges toward the camera, plus a faint top kiss
        rims = [area("RimL", (-0.16, 0.16, 0.06), (0, 0, 0.034), 0.05, 60, "#BFD3FF", size_y=0.25),
                area("RimR", (0.16, 0.16, 0.07), (0, 0, 0.034), 0.05, 60, "#BFD3FF", size_y=0.25),
                area("RimT", (0.0, 0.12, 0.2), (0, 0, 0.05), 0.12, 12, "#DCE6FF")]
        bpy.context.scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.01
        FLOOR.hide_render = True
        look_at((0.0, 0.0, 0.034), 0.30, -90, 6)
        render(name, SIZE, SIZE, post_args=("--transparent",))
        for r in rims:
            bpy.data.objects.remove(r, do_unlink=True)

    elif name == "prod-bundle":
        set_screen("home.png")
        stand_gb(18)
        # the cartridge out of the slot, standing beside the console
        ca.parent = None
        ca.location = (0.075, -0.035, 32.5 * mm + 0.0002)
        ca.rotation_euler = (0, 0, math.radians(-30))
        look_at((0.03, 0.0, 0.07), 0.62, -90, 12)
        render(name, SIZE, SIZE, post_args=("--transparent",))

print("[products] times:", {k: round(v, 1) for k, v in TIMES.items()})
