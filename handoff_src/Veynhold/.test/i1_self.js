const C = require('../src/core.js'); const r = C.runSelfTests();
r.filter(t => !t.pass || /^I1/.test(t.name)).forEach(t => console.log((t.pass ? 'PASS ' : 'FAIL ') + t.name + ' [' + t.info + ']'));
console.log(r.filter(t => t.pass).length + '/' + r.length);
