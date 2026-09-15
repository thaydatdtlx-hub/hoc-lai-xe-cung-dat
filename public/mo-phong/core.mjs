export const CHAPTER_ENDS = [29, 43, 63, 73, 90, 120];
export const chapterOf = id => CHAPTER_ENDS.findIndex(end => id <= end) + 1;
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function validateManifest(data, {requireComplete = false} = {}) {
  const errors = [];
  if (!data || typeof data.version !== 'string' || !Array.isArray(data.scenarios)) return ['Manifest cần version và scenarios.'];
  const ids = new Set();
  for (const s of data.scenarios) {
    const label = `Tình huống ${s?.id}`;
    if (!s || !Number.isInteger(s.id) || s.id < 1 || s.id > 120 || ids.has(s.id)) { errors.push(`${label}: ID không hợp lệ hoặc trùng.`); continue; }
    ids.add(s.id);
    if (s.chapter !== chapterOf(s.id)) errors.push(`${label}: sai chương.`);
    if (typeof s.title !== 'string' || !s.title.trim()) errors.push(`${label}: thiếu tiêu đề.`);
    if (typeof s.videoUrl !== 'string' || !(/^(https:\/\/|\/(?!\/))/.test(s.videoUrl)) || /[\s\\]/.test(s.videoUrl)) errors.push(`${label}: cần URL HTTPS hoặc đường dẫn tuyệt đối cùng website.`);
    if (!finite(s.durationSeconds) || s.durationSeconds <= 0) errors.push(`${label}: thời lượng không hợp lệ.`);
    const w = s.scoreWindows;
    if (!Array.isArray(w) || w.length !== 5) errors.push(`${label}: cần 5 khoảng điểm.`);
    else w.forEach((v, i) => {
      if (!v || v.score !== 5 - i || !finite(v.start) || !finite(v.end) || v.start < 0 || v.end <= v.start || v.end > s.durationSeconds || (i && v.start !== w[i-1]?.end)) errors.push(`${label}: khoảng điểm ${i+1} không hợp lệ.`);
    });
    if (!s.source || typeof s.source.url !== 'string' || !s.source.url.startsWith('https://') || typeof s.source.version !== 'string' || !s.source.version.trim() || typeof s.source.rightsReference !== 'string' || !s.source.rightsReference.trim()) errors.push(`${label}: thiếu nguồn, phiên bản hoặc tham chiếu quyền sử dụng.`);
  }
  if (requireComplete && (ids.size !== 120 || data.version === 'pending')) errors.push('Chưa đủ 120 tình huống và phiên bản phát hành.');
  return errors;
}
// All times are seconds on the exact video timeline, including any embedded countdown.
// Intervals are [start, end); outside all intervals is zero, never an invented threshold.
export function scoreAt(scenario, seconds) {
  if (seconds === null) return 0;
  if (!finite(seconds) || seconds < 0) throw new Error('Thời điểm không hợp lệ.');
  return scenario.scoreWindows.find(w => seconds >= w.start && seconds < w.end)?.score ?? 0;
}
export function makeExam(scenarios, random = Math.random) {
  if (scenarios.length !== 120 || new Set(scenarios.map(s => s.id)).size !== 120) throw new Error('Thi thử cần đủ 120 tình huống hợp lệ.');
  const copy = [...scenarios];
  for (let i = copy.length-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0,10);
}
export async function loadManifest(url = '/data/mo-phong-120-media.json') {
  const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Không tải được dữ liệu (HTTP ${response.status}).`);
  const data = await response.json();
  const errors = validateManifest(data);
  if (errors.length) throw new Error(errors.slice(0,3).join(' '));
  return data;
}
