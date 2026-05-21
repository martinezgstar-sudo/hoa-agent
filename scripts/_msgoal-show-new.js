const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/msdir-pending.json', 'utf8'));
const newOnes = data.filter(r => !r.context?.ms_goal_refined_at);
newOnes.forEach(r => {
  console.log('---');
  console.log('ID:', r.id);
  console.log('Priority:', r.priority);
  console.log('Title:', r.title);
  console.log('Description:', r.description);
  console.log('Context:', JSON.stringify(r.context, null, 2));
  console.log();
});
