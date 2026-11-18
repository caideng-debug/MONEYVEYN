import json
from PIL import Image, ImageDraw
shots=json.load(open('/tmp/wire.json')); W,H=640,360
im=Image.new('RGB',(W*2,H*2),(8,9,12))
for si,s in enumerate(shots):
  ox,oy=(si%2)*W,(si//2)*H; g=ImageDraw.Draw(im)
  tris=sorted(s['tris'],key=lambda t:-sum(p[2] for p in t[0]))
  for pts,col in tris:
    if any(p[2]<0.1 for p in pts) or col in ('8a847a','15130f'): continue
    xy=[(ox+(p[0]+1)/2*W, oy+(1-p[1])/2*H) for p in pts]
    if all(abs(p[0])>1.5 or abs(p[1])>1.5 for p in pts): continue
    c=tuple(int(col[i:i+2],16) for i in (0,2,4))
    g.polygon(xy, fill=c)
  g.text((ox+6,oy+6),s['label'],fill=(255,255,0))
  g.rectangle([ox,oy,ox+W-1,oy+H-1],outline=(60,60,60))
im.save('/tmp/wire.png')
