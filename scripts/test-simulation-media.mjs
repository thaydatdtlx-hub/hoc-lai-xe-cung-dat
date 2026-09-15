import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chapterOf, EXAM_CHAPTER_COUNTS, validateManifest, scoreAt, makeExam} from '../public/mo-phong/core.mjs';
// Synthetic timeline for algorithm tests only. Never included in the production manifest.
const scenario = id => ({id, chapter: chapterOf(id), title: 'Synthetic fixture', videoUrl: '/fixture.mp4', durationSeconds: 20,
  scoreWindows: Array.from({length:5},(_,i)=>({score:5-i,start:5+i,end:6+i})),
  source:{url:'https://example.com/fixture',version:'test',rightsReference:'test fixture only'}});
const good = {version:'test',scenarios:Array.from({length:120},(_,i)=>scenario(i+1))};
assert.deepEqual(validateManifest(good,{requireComplete:true}),[]);
for (let i=0;i<5;i++) {
  assert.equal(scoreAt(good.scenarios[0],5+i),5-i);
  assert.equal(scoreAt(good.scenarios[0],6+i-0.0001),5-i);
  assert.equal(scoreAt(good.scenarios[0],6+i),i===4?0:4-i);
}
assert.equal(scoreAt(good.scenarios[0],4.9999),0);
assert.equal(scoreAt(good.scenarios[0],null),0);
assert.throws(()=>scoreAt(good.scenarios[0],NaN));
for (const mutate of [d=>d.scenarios.push(scenario(1)),d=>d.scenarios[0].scoreWindows[1].start=4,d=>d.scenarios[0].durationSeconds=6,d=>d.scenarios[0].chapter=2,d=>d.scenarios[0].videoUrl='javascript:alert(1)',d=>delete d.scenarios[0].source]) {
 const d=structuredClone(good);mutate(d);assert.ok(validateManifest(d).length);
}
const exam = makeExam(good.scenarios, () => 0.314159);
assert.equal(new Set(exam.map(s=>s.id)).size,10);
assert.deepEqual(Array.from({length:6},(_,i)=>exam.filter(s=>chapterOf(s.id)===i+1).length),EXAM_CHAPTER_COUNTS);
assert.throws(()=>makeExam(good.scenarios.slice(0,119)));
const pending=JSON.parse(await readFile(new URL('../public/data/mo-phong-120-media.json',import.meta.url)));
assert.deepEqual(validateManifest(pending),[]);
assert.ok(validateManifest(pending,{requireComplete:true}).length);
console.log('PASS: boundary scores, invalid data, chapter mapping, exam chapter quotas, pending release blocked.');
