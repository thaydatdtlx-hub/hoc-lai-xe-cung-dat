import {loadManifest, chapterOf, scoreAt, makeExam} from './core.mjs';
const $ = id => document.getElementById(id);
const video = $('video'), KEY = 'dat-simulation-device-v1';
let data = {scenarios: []}, current = null, mode = 'study', queue = [], index = 0, answers = [], mark = null, finished = false, recorded = false, mediaReady = false;
let state = {last: null, attempts: {}, history: []};
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && saved.attempts && typeof saved.attempts === 'object' && !Array.isArray(saved.attempts) && Array.isArray(saved.history)) state = saved;
} catch { $('storageNotice').textContent = 'Không đọc được tiến độ đã lưu. Bạn vẫn có thể luyện trong phiên này.'; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { $('storageNotice').textContent = 'Trình duyệt không cho lưu tiến độ. Kết quả chỉ còn trong phiên này.'; }
}
function drawGrid() {
  $('grid').replaceChildren();
  let done = 0;
  for (let id = 1; id <= 120; id++) {
    if (state.attempts[id]?.version === data.version) done++;
    if (+$('chapter').value && chapterOf(id) !== +$('chapter').value) continue;
    const scenario = data.scenarios.find(s => s.id === id), saved = state.attempts[id];
    const score = saved?.version === data.version ? saved.score : undefined;
    const b = document.createElement('button');
    b.disabled = !scenario || mode === 'exam';
    b.textContent = `${id}${!scenario ? ' —' : score === undefined ? '' : score >= 4 ? ' ✓' : score > 0 ? ' ~' : ' ×'}`;
    b.className = score === undefined ? '' : score >= 4 ? 'high' : score > 0 ? 'low' : 'zero';
    b.setAttribute('aria-label', `Tình huống ${id}${scenario ? score === undefined ? ', chưa luyện' : `, ${score} điểm` : ', chưa có dữ liệu'}`);
    b.setAttribute('aria-current', String(current?.id === id));
    b.onclick = () => select(scenario);
    $('grid').append(b);
  }
  $('progress').textContent = `Đã luyện ${done}/120 · Dữ liệu sẵn sàng ${data.scenarios.length}/120`;
}
function select(s) {
  video.pause(); current = s; mark = null; finished = false; recorded = false; mediaReady = false;
  $('title').textContent = `${mode === 'exam' ? `Bài ${index+1}/10 · ` : ''}Tình huống ${s.id}: ${s.title}`;
  $('result').textContent = ''; $('summary').replaceChildren(); $('explanation').hidden = true; $('explanation').open = false;
  $('play').disabled = true; $('detect').disabled = true; $('next').disabled = true;
  video.controls = mode === 'study';
  $('playerStatus').textContent = 'Đang tải video…';
  video.src = s.videoUrl; video.load();
  if (mode === 'study') { state.last = s.id; save(); }
  drawGrid();
}
function record() {
  if (recorded || !current) return;
  recorded = true;
  const score = scoreAt(current, mark);
  state.attempts[current.id] = {score, time: mark, date: new Date().toISOString(), version: data.version};
  if (mode === 'exam') answers.push({id: current.id, score, time: mark});
  save(); drawGrid();
  $('result').textContent = mode === 'exam' ? 'Đã hoàn thành tình huống.' : `${score}/5 điểm · ${mark === null ? 'Chưa bấm phát hiện' : `Bấm tại ${mark.toFixed(3)} giây`}`;
  if (mode === 'study') {
    $('windows').replaceChildren();
    for (const w of current.scoreWindows) { const p = document.createElement('p'); p.textContent = `${w.score} điểm: từ ${w.start} đến trước ${w.end} giây`; $('windows').append(p); }
    $('hint').textContent = current.hint || 'Quan sát lại diễn biến và đối chiếu các khoảng điểm ở trên.';
    $('explanation').hidden = false;
  }
}
function detect() {
  if (!current || !mediaReady || video.paused || video.ended || finished || mark !== null) return;
  mark = video.currentTime; $('detect').disabled = true;
  $('playerStatus').textContent = `Đã ghi nhận tại ${mark.toFixed(3)} giây. Xem hết video để nhận kết quả.`;
}
video.addEventListener('loadedmetadata', () => {
  if (!current) return;
  if (!Number.isFinite(video.duration) || Math.abs(video.duration-current.durationSeconds) > .25) {
    mediaReady = false; video.pause(); video.controls = false;
    $('play').disabled = true; $('playerStatus').textContent = 'Video không khớp thời lượng dữ liệu. Tạm dừng chấm điểm để kiểm tra nguồn.'; return;
  }
  mediaReady = true; $('play').disabled = false; $('playerStatus').textContent = 'Nhấn Phát video, sau đó bấm Space hoặc nút phát hiện khi thấy nguy hiểm.';
});
video.addEventListener('playing', () => { if (!mediaReady) video.pause(); else $('detect').disabled = mark !== null || finished; });
video.addEventListener('pause', () => { $('detect').disabled = true; });
video.addEventListener('ended', () => { if (!mediaReady) return; finished = true; $('detect').disabled = true; record(); $('next').disabled = false; $('play').disabled = mode === 'exam'; });
video.addEventListener('error', () => {
  mediaReady = false; $('detect').disabled = true; $('play').disabled = true;
  $('playerStatus').textContent = 'Không tải được video. Kiểm tra mạng hoặc chọn lại tình huống. Kết quả chưa được ghi.';
});
$('play').onclick = async () => {
  if (!current || !mediaReady) return;
  if (finished) { select(current); return; }
  try { await video.play(); } catch { $('playerStatus').textContent = 'Không phát được video. Hãy thử lại.'; }
};
$('detect').onclick = detect;
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || /INPUT|TEXTAREA|SELECT|BUTTON|VIDEO/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (current && mediaReady && !video.paused && !finished) { e.preventDefault(); detect(); }
});
function setMode(nextMode) {
  video.pause(); mode = nextMode;
  $('study').setAttribute('aria-pressed', String(mode === 'study'));
  $('exam').setAttribute('aria-pressed', String(mode === 'exam'));
  $('continue').disabled = mode === 'exam' || !data.scenarios.some(s => s.id === state.last);
  $('exam').disabled = mode === 'exam' || data.scenarios.length !== 120 || data.version === 'pending';
  $('chapter').disabled = mode === 'exam'; drawGrid();
}
$('study').onclick = () => {
  if (mode === 'exam' && !confirm('Kết thúc bài thi đang làm? Bài chưa hoàn thành sẽ không được lưu vào lịch sử thi.')) return;
  setMode('study'); if (current) select(current);
};
$('continue').onclick = () => { const s = data.scenarios.find(s => s.id === state.last); if (s) select(s); };
$('exam').onclick = () => {
  queue = makeExam(data.scenarios); index = 0; answers = [];
  setMode('exam'); select(queue[0]);
};
$('next').onclick = () => {
  if (mode === 'study') { const i = data.scenarios.findIndex(s => s.id === current.id); select(data.scenarios[(i+1)%data.scenarios.length]); return; }
  if (!finished || !recorded) return;
  if (++index < queue.length) { select(queue[index]); return; }
  const total = answers.reduce((n,a) => n+a.score,0);
  state.history.unshift({date: new Date().toISOString(), version: data.version, total, answers: [...answers]});
  state.history = state.history.slice(0,50); save();
  setMode('study'); $('next').disabled = true; $('play').disabled = true;
  $('result').textContent = `Kết quả luyện tập: ${total}/50 · ${total >= 35 ? 'Đạt mục tiêu 35 điểm' : 'Chưa đạt mục tiêu 35 điểm'}`;
  const table = document.createElement('table');
  for (const a of answers) { const tr = document.createElement('tr'); for (const value of [`Tình huống ${a.id}`, `${a.score}/5`, a.time === null ? 'Không bấm' : `${a.time.toFixed(3)} giây`]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } table.append(tr); }
  $('summary').append(table); $('playerStatus').textContent = 'Đã lưu kết quả. Chọn tình huống hoặc bắt đầu bài thi mới.';
};
$('chapter').onchange = drawGrid;
$('history').onclick = () => {
  $('historyPanel').hidden = !$('historyPanel').hidden; $('historyList').replaceChildren();
  if (!state.history.length) $('historyList').textContent = 'Chưa có bài thi hoàn thành.';
  for (const item of state.history) { const p = document.createElement('p'); p.textContent = `${new Date(item.date).toLocaleString('vi-VN')} · ${item.total}/50 · Bộ dữ liệu ${item.version}`; $('historyList').append(p); }
};
async function init() {
  if (mode === 'exam') return;
  $('retry').disabled = true; video.pause(); current = null; mediaReady = false; finished = true;
  video.removeAttribute('src'); video.load();
  for (const id of ['play','detect','next','exam','continue']) $(id).disabled = true;
  $('explanation').hidden = true; $('result').textContent = ''; $('summary').replaceChildren();
  try {
    data = await loadManifest(); data.scenarios.sort((a,b) => a.id-b.id);
    $('status').textContent = data.scenarios.length ? `Sẵn sàng ${data.scenarios.length}/120 tình huống · ${data.version}` : 'Bộ video và mốc chấm điểm chưa được nhập. Ôn tập và thi thử sẽ mở khi dữ liệu sẵn sàng.';
    setMode('study'); drawGrid();
  } catch (error) { data = {scenarios: []}; $('status').textContent = error.message; drawGrid(); }
  finally { $('retry').disabled = false; }
}
$('retry').onclick = init;
window.addEventListener('beforeunload', e => { if (mode === 'exam') { e.preventDefault(); e.returnValue = ''; } });
await init();
