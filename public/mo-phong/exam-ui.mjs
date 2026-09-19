const $ = id => document.getElementById(id);

const menuExam = $('menuExam');
const menuStudy = $('menuStudy');
const hiddenExamButton = $('exam');
const hiddenHistoryButton = $('history');
const player = document.querySelector('.player');
const title = $('title');
const video = $('video');
const result = $('result');
const summary = $('summary');
const moduleTitlebar = $('moduleTitlebar');

let startedAt = 0;
let timerId = 0;
let lastElapsedSeconds = 0;
let currentNumber = 0;

function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}

function buildExamUi() {
  if (!player || $('examStatusbar')) return;

  if (menuExam) {
    menuExam.innerHTML = '<i></i>Thi thử mô phỏng';
    menuExam.setAttribute('aria-label', 'Thi thử mô phỏng 10 tình huống');
  }
  if (hiddenExamButton) hiddenExamButton.textContent = 'Thi thử mô phỏng';

  const statusbar = document.createElement('section');
  statusbar.id = 'examStatusbar';
  statusbar.className = 'exam-statusbar';
  statusbar.setAttribute('aria-live', 'polite');
  statusbar.innerHTML = `
    <div class="exam-status-copy">
      <strong>THI THỬ MÔ PHỎNG</strong>
      <span id="examProgressLabel">Tình huống 1/10</span>
    </div>
    <div class="exam-progress-dots" id="examProgressDots" aria-label="Tiến độ 10 tình huống">
      ${Array.from({length: 10}, (_, i) => '<span class="exam-dot" data-exam-dot="' + (i + 1) + '">' + (i + 1) + '</span>').join('')}
    </div>
    <div class="exam-clock" aria-label="Thời gian làm bài">
      <span>Thời gian</span>
      <strong id="examElapsed">00:00</strong>
    </div>
  `;
  player.insertBefore(statusbar, title?.nextSibling || player.firstChild);

  const finalPanel = document.createElement('section');
  finalPanel.id = 'examFinalPanel';
  finalPanel.className = 'exam-final-panel';
  finalPanel.hidden = true;
  player.append(finalPanel);

  const dialog = document.createElement('dialog');
  dialog.id = 'examIntroDialog';
  dialog.className = 'exam-intro-dialog';
  dialog.innerHTML = `
    <form method="dialog" class="exam-intro-card">
      <button class="exam-dialog-close" value="cancel" aria-label="Đóng">×</button>
      <p class="exam-eyebrow">HỌC LÁI XE CÙNG ĐẠT</p>
      <h2>Thi thử mô phỏng 10 tình huống</h2>
      <p class="exam-intro-lead">Hệ thống tạo ngẫu nhiên 10 tình huống từ đủ 6 chương để bạn luyện phản xạ nhận biết nguy hiểm.</p>
      <div class="exam-intro-grid">
        <div><strong>10</strong><span>Tình huống</span></div>
        <div><strong>50</strong><span>Điểm tối đa</span></div>
        <div><strong>35</strong><span>Mục tiêu luyện tập</span></div>
      </div>
      <ul class="exam-rules">
        <li>Mỗi tình huống chỉ ghi nhận <b>một lần</b> bấm phát hiện nguy hiểm.</li>
        <li>Dùng phím <b>Space</b> hoặc nút <b>Phát hiện nguy hiểm</b> khi nguy cơ xuất hiện.</li>
        <li>Video thi thử không có thanh tua. Hết video mới chuyển sang tình huống tiếp theo.</li>
        <li>Điểm chi tiết chỉ hiển thị sau khi hoàn thành đủ 10 tình huống.</li>
      </ul>
      <p class="exam-legal-note">Đây là chế độ luyện kỹ năng nhận biết tình huống nguy hiểm; không được giới thiệu như nội dung sát hạch GPLX hiện hành.</p>
      <p id="examIntroState" class="exam-intro-state"></p>
      <div class="exam-intro-actions">
        <button value="cancel" class="exam-secondary">Quay lại ôn tập</button>
        <button type="button" id="examStartNow" class="exam-primary">Bắt đầu thi thử</button>
      </div>
    </form>
  `;
  document.body.append(dialog);

  const historyQuick = document.createElement('button');
  historyQuick.type = 'button';
  historyQuick.className = 'menu-sub menu-action';
  historyQuick.id = 'menuExamHistory';
  historyQuick.innerHTML = '<i></i>Lịch sử thi thử';
  menuExam?.after(historyQuick);
  historyQuick.addEventListener('click', () => {
    hiddenHistoryButton?.click();
    $('historyPanel')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  });

  $('examStartNow')?.addEventListener('click', () => {
    const introState = $('examIntroState');
    if (!hiddenExamButton || hiddenExamButton.disabled) {
      if (introState) introState.textContent = 'Dữ liệu 120 tình huống chưa sẵn sàng. Hãy tải lại dữ liệu rồi thử lại.';
      return;
    }
    dialog.close();
    clearFinalResult();
    resetExamProgress();
    hiddenExamButton.click();
  });

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

function openExamIntro() {
  const dialog = $('examIntroDialog');
  const introState = $('examIntroState');
  if (!dialog) return;
  if (introState) {
    introState.textContent = hiddenExamButton?.disabled
      ? 'Đang chờ hệ thống tải đủ dữ liệu 120 tình huống.'
      : 'Dữ liệu đã sẵn sàng. Bạn có thể bắt đầu.';
  }
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', '');
}

function resetExamProgress() {
  currentNumber = 0;
  document.querySelectorAll('[data-exam-dot]').forEach(dot => {
    dot.classList.remove('active', 'done');
  });
  if ($('examProgressLabel')) $('examProgressLabel').textContent = 'Tình huống 1/10';
  if ($('examElapsed')) $('examElapsed').textContent = '00:00';
}

function updateDots(number, markCurrentDone = false) {
  if (!Number.isInteger(number) || number < 1 || number > 10) return;
  currentNumber = number;
  document.querySelectorAll('[data-exam-dot]').forEach(dot => {
    const n = Number(dot.dataset.examDot);
    dot.classList.toggle('done', n < number || (markCurrentDone && n === number));
    dot.classList.toggle('active', !markCurrentDone && n === number);
  });
  if ($('examProgressLabel')) $('examProgressLabel').textContent = 'Tình huống ' + number + '/10';
}

function syncCurrentFromTitle() {
  if (document.body.dataset.mode !== 'exam') return;
  const match = String(title?.textContent || '').match(/Bài\s+(\d+)\/10/i);
  if (match) updateDots(Number(match[1]));
}

function startTimer() {
  stopTimer(false);
  startedAt = Date.now();
  lastElapsedSeconds = 0;
  const tick = () => {
    lastElapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if ($('examElapsed')) $('examElapsed').textContent = formatDuration(lastElapsedSeconds);
  };
  tick();
  timerId = window.setInterval(tick, 1000);
}

function stopTimer(capture = true) {
  if (timerId) window.clearInterval(timerId);
  timerId = 0;
  if (capture && startedAt) lastElapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  startedAt = 0;
}

function handleModeChange() {
  const examMode = document.body.dataset.mode === 'exam';
  document.body.classList.toggle('exam-running', examMode);
  if (examMode) {
    clearFinalResult();
    resetExamProgress();
    startTimer();
    window.setTimeout(syncCurrentFromTitle, 0);
  } else if (timerId) {
    stopTimer(true);
  }
}

function readSummaryRows() {
  const table = summary?.querySelector('table');
  if (!table) return [];
  return [...table.querySelectorAll('tr')].map(row => {
    const cells = [...row.querySelectorAll('td')].map(cell => cell.textContent.trim());
    const score = Number((cells[1] || '').match(/\d+/)?.[0] || 0);
    return {
      scenario: cells[0] || '',
      score,
      time: cells[2] || ''
    };
  }).filter(item => item.scenario);
}

function buildResultTable(rows) {
  const table = document.createElement('table');
  table.className = 'exam-result-table';
  table.innerHTML = '<thead><tr><th>Tình huống</th><th>Điểm</th><th>Thời điểm phát hiện</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const item of rows) {
    const tr = document.createElement('tr');
    tr.className = item.score === 0 ? 'score-zero' : item.score >= 4 ? 'score-high' : 'score-mid';
    const a = document.createElement('td');
    const b = document.createElement('td');
    const c = document.createElement('td');
    a.textContent = item.scenario;
    b.textContent = item.score + '/5';
    c.textContent = item.time;
    tr.append(a, b, c);
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

function renderFinalResult() {
  const text = String(result?.textContent || '');
  const scoreMatch = text.match(/(\d+)\/50/);
  if (!scoreMatch) return;

  const total = Number(scoreMatch[1]);
  const rows = readSummaryRows();
  if (!rows.length) return;

  stopTimer(true);
  const high = rows.filter(item => item.score >= 4).length;
  const mid = rows.filter(item => item.score >= 1 && item.score <= 3).length;
  const zero = rows.filter(item => item.score === 0).length;
  const achieved = total >= 35;
  const panel = $('examFinalPanel');
  if (!panel) return;

  document.body.classList.add('exam-result-mode');
  if (moduleTitlebar) moduleTitlebar.textContent = 'Kết quả thi thử mô phỏng';

  panel.hidden = false;
  panel.replaceChildren();

  const hero = document.createElement('div');
  hero.className = 'exam-result-hero';
  hero.innerHTML = `
    <div class="exam-score-ring"><strong>${total}</strong><span>/50 điểm</span></div>
    <div class="exam-result-copy">
      <p class="exam-eyebrow">HOÀN THÀNH 10/10 TÌNH HUỐNG</p>
      <h2>${achieved ? 'Đạt mục tiêu luyện tập 35/50' : 'Chưa đạt mục tiêu luyện tập 35/50'}</h2>
      <p>Bạn đã hoàn thành đề trong <b>${formatDuration(lastElapsedSeconds)}</b>. Xem lại từng tình huống bên dưới để biết phần cần luyện thêm.</p>
    </div>
  `;

  const stats = document.createElement('div');
  stats.className = 'exam-result-stats';
  stats.innerHTML = `
    <div><strong>${high}</strong><span>Tình huống 4–5 điểm</span></div>
    <div><strong>${mid}</strong><span>Tình huống 1–3 điểm</span></div>
    <div><strong>${zero}</strong><span>Tình huống 0 điểm</span></div>
    <div><strong>${formatDuration(lastElapsedSeconds)}</strong><span>Thời gian hoàn thành</span></div>
  `;

  const heading = document.createElement('div');
  heading.className = 'exam-result-heading';
  heading.innerHTML = '<h3>Chi tiết bài thi thử</h3><p>Điểm được tính theo các mốc luyện tập đang có trong bộ dữ liệu.</p>';

  const actions = document.createElement('div');
  actions.className = 'exam-final-actions';
  actions.innerHTML = `
    <button type="button" class="exam-primary" id="examTryAgain">Thi đề mới</button>
    <button type="button" class="exam-secondary" id="examReviewNow">Ôn lại tình huống</button>
    <button type="button" class="exam-secondary" id="examOpenHistory">Xem lịch sử</button>
  `;

  panel.append(hero, stats, heading, buildResultTable(rows), actions);

  $('examTryAgain')?.addEventListener('click', () => {
    clearFinalResult();
    openExamIntro();
  });
  $('examReviewNow')?.addEventListener('click', () => {
    clearFinalResult();
    menuStudy?.click();
    window.scrollTo({top: 0, behavior: 'smooth'});
  });
  $('examOpenHistory')?.addEventListener('click', () => {
    clearFinalResult();
    hiddenHistoryButton?.click();
    $('historyPanel')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  });
}

function clearFinalResult() {
  document.body.classList.remove('exam-result-mode');
  const panel = $('examFinalPanel');
  if (panel) {
    panel.hidden = true;
    panel.replaceChildren();
  }
}

buildExamUi();

menuExam?.addEventListener('click', event => {
  if (document.body.dataset.mode === 'exam') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openExamIntro();
}, true);

menuStudy?.addEventListener('click', () => {
  if (document.body.dataset.mode !== 'exam') clearFinalResult();
}, true);

video?.addEventListener('ended', () => {
  if (document.body.dataset.mode === 'exam' && currentNumber) updateDots(currentNumber, true);
});

new MutationObserver(syncCurrentFromTitle).observe(title, {childList: true, characterData: true, subtree: true});
new MutationObserver(handleModeChange).observe(document.body, {attributes: true, attributeFilter: ['data-mode']});
new MutationObserver(() => {
  if (/^Kết quả luyện tập:/i.test(String(result?.textContent || ''))) {
    window.setTimeout(renderFinalResult, 0);
  }
}).observe(result, {childList: true, characterData: true, subtree: true});

handleModeChange();
