const fs = require('fs');
for (const p of ['src/GenerateRiderDataReport.jsx','src/ViewSeller.jsx','src/SettingsArchiveView.jsx','src/ManageAccounts.jsx']) {
  const raw = fs.readFileSync(p);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  const t = raw.toString('utf8');
  const bad = (t.match(/[\u00C2\u00E2][\u0080-\u00BF]*/g) || []).length;
  console.log(p + ' | BOM=' + bom + ' | mojibake-suspects=' + bad);
}
const g = fs.readFileSync('src/GenerateRiderDataReport.jsx','utf8');
const m = g.split('\n').find(l => l.includes('Archiving is managed'));
console.log('GRR subtitle: ' + JSON.stringify(m.trim().slice(0, 110)));
const v = fs.readFileSync('src/ViewSeller.jsx','utf8');
const mv = v.split('\n').find(l => l.includes('Archiving is managed'));
console.log('ViewSeller subtitle: ' + JSON.stringify(mv.trim().slice(0, 110)));
