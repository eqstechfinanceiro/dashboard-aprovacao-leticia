const fs = require('fs');
const reports = JSON.parse(fs.readFileSync('reports.json', 'utf8')).data;

console.log('=== DATA ANALYSIS FOR FEATURE IDEAS ===\n');

// 1. Report status distribution
const statusDist = {};
reports.forEach(r => { statusDist[r.status] = (statusDist[r.status] || 0) + 1; });
console.log('1. REPORT STATUS DISTRIBUTION:');
Object.entries(statusDist).forEach(([k, v]) => {
  const pct = ((v / reports.length) * 100).toFixed(1);
  console.log(`   ${k}: ${v} (${pct}%)`);
});

// 2. Users with most reports
const userReports = {};
reports.forEach(r => {
  const name = r.user?.data?.name || 'Unknown';
  if (!userReports[name]) userReports[name] = { count: 0, statuses: {} };
  userReports[name].count++;
  userReports[name].statuses[r.status] = (userReports[name].statuses[r.status] || 0) + 1;
});
console.log('\n2. TOP 10 USERS BY REPORT COUNT:');
Object.entries(userReports)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 10)
  .forEach(([name, data]) => {
    const pending = data.statuses['ABERTO'] || 0;
    const approved = data.statuses['APROVADO'] || 0;
    console.log(`   ${name}: ${data.count} reports (${approved} approved, ${pending} pending)`);
  });

// 3. Report patterns (CAIXA vs FATURA)
const patterns = { CAIXA: 0, FATURA: 0, OTHER: 0 };
reports.forEach(r => {
  const desc = (r.description || '').toUpperCase();
  if (desc.includes('CAIXA')) patterns.CAIXA++;
  else if (desc.includes('FATURA')) patterns.FATURA++;
  else patterns.OTHER++;
});
console.log('\n3. REPORT PATTERNS:');
Object.entries(patterns).forEach(([k, v]) => console.log(`   ${k}: ${v}`));

// 4. Approval flow analysis
const approvalFlows = {};
reports.forEach(r => {
  const flowId = r.user?.data?.approval_flow_id;
  if (flowId) {
    if (!approvalFlows[flowId]) approvalFlows[flowId] = { count: 0, users: new Set() };
    approvalFlows[flowId].count++;
    approvalFlows[flowId].users.add(r.user?.data?.name);
  }
});
console.log('\n4. APPROVAL FLOWS:');
console.log(`   Unique flows: ${Object.keys(approvalFlows).length}`);
Object.entries(approvalFlows).slice(0, 3).forEach(([id, data]) => {
  console.log(`   Flow ${id}: ${data.count} reports, ${data.users.size} users`);
});

// 5. Time to approval (for approved reports)
const approvedReports = reports.filter(r => r.status === 'APROVADO' && r.approval_date && r.created_at);
const approvalTimes = approvedReports.map(r => {
  const created = new Date(r.created_at);
  const approved = new Date(r.approval_date);
  return (approved - created) / (1000 * 60 * 60 * 24); // days
}).filter(t => t >= 0 && t < 365);

if (approvalTimes.length > 0) {
  const avg = approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length;
  const max = Math.max(...approvalTimes);
  const min = Math.min(...approvalTimes);
  console.log('\n5. TIME TO APPROVAL (days):');
  console.log(`   Average: ${avg.toFixed(1)} days`);
  console.log(`   Min: ${min.toFixed(1)} days`);
  console.log(`   Max: ${max.toFixed(1)} days`);
  console.log(`   Sample size: ${approvalTimes.length}`);
}

// 6. Reports without approval_date that are approved
const approvedNoDate = reports.filter(r => r.status === 'APROVADO' && !r.approval_date);
console.log(`\n6. APPROVED REPORTS WITHOUT APPROVAL DATE: ${approvedNoDate.length}`);

// 7. Old pending reports
const now = new Date('2026-05-21');
const oldPending = reports.filter(r => {
  if (r.status !== 'ABERTO' && r.status !== 'ENVIADO') return false;
  const created = new Date(r.created_at);
  const daysOld = (now - created) / (1000 * 60 * 60 * 24);
  return daysOld > 30;
});
console.log(`\n7. PENDING REPORTS OLDER THAN 30 DAYS: ${oldPending.length}`);

console.log('\n=== END ANALYSIS ===');
