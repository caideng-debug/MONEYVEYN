import json,sys
from PIL import Image, ImageDraw
d=json.load(open('/tmp/poses.json')); keys=list(d)
cols=6; cw,ch=300,260; rows=(len(keys)+cols-1)//cols
im=Image.new('RGB',(cols*cw,rows*ch),(20,20,24)); g=ImageDraw.Draw(im)
bones=[('hips','neck'),('neck','head'),('neck','rSh'),('rSh','rEl'),('rEl','rHand'),('neck','lSh'),('lSh','lEl'),('lEl','lHand'),('hips','lKnee'),('lKnee','lFoot'),('hips','rKnee'),('rKnee','rFoot')]
for i,k in enumerate(keys):
  ox,oy=(i%cols)*cw,(i//cols)*ch; p=d[k]
  # side view (z to right, y up) left half; front view (x mirrored so char's right on left... viewer facing char: char right(-x) appears on viewer's left) right half
  def S(v): return (ox+70+v[2]*55, oy+230-v[1]*85)
  def F(v): return (ox+220-v[0]*55*-1, oy+230-v[1]*85)
  for proj,lab in [(S,'side'),(F,'front')]:
    for a,b in bones:
      c=(200,80,80) if a.startswith('r') or b.startswith('r') else (120,160,220) if a.startswith('l') or b.startswith('l') else (220,220,220)
      g.line([proj(p[a]),proj(p[b])],fill=c,width=3)
    g.line([proj(p['rHand']),proj(p['tip'])],fill=(255,230,120),width=2)
    g.ellipse([proj(p['head'])[0]-7,proj(p['head'])[1]-7,proj(p['head'])[0]+7,proj(p['head'])[1]+7],outline=(220,220,220))
  g.text((ox+5,oy+5),k,fill=(255,255,255)); g.text((ox+5,oy+18),'side(fwd->)   front',fill=(150,150,150))
im.save('/tmp/poses.png'); print(im.size)
