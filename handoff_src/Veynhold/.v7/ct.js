const C = require('../src/core.js');
const r = C.runSelfTests(); for (const t of r) if (!t.pass || process.argv[2]) console.log((t.pass?'PASS ':'FAIL ')+t.name+' ['+t.info+']'); console.log(r.filter(t=>t.pass).length+'/'+r.length);
