import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/college-cost-overrides.json', import.meta.url), 'utf8'));
const checks = [
 {url: data.colleges[0].costs.tuitionOutOfState.sourceUrl, hash: data.colleges[0].sourceSha256, patterns: [/2026.?2027/, /Tuition[\s\S]{0,800}67,731/, /Housing and Food[\s\S]{0,600}22,944/, /Student Fees Allowance[\s\S]{0,700}2,610/, /Books and Supplies Allowance[\s\S]{0,600}855/, /Personal Expenses Allowance[\s\S]{0,600}3,405/, /Total\s*\$97,545/, /Travel[\s\S]{0,600}Varies/]},
 {url: data.colleges[1].costs.tuitionOutOfState.sourceUrl, hash: data.colleges[1].sourceSha256, patterns: [/2026-27 Cohort/, /Tuition\s*7,101\.00\s*7,101\.00/, /Student Services Fee\s*693\.00/, /Berkeley Campus Fee\s*936\.00/, /Transit Fee\s*236\.00/, /Nonresident Supplemental Tuition\s*N\/A\s*19,635\.00/, /Enhancement Fee\s*141\.00/, /fees below are per semester/]},
 {url: data.colleges[1].budget.sourceUrl, hash: data.colleges[1].budget.sourceSha256, patterns: [/New Students Starting in the 2026-27 Academic Year/, /Tuition and Fees\s*\$18,214/, /Housing\s*\$16,640/, /Meal Plan\s*\$7,000/, /Student Health Insurance Plan\s*\$5,066/, /Total Cost of Attendance[\s\S]{0,80}\$54,674/, /Total Estimated Personal Expenses\s*\$7,754/, /Nonresident Supplemental Tuition of \$39,270/]},
];
const results=[];
for (const check of checks) {
 const response=await fetch(check.url,{signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,check.url);
 const html=await response.text();
 assert.ok(html.length < 2_000_000,'Source size unexpectedly large');
 const text=html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
 for (const pattern of check.patterns) assert.match(text,pattern,`Review source changed: ${check.url}`);
 results.push({url:check.url,status:response.status,contentChecks:check.patterns.length,snapshotMatches:createHash('sha256').update(html).digest('hex')===check.hash});
}
for (const college of data.colleges) {
 assert.equal(college.budget.rows.reduce((sum,[,amount])=>sum+amount,0),college.budget.total);
}
const report={checkedOn:new Date().toISOString(),status:'numeric content checks passed; hash drift requires review',results};
const reportPath=process.argv[2];
if(reportPath) await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
