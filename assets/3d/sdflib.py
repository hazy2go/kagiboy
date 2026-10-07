"""Tiny numpy signed-distance-field toolkit used by build.py.

Shapes are modelled as SDFs on a regular voxel grid (mm units, negative =
inside), then meshed with OpenVDB (bundled with Blender) and given exact
normals sampled from the field gradient. That keeps every fillet and groove
smooth without fighting boolean/bevel modifiers.
"""
import numpy as np
import openvdb as vdb

f32 = np.float32


# ---------------------------------------------------------------- combinators
def rI(a, b, r):
    """Intersection with circular fillet of radius r (hg_sdf)."""
    ux = np.maximum(r + a, 0.0)
    uy = np.maximum(r + b, 0.0)
    return np.minimum(-r, np.maximum(a, b)) + np.sqrt(ux * ux + uy * uy)


def rU(a, b, r):
    """Union with circular fillet of radius r."""
    ux = np.maximum(r - a, 0.0)
    uy = np.maximum(r - b, 0.0)
    return np.maximum(r, np.minimum(a, b)) - np.sqrt(ux * ux + uy * uy)


def rD(a, b, r):
    """a minus b with a rounded edge of radius r."""
    return rI(a, -b, r)


def smax(a, b, k):
    """Polynomial smooth max (blend width k)."""
    h = np.clip(0.5 + 0.5 * (a - b) / k, 0.0, 1.0)
    return b * (1 - h) + a * h + k * h * (1 - h)


def slab(z, z0, z1):
    return np.maximum(z0 - z, z - z1)


# ---------------------------------------------------------------- 2D shapes
def rbox2(px, py, x0, y0, x1, y1, rtl, rtr=None, rbr=None, rbl=None):
    """Rounded rectangle, per-corner radii. y grows downward (tl = small x, small y)."""
    if rtr is None:
        rtr = rbr = rbl = rtl
    cx, cy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    bx, by = (x1 - x0) * 0.5, (y1 - y0) * 0.5
    qx = px - cx
    qy = py - cy
    r = np.where(qx > 0, np.where(qy > 0, rbr, rtr), np.where(qy > 0, rbl, rtl))
    ax = np.abs(qx) - bx + r
    ay = np.abs(qy) - by + r
    return (np.minimum(np.maximum(ax, ay), 0.0)
            + np.sqrt(np.maximum(ax, 0.0) ** 2 + np.maximum(ay, 0.0) ** 2) - r)


def circle2(px, py, cx, cy, r):
    return np.sqrt((px - cx) ** 2 + (py - cy) ** 2) - r


def capsule2(px, py, ax, ay, bx, by, r):
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    h = np.clip((pax * bax + pay * bay) / (bax * bax + bay * bay), 0.0, 1.0)
    return np.sqrt((pax - bax * h) ** 2 + (pay - bay * h) ** 2) - r


def pill2(px, py, cx, cy, length, width, ang_deg):
    """Stadium of total length/width centred at c, rotated (deg, CCW on screen with y down = rising right for negative)."""
    a = np.radians(ang_deg)
    dx, dy = np.cos(a), np.sin(a)
    hl = (length - width) * 0.5
    return capsule2(px, py, cx - dx * hl, cy - dy * hl, cx + dx * hl, cy + dy * hl, width * 0.5)


def tri2(px, py, p0, p1, p2):
    """Exact SDF of a triangle (iq)."""
    e0 = (p1[0] - p0[0], p1[1] - p0[1])
    e1 = (p2[0] - p1[0], p2[1] - p1[1])
    e2 = (p0[0] - p2[0], p0[1] - p2[1])
    v0 = (px - p0[0], py - p0[1])
    v1 = (px - p1[0], py - p1[1])
    v2 = (px - p2[0], py - p2[1])

    def seg(v, e):
        h = np.clip((v[0] * e[0] + v[1] * e[1]) / (e[0] * e[0] + e[1] * e[1]), 0, 1)
        return (v[0] - e[0] * h, v[1] - e[1] * h)

    q0, q1, q2 = seg(v0, e0), seg(v1, e1), seg(v2, e2)
    s = np.sign(e0[0] * e2[1] - e0[1] * e2[0])
    d0 = (q0[0] ** 2 + q0[1] ** 2, s * (v0[0] * e0[1] - v0[1] * e0[0]))
    d1 = (q1[0] ** 2 + q1[1] ** 2, s * (v1[0] * e1[1] - v1[1] * e1[0]))
    d2 = (q2[0] ** 2 + q2[1] ** 2, s * (v2[0] * e2[1] - v2[1] * e2[0]))
    dd = np.minimum(np.minimum(d0[0], d1[0]), d2[0])
    ss = np.minimum(np.minimum(d0[1], d1[1]), d2[1])
    return -np.sqrt(dd) * np.sign(ss)


def plus2(px, py, cx, cy, span, arm, r_out, r_in):
    h = span * 0.5
    w = arm * 0.5
    a = rbox2(px, py, cx - h, cy - w, cx + h, cy + w, r_out)
    b = rbox2(px, py, cx - w, cy - h, cx + w, cy + h, r_out)
    return rU(a, b, r_in)


# ---------------------------------------------------------------- grid
class Field:
    """Dense SDF sampled on a regular grid. Axes are the part's own (a, b, c) mm coords."""

    def __init__(self, lo, hi, h, chunk=24):
        self.h = float(h)
        self.lo = np.array(lo, float)
        n = np.ceil((np.array(hi, float) - self.lo) / h).astype(int) + 1
        self.n = n
        self.ax = [self.lo[i] + np.arange(n[i]) * h for i in range(3)]
        self.F = np.empty(tuple(n), f32)
        self.chunk = chunk

    def _slices(self, bbox):
        if bbox is None:
            return [slice(0, self.n[i]) for i in range(3)]
        out = []
        for i in range(3):
            a = int(np.clip(np.floor((bbox[0][i] - self.lo[i]) / self.h), 0, self.n[i]))
            b = int(np.clip(np.ceil((bbox[1][i] - self.lo[i]) / self.h) + 1, 0, self.n[i]))
            out.append(slice(a, b))
        return out

    def _iter(self, bbox):
        sx, sy, sz = self._slices(bbox)
        for i0 in range(sx.start, sx.stop, self.chunk):
            i1 = min(i0 + self.chunk, sx.stop)
            X = self.ax[0][i0:i1][:, None, None]
            Y = self.ax[1][sy][None, :, None]
            Z = self.ax[2][sz][None, None, :]
            yield (slice(i0, i1), sy, sz), X, Y, Z

    def base(self, fn):
        for s, X, Y, Z in self._iter(None):
            self.F[s] = np.broadcast_to(fn(X, Y, Z), self.F[s].shape)

    def apply(self, fn, bbox=None):
        """fn(X, Y, Z, F) -> new F for the sub block."""
        for s, X, Y, Z in self._iter(bbox):
            sub = self.F[s]
            if sub.size == 0:
                continue
            self.F[s] = np.broadcast_to(fn(X, Y, Z, sub), sub.shape)

    def sub(self, fn, bbox, r=0.0):
        self.apply(lambda X, Y, Z, F: rD(F, fn(X, Y, Z), r) if r > 0 else np.maximum(F, -fn(X, Y, Z)), bbox)

    def add(self, fn, bbox, r=0.0):
        self.apply(lambda X, Y, Z, F: rU(F, fn(X, Y, Z), r) if r > 0 else np.minimum(F, fn(X, Y, Z)), bbox)

    def groove(self, fn_2d, depth, bbox, r=0.08):
        """Cut a groove whose cross-section is fn_2d<0, depth measured from the current surface."""
        def f(X, Y, Z, F):
            g = np.maximum(fn_2d(X, Y, Z), -(F + depth))
            return rD(F, g, r)
        self.apply(f, bbox)

    # ---- meshing
    def polygons(self, adaptivity=0.0, band=None):
        band = band or 4 * self.h
        A = np.clip(self.F, -band, band).astype(f32)
        g = vdb.FloatGrid(band)
        g.copyFromArray(A)
        g.prune()
        p, t, q = g.convertToPolygons(0.0, float(adaptivity))
        p = p.astype(np.float64) * self.h + self.lo
        return p, np.asarray(t, np.int64), np.asarray(q, np.int64)

    def sample(self, P):
        g = (P - self.lo) / self.h
        i0 = np.floor(g).astype(np.int64)
        for k in range(3):
            np.clip(i0[:, k], 0, self.n[k] - 2, out=i0[:, k])
        f = np.clip(g - i0, 0, 1)
        F = self.F
        x, y, z = i0[:, 0], i0[:, 1], i0[:, 2]
        fx, fy, fz = f[:, 0], f[:, 1], f[:, 2]
        c00 = F[x, y, z] * (1 - fx) + F[x + 1, y, z] * fx
        c10 = F[x, y + 1, z] * (1 - fx) + F[x + 1, y + 1, z] * fx
        c01 = F[x, y, z + 1] * (1 - fx) + F[x + 1, y, z + 1] * fx
        c11 = F[x, y + 1, z + 1] * (1 - fx) + F[x + 1, y + 1, z + 1] * fx
        c0 = c00 * (1 - fy) + c10 * fy
        c1 = c01 * (1 - fy) + c11 * fy
        return c0 * (1 - fz) + c1 * fz

    def normals(self, P):
        e = self.h * 0.8
        N = np.empty_like(P)
        for k in range(3):
            d = np.zeros(3)
            d[k] = e
            N[:, k] = self.sample(P + d) - self.sample(P - d)
        L = np.linalg.norm(N, axis=1, keepdims=True)
        L[L == 0] = 1
        return N / L
