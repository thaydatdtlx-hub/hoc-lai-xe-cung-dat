import {readFileSync} from "node:fs";
import {strict as assert} from "node:assert";
import {MOTORCYCLE_QUESTION_IDS,MOTORCYCLE_CRITICAL_IDS,EXAMS} from "../exam-config.js";
const read=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const moto=read("250-cau-hoi.html");
const car=read("600-cau-hoi.html");
const quiz=read("questions.js");
const registration=read("dang-ky-hoc-lai-xe.html");
const unified=read("site-unification.js");
const brand=read("theory-hero-brand.js");
const vite=read("vite.config.js");
assert.equal(MOTORCYCLE_QUESTION_IDS.length,250,"A1/A must use exactly 250 official question IDs");
assert.equal(new Set(MOTORCYCLE_QUESTION_IDS).size,250,"The motorcycle bank contains duplicate IDs");
assert.equal(MOTORCYCLE_CRITICAL_IDS.length,20,"Motorcycle must use 20 critical questions");
assert.equal(EXAMS.A1.questionIds.length,250);
assert.equal(EXAMS.A.questionIds.length,250);
assert.equal(EXAMS.B.questionIds,null);
assert.equal(EXAMS.C1.questionIds,null);
for(const [name,html,total,other] of [
 ["motorcycle",moto,250,600],["automobile",car,600,250]
]){
 assert.match(html,new RegExp('<body data-theory-bank="'+total+'">'),name+" body bank");
 assert.match(html,new RegExp('<h1><b>'+total+'</b> câu hỏi'),name+" distinct H1");
 assert.match(html,new RegExp('<title>Học '+total+' câu'),name+" distinct title");
 assert.match(html,new RegExp('href="https://www.hoclaixecungdat.com/'+total+'-cau-hoi.html"'),name+" canonical");
 assert.match(html,/class="theory-bank-switch"/,name+" bank switch");
 assert.match(html,/href="\/250-cau-hoi.html"/,name+" motorcycle link");
 assert.match(html,/href="\/600-cau-hoi.html"/,name+" automobile link");
 assert.match(html,new RegExp('href="/'+total+'-cau-hoi.html" class="theory-bank-switch__link is-current" aria-current="page"'),name+" current marker");
 assert.match(html,/\/questions.js\?v=20261124-separated-banks/,name+" shared quiz code");
}
assert.match(registration,/href="\/250-cau-hoi.html\?hang=A1"[^>]*>Học 250 câu</);
assert.match(registration,/href="\/600-cau-hoi.html\?hang=B"[^>]*>Học 600 câu</);
assert.match(unified,/href:"\/250-cau-hoi.html\?hang=A1"/);
assert.match(quiz,/motorcyclePage=location.pathname==="\/250-cau-hoi.html"/);
assert.match(quiz,/destination.pathname=expectedPath/);
assert.match(brand,/const count=moto\?250:600/);
assert.match(vite,/theoryMoto:resolve\(__dirname,"250-cau-hoi.html"\)/);
console.log("Đạt: 250 câu A1/A; 600 câu B/C1; trang riêng, điều hướng, tiêu đề, canonical và bộ câu hỏi chính thức.");
