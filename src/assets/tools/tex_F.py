# Veynhold chunk F: Poly Haven 1K textures -> assets/textures (python3 + Pillow).
# usage: python3 tex_F.py <assets_incoming/polyhaven_textures> <assets/textures>
# Walls / floors keep 1K diffuse; wood and iron (small props, posts) go to 512. Normal maps 512 (mud 256; rusty metal none: flat).
# medieval_blocks (warm sandstone) and the mud (green clover) are partly desaturated so they sit in the grey-brown palette.
import sys, os
from PIL import Image, ImageEnhance
src, out = sys.argv[1], sys.argv[2]
spec = {  # name: (diff size, diff quality, saturation, normal size or 0, normal quality)
    'castle_wall_slates': (1024, 60, 1.0, 512, 60),
    'medieval_blocks_02': (1024, 60, 0.35, 512, 60),
    'brown_mud_leaves_01': (1024, 58, 0.6, 256, 60),
    'rough_wood': (512, 68, 1.0, 512, 60),
    'rusty_metal_02': (512, 68, 1.0, 0, 0),
}
for n, (ds, dq, sat, ns, nq) in spec.items():
    d = Image.open(os.path.join(src, n + '_diff_1k.jpg')).convert('RGB')
    if sat != 1.0: d = ImageEnhance.Color(d).enhance(sat)
    d.resize((ds, ds), Image.LANCZOS).save(os.path.join(out, n + '_diff.jpg'), quality=dq, optimize=True)
    if ns:
        Image.open(os.path.join(src, n + '_nor_gl_1k.jpg')).convert('RGB').resize((ns, ns), Image.LANCZOS).save(os.path.join(out, n + '_nor.jpg'), quality=nq, optimize=True)
    print(n)
