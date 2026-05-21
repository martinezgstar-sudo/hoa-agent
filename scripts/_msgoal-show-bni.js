const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/msdir-pending.json', 'utf8'));
const targets = data.filter(r => ['08dc9317','16629cfb','9345e3aa'].some(p => r.id.startsWith(p)));
targets.forEach(r => {
  console.log('==='); console.log(r.id, '|', r.priority, '|', r.title);
  console.log('DESC:', r.description);
  console.log('CTX:', JSON.stringify(r.context, null, 2));
});
