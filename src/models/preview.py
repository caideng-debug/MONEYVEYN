"""Reads the exported GLBs back, poses them with their own skin + Idle_Guard clip (linear blend skinning), and paints a flat-shaded turnaround sheet."""
import sys, os, math, struct
import numpy as np
import pygltflib as G
from PIL import Image, ImageDraw

CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def acc(gl, blob, i):
    a = gl.accessors[i]; bv = gl.bufferViews[a.bufferView]; n = NC[a.type]; dt = CT[a.componentType]
    off = (bv.byteOffset or 0) + (a.byteOffset or 0); arr = np.frombuffer(blob, dtype=dt, count=a.count * n, offset=off).reshape(a.count, n); return arr.astype(np.float64)
def qmat(q):
    x, y, z, w = q; return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def trs(t, q):
    m = np.eye(4); m[:3, :3] = qmat(q); m[:3, 3] = t; return m

def load(path, pose=True, t=0.0):
    gl = G.GLTF2().load_binary(path); blob = gl.binary_blob()
    T = {i: np.array(n.translation or [0, 0, 0], float) for i, n in enumerate(gl.nodes)}; Q = {i: np.array(n.rotation or [0, 0, 0, 1], float) for i, n in enumerate(gl.nodes)}
    if pose and gl.animations:
        an = gl.animations[0]
        for ch in an.channels:
            s = an.samplers[ch.sampler]; times = acc(gl, blob, s.input)[:, 0]; vals = acc(gl, blob, s.output); k = int(np.searchsorted(times, t, side='right') - 1); k = max(0, min(k, len(times) - 1)); val = vals[k]
            if ch.target.path == 'rotation': Q[ch.target.node] = val / np.linalg.norm(val)
            else: T[ch.target.node] = val
    parent = {}
    for i, n in enumerate(gl.nodes):
        for c in (n.children or []): parent[c] = i
    world = {}
    def W(i):
        if i in world: return world[i]
        m = trs(T[i], Q[i]); world[i] = (W(parent[i]) @ m) if i in parent else m; return world[i]
    skin = gl.skins[0]; ibm = acc(gl, blob, skin.inverseBindMatrices).reshape(-1, 4, 4).transpose(0, 2, 1)
    jm = np.array([W(j) @ ibm[q] for q, j in enumerate(skin.joints)])
    tris = []
    for ni, n in enumerate(gl.nodes):
        if n.mesh is None: continue
        for pr in gl.meshes[n.mesh].primitives:
            P = acc(gl, blob, pr.attributes.POSITION); idx = acc(gl, blob, pr.indices).astype(int).reshape(-1, 3)
            if n.skin is not None:
                J = acc(gl, blob, pr.attributes.JOINTS_0).astype(int); Wt = acc(gl, blob, pr.attributes.WEIGHTS_0); Ph = np.c_[P, np.ones(len(P))]
                out = np.zeros_like(P)
                for c in range(4): out += Wt[:, c:c + 1] * np.einsum('nij,nj->ni', jm[J[:, c]], Ph)[:, :3]
                P = out
            else: m = W(ni); P = (np.c_[P, np.ones(len(P))] @ m.T)[:, :3]
            mat = gl.materials[pr.material]; col = mat.pbrMetallicRoughness.baseColorFactor[:3]
            if mat.pbrMetallicRoughness.baseColorTexture is not None:   # approximate textured colour with the texture's mean
                img = gl.images[gl.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source]; bv = gl.bufferViews[img.bufferView]
                import io; col = (np.array(Image.open(io.BytesIO(blob[bv.byteOffset:bv.byteOffset + bv.byteLength]))).reshape(-1, 3).mean(0) / 255) ** 2.2
            em = mat.emissiveFactor if mat.emissiveFactor and sum(mat.emissiveFactor) > 0 else None
            for a, b, c in idx: tris.append((P[a], P[b], P[c], np.array(col), em))
    return tris

def render(tris, yaw, size=(300, 420), H=2.2):
    img = Image.new('RGB', size, (18, 19, 24)); d = ImageDraw.Draw(img); cy, sy = math.cos(yaw), math.sin(yaw)
    L = np.array([0.4, 0.7, 0.6]); L /= np.linalg.norm(L); sc = size[1] / (H + 0.3)
    items = []
    for a, b, c, col, em in tris:
        pts = []
        for p in (a, b, c): x = p[0] * cy + p[2] * sy; z = -p[0] * sy + p[2] * cy; pts.append((x, p[1], z))
        n = np.cross(np.subtract(pts[1], pts[0]), np.subtract(pts[2], pts[0])); nl = np.linalg.norm(n)
        if nl < 1e-12: continue
        n /= nl
        if n[2] < 0: continue            # back-face (glTF CCW front faces toward the viewer at +Z)
        shade = 0.25 + 0.75 * max(0, float(np.dot(n, L)))
        rgb = em if em is not None else col * shade
        rgb = np.clip(np.power(np.clip(rgb, 0, 1), 1 / 2.2) * 255 * (1.0 if em is not None else 1.35), 0, 255).astype(int)
        items.append((sum(p[2] for p in pts) / 3, [(size[0] / 2 + p[0] * sc, size[1] - 15 - p[1] * sc) for p in pts], tuple(rgb)))
    for _, poly, rgb in sorted(items, key=lambda x: x[0]): d.polygon(poly, fill=rgb)
    return img

if __name__ == '__main__':
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glb'); files = sorted(f for f in os.listdir(d) if f.endswith('.glb'))
    order = ['Wanderer', 'Duelist', 'IronWarden', 'FalseBrother', 'KingsFirstBlade']; files = sorted(files, key=lambda f: [o in f for o in order].index(True))
    views = [(0, False), (math.pi / 2, False), (0.5, True), (math.pi + 0.6, True)]
    sheet = Image.new('RGB', (300 * len(views), 420 * len(files)), (10, 10, 12))
    for r, f in enumerate(files):
        for c, (yaw, pose) in enumerate(views):
            im = render(load(os.path.join(d, f), pose=pose, t=0.75), yaw); dd = ImageDraw.Draw(im); dd.text((6, 6), f.replace('Veynhold_', '').replace('.glb', '') + ('  Idle_Guard' if pose else '  T-pose'), fill=(230, 210, 150))
            sheet.paste(im, (c * 300, r * 420))
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/models_sheet.png'; sheet.save(out); print(out, sheet.size)
