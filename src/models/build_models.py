"""
VEYNHOLD — procedural rigged GLB characters.
Builds five skinned, game-ready low-poly characters with a Mixamo-style humanoid skeleton,
cape/scarf bone chains, a separate blade node, PBR material slots, small embedded weathering
textures and one looping "Idle_Guard" clip. Pure Python (numpy + pygltflib + Pillow).
"""
import io, math, json, struct, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import pygltflib as G

# ----------------------------------------------------------------------------- math helpers
def v(*a): return np.array(a, dtype=np.float64)
def norm(a): n = np.linalg.norm(a); return a / n if n > 1e-9 else a
def quat_axis(axis, ang):
    axis = norm(np.asarray(axis, float)); s = math.sin(ang / 2); return np.array([axis[0] * s, axis[1] * s, axis[2] * s, math.cos(ang / 2)])
def quat_mul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2])
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def rot_between(a, b):
    a = norm(a); b = norm(b); c = np.cross(a, b); d = float(np.dot(a, b))
    if d < -0.9999: ax = np.cross(a, v(1, 0, 0)); ax = ax if np.linalg.norm(ax) > 1e-6 else np.cross(a, v(0, 1, 0)); return quat_mat(quat_axis(ax, math.pi))
    s = math.sqrt((1 + d) * 2); q = np.array([c[0] / s, c[1] / s, c[2] / s, s / 2]); return quat_mat(q)

# ----------------------------------------------------------------------------- skeleton
class Skeleton:
    def __init__(self): self.names, self.parent, self.head = [], [], []
    def add(self, name, parent, pos):
        self.names.append(name); self.parent.append(self.names.index(parent) if parent else -1); self.head.append(np.asarray(pos, float)); return len(self.names) - 1
    def i(self, name): return self.names.index(name)

def build_skeleton(H, bulk, cape_len=0.0, scarf=False, cape_top=1.43):
    s = H / 1.78; X = bulk
    k = Skeleton(); P = lambda x, y, z=0.0: v(x * X, y * s, z * X)
    k.add('Root', None, v(0, 0, 0))
    k.add('Hips', 'Root', P(0, 0.98)); k.add('Spine', 'Hips', P(0, 1.08)); k.add('Spine1', 'Spine', P(0, 1.27))
    k.add('Neck', 'Spine1', P(0, 1.50)); k.add('Head', 'Neck', P(0, 1.58)); k.add('HeadTop_End', 'Head', P(0, 1.78))
    for side, sx in (('Left', 1), ('Right', -1)):
        k.add(side + 'Shoulder', 'Spine1', P(0.035 * sx, 1.44)); k.add(side + 'Arm', side + 'Shoulder', P(0.235 * sx, 1.45))
        k.add(side + 'ForeArm', side + 'Arm', P(0.515 * sx, 1.45)); k.add(side + 'Hand', side + 'ForeArm', P(0.765 * sx, 1.45)); k.add(side + 'HandEnd', side + 'Hand', P(0.875 * sx, 1.45))
    for side, sx in (('Left', 1), ('Right', -1)):
        k.add(side + 'UpLeg', 'Hips', P(0.10 * sx, 0.95)); k.add(side + 'Leg', side + 'UpLeg', P(0.10 * sx, 0.52, 0.01)); k.add(side + 'Foot', side + 'Leg', P(0.10 * sx, 0.085))
        k.add(side + 'ToeBase', side + 'Foot', P(0.10 * sx, 0.03, 0.13)); k.add(side + 'Toe_End', side + 'ToeBase', P(0.10 * sx, 0.03, 0.22))
    if cape_len > 0:
        n = 4; prev = 'Spine1'
        for c in range(n):
            nm = 'Cape%d' % (c + 1); k.add(nm, prev, P(0, cape_top - cape_len * c / n, -0.17)); prev = nm
        k.add('Cape_End', prev, P(0, cape_top - cape_len, -0.2))
    if scarf:
        prev = 'Neck'
        for c in range(3):
            nm = 'Scarf%d' % (c + 1); k.add(nm, prev, P(0.05, 1.48 - 0.17 * c, -0.13 - 0.02 * c)); prev = nm
        k.add('Scarf_End', prev, P(0.06, 1.48 - 0.51, -0.2))
    return k

# ----------------------------------------------------------------------------- mesh building
class Part:
    """vertices for one material primitive, each with up to 2 bone influences"""
    def __init__(self): self.pos, self.nor, self.uv, self.j, self.w, self.idx = [], [], [], [], [], []
    def vert(self, p, n, uv, bones):
        n = np.asarray(n, float); n = n / np.linalg.norm(n) if np.linalg.norm(n) > 1e-6 else v(0, 1, 0)
        self.pos.append(p); self.nor.append(n); self.uv.append(uv)
        merged = {}
        for bb, wt in bones:
            if wt > 1e-3: merged[bb] = merged.get(bb, 0.0) + wt
        items = sorted(merged.items(), key=lambda x: -x[1])[:4]; tot = sum(w for _, w in items)
        j = [0, 0, 0, 0]; w = [0.0, 0.0, 0.0, 0.0]
        for q, (bb, wt) in enumerate(items): j[q] = bb; w[q] = wt / tot
        w32 = np.array(w, np.float32); w32[0] = np.float32(1.0) - np.float32(w32[1:].sum())   # exact float32 normalisation
        self.j.append(j); self.w.append(w32.tolist()); return len(self.pos) - 1

class Builder:
    def __init__(self, skel): self.k = skel; self.parts = {}
    def part(self, mat): return self.parts.setdefault(mat, Part())
    def B(self, name): return self.k.i(name)
    # rigid weight helper
    def rigid(self, bone): b = self.B(bone); return lambda p, t=0: [(b, 1.0)]
    def limb_w(self, bone, parent_bone, blend=0.22):
        b = self.B(bone); pb = self.B(parent_bone) if parent_bone else None
        def f(p, t=0):
            if pb is None or t >= blend: return [(b, 1.0)]
            a = 0.5 + 0.5 * (t / blend); return [(b, a), (pb, 1 - a)]
        return f
    def box(self, mat, center, size, wfn, R=None, taper=1.0, uvs=1.0):
        P = self.part(mat); R = np.eye(3) if R is None else R; c = np.asarray(center, float); hx, hy, hz = [s / 2 for s in size]
        faces = [((1, 0, 0), (0, 1, 0), (0, 0, 1)), ((-1, 0, 0), (0, 1, 0), (0, 0, -1)), ((0, 1, 0), (0, 0, 1), (1, 0, 0)), ((0, -1, 0), (0, 0, -1), (1, 0, 0)), ((0, 0, 1), (0, 1, 0), (-1, 0, 0)), ((0, 0, -1), (0, 1, 0), (1, 0, 0))]
        for n, up, rt in faces:
            n = v(*n); up = v(*up); rt = v(*rt); base = []
            for (a, b) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                lp = n * v(hx, hy, hz) + rt * a * v(hx, hy, hz) + up * b * v(hx, hy, hz)
                if lp[1] > 0: lp = lp * v(taper, 1, taper)
                wp = c + R @ lp; base.append(P.vert(wp, R @ n, ((a + 1) / 2 * uvs, (b + 1) / 2 * uvs), wfn(wp)))
            P.idx += [base[0], base[2], base[1], base[0], base[3], base[2]]   # CCW seen from outside
    def tube(self, mat, p0, p1, r0, r1, wfn, seg=8, rings=3, cap0=True, cap1=True, flat=1.0, scaleXZ=None):
        """frustum from p0 to p1; wfn(p, t) where t is 0..1 along the axis"""
        P = self.part(mat); p0 = np.asarray(p0, float); p1 = np.asarray(p1, float); ax = p1 - p0; L = np.linalg.norm(ax); R = rot_between(v(0, 1, 0), ax)
        rows = []
        for r in range(rings + 1):
            t = r / rings; rad = r0 + (r1 - r0) * t; row = []
            for s in range(seg + 1):
                a = s / seg * 2 * math.pi; lp = v(math.cos(a) * rad, t * L, math.sin(a) * rad * flat)
                wp = p0 + R @ lp; n = R @ v(math.cos(a), (r0 - r1) / max(L, 1e-6), math.sin(a) * flat)
                row.append(P.vert(wp, n, (s / seg, t), wfn(wp, t)))
            rows.append(row)
        for r in range(rings):
            for s in range(seg):
                a, b, c, d = rows[r][s], rows[r][s + 1], rows[r + 1][s + 1], rows[r + 1][s]
                P.idx += [a, c, b, a, d, c]
        for cap, t, rr in ((cap0, 0, r0), (cap1, 1, r1)):
            if not cap or rr <= 1e-4: continue
            cen = p0 + ax * t; n = norm(ax) * (1 if t else -1); ci = P.vert(cen, n, (0.5, 0.5), wfn(cen, t)); ring = []
            for s in range(seg):
                a = s / seg * 2 * math.pi; wp = p0 + R @ v(math.cos(a) * rr, t * L, math.sin(a) * rr * flat); ring.append(P.vert(wp, n, (0.5 + math.cos(a) / 2, 0.5 + math.sin(a) / 2), wfn(wp, t)))
            for s in range(seg):
                a, b = ring[s], ring[(s + 1) % seg]
                P.idx += ([ci, b, a] if t else [ci, a, b])
    def ellipsoid(self, mat, c, r, wfn, seg=10, rings=7, R=None, cut=None):
        """cut = (axis_index, min_value_in_unit) keeps only part of the sphere (domes, half-shells)"""
        P = self.part(mat); c = np.asarray(c, float); R = np.eye(3) if R is None else R; grid = []
        for i in range(rings + 1):
            th = i / rings * math.pi; row = []
            for j in range(seg + 1):
                ph = j / seg * 2 * math.pi; u = v(math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph))
                if cut is not None and u[cut[0]] < cut[1]: u = u.copy(); u[cut[0]] = cut[1]
                wp = c + R @ (u * np.asarray(r, float)); row.append(P.vert(wp, R @ (u / np.asarray(r, float)), (j / seg, i / rings), wfn(wp)))
            grid.append(row)
        for i in range(rings):
            for j in range(seg):
                a, b, cc, d = grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]
                P.idx += [a, b, cc, a, cc, d]
    def sheet(self, mat, corners_fn, nu, nv, wfn, double=True):
        """parametric sheet: corners_fn(u, v) -> world point; double-sided by duplicating with flipped winding"""
        P = self.part(mat); grid = []
        for i in range(nv + 1):
            row = []
            for j in range(nu + 1):
                u, w_ = j / nu, i / nv; p = corners_fn(u, w_); du = corners_fn(min(1, u + 0.01), w_) - corners_fn(max(0, u - 0.01), w_); dv = corners_fn(u, min(1, w_ + 0.01)) - corners_fn(u, max(0, w_ - 0.01))
                n = norm(np.cross(du, dv)); row.append((p, n, (u, w_)))
            grid.append(row)
        for side in ((1,) if not double else (1, -1)):
            ids = [[P.vert(p, n * side, uv, wfn(p, uv[1])) for (p, n, uv) in row] for row in grid]
            for i in range(nv):
                for j in range(nu):
                    a, b, c, d = ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]
                    P.idx += ([a, b, c, a, c, d] if side > 0 else [a, c, b, a, d, c])

# ----------------------------------------------------------------------------- textures (tiny, procedural weathering)
def tex_png(base, seed, kind):
    rng = np.random.default_rng(seed); S = 128; img = np.zeros((S, S, 3), float); img[:] = np.array(base, float)
    noise = rng.normal(0, 1, (S // 8, S // 8)); noise = np.array(Image.fromarray(((noise - noise.min()) / (np.ptp(noise) + 1e-9) * 255).astype('uint8')).resize((S, S), Image.BICUBIC), float) / 255
    fine = rng.normal(0, 1, (S, S)) * 0.035
    if kind == 'cloth':
        weave = ((np.indices((S, S))[0] % 3 == 0) * 0.05 + (np.indices((S, S))[1] % 4 == 0) * 0.04)
        img *= (0.82 + noise[..., None] * 0.3 - weave[..., None] + fine[..., None])
    elif kind == 'metal':
        img *= (0.85 + noise[..., None] * 0.25 + fine[..., None]); pil = Image.fromarray(np.clip(img, 0, 255).astype('uint8')); d = ImageDraw.Draw(pil)
        for _ in range(70):
            x, y = rng.integers(0, S, 2); L = rng.integers(4, 18); c = tuple(int(min(255, ch * 1.35)) for ch in base); d.line([(x, y), (x + L, y + rng.integers(-3, 4))], fill=c, width=1)
        img = np.array(pil, float)
    elif kind == 'skin':
        img *= (0.9 + noise[..., None] * 0.15 + fine[..., None] * 0.5)
    else: img *= (0.9 + noise[..., None] * 0.2 + fine[..., None])
    if kind in ('cloth', 'metal'):   # grime and old blood near the bottom of the UV space
        grime = np.clip((np.linspace(0, 1, S)[:, None] - 0.55) * 1.8, 0, 1) * (0.5 + noise * 0.8); img *= (1 - grime[..., None] * 0.35)
        for _ in range(3):
            cx, cy, r = rng.integers(10, S - 10), rng.integers(S // 2, S - 6), rng.integers(4, 11); yy, xx = np.ogrid[:S, :S]; m = ((xx - cx) ** 2 + (yy - cy) ** 2) < r * r
            img[m] = img[m] * 0.55 + np.array([70, 8, 6]) * 0.45
    buf = io.BytesIO(); Image.fromarray(np.clip(img, 0, 255).astype('uint8')).save(buf, 'JPEG', quality=82, optimize=True); return buf.getvalue()

def hex_rgb(h): return [(h >> 16) & 255, (h >> 8) & 255, h & 255]
def lin(c): return [((x / 255) ** 2.2) for x in c]

# ----------------------------------------------------------------------------- character designs
LOOKS = {   # base colours mirror the game's LOOKS table
    'wanderer': dict(H=1.78, bulk=1.0, cloth=0x252a33, armor=0x5b5f66, trim=0x8b1a1a, skin=0xb08a72, cape=0x1d2027, scarf=0x8b1a1a, blade=0xd8dde5),
    'duelist':  dict(H=1.76, bulk=1.02, cloth=0x3a2a1e, armor=0x6e5a3e, trim=0xa0763a, skin=0xa98266, cape=0x4a2e1c, blade=0xd8dde5),
    'warden':   dict(H=2.15, bulk=1.32, cloth=0x2b2d31, armor=0x6b7078, trim=0x3a3d42, skin=0x8c7a6a, cape=0x2a2c30, blade=0xbfc6cf),
    'brother':  dict(H=1.74, bulk=0.94, cloth=0x1f2a22, armor=0x3c4038, trim=0x55603d, skin=0x9e7c66, cape=0x18201a, blade=0xcfd6cc),
    'king':     dict(H=1.88, bulk=1.06, cloth=0x4a0f12, armor=0x24272d, trim=0x8e1b1f, skin=0x8f8f8f, cape=0x5a0c10, blade=0xe2e4ea),
}

def common_body(b, L, k, s, X, armored_legs=False, arm_r=0.05, leg_r=0.07):
    """limbs, hands, feet, neck with blended joint weights"""
    H = k.head; ix = k.i
    for side, sx in (('Left', 1), ('Right', -1)):
        b.tube('Cloth', H[ix(side + 'Arm')], H[ix(side + 'ForeArm')], arm_r * 1.1 * X, arm_r * 0.9 * X, b.limb_w(side + 'Arm', side + 'Shoulder'), seg=8)
        b.tube('Cloth', H[ix(side + 'ForeArm')], H[ix(side + 'Hand')], arm_r * 0.85 * X, arm_r * 0.7 * X, b.limb_w(side + 'ForeArm', side + 'Arm'), seg=8)
        b.ellipsoid('Skin', H[ix(side + 'Hand')] + v(0.05 * sx, 0, 0) * s, v(0.055, 0.035, 0.045) * s * X, b.rigid(side + 'Hand'), seg=8, rings=5)
        b.ellipsoid('Armor', H[ix(side + 'ForeArm')], v(0.055, 0.055, 0.055) * s * X, b.rigid(side + 'ForeArm'), seg=8, rings=5)   # elbow cap hides the bend
        b.tube('Cloth', H[ix(side + 'UpLeg')], H[ix(side + 'Leg')], leg_r * 1.15 * X, leg_r * 0.85 * X, b.limb_w(side + 'UpLeg', 'Hips'), seg=9)
        b.tube('Armor' if armored_legs else 'Cloth', H[ix(side + 'Leg')], H[ix(side + 'Foot')], leg_r * 0.85 * X, leg_r * 0.62 * X, b.limb_w(side + 'Leg', side + 'UpLeg'), seg=9)
        b.ellipsoid('Armor', H[ix(side + 'Leg')] + v(0, 0, 0.03) * s, v(0.065, 0.07, 0.06) * s * X, b.rigid(side + 'Leg'), seg=8, rings=5)  # knee cop
        b.box('Armor', H[ix(side + 'Foot')] + v(0, -0.04, 0.06) * s, v(0.1 * X, 0.08, 0.26) * s, b.rigid(side + 'Foot'), taper=0.85)
    b.tube('Skin', H[ix('Neck')] + v(0, -0.03, 0) * s, H[ix('Head')] + v(0, 0.04, 0) * s, 0.055 * s, 0.05 * s, b.limb_w('Neck', 'Spine1'), seg=8)

def torso(b, k, s, X, mat_lower='Cloth', mat_upper='Armor', chest_w=0.42, chest_d=0.25):
    H = k.head; ix = k.i
    b.tube(mat_lower, H[ix('Hips')] + v(0, -0.1, 0) * s, H[ix('Spine')] + v(0, 0.04, 0) * s, 0.17 * X * s, 0.16 * X * s, b.limb_w('Hips', None), seg=10, flat=0.7)
    b.tube(mat_lower, H[ix('Spine')], H[ix('Spine1')] + v(0, 0.02, 0) * s, 0.16 * X * s, 0.19 * X * s, b.limb_w('Spine', 'Hips', 0.35), seg=10, flat=0.68)
    b.box(mat_upper, H[ix('Spine1')] + v(0, 0.1, 0) * s, v(chest_w * X, 0.3, chest_d * X) * s, b.rigid('Spine1'), taper=1.08)
    b.ellipsoid('Skin', H[ix('Head')] + v(0, 0.1, 0.01) * s, v(0.1, 0.12, 0.11) * s, b.rigid('Head'), seg=12, rings=8)

def blade_mesh(L, kind, length, width, curve=0.0, crimson=False):
    """separate, unskinned blade; grip at origin, blade along +Z. returns Builder-like Part dict"""
    bb = Builder(Skeleton()); bb.k.add('B', None, v(0, 0, 0)); W = lambda p, t=0: [(0, 1.0)]
    # grip + guard + pommel
    bb.tube('Trim', v(0, 0, -0.16), v(0, 0, 0.08), 0.017, 0.017, W, seg=8)
    if kind == 'katana': bb.tube('Armor', v(0, 0, 0.08), v(0, 0, 0.1), 0.045, 0.045, W, seg=10)
    else: bb.box('Armor', v(0, 0, 0.09), v(0.2 if kind != 'great' else 0.32, 0.03, 0.03), W)
    bb.ellipsoid('Armor', v(0, 0, -0.17), v(0.025, 0.025, 0.025), W, seg=8, rings=5)
    # blade: segments with optional curve (bends toward +Y), tapered tip
    n = 10; P = bb.part('Blade'); E = bb.part('Edge') if crimson else None; ring = []
    for i in range(n + 1):
        t = i / n; z = 0.1 + t * length; y = curve * (t ** 2) * length; w = width * (1 - 0.15 * t) if i < n else 0.0
        th = 0.008 if i < n else 0.002; spine = v(0, y + w * 0.5, z); edge = v(0, y - w * 0.5, z)
        ring.append((spine + v(th, 0, 0), spine + v(-th, 0, 0), edge))
    for i in range(n):
        (a1, a2, a3), (b1, b2, b3) = ring[i], ring[i + 1]
        for (p, q, r, s_) in ((a1, b1, b3, a3), (a2, a3, b3, b2), (a1, a2, b2, b1)):
            nn = norm(np.cross(q - p, r - p)); ids = [P.vert(x, nn, (0.5, i / n), [(0, 1)]) for x in (p, q, r, s_)]; P.idx += [ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]]
        if E is not None:   # glowing crimson edge strip just outside the cutting edge
            p, q = a3 + v(0, -0.002, 0), b3 + v(0, -0.002, 0); r, s_ = q + v(0, -0.007, 0), p + v(0, -0.007, 0)
            for side in (1, -1):
                nn = v(side, 0, 0); ids = [E.vert(x + v(0.0085 * side, 0, 0), nn, (0, 0), [(0, 1)]) for x in (p, q, r, s_)]; E.idx += ([ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]] if side > 0 else [ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]])
    return bb

def design(name):
    L = LOOKS[name]; H_ = L['H']; X = L['bulk']; s = H_ / 1.78
    cape = {'wanderer': 0.85, 'duelist': 0.0, 'warden': 0.7, 'brother': 0.55, 'king': 1.15}[name]
    k = build_skeleton(H_, X, cape_len=cape * s, scarf=(name == 'wanderer'), cape_top=1.43 * s)
    b = Builder(k); Hd = k.head; ix = k.i
    torso(b, k, s, X, mat_upper='Armor' if name in ('warden', 'king', 'duelist') else 'Cloth', chest_w={'warden': 0.5}.get(name, 0.42))
    common_body(b, L, k, s, X, armored_legs=name in ('warden', 'king'), arm_r={'warden': 0.065, 'brother': 0.045}.get(name, 0.05), leg_r={'warden': 0.085, 'brother': 0.064}.get(name, 0.07))
    head = Hd[ix('Head')]; chest = Hd[ix('Spine1')]; hips = Hd[ix('Hips')]
    def skirt(mat, top_y, bot_y, r_top, r_bot, front_gap=0.0, length_back=0.0):
        """split tasset / coat skirt: 4 panels weighted to thighs and hips so legs can move"""
        for side, sx in (('Left', 1), ('Right', -1)):
            for fb, fz in ((1, 1), (-1, -1)):
                def f(u, w, sx=sx, fz=fz):
                    a = (0.08 + u * 0.84) * math.pi / 2; r = r_top + (r_bot - r_top) * w; y = top_y + (bot_y - top_y - (length_back if fz < 0 else 0)) * w
                    return v(sx * math.sin(a) * r * X, y, fz * math.cos(a) * r * X * 0.8) * v(1, 1, 1)
                hb, tb = k.i('Hips'), k.i(side + 'UpLeg')
                b.sheet(mat, f, 3, 3, lambda p, t, hb=hb, tb=tb: [(hb, 1 - t * 0.85), (tb, 0.15 + t * 0.85)])
    if name == 'wanderer':
        # deep hood: cowl shell + pulled-back point, shadowed face plate, scarf wrap, asymmetric left pauldron, bracers, coat skirt
        b.ellipsoid('Cloth', head + v(0, 0.11, -0.01) * s, v(0.135, 0.15, 0.15) * s, b.rigid('Head'), seg=12, rings=8, cut=(2, -0.95))
        b.tube('Cloth', head + v(0, 0.2, -0.06) * s, head + v(0, 0.3, -0.2) * s, 0.09 * s, 0.0, b.rigid('Head'), seg=8, cap1=False)
        b.box('Shadow', head + v(0, 0.09, 0.1) * s, v(0.15, 0.1, 0.02) * s, b.rigid('Head'))
        b.tube('Scarf', Hd[ix('Neck')] + v(0, -0.02, 0) * s, Hd[ix('Neck')] + v(0, 0.06, 0) * s, 0.1 * s, 0.085 * s, b.rigid('Neck'), seg=10)
        b.ellipsoid('Armor', Hd[ix('LeftArm')] + v(0.01, 0.04, 0) * s, v(0.11, 0.07, 0.11) * s, b.rigid('LeftArm'), seg=10, rings=6, cut=(1, -0.2))
        for side in ('Left', 'Right'): b.tube('Armor', Hd[ix(side + 'ForeArm')] * 0.55 + Hd[ix(side + 'Hand')] * 0.45, Hd[ix(side + 'Hand')] * 0.95 + Hd[ix(side + 'ForeArm')] * 0.05, 0.05 * s, 0.045 * s, b.rigid(side + 'ForeArm'), seg=8)
        b.box('Trim', chest + v(-0.06, 0.08, 0.13) * s, v(0.05, 0.28, 0.015) * s, b.rigid('Spine1'), R=quat_mat(quat_axis((0, 0, 1), 0.5)))        # diagonal sash
        b.box('Armor', hips + v(0, 0.06, 0) * s, v(0.36, 0.06, 0.24) * s, b.rigid('Hips'))                                                       # belt
        b.tube('Armor', hips + v(0.18, 0.02, -0.05) * s, hips + v(0.22, -0.3, 0.35) * s, 0.025 * s, 0.022 * s, b.rigid('Hips'), seg=6)           # sheath (left hip)
        skirt('Cloth', hips[1] + 0.02 * s, hips[1] - 0.42 * s, 0.17 * s, 0.22 * s, length_back=0.08 * s)
    elif name == 'duelist':
        b.ellipsoid('Armor', head + v(0, 0.13, 0) * s, v(0.135, 0.11, 0.135) * s, b.rigid('Head'), seg=12, rings=6, cut=(1, 0.0))                   # kettle dome
        b.tube('Armor', head + v(0, 0.12, 0) * s, head + v(0, 0.135, 0) * s, 0.25 * s, 0.25 * s, b.rigid('Head'), seg=16)                       # wide brim
        b.tube('Armor', Hd[ix('Neck')] + v(0, -0.04, 0) * s, Hd[ix('Neck')] + v(0, 0.06, 0) * s, 0.1 * s, 0.075 * s, b.rigid('Neck'), seg=10)  # gorget
        for yy in (0.02, 0.1, 0.18): b.box('Trim', chest + v(0, yy, 0.13 * X) * s, v(0.38, 0.018, 0.01) * s, b.rigid('Spine1'))                   # brigandine rivet rows
        for side, sx in (('Left', 1), ('Right', -1)): b.ellipsoid('Armor', Hd[ix(side + 'Arm')] + v(0.0, 0.03, 0) * s, v(0.09, 0.06, 0.09) * s, b.rigid(side + 'Arm'), seg=8, rings=5, cut=(1, -0.1))
        def mantle(u, w):   # half-cape on the right shoulder only (asymmetry)
            return chest + v(-0.05 - u * 0.22, 0.22 - w * 0.55, -0.12 - 0.05 * u + 0.06 * w * u) * s
        b.sheet('Cape', mantle, 3, 4, lambda p, t: [(k.i('Spine1'), 1 - t * 0.5), (k.i('RightArm'), t * 0.5 + 1e-3)])
        b.box('Trim', hips + v(0, 0.06, 0) * s, v(0.36, 0.06, 0.24) * s, b.rigid('Hips'))
        skirt('Armor', hips[1] + 0.03 * s, hips[1] - 0.26 * s, 0.17 * s, 0.2 * s)
    elif name == 'warden':
        b.box('Armor', head + v(0, 0.12, 0) * s, v(0.3, 0.34, 0.3) * s, b.rigid('Head'), taper=0.92)                                            # great helm
        b.box('Shadow', head + v(0, 0.15, 0.152) * s, v(0.22, 0.025, 0.01) * s, b.rigid('Head')); b.box('Shadow', head + v(0, 0.08, 0.152) * s, v(0.03, 0.12, 0.01) * s, b.rigid('Head'))
        b.box('Trim', head + v(0, 0.31, 0) * s, v(0.03, 0.06, 0.32) * s, b.rigid('Head'))                                                        # crest ridge
        b.ellipsoid('Armor', chest + v(0, 0.08, 0.06) * s, v(0.27, 0.22, 0.18) * s * X, b.rigid('Spine1'), seg=12, rings=7, cut=(2, -0.2))        # breastplate
        for side, sx in (('Left', 1), ('Right', -1)):
            for i_, (dy, sc) in enumerate(((0.06, 1.0), (0.0, 0.92), (-0.06, 0.84))):     # stacked pauldron lames
                b.ellipsoid('Armor' if i_ != 1 else 'Trim', Hd[ix(side + 'Arm')] + v(0.02 * sx, dy + 0.02, 0) * s, v(0.17, 0.08, 0.17) * s * sc * X, b.rigid(side + 'Arm'), seg=10, rings=5, cut=(1, -0.3))
            b.tube('Armor', Hd[ix(side + 'ForeArm')] * 0.5 + Hd[ix(side + 'Hand')] * 0.5, Hd[ix(side + 'Hand')], 0.075 * s * X, 0.085 * s * X, b.rigid(side + 'ForeArm'), seg=9)  # big gauntlets
        for i_ in range(3): b.tube('Armor', hips + v(0, 0.05 - i_ * 0.07, 0) * s, hips + v(0, -0.01 - i_ * 0.07, 0) * s, (0.24 + i_ * 0.02) * s * X, (0.25 + i_ * 0.02) * s * X, b.rigid('Hips'), seg=12, flat=0.75)  # faulds
        skirt('Armor', hips[1] - 0.18 * s, hips[1] - 0.42 * s, 0.24 * s, 0.25 * s)
    elif name == 'brother':
        b.ellipsoid('Cloth', head + v(0, 0.1, -0.01) * s, v(0.145, 0.16, 0.16) * s, b.rigid('Head'), seg=12, rings=8, cut=(2, -0.95))
        b.tube('Cloth', head + v(0, 0.2, -0.02) * s, head + v(0, 0.42, 0.06) * s, 0.1 * s, 0.0, b.rigid('Head'), seg=8, cap1=False)              # tall drooping cowl point (forward)
        b.box('Shadow', head + v(0, 0.06, 0.11) * s, v(0.17, 0.13, 0.03) * s, b.rigid('Head'))                                                  # mask
        for side in ('Left', 'Right'):
            for i_ in range(4): t0 = 0.15 + i_ * 0.2; b.tube('Trim', Hd[ix(side + 'ForeArm')] * (1 - t0) + Hd[ix(side + 'Hand')] * t0, Hd[ix(side + 'ForeArm')] * (1 - t0 - 0.08) + Hd[ix(side + 'Hand')] * (t0 + 0.08), 0.047 * s, 0.047 * s, b.rigid(side + 'ForeArm'), seg=7)  # wraps
        b.ellipsoid('Armor', Hd[ix('RightArm')] + v(0, 0.03, 0) * s, v(0.085, 0.055, 0.085) * s, b.rigid('RightArm'), seg=8, rings=5, cut=(1, -0.1))  # single right pauldron (mirror of the Wanderer's)
        b.box('Armor', hips + v(0, 0.06, 0) * s, v(0.32, 0.05, 0.22) * s, b.rigid('Hips'))
        skirt('Cloth', hips[1] + 0.02 * s, hips[1] - 0.36 * s, 0.16 * s, 0.2 * s)
    elif name == 'king':
        b.tube('Armor', head + v(0, 0.02, 0) * s, head + v(0, 0.24, 0) * s, 0.135 * s, 0.13 * s, b.rigid('Head'), seg=12)                         # closed helm
        b.ellipsoid('Armor', head + v(0, 0.24, 0) * s, v(0.13, 0.05, 0.13) * s, b.rigid('Head'), seg=12, rings=4, cut=(1, 0.0))
        b.box('Shadow', head + v(0, 0.13, 0.13) * s, v(0.16, 0.025, 0.01) * s, b.rigid('Head'))
        b.tube('Trim', head + v(0, 0.24, 0) * s, head + v(0, 0.29, 0) * s, 0.15 * s, 0.155 * s, b.rigid('Head'), seg=14)                            # crown band
        for i_ in range(7):
            a = i_ / 7 * 2 * math.pi; b.tube('Trim', head + v(math.sin(a) * 0.14, 0.29, math.cos(a) * 0.14) * s, head + v(math.sin(a) * 0.16, 0.41, math.cos(a) * 0.16) * s, 0.025 * s, 0.0, b.rigid('Head'), seg=5)
        b.tube('Armor', Hd[ix('Neck')] + v(0, -0.05, 0) * s, Hd[ix('Neck')] + v(0, 0.12, -0.02) * s, 0.12 * s, 0.16 * s, b.rigid('Spine1'), seg=12, cap1=False)   # tall collar
        b.box('Cloth', chest + v(0, -0.25, 0.135) * s, v(0.24, 0.75, 0.02) * s, lambda p, t=0: [(k.i('Spine1'), 0.6), (k.i('Hips'), 0.4)])          # crimson tabard
        b.box('Trim', chest + v(0, 0.12, 0.14) * s, v(0.3, 0.04, 0.02) * s, b.rigid('Spine1'))
        for side, sx in (('Left', 1), ('Right', -1)):
            b.ellipsoid('Armor', Hd[ix(side + 'Arm')] + v(0.01 * sx, 0.04, 0) * s, v(0.13, 0.075, 0.13) * s, b.rigid(side + 'Arm'), seg=10, rings=6, cut=(1, -0.25))
            for j_ in range(3): b.tube('Trim', Hd[ix(side + 'Arm')] + v((0.02 + 0.05 * j_) * sx, 0.09, -0.03 + 0.03 * j_) * s, Hd[ix(side + 'Arm')] + v((0.03 + 0.05 * j_) * sx, 0.19, -0.04 + 0.03 * j_) * s, 0.018 * s, 0.0, b.rigid(side + 'Arm'), seg=5)  # spikes
        # Phase II: glowing cracks over breastplate and pauldrons (separate emissive material, toggle visibility in game)
        rng = np.random.default_rng(3)
        for _ in range(9):
            p = chest + v(rng.uniform(-0.17, 0.17), rng.uniform(-0.02, 0.22), 0.128 * X) * s; ang = rng.uniform(-1.2, 1.2)
            b.box('PhaseII_Cracks', p, v(0.006, rng.uniform(0.05, 0.11), 0.004) * s, b.rigid('Spine1'), R=quat_mat(quat_axis((0, 0, 1), ang)))
        skirt('Armor', hips[1] + 0.02 * s, hips[1] - 0.32 * s, 0.17 * s, 0.22 * s)
    # cape (skinned to the Cape bone chain)
    if cape > 0:
        cw = {'king': 0.52, 'warden': 0.48, 'brother': 0.4}.get(name, 0.46) * X * s; top = 1.43 * s; ln = cape * s
        cb = [k.i('Cape%d' % (c + 1)) for c in range(4)]
        def cf(u, w): return v((u - 0.5) * cw * (1 + 0.25 * w), top - ln * w, (-0.17 - 0.06 * w) * X)
        def cwt(p, t):
            f = t * 4; c0 = min(3, int(f)); a = f - c0
            return [(cb[c0], 1 - a), (cb[min(3, c0 + 1)], a + 1e-4)]
        b.sheet('Cape', cf, 4, 8, cwt)
    if name == 'wanderer':   # scarf tails on their own chain
        sb = [k.i('Scarf%d' % (c + 1)) for c in range(3)]
        def sf(u, w): return v(0.03 + u * 0.08 + 0.02 * w, 1.48 * s - 0.51 * s * w, -0.13 - 0.07 * w)
        def swt(p, t):
            f = t * 3; c0 = min(2, int(f)); a = f - c0
            return [(sb[c0], 1 - a), (sb[min(2, c0 + 1)], a + 1e-4)]
        b.sheet('ScarfTail', sf, 1, 6, swt)
    blade_kind = {'wanderer': ('katana', 0.86, 0.034, 0.03), 'duelist': ('sword', 0.88, 0.042, 0.0), 'warden': ('great', 1.35, 0.075, 0.0), 'brother': ('katana', 0.82, 0.036, 0.11), 'king': ('sword', 1.02, 0.05, 0.0)}[name]
    blade = blade_mesh(L, blade_kind[0], blade_kind[1] * s, blade_kind[2] * s, blade_kind[3], crimson=(name == 'king'))
    return L, k, b, blade

# ----------------------------------------------------------------------------- materials
def materials_for(name, L):
    c = lambda h: lin(hex_rgb(h)) + [1.0]
    M = {
        'Cloth':  dict(color=c(L['cloth']), rough=0.95, metal=0.0, tex=('cloth', hex_rgb(L['cloth']))),
        'Armor':  dict(color=c(L['armor']), rough=0.45, metal=0.75, tex=('metal', hex_rgb(L['armor']))),
        'Trim':   dict(color=c(L['trim']), rough=0.6, metal=0.3 if name != 'duelist' else 0.8, tex=None),
        'Skin':   dict(color=c(L['skin']), rough=0.75, metal=0.0, tex=('skin', hex_rgb(L['skin']))),
        'Shadow': dict(color=c(0x07080a), rough=1.0, metal=0.0, tex=None),
        'Cape':   dict(color=c(L['cape']), rough=1.0, metal=0.0, tex=('cloth', hex_rgb(L['cape'])), double=True),
        'Scarf':  dict(color=c(L.get('scarf', 0x8b1a1a)), rough=0.9, metal=0.0, tex=('cloth', hex_rgb(L.get('scarf', 0x8b1a1a))), double=True),
        'ScarfTail': dict(color=c(L.get('scarf', 0x8b1a1a)), rough=0.9, metal=0.0, tex=('cloth', hex_rgb(L.get('scarf', 0x8b1a1a))), double=True),
        'Blade':  dict(color=c(L['blade']), rough=0.22, metal=0.9, tex=None),
        'Edge':   dict(color=c(0x9a0a0a), rough=0.3, metal=0.4, tex=None, emissive=[0.9, 0.06, 0.04]),
        'PhaseII_Cracks': dict(color=c(0x2a0303), rough=0.5, metal=0.0, tex=None, emissive=[1.0, 0.12, 0.05]),
    }
    for m in M.values():
        if m['tex']: m['color'] = [1, 1, 1, 1]     # texture carries the colour
    return M

# ----------------------------------------------------------------------------- idle/guard clip (local rotations; bind pose has identity rotations)
def guard_pose(k, t, name):
    br = math.sin(t * 2 * math.pi / 3.0)   # 3 s breathing loop
    q = {}
    def R(n, axis, ang):
        if n in k.names: q[n] = quat_mul(q.get(n, np.array([0, 0, 0, 1.0])), quat_axis(axis, ang))
    R('Spine', (1, 0, 0), 0.06 + br * 0.015); R('Spine1', (1, 0, 0), 0.05 + br * 0.025); R('Spine1', (0, 1, 0), -0.25); R('Neck', (0, 1, 0), 0.2); R('Head', (1, 0, 0), -0.05 - br * 0.01)
    # arms down from T-pose and both hands to the grip in front of the body
    R('LeftArm', (0, 0, 1), -1.15); R('LeftArm', (0, 1, 0), -0.55); R('LeftForeArm', (0, 1, 0), -1.25 - br * 0.02)
    R('RightArm', (0, 0, 1), 1.2); R('RightArm', (0, 1, 0), 0.75); R('RightForeArm', (0, 1, 0), 1.05 + br * 0.02); R('RightHand', (0, 0, 1), 0.35)
    R('LeftShoulder', (0, 0, 1), br * 0.02); R('RightShoulder', (0, 0, 1), -br * 0.02)
    R('LeftUpLeg', (1, 0, 0), -0.3); R('LeftLeg', (1, 0, 0), 0.35); R('LeftFoot', (1, 0, 0), -0.05)
    R('RightUpLeg', (1, 0, 0), 0.22); R('RightLeg', (1, 0, 0), 0.3); R('RightUpLeg', (0, 0, 1), -0.08)
    for c in range(1, 5): R('Cape%d' % c, (1, 0, 0), 0.06 + 0.04 * c + br * 0.02)
    for c in range(1, 4): R('Scarf%d' % c, (1, 0, 0), 0.15 + br * 0.04); R('Scarf%d' % c, (0, 0, 1), 0.1 * math.sin(t * 2.1 + c))
    hips_y = -0.06 + br * 0.006
    return q, hips_y

# ----------------------------------------------------------------------------- GLB writer
def write_glb(name, out_path):
    L, k, b, blade = design(name); M = materials_for(name, L)
    gl = G.GLTF2(); gl.asset = G.Asset(generator='Veynhold procedural rig builder', version='2.0'); gl.scene = 0; blob = bytearray()
    def add_view(data, target=None):
        while len(blob) % 4: blob.append(0)
        off = len(blob); blob.extend(data); bv = G.BufferView(buffer=0, byteOffset=off, byteLength=len(data)); 
        if target: bv.target = target
        gl.bufferViews.append(bv); return len(gl.bufferViews) - 1
    def add_acc(arr, ctype, comp, target=None, minmax=False, norm_=False):
        arr = np.ascontiguousarray(arr); bv = add_view(arr.tobytes(), target)
        acc = G.Accessor(bufferView=bv, componentType=comp, count=len(arr), type=ctype, normalized=norm_ or None)
        if minmax: acc.min = [float(x) for x in arr.min(axis=0)]; acc.max = [float(x) for x in arr.max(axis=0)]
        gl.accessors.append(acc); return len(gl.accessors) - 1
    # materials + textures
    mat_index = {}
    for mname, m in M.items():
        pbr = G.PbrMetallicRoughness(baseColorFactor=m['color'], metallicFactor=m['metal'], roughnessFactor=m['rough'])
        if m.get('tex'):
            png = tex_png(m['tex'][1], zlib.crc32((name + mname).encode()) % 9999, m['tex'][0]); iv = add_view(png)
            gl.images.append(G.Image(bufferView=iv, mimeType='image/jpeg', name=mname + '_BaseColor')); 
            if not gl.samplers: gl.samplers.append(G.Sampler(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497))
            gl.textures.append(G.Texture(source=len(gl.images) - 1, sampler=0)); pbr.baseColorTexture = G.TextureInfo(index=len(gl.textures) - 1)
        mat = G.Material(name=mname, pbrMetallicRoughness=pbr, doubleSided=bool(m.get('double')))
        if m.get('emissive'): mat.emissiveFactor = m['emissive']
        gl.materials.append(mat); mat_index[mname] = len(gl.materials) - 1
    # nodes: skeleton joints
    nj = len(k.names); node_of = {}
    for i, nm in enumerate(k.names):
        p = k.parent[i]; t = k.head[i] - (k.head[p] if p >= 0 else 0)
        gl.nodes.append(G.Node(name=nm, translation=[float(x) for x in t])); node_of[i] = len(gl.nodes) - 1
    for i in range(nj):
        kids = [node_of[c] for c in range(nj) if k.parent[c] == i]
        if kids: gl.nodes[node_of[i]].children = kids
    # skinned body mesh
    def skinned_prims(only=None, skip=None):
        out = []
        for mname, P in b.parts.items():
            if not P.idx or (only and mname not in only) or (skip and mname in skip): continue
            out.append(make_prim(mname, P))
        return out
    def make_prim(mname, P):
        pos = np.array(P.pos, np.float32); nor = np.array(P.nor, np.float32); nor /= np.linalg.norm(nor, axis=1, keepdims=True); uv = np.array(P.uv, np.float32); jj = np.array(P.j, np.uint16); ww = np.array(P.w, np.float32); idx = np.array(P.idx, np.uint32 if len(P.pos) > 65535 else np.uint16)
        attrs = G.Attributes(POSITION=add_acc(pos, 'VEC3', 5126, 34962, True), NORMAL=add_acc(nor, 'VEC3', 5126, 34962), TEXCOORD_0=add_acc(uv, 'VEC2', 5126, 34962), JOINTS_0=add_acc(jj, 'VEC4', 5123, 34962), WEIGHTS_0=add_acc(ww, 'VEC4', 5126, 34962))
        return G.Primitive(attributes=attrs, indices=add_acc(idx, 'SCALAR', 5125 if idx.dtype == np.uint32 else 5123, 34963), material=mat_index[mname])
    prims = skinned_prims(skip=['PhaseII_Cracks'])
    gl.meshes.append(G.Mesh(name=name + '_Body', primitives=prims))
    ibm = np.zeros((nj, 4, 4), np.float32)
    for i in range(nj): m4 = np.eye(4); m4[:3, 3] = -k.head[i]; ibm[i] = m4.T     # column-major
    gl.skins.append(G.Skin(name=name + '_Skin', joints=[node_of[i] for i in range(nj)], skeleton=node_of[0], inverseBindMatrices=add_acc(ibm.reshape(nj, 16), 'MAT4', 5126)))
    body_node = len(gl.nodes); gl.nodes.append(G.Node(name=name.capitalize() + '_Body', mesh=0, skin=0)); extra_nodes = []
    if 'PhaseII_Cracks' in b.parts:
        gl.meshes.append(G.Mesh(name=name + '_PhaseII', primitives=skinned_prims(only=['PhaseII_Cracks'])))
        extra_nodes.append(len(gl.nodes)); gl.nodes.append(G.Node(name='PhaseII_Cracks', mesh=len(gl.meshes) - 1, skin=0, extras={'visibleInPhase': 2}))
    # blade: separate unskinned node parented to RightHand (grip at the hand, blade along +Z)
    bprims = []
    for mname, P in blade.parts.items():
        if not P.idx: continue
        pos = np.array(P.pos, np.float32); nor = np.array(P.nor, np.float32); nor /= np.linalg.norm(nor, axis=1, keepdims=True); uv = np.array(P.uv, np.float32); idx = np.array(P.idx, np.uint16)
        bprims.append(G.Primitive(attributes=G.Attributes(POSITION=add_acc(pos, 'VEC3', 5126, 34962, True), NORMAL=add_acc(nor, 'VEC3', 5126, 34962), TEXCOORD_0=add_acc(uv, 'VEC2', 5126, 34962)), indices=add_acc(idx, 'SCALAR', 5123, 34963), material=mat_index[mname]))
    gl.meshes.append(G.Mesh(name=name + '_Blade', primitives=bprims)); blade_mesh_i = len(gl.meshes) - 1
    rh = node_of[k.i('RightHand')]; blade_node = len(gl.nodes)
    gl.nodes.append(G.Node(name='Blade', mesh=blade_mesh_i, translation=[float(-0.05 * L['H'] / 1.78), 0.0, 0.0], extras={'trailBase': [0, 0, 0.1], 'trailTip': [0, 0, 0.1 + 1.0]}))
    gl.nodes[rh].children = (gl.nodes[rh].children or []) + [blade_node]
    gl.scenes.append(G.Scene(name=name, nodes=[node_of[0], body_node] + extra_nodes))
    # animation: Idle_Guard (3 s loop, 13 keys)
    times = np.linspace(0, 3.0, 13).astype(np.float32); tin = add_acc(times.reshape(-1, 1), 'SCALAR', 5126, None, True)
    samplers, channels = [], []; frames = [guard_pose(k, float(t), name) for t in times]
    for nm in k.names:
        if nm not in frames[0][0]: continue
        rots = np.array([f[0].get(nm, np.array([0, 0, 0, 1.0])) for f in frames], np.float32)
        samplers.append(G.AnimationSampler(input=tin, output=add_acc(rots, 'VEC4', 5126), interpolation='LINEAR')); channels.append(G.AnimationChannel(sampler=len(samplers) - 1, target=G.AnimationChannelTarget(node=node_of[k.i(nm)], path='rotation')))
    hp = np.array([k.head[k.i('Hips')] - k.head[0] + v(0, f[1], 0) for f in frames], np.float32)
    samplers.append(G.AnimationSampler(input=tin, output=add_acc(hp, 'VEC3', 5126), interpolation='LINEAR')); channels.append(G.AnimationChannel(sampler=len(samplers) - 1, target=G.AnimationChannelTarget(node=node_of[k.i('Hips')], path='translation')))
    gl.animations.append(G.Animation(name='Idle_Guard', samplers=samplers, channels=channels))
    gl.buffers.append(G.Buffer(byteLength=len(blob))); gl.set_binary_blob(bytes(blob))
    gl.extras = {'veynhold': {'character': name, 'height_m': L['H'], 'forward': '+Z', 'bindPose': 'T-pose', 'bladeNode': 'Blade', 'phase2Material': 'PhaseII_Cracks' if name == 'king' else None}}
    gl.save_binary(out_path)
    tris = sum(len(P.idx) // 3 for P in b.parts.values()) + sum(len(P.idx) // 3 for P in blade.parts.values())
    return dict(name=name, bones=nj, tris=tris, bytes=len(open(out_path, 'rb').read()), skel=k, builder=b, blade=blade)

if __name__ == '__main__':
    import sys, os
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glb'); os.makedirs(out, exist_ok=True)
    names = {'wanderer': 'Veynhold_Wanderer', 'duelist': 'Veynhold_Duelist', 'warden': 'Veynhold_IronWarden', 'brother': 'Veynhold_FalseBrother', 'king': 'Veynhold_KingsFirstBlade'}
    for n, fn in names.items():
        r = write_glb(n, os.path.join(out, fn + '.glb')); print('%-26s bones %3d  tris %5d  %6.1f KB' % (fn, r['bones'], r['tris'], r['bytes'] / 1024))
