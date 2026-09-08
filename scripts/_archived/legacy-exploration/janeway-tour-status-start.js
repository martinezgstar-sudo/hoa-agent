const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
(async () => {
  await status.start('hoa-boards', 'Janeway tour: filing 3 gap-targeted hoa-dir proposals (CourtListener cron, city normalize, comment SLA)', 3);
  console.log('started');
})();
