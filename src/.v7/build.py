import re
t=open('src/template.html').read()
three=open('three.min.js').read(); core=open('src/core.js').read(); game=open('src/game.js').read()
import base64, json, os
loaders=open('src/vendor/GLTFLoader.js').read().replace("if ( typeof createImageBitmap !== 'undefined' && /Firefox/.test( navigator.userAgent ) === false ) {", "if ( false ) { // Veynhold: always decode via <img> (most reliable from file:// on Chromebooks)",1)+'\n'+open('src/vendor/SkeletonUtils.js').read()
G={'wanderer':'Veynhold_Wanderer','duelist':'Veynhold_Duelist','warden':'Veynhold_IronWarden','brother':'Veynhold_FalseBrother','king':'Veynhold_KingsFirstBlade'}
data={k:base64.b64encode(open('models/glb/%s.glb'%f,'rb').read()).decode() for k,f in G.items()}
models=open('src/models.js').read().replace('/*MODELS_DATA*/{}', json.dumps(data),1)
chk=open('src/checklist.txt').read() if __import__('os').path.exists('src/checklist.txt') else ''
for name,js in [('THREE',three),('LOADERS',loaders),('MODELS',models),('CORE',core),('GAME',game)]:
    assert '</script' not in js.lower(), name
    t=t.replace('/*%s*/'%name, js, 1)
t=t.replace('<!--VEYN_CHECKLIST-->', '<!--\n'+chk.replace('--','—')+'\n-->')
import os; os.makedirs('dist',exist_ok=True)
open('dist/index.html','w').write(t); print(len(t))
