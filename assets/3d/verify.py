"""Verification helpers.

  blender -b -P verify.py            -> cartridge half outline comparison + GLB re-import check
Writes raw/cart_outlines.npz and prints a report.
"""
import bpy
import os
import json
import struct
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.expanduser("~/gb-wallet/web/public/3d/kagiboy.glb")


def hull(P):
    P = sorted(set(map(tuple, np.round(P, 6))))
    if len(P) < 3:
        return np.array(P)

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return np.array(lo[:-1] + up[:-1])


def area(H):
    x, y = H[:, 0], H[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def seg_dist(P, H):
    """max over points P of distance to polygon boundary H."""
    A = H
    B = np.roll(H, -1, 0)
    best = np.full(len(P), np.inf)
    for a, b in zip(A, B):
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        best = np.minimum(best, d)
    return best.max()


def outlines():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "kagiboy.blend"))
    res = {}
    for n in ("CartFront", "CartBack"):
        me = bpy.data.objects[n].data
        V = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", V)
        V = V.reshape(-1, 3) * 1000.0
        H = hull(V[:, [0, 2]])
        res[n] = (V, H)
        print("%-9s verts=%d  X[%.3f, %.3f] Z[%.3f, %.3f] Y[%.3f, %.3f]  silhouette area=%.3f mm2" % (
            n, len(V), V[:, 0].min(), V[:, 0].max(), V[:, 2].min(), V[:, 2].max(), V[:, 1].min(), V[:, 1].max(), area(H)))
    Hf, Hb = res["CartFront"][1], res["CartBack"][1]
    d1 = seg_dist(Hf, Hb)
    d2 = seg_dist(Hb, Hf)
    print("outline Hausdorff distance front<->back: %.4f mm (voxel 0.08 mm)" % max(d1, d2))
    print("area difference: %.4f mm2 (%.4f%%)" % (abs(area(Hf) - area(Hb)), 100 * abs(area(Hf) - area(Hb)) / area(Hf)))
    np.savez(os.path.join(HERE, "raw", "cart_outlines.npz"), front=Hf, back=Hb)


def glb_check():
    raw = open(GLB, "rb").read()
    n = struct.unpack("<I", raw[12:16])[0]
    j = json.loads(raw[20:20 + n])
    print("GLB size: %.2f MB" % (len(raw) / 1e6))
    nodes = j["nodes"]

    def walk(i, depth):
        nd = nodes[i]
        extra = ""
        if "mesh" in nd:
            m = j["meshes"][nd["mesh"]]
            tri = sum(j["accessors"][p["indices"]]["count"] // 3 for p in m["primitives"])
            mats = [j["materials"][p["material"]]["name"] for p in m["primitives"] if "material" in p]
            extra = "  tris=%d mats=%s" % (tri, mats)
        t = nd.get("translation")
        print("  " * depth + "- " + nd.get("name", "?") + ("  t=" + str([round(x, 4) for x in t]) if t else "") + extra)
        for c in nd.get("children", []):
            walk(c, depth + 1)
    for r in j["scenes"][0]["nodes"]:
        walk(r, 1)
    print("images:", [(im.get("name"), im.get("mimeType")) for im in j.get("images", [])])
    print("extensionsUsed:", j.get("extensionsUsed"))
    # Screen UVs
    for nd in nodes:
        if nd.get("name") != "Screen":
            continue
        m = j["meshes"][nd["mesh"]]
        if True:
            acc = j["accessors"][m["primitives"][0]["attributes"]["TEXCOORD_0"]]
            bv = j["bufferViews"][acc["bufferView"]]
            off = 20 + n + 8 + bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
            uv = np.frombuffer(raw[off:off + acc["count"] * 8], np.float32).reshape(-1, 2)
            pacc = j["accessors"][m["primitives"][0]["attributes"]["POSITION"]]
            pbv = j["bufferViews"][pacc["bufferView"]]
            poff = 20 + n + 8 + pbv.get("byteOffset", 0) + pacc.get("byteOffset", 0)
            pos = np.frombuffer(raw[poff:poff + pacc["count"] * 12], np.float32).reshape(-1, 3)
            print("Screen glTF UVs (u,v) with local positions (x, y-up) in mm:")
            for p, u in zip(pos, uv):
                print("   pos=(%.2f, %.2f, %.2f)  uv=(%.3f, %.3f)" % (p[0] * 1000, p[1] * 1000, p[2] * 1000, u[0], u[1]))
    # re-import in Blender
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    print("re-imported objects:", sorted(o.name for o in bpy.data.objects))


if __name__ == "__main__":
    outlines()
    glb_check()
