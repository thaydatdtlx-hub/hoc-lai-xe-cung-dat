import {loadManifest, chapterOf, scoreAt, makeExam} from './core.mjs';
const $=id=>document.getElementById(id),video=$('video'),KEY='dat-simulation-device-v2',REVIEW_KEY='dat-simulation-review-v1';
const token=()=>localStorage.getItem('hv_token')||sessionStorage.getItem('hv_token')||localStorage.getItem('app_student_token')||sessionStorage.getItem('app_student_token')||'';
let data={scenarios:[]},current=null,mode='study',queue=[],index=0,answers=[],mark=null,finished=false,recorded=false,mediaReady=false,examStartedAt=0,remoteTimer=null;
let state={last:null,attempts:{},history:[],totalAttempts:0};
let reviewState={completed:{},answers:{}};
try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&saved.attempts&&typeof saved.attempts==='object'){state={...state,...saved,history:Array.isArray(saved.history)?saved.history:[]}}}catch{$('storageNotice').textContent='Không đọc được tiến độ đã lưu. Bạn vẫn có thể luyện trong phiên này.'}
try{const savedReview=JSON.parse(localStorage.getItem(REVIEW_KEY));if(savedReview&&typeof savedReview==='object')reviewState={...reviewState,...savedReview,completed:savedReview.completed||{},answers:savedReview.answers||{}}}catch{}
async function rpc(fn,body={}){const r=await fetch('/api/student-rpc',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn,body}),signal:AbortSignal.timeout(8000)});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||d?.error||`HTTP ${r.status}`);return d}
function counts(){const attempts=Object.values(state.attempts).filter(a=>a?.version===data.version);return{completed:attempts.length,mastered:attempts.filter(a=>a.score>=4).length}}
function saveLocal(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{$('storageNotice').textContent='Trình duyệt không cho lưu tiến độ. Kết quả chỉ còn trong phiên này.'}}
function scheduleRemoteSave(){if(!token()||data.version==='pending')return;clearTimeout(remoteTimer);remoteTimer=setTimeout(async()=>{const c=counts();try{await rpc('app_student_save_simulation_progress',{p_token:token(),p_progress_data:{last:state.last,attempts:state.attempts},p_completed_count:c.completed,p_mastered_count:c.mastered,p_total_attempts:state.totalAttempts||0,p_last_scenario_id:state.last||1});$('storageNotice').textContent='Tiến độ đang được đồng bộ với tài khoản học viên.'}catch{$('storageNotice').textContent='Chưa đồng bộ được tài khoản; tiến độ vẫn được lưu trên thiết bị này.'}},500)}
function save(){saveLocal();scheduleRemoteSave()}
function newer(a,b){return !a?b:!b?a:new Date(a.date||0)>=new Date(b.date||0)?a:b}
async function loadRemote(){if(!token())return;try{const r=await rpc('app_student_get_simulation_progress',{p_token:token()});const p=r?.progress_data||{};if(p.attempts&&typeof p.attempts==='object'){for(const[id,a]of Object.entries(p.attempts))state.attempts[id]=newer(state.attempts[id],a)}state.last=p.last||r?.last_scenario_id||state.last;state.totalAttempts=Math.max(state.totalAttempts||0,r?.total_attempts||0);if(Array.isArray(r?.history)&&r.history.length){state.history=r.history.map(h=>({date:h.submitted_at,version:data.version,total:h.score,answers:[]})).slice(0,50)}saveLocal();$('storageNotice').textContent='Đã đồng bộ tiến độ từ tài khoản học viên.'}catch{$('storageNotice').textContent='Đang dùng tiến độ trên thiết bị; chưa tải được dữ liệu tài khoản.'}}
const CHAPTER_LABELS=['Giao thông trong đô thị, khu đông dân cư','Giao thông trên đường nông thôn','Giao thông trên đường cao tốc','Giao thông trên đường núi','Giao thông trên quốc lộ','Các tình huống thực tế'];
const CHAPTER_ROMAN=['I','II','III','IV','V','VI'];
function saveReview(){try{localStorage.setItem(REVIEW_KEY,JSON.stringify(reviewState))}catch{}}
function normalizedReviewQuestions(s){
  const raw=Array.isArray(s?.reviewQuestions)?s.reviewQuestions:[];
  return raw.slice(0,4).map((q,i)=>({
    title:String(q?.title||['Nhận biết tên tình huống','Dấu hiệu nhận biết gián tiếp','Dấu hiệu nhận biết trực tiếp','Phương án xử lý'][i]||('Câu '+(i+1))),
    options:Array.isArray(q?.options)?q.options.map(String):[],
    correct:Number.isInteger(q?.correct)?q.correct:-1
  })).filter(q=>q.options.length>=2&&q.correct>=0&&q.correct<q.options.length);
}
function renderReview(s){
  const panel=$('reviewPanel'),host=$('reviewQuestions'),result=$('reviewResult');
  if(!panel||!host||mode!=='study'){if(panel)panel.hidden=true;return}
  panel.hidden=false;host.replaceChildren();result.textContent='';
  const questions=normalizedReviewQuestions(s);
  if(questions.length!==4){
    const pending=document.createElement('div');pending.className='review-pending';
    const titles=['Nhận biết tên tình huống','Dấu hiệu nhận biết gián tiếp','Dấu hiệu nhận biết trực tiếp','Phương án xử lý'];
    const rows=[3,3,3,4];
    titles.forEach((title,i)=>{
      const card=document.createElement('article');card.className='review-pending-card';
      const h=document.createElement('h3');h.innerHTML='<span class="review-index">'+(i+1)+'</span>'+title;
      card.append(h);
      for(let r=0;r<rows[i];r++){
        const row=document.createElement('div');row.className='review-pending-option';
        row.textContent='Đang cập nhật nội dung đã xác minh…';
        card.append(row);
      }
      pending.append(card);
    });
    host.append(pending);$('next').disabled=false;return;
  }
  const saved=reviewState.answers[s.id]||{};
  questions.forEach((q,qi)=>{
    const card=document.createElement('article');card.className='review-card';
    const h=document.createElement('h3');h.innerHTML='<span class="review-index">'+(qi+1)+'</span>'+q.title;
    const opts=document.createElement('div');opts.className='review-options';
    q.options.forEach((label,oi)=>{
      const b=document.createElement('button');b.type='button';b.className='review-option';b.textContent=label;
      if(saved[qi]!==undefined){
        if(oi===saved[qi])b.classList.add('selected');
        if(oi===q.correct)b.classList.add('correct');
        else if(oi===saved[qi])b.classList.add('wrong');
      }
      b.onclick=()=>{
        if(!reviewState.answers[s.id])reviewState.answers[s.id]={};
        reviewState.answers[s.id][qi]=oi;
        const ans=reviewState.answers[s.id];
        if([0,1,2,3].every(i=>ans[i]!==undefined))reviewState.completed[s.id]=true;
        saveReview();renderReview(s);drawGrid();
        const total=[0,1,2,3].filter(i=>ans[i]===questions[i].correct).length;
        $('reviewResult').textContent='Đã trả lời '+Object.keys(ans).length+'/4 · Đúng '+total+'/4 nội dung.';
        if(reviewState.completed[s.id])$('next').disabled=false;
      };
      opts.append(b);
    });
    card.append(h,opts);host.append(card);
  });
  if(reviewState.completed[s.id]){
    const ans=reviewState.answers[s.id]||{},total=[0,1,2,3].filter(i=>ans[i]===questions[i].correct).length;
    result.textContent='Đã ôn đủ 4 nội dung · Đúng '+total+'/4.';
    $('next').disabled=false;
  }
}
function drawGrid(){
  $('grid').replaceChildren();
  let done=0;
  for(let id=1;id<=120;id++)if(reviewState.completed[id])done++;
  const selectedChapter=+$('chapter').value;
  for(let chapter=1;chapter<=6;chapter++){
    if(selectedChapter&&chapter!==selectedChapter)continue;
    const block=document.createElement('section');block.className='chapter-block';
    const heading=document.createElement('h2');heading.className='chapter-heading';heading.textContent='Chương '+CHAPTER_ROMAN[chapter-1]+' - '+CHAPTER_LABELS[chapter-1];
    const chapterGrid=document.createElement('div');chapterGrid.className='chapter-grid';
    const starts=[1,30,44,64,74,91],ends=[29,43,63,73,90,120];
    for(let id=starts[chapter-1];id<=ends[chapter-1];id++){
      const scenario=data.scenarios.find(s=>s.id===id),reviewed=!!reviewState.completed[id],b=document.createElement('button');
      b.disabled=!scenario||mode==='exam';
      b.textContent=String(id)+(!scenario?' —':'');
      b.className=reviewed?'high':'';
      b.setAttribute('aria-label','Tình huống '+id+(scenario?(reviewed?', đã ôn đủ 4 nội dung':', chưa ôn'):', chưa có dữ liệu'));
      b.setAttribute('aria-current',String(current?.id===id));
      b.onclick=()=>select(scenario);
      chapterGrid.append(b);
    }
    block.append(heading,chapterGrid);$('grid').append(block);
  }
  $('progress').textContent='Đã ôn '+done+'/120 · Dữ liệu sẵn sàng '+data.scenarios.length+'/120';
}
function select(s){video.pause();current=s;mark=null;finished=false;recorded=false;mediaReady=false;$('title').textContent=`${mode==='exam'?`Bài ${index+1}/10 · `:''}Tình huống ${s.id}: ${s.title}`;$('result').textContent='';$('summary').replaceChildren();$('explanation').hidden=true;$('explanation').open=false;$('play').disabled=true;$('detect').disabled=true;$('next').disabled=true;video.controls=mode==='study';$('playerStatus').textContent='Đang tải video…';video.src=s.videoUrl;video.load();const actions=document.querySelector('.actions');if(actions)actions.className='actions '+(mode==='study'?'study-actions':'exam-actions');if(mode==='study'){state.last=s.id;save();renderReview(s)}else{$('reviewPanel').hidden=true}drawGrid()}
function record(){if(recorded||!current)return;recorded=true;const score=scoreAt(current,mark);state.totalAttempts=(state.totalAttempts||0)+1;state.attempts[current.id]={score,time:mark,date:new Date().toISOString(),version:data.version};if(mode==='exam')answers.push({id:current.id,score,time:mark});save();drawGrid();$('result').textContent=mode==='exam'?'Đã hoàn thành tình huống.':`${score}/5 điểm · ${mark===null?'Chưa bấm phát hiện':`Bấm tại ${mark.toFixed(3)} giây`}`;if(mode==='study'){$('windows').replaceChildren();for(const w of current.scoreWindows){const p=document.createElement('p');p.textContent=`${w.score} điểm: từ ${w.start} đến trước ${w.end} giây`;$('windows').append(p)}$('hint').textContent=current.hint||'Quan sát lại diễn biến và đối chiếu các khoảng điểm ở trên.';$('explanation').hidden=false}}
function detect(){if(!current||!mediaReady||video.paused||video.ended||finished||mark!==null)return;mark=video.currentTime;$('detect').disabled=true;$('playerStatus').textContent=`Đã ghi nhận tại ${mark.toFixed(3)} giây. Xem hết video để nhận kết quả.`}
video.addEventListener('loadedmetadata',()=>{if(!current)return;if(!Number.isFinite(video.duration)||Math.abs(video.duration-current.durationSeconds)>.25){mediaReady=false;video.pause();video.controls=false;$('play').disabled=true;$('playerStatus').textContent='Video không khớp thời lượng dữ liệu. Tạm dừng chấm điểm để kiểm tra nguồn.';return}mediaReady=true;$('play').disabled=mode==='study';$('playerStatus').textContent=mode==='study'?'Xem video và trả lời 4 câu hỏi ôn tập bên dưới.':'Nhấn Phát video, sau đó bấm Space hoặc nút phát hiện khi thấy nguy hiểm.'});
video.addEventListener('playing',()=>{if(!mediaReady)video.pause();else $('detect').disabled=mark!==null||finished});video.addEventListener('pause',()=>{$('detect').disabled=true});video.addEventListener('ended',()=>{if(!mediaReady)return;finished=true;$('detect').disabled=true;if(mode==='exam'){record();$('next').disabled=false;$('play').disabled=true}else if(reviewState.completed[current?.id])$('next').disabled=false});video.addEventListener('error',()=>{mediaReady=false;$('detect').disabled=true;$('play').disabled=true;$('playerStatus').textContent='Không tải được video. Kiểm tra mạng hoặc chọn lại tình huống. Kết quả chưa được ghi.'});
$('play').onclick=async()=>{if(!current||!mediaReady)return;if(finished){select(current);return}try{await video.play()}catch{$('playerStatus').textContent='Không phát được video. Hãy thử lại.'}};$('detect').onclick=detect;document.addEventListener('keydown',e=>{if(e.code!=='Space'||e.repeat||/INPUT|TEXTAREA|SELECT|BUTTON|VIDEO/.test(e.target.tagName)||e.target.isContentEditable)return;if(current&&mediaReady&&!video.paused&&!finished){e.preventDefault();detect()}});
function setMode(nextMode){video.pause();mode=nextMode;document.body.dataset.mode=mode;if($('moduleTitlebar'))$('moduleTitlebar').textContent=mode==='study'?'Ôn mô phỏng các tình huống giao thông':'Kiểm tra mô phỏng các tình huống giao thông';$('menuStudy')?.classList.toggle('selected',mode==='study');$('menuExam')?.classList.toggle('selected',mode==='exam');if($('reviewPanel'))$('reviewPanel').hidden=mode!=='study';$('study').setAttribute('aria-pressed',String(mode==='study'));$('exam').setAttribute('aria-pressed',String(mode==='exam'));$('continue').disabled=mode==='exam'||!data.scenarios.some(s=>s.id===state.last);$('exam').disabled=mode==='exam'||data.scenarios.length!==120||data.version==='pending';$('chapter').disabled=mode==='exam';drawGrid()}
$('study').onclick=()=>{if(mode==='exam'&&!confirm('Kết thúc bài luyện đề đang làm? Bài chưa hoàn thành sẽ không được lưu vào lịch sử luyện đề.'))return;setMode('study');if(current)select(current)};$('continue').onclick=()=>{const s=data.scenarios.find(s=>s.id===state.last);if(s)select(s)};$('exam').onclick=()=>{queue=makeExam(data.scenarios);index=0;answers=[];examStartedAt=Date.now();setMode('exam');select(queue[0])};
$('next').onclick=async()=>{if(mode==='study'){const i=data.scenarios.findIndex(s=>s.id===current.id);select(data.scenarios[(i+1)%data.scenarios.length]);return}if(!finished||!recorded)return;if(++index<queue.length){select(queue[index]);return}const total=answers.reduce((n,a)=>n+a.score,0),date=new Date().toISOString();state.history.unshift({date,version:data.version,total,answers:[...answers]});state.history=state.history.slice(0,50);save();if(token()){rpc('app_student_save_simulation_exam',{p_token:token(),p_score:total,p_scenario_ids:answers.map(a=>a.id),p_scenario_scores:answers.map(a=>a.score),p_elapsed_seconds:Math.max(0,Math.round((Date.now()-examStartedAt)/1000))}).catch(()=>{})}setMode('study');$('next').disabled=true;$('play').disabled=true;$('result').textContent=`Kết quả luyện tập: ${total}/50 · ${total>=35?'Đạt mục tiêu 35 điểm':'Chưa đạt mục tiêu 35 điểm'}`;const table=document.createElement('table');for(const a of answers){const tr=document.createElement('tr');for(const value of[`Tình huống ${a.id}`,`${a.score}/5`,a.time===null?'Không bấm':`${a.time.toFixed(3)} giây`]){const td=document.createElement('td');td.textContent=value;tr.append(td)}table.append(tr)}$('summary').append(table);$('playerStatus').textContent='Đã lưu kết quả. Chọn tình huống hoặc bắt đầu lượt luyện đề mới.'};
$('chapter').onchange=drawGrid;$('history').onclick=()=>{$('historyPanel').hidden=!$('historyPanel').hidden;$('historyList').replaceChildren();if(!state.history.length)$('historyList').textContent='Chưa có lượt luyện đề hoàn thành.';for(const item of state.history){const p=document.createElement('p');p.textContent=`${new Date(item.date).toLocaleString('vi-VN')} · ${item.total}/50 · Bộ dữ liệu ${item.version}`;$('historyList').append(p)}};
async function init(){if(mode==='exam')return;$('retry').disabled=true;video.pause();current=null;mediaReady=false;finished=true;video.removeAttribute('src');video.load();for(const id of['play','detect','next','exam','continue'])$(id).disabled=true;$('explanation').hidden=true;$('result').textContent='';$('summary').replaceChildren();try{data=await loadManifest();data.scenarios.sort((a,b)=>a.id-b.id);await loadRemote();if(mode==='study')$('storageNotice').textContent='Ôn tập 4 câu được lưu riêng trên thiết bị; dữ liệu và điểm cũ của học viên không bị thay đổi.';$('status').textContent=data.scenarios.length?`Sẵn sàng ${data.scenarios.length}/120 tình huống · ${data.version}`:'Bộ video và mốc chấm điểm chưa được nhập. Ôn tập và luyện đề sẽ mở khi dữ liệu sẵn sàng.';setMode('study');drawGrid()}catch(error){data={scenarios:[]};$('status').textContent=error.message;drawGrid()}finally{$('retry').disabled=false}}
$('retry').onclick=init;window.addEventListener('beforeunload',e=>{if(mode==='exam'){e.preventDefault();e.returnValue=''}});await init();
async function loadStudentShell(){
  if(!token())return;
  try{
    const results=await Promise.allSettled([
      rpc('app_student_me',{p_token:token()}),
      rpc('app_student_portal',{p_token:token()})
    ]);
    const unwrap=v=>{
      let x=v;
      for(let i=0;i<5;i++){
        if(Array.isArray(x)){x=x[0];continue}
        if(x&&typeof x==='object'&&!('name'in x)&&!('student_name'in x)&&!('photo_data'in x)){
          const n=x.data??x.result??x.student??x.profile??x.account;
          if(n!==undefined&&n!==x){x=n;continue}
        }
        break;
      }
      return x&&typeof x==='object'?x:{};
    };
    const me=results[0].status==='fulfilled'?unwrap(results[0].value):{};
    const student=results[1].status==='fulfilled'?unwrap(results[1].value):{};
    const name=student.name||student.full_name||student.student_name||me.name||me.full_name||me.student_name||me.username;
    if(name&&$('sidebarStudentName'))$('sidebarStudentName').textContent=String(name);
    const photo=student.photo_data||student.photo_url||student.avatar_url;
    if(photo&&$('sidebarStudentPhoto')){
      $('sidebarStudentPhoto').src=String(photo);
      $('sidebarStudentPhoto').hidden=false;
      if($('sidebarStudentInitials'))$('sidebarStudentInitials').hidden=true;
    }else if(name&&$('sidebarStudentInitials')){
      $('sidebarStudentInitials').textContent=String(name).split(/\s+/).filter(Boolean).slice(-2).map(x=>x[0]).join('').toUpperCase()||'HV';
    }
  }catch{}
}
$('sidebarToggle')?.addEventListener('click',()=>{
  if(matchMedia('(max-width:980px)').matches)document.body.classList.toggle('sidebar-open');
  else document.body.classList.toggle('sidebar-collapsed');
});
$('fullscreenToggle')?.addEventListener('click',async()=>{
  try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}
});
$('menuStudy')?.addEventListener('click',e=>{e.preventDefault();if(mode==='exam'&&!confirm('Kết thúc bài kiểm tra đang làm?'))return;setMode('study');if(current)select(current)});
$('menuExam')?.addEventListener('click',()=>{if(!$('exam').disabled)$('exam').click()});
loadStudentShell();
