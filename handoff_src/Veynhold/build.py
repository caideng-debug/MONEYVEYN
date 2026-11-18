import re
t=open('src/template.html').read()
three=open('three.min.js').read(); core=open('src/core.js').read(); game=open('src/game.js').read()
import base64, json, os
loaders=open('src/vendor/GLTFLoader.js').read().replace("if ( typeof createImageBitmap !== 'undefined' && /Firefox/.test( navigator.userAgent ) === false ) {", "if ( false ) { // Veynhold: always decode via <img> (most reliable from file:// on Chromebooks)",1)+'\n'+open('src/vendor/SkeletonUtils.js').read()+'\n'+'\n'.join(open('src/vendor/%s.js'%n).read() for n in ['CopyShader','LuminosityHighPassShader','FXAAShader','EffectComposer','ShaderPass','RenderPass','UnrealBloomPass'])   # chunk E: r128 post-processing examples (Ultra tier only)
G={'wanderer':'Veynhold_Wanderer','duelist':'Veynhold_Duelist','warden':'Veynhold_IronWarden','brother':'Veynhold_FalseBrother','king':'Veynhold_KingsFirstBlade'}
data={k:base64.b64encode(open('models/glb/%s.glb'%f,'rb').read()).decode() for k,f in G.items()}
models=open('src/models.js').read().replace('/*MODELS_DATA*/{}', json.dumps(data),1)
chk=open('src/checklist.txt').read() if __import__('os').path.exists('src/checklist.txt') else ''
anim=open('src/anim.js').read().replace('/*ANIM_DATA*/null', open('src/anim_data.json').read(),1)
import glob
data=open('src/data/content.js').read()+'\n'+'\n'.join(open(f).read() for f in sorted(glob.glob('src/data/region_*.js')))
# chunk F: CC0 downloads (docs/LICENSES.md) under assets/: Poly Haven textures + Quaternius props -> world_build.js, Quaternius characters -> models.js
FA={'tex':{os.path.basename(f)[:-4]:base64.b64encode(open(f,'rb').read()).decode() for f in sorted(glob.glob('assets/textures/*.jpg'))},'props':base64.b64encode(open('assets/props/Q_Props.glb','rb').read()).decode()}
QM={os.path.basename(f)[:-4]:base64.b64encode(open(f,'rb').read()).decode() for f in sorted(glob.glob('assets/chars/*.glb'))}
models=models.replace('/*QMODELS_DATA*/{}', json.dumps(QM),1)
wb=open('src/world_build.js').read().replace('/*F_ASSETS*/{}', json.dumps(FA),1); ui=open('src/ui.js').read(); world=open('src/world.js').read()
world+='\n'+open('src/world_boss.js').read()   # chunk D: the headsman (build-up, cutscene, deathblows)
world+='\n'+open('src/world_scenes.js').read()   # chunk G3: Ilsabet's dialogue cutscenes (scene runner, cage door, walks)
world+='\n'+open('src/world_combat.js').read()   # chunk H4: combat mechanics (vitality posture, guard regain, charged heavy, deflect tiers, stealth polish)
world+='\n'+open('src/world_surfaces.js').read()   # chunk I4: surface materials (footsteps, particles, impact queries)
world+='\n'+open('src/world_audio.js').read()   # chunk I4: deathblow audio map (A.DBAudio), world one-shot priorities
# chunk DB6: deathblow clips (assets_incoming/deathblow_clips, CC0 Quaternius retimed) + sampled deathblow audio (assets_incoming/deathblow_audio, own synthesis)
_clips={}
for f in sorted(glob.glob('assets_incoming/deathblow_clips/*.json')):
    d=json.load(open(f)); [d.pop(k,None) for k in ('retime','sources','blade')]; _clips[os.path.basename(f)[:-5]]=d
_cues=json.load(open('assets_incoming/deathblow_audio/cues.json'))
_aud={'cues':{'schedules':_cues['schedules'],'variants':{k:{kk:vv for kk,vv in v.items() if kk in ('schedule','layers','duck')} for k,v in _cues['variants'].items()}},'files':{os.path.basename(f)[:-4]:base64.b64encode(open(f,'rb').read()).decode() for f in sorted(glob.glob('assets_incoming/deathblow_audio/*.ogg'))}}
world+='\n'+open('src/deathblow6.js').read().replace('/*DB6_CLIPS*/{}', json.dumps(_clips,separators=(',',':')),1).replace('/*DB6_AUDIO*/{}', json.dumps(_aud,separators=(',',':')),1)   # chunk DB6: deathblow feel (clips, root motion, input, audio)
world+='\n'+open('src/ui_access.js').read()   # chunk I3: HUD rules, accessibility, soft-lock recovery, debug overlay, telemetry, action ids
for name,js in [('THREE',three),('LOADERS',loaders),('MODELS',models),('ANIM',anim),('CORE',core),('GAME',game),('DATA',data),('WORLD_BUILD',wb),('UI',ui),('WORLD',world)]:
    assert '</script' not in js.lower(), name
    t=t.replace('/*%s*/'%name, js, 1)
t=t.replace('<!--VEYN_CHECKLIST-->', '<!--\n'+chk.replace('--','—')+'\n-->')
import os; os.makedirs('dist',exist_ok=True)
open('dist/index.html','w').write(t); print(len(t))
import shutil; shutil.copy('dist/index.html','dist/Veynhold.html')
