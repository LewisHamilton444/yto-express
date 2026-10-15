// ============================================================================
// Waybill parity check (I-4).  Run: npm run qa:waybill
// ----------------------------------------------------------------------------
// The portal prints the SAME physical label the app does, so the destination
// hub code and SORT CODE must be identical on both sides — a drift means the
// same parcel prints two different sort codes and the hub mis-sorts it.
//
// This reads the app's resolveDestinationHub straight out of its source (the
// function is not exported), replays each rule against the portal's ported
// table (src/services/waybill.js), and fails on the first disagreement. Textual
// extraction is deliberate: it re-checks the LIVE app source on every run, so
// editing the app's table without updating the portal breaks this check instead
// of silently shipping two different labels.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { resolveDestinationHub, formatWaybillDimensions } from '../../../src/services/waybill.js';

const APP_CONTROLLER = process.env.APP_CONTROLLER
  || 'C:/Users/ADMIN/AndroidStudioProjects/YTO_Express_App/yto_express_backend/controllers/shipmentController.js';

let checks = 0;
let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks += 1;
  if (!ok) {
    failures += 1;
    console.log(`  FAIL ${label}\n       app:    ${JSON.stringify(expected)}\n       portal: ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok  ${label}`);
  }
}

function appRules() {
  const src = fs.readFileSync(APP_CONTROLLER, 'utf8');
  const start = src.indexOf('function resolveDestinationHub');
  if (start === -1) throw new Error('resolveDestinationHub not found in the app controller — update this checker');
  const end = src.indexOf('\n}', start);
  // Include the closing brace so the trailing fallback return is inside the slice.
  const body = src.slice(start, end === -1 ? undefined : end + 2);

  // `if \((.+?)\) return \{` — the condition contains nested parentheses
  // (addr.includes('x')), so the group must be lazy and close on the `) return {`
  // that follows the WHOLE condition, not the first inner paren.
  const rules = [];
  const ruleRe = /if \((.+?)\) return \{ code: '([^']*)', name: '([^']*)', sortCode: '([^']*)' \};/g;
  let m;
  while ((m = ruleRe.exec(body)) !== null) {
    const needles = [...m[1].matchAll(/'([^']*)'/g)].map((n) => n[1]);
    if (needles.length) rules.push({ needles, code: m[2], name: m[3], sortCode: m[4] });
  }
  if (!rules.length) throw new Error('no hub rules parsed from the app — the source shape changed');

  // The fallback is the LAST return in the function (it has no `if` guard), so
  // take the final match of the same shape rather than anchoring on braces.
  const allReturns = [...body.matchAll(/return \{ code: '([^']*)', name: '([^']*)', sortCode: '([^']*)' \};/g)];
  const last = allReturns[allReturns.length - 1];
  const fallback = last ? { code: last[1], name: last[2], sortCode: last[3] } : null;
  return { rules, fallback };
}

console.log('waybill parity: portal hub table vs the app resolver\n');

const { rules, fallback } = appRules();
console.log(`parsed ${rules.length} app rule(s) + ${fallback ? 'a fallback' : 'NO fallback'}\n`);

// 1. Every app rule must resolve identically through the portal's table.
for (const rule of rules) {
  const sample = rule.needles[0];
  const got = resolveDestinationHub(sample);
  check(`address "${sample}"`, got, { code: rule.code, name: rule.name, sortCode: rule.sortCode });
}

// 2. Every alternative needle of a multi-needle rule must match too — this is
//    where a half-copied rule (e.g. baliuag without baliwag) shows up.
for (const rule of rules) {
  for (const needle of rule.needles.slice(1)) {
    const got = resolveDestinationHub(needle);
    check(`alternative spelling "${needle}"`, got, { code: rule.code, name: rule.name, sortCode: rule.sortCode });
  }
}

// 3. A realistic full address (with the hub name trailing) must still hit the
//    same rule on both sides — the app lowercases the whole string, so does the
//    portal, and the extra words must not flip the match.
if (fallback) {
  check('unknown address falls back identically', resolveDestinationHub('Some Foreign Address 12'), {
    code: fallback.code, name: fallback.name, sortCode: fallback.sortCode,
  });
  check('empty address falls back identically', resolveDestinationHub(''), {
    code: fallback.code, name: fallback.name, sortCode: fallback.sortCode,
  });
}
check('a full address still resolves by its city', resolveDestinationHub('123 Mabini St, Malolos, Bulacan'), {
  code: 'BUL-MAL-02', name: 'Malolos Hub', sortCode: 'BUL-MAL-02-D02',
});

// 4. Dimensions formatting must match the app's default text on an empty box.
check('empty dimensions use the app default', formatWaybillDimensions({ length: 0, width: 0, height: 0 }), '25 x 20 x 10 cm');
check('a real box prints as the app prints it', formatWaybillDimensions({ length: 30, width: 20, height: 15 }), '30 x 20 x 15 cm');
check('a short-key box works too', formatWaybillDimensions({ l: 10, w: 5, h: 2 }), '10 x 5 x 2 cm');

console.log(`\n${checks - failures}/${checks} parity checks passed.`);
if (failures > 0) process.exit(1);
