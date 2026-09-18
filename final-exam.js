const $=id=>document.getElementById(id);
const DATA_URL='/data/600-cau-hoi-2025.json';
const RESULT_KEY='dat-final-course-exam-v1';
const token=()=>localStorage.getItem('hv_token')||sessionStorage.getItem('hv_token')||localStorage.getItem('app_student_token')||sessionStorage.getItem('app_student_token')||'';

const EXAMS=[
  {id:'law',title:'Pháp luật về giao thông đường bộ',description:'10 câu hỏi về luật giao thông (Khái niệm, Quy tắc, Biển báo, Tốc độ, Sa hình)',ids:[1,20,80,105,143,149,310,336,486,500]},
  {id:'upgrade',title:'Kiến thức mới về xe nâng hạng',description:'10 câu hỏi kiến thức nâng cao dành cho nâng hạng',ids:[118,120,122,128,129,130,131,132,134,135]},
  {id:'ethics',title:'Đạo đức, văn hóa giao thông, phòng chống rượu bia, PCCC',description:'10 câu hỏi về đạo đức người lái xe',topicId:2},
  {id:'technique',title:'Kỹ thuật lái xe',description:'10 câu hỏi về kỹ thuật lái xe',topicId:3},
  {id:'mechanics',title:'Cấu tạo và sửa chữa thông thường',description:'10 câu hỏi về cấu tạo và sửa chữa xe',topicId:4}
];

let allQuestions=[],activeExam=null,examQuestions=[],answers={},currentIndex=0,reviewMode=false,lastResult=null;

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
async function rpc(fn,body={}){const r=await fetch('/api/student-rpc',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn,body}),signal:AbortSignal.timeout(8000)});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||d?.error||('HTTP '+r.status));return d}
function stablePick(source,count=10){return [...source].sort((a,b)=>a.id-b.id).slice(0,count)}
function questionsFor(def){
  if(Array.isArray(def.ids))return def.ids.map(id=>allQuestions.find(q=>q.id===id)).filter(Boolean);
  return stablePick(allQuestions.filter(q=>q.topicId===def.topicId),10);
}
function renderCards(){
  $('examCards').innerHTML=EXAMS.map(def=>`<article class="exam-card">
    <span class="exam-card-icon">▤</span>
    <h2>${esc(def.title)}</h2>
    <p>${esc(def.description)}</p>
    <button type="button" data-exam="${def.id}">▶ Bắt đầu làm bài</button>
  </article>`).join('');
  document.querySelectorAll('[data-exam]').forEach(button=>button.onclick=()=>startExam(button.dataset.exam));
}
function startExam(id){
  activeExam=EXAMS.find(x=>x.id===id);
  if(!activeExam)return;
  examQuestions=questionsFor(activeExam);
  if(examQuestions.length!==10){alert('Đề này chưa đủ 10 câu hỏi.');return}
  answers={};currentIndex=0;reviewMode=false;lastResult=null;
  $('examPicker').hidden=true;$('examRunner').hidden=false;
  $('runnerTitle').textContent=activeExam.title;
  renderQuestion();
}
function renderQuestion(){
  const q=examQuestions[currentIndex];if(!q)return;
  $('runnerProgress').textContent=(currentIndex+1)+' / '+examQuestions.length;
  $('questionNumber').textContent='CÂU '+(currentIndex+1)+' / '+examQuestions.length;
  $('questionText').textContent=q.question;
  const figure=$('questionFigure'),img=$('questionImage');
  if(q.image){img.src=q.image;figure.hidden=false}else{img.removeAttribute('src');figure.hidden=true}
  const selected=answers[q.id];
  $('answerOptions').replaceChildren();
  q.options.forEach(option=>{
    const b=document.createElement('button');b.type='button';b.className='final-answer';
    if(selected===option.n)b.classList.add('selected');
    if(reviewMode){
      if(option.n===q.answer)b.classList.add('review-correct');
      else if(selected===option.n)b.classList.add('review-wrong');
      b.disabled=true;
    }
    const n=document.createElement('span');n.textContent=option.n;
    const text=document.createElement('strong');text.textContent=option.text;
    b.append(n,text);
    b.onclick=()=>{if(reviewMode)return;answers[q.id]=option.n;renderQuestion()};
    $('answerOptions').append(b);
  });
  $('prevQuestion').disabled=currentIndex===0;
  $('nextQuestion').disabled=currentIndex===examQuestions.length-1;
  renderPalette();
}
function renderPalette(){
  $('questionPalette').replaceChildren();
  examQuestions.forEach((q,i)=>{
    const b=document.createElement('button');b.type='button';b.textContent=i+1;
    if(answers[q.id])b.classList.add('answered');
    if(i===currentIndex)b.classList.add('current');
    b.onclick=()=>{currentIndex=i;renderQuestion()};
    $('questionPalette').append(b);
  });
}
function scoreExam(){
  const correct=examQuestions.filter(q=>answers[q.id]===q.answer).length;
  const unanswered=examQuestions.filter(q=>!answers[q.id]).length;
  return{correct,total:examQuestions.length,unanswered,date:new Date().toISOString(),examId:activeExam.id,title:activeExam.title};
}
function persistResult(result){
  try{
    const list=JSON.parse(localStorage.getItem(RESULT_KEY)||'[]');
    const next=[result,...(Array.isArray(list)?list:[])].slice(0,50);
    localStorage.setItem(RESULT_KEY,JSON.stringify(next));
  }catch{}
}
function submitExam(){
  const result=scoreExam();lastResult=result;persistResult(result);
  $('resultScore').textContent=result.correct+'/'+result.total;
  $('resultText').textContent=result.unanswered?'Bạn còn '+result.unanswered+' câu chưa trả lời. Kết quả đã được lưu trên thiết bị.':'Bạn đã trả lời đủ 10 câu. Kết quả đã được lưu trên thiết bị.';
  $('resultDialog').showModal();
}
function showReview(){reviewMode=true;$('resultDialog').close();currentIndex=0;renderQuestion()}
function resetToPicker(){$('resultDialog').close();$('examRunner').hidden=true;$('examPicker').hidden=false;activeExam=null;examQuestions=[];answers={};reviewMode=false}
$('prevQuestion').onclick=()=>{if(currentIndex>0){currentIndex--;renderQuestion()}};
$('nextQuestion').onclick=()=>{if(currentIndex<examQuestions.length-1){currentIndex++;renderQuestion()}};
$('submitExam').onclick=submitExam;
$('backToPicker').onclick=()=>{if(Object.keys(answers).length&&!confirm('Thoát bài thi đang làm? Kết quả chưa nộp sẽ không được lưu.'))return;resetToPicker()};
$('reviewResult').onclick=showReview;
$('retryExam').onclick=()=>{const id=activeExam?.id;$('resultDialog').close();startExam(id)};
$('closeResult').onclick=resetToPicker;
$('sidebarToggle')?.addEventListener('click',()=>{if(matchMedia('(max-width:980px)').matches)document.body.classList.toggle('sidebar-open');else document.body.classList.toggle('sidebar-collapsed')});
$('fullscreenToggle')?.addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}});

async function loadStudent(){
  if(!token())return;
  try{
    const results=await Promise.allSettled([rpc('app_student_me',{p_token:token()}),rpc('app_student_portal',{p_token:token()})]);
    const unwrap=v=>{let x=v;for(let i=0;i<5;i++){if(Array.isArray(x)){x=x[0];continue}if(x&&typeof x==='object'&&!('name'in x)&&!('student_name'in x)&&!('photo_data'in x)){const n=x.data??x.result??x.student??x.profile??x.account;if(n!==undefined&&n!==x){x=n;continue}}break}return x&&typeof x==='object'?x:{}};
    const me=results[0].status==='fulfilled'?unwrap(results[0].value):{},student=results[1].status==='fulfilled'?unwrap(results[1].value):{};
    const name=student.name||student.full_name||student.student_name||me.name||me.full_name||me.student_name||me.username;
    if(name)$('sidebarStudentName').textContent=String(name);
    const photo=student.photo_data||student.photo_url||student.avatar_url;
    if(photo){$('sidebarStudentPhoto').src=String(photo);$('sidebarStudentPhoto').hidden=false;$('sidebarStudentInitials').hidden=true}
    else if(name)$('sidebarStudentInitials').textContent=String(name).split(/\s+/).filter(Boolean).slice(-2).map(x=>x[0]).join('').toUpperCase()||'HV';
  }catch{}
}
async function init(){
  try{
    const r=await fetch(DATA_URL,{cache:'no-store'});if(!r.ok)throw new Error('Không tải được bộ 600 câu.');
    allQuestions=await r.json();if(!Array.isArray(allQuestions)||allQuestions.length!==600)throw new Error('Dữ liệu 600 câu chưa đầy đủ.');
    for(const def of EXAMS){if(questionsFor(def).length!==10)throw new Error('Đề '+def.title+' chưa đủ 10 câu.')}
    renderCards();loadStudent();
  }catch(error){$('examCards').innerHTML='<p>'+esc(error.message||'Không tải được dữ liệu đề thi.')+'</p>'}
}
await init();