import {studentRpc} from "./student-rpc-client.js";
import {SCHEDULE_FIELDS,isMotorcycleLicense} from "./schedule-data.js";

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const RESULT_LABELS={scheduled:"Chưa thi",passed:"Đậu",failed:"Rớt",absent:"Vắng thi",cancelled:"Đã hủy"};
const PART_LABELS={theory:"Lý thuyết",simulation:"Mô phỏng",yard:"Sa hình",road:"Đường trường"};
const fieldFor=type=>SCHEDULE_FIELDS.find(f=>f.key===type);
const fmt=value=>{const d=new Date(value);return Number.isNaN(d.valueOf())?"Chưa rõ":new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",year:"numeric"}).format(d)};
const localDate=value=>{const date=new Date(value);if(Number.isNaN(date.valueOf()))return "";return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const normalizeArray=value=>Array.isArray(value)?value:[];
const typeLabel=type=>type==="graduation"?"Thi tốt nghiệp":"Thi sát hạch";

export async function fetchExamAttempts(token,studentId=null){
  const data=await studentRpc("app_list_exam_schedule_attempts",{p_token:token,p_student_id:studentId},{proxyTimeoutMs:6500,directTimeoutMs:4500});
  return normalizeArray(data);
}

export function examAttemptEvents(records,students){
  const studentMap=new Map(students.map(student=>[String(student.id),student]));
  return records.flatMap(record=>{
    const student=studentMap.get(String(record.student_id)),field=fieldFor(record.exam_type);
    if(!student||!field||!record.starts_at)return [];
    if(isMotorcycleLicense(student.license_class)&&record.exam_type==="graduation")return [];
    return [{id:record.id,student,field,date:record.starts_at,
      location:record.location||"",note:record.note||"",
      source:"exam_attempt",attempt:record,
      attemptNo:Number(record.attempt_no)||1,
      statusText:RESULT_LABELS[record.result]||"Chưa thi"}];
  });
}

export function createExamScheduleManager({me,students,token,onReload}){
  if(!["admin","user","student"].includes(me?.role))return null;
  let records=[],busy=false,available=true;
  const manager=["admin","user"].includes(me.role);
  let currentRecord=null;
  const host=document.createElement("dialog");
  host.id="examAttemptDialog";
  host.className="exam-attempt-dialog";
  host.innerHTML=`
    <form id="examAttemptForm">
      <div class="dialog-head"><div><p>LỊCH THI VÀ THI LẠI</p><h2 id="examAttemptTitle">Lập lịch thi</h2></div><button class="dialog-close" type="button" aria-label="Đóng">×</button></div>
      <div class="exam-form-grid">
        <label class="exam-wide">Học viên<select id="examAttemptStudent" required></select></label>
        <label>Loại kỳ thi<select id="examAttemptType" required><option value="graduation">🎓 Thi tốt nghiệp</option><option value="exam">🏁 Thi sát hạch</option></select></label>
        <div class="exam-counter"><small>ĐỢT THI</small><strong id="examAttemptNumber">Lần 1</strong><span id="examAttemptTip">Tự động đánh số theo lịch sử.</span></div>
        <label>Ngày và giờ thi<input type="datetime-local" id="examAttemptStartsAt" required></label>
        <label>Địa điểm / hình thức<input type="text" maxlength="255" id="examAttemptLocation" placeholder="Trung tâm sát hạch / hình thức thi" required></label>
        <label>Kết quả<select id="examAttemptResult"><option value="scheduled">Chưa thi</option><option value="passed">Đậu</option><option value="failed">Rớt</option><option value="absent">Vắng thi</option><option value="cancelled">Đã hủy</option></select></label>
        <div class="exam-failed-parts exam-wide" id="examFailedPartsBox" hidden><strong>Phần thi chưa đạt</strong><div id="examFailedParts"></div></div>
        <label class="exam-wide">Ghi chú<textarea id="examAttemptNote" rows="2" maxlength="1000" placeholder="Giấy tờ cần mang theo, thời gian tập trung…"></textarea></label>
      </div>
      <section class="exam-history"><strong>Lịch sử thi của học viên</strong><div id="examAttemptHistory"></div></section>
      <p id="examAttemptError" class="form-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="dialog-close">Hủy</button><button id="examAttemptSave" type="submit" class="primary">Lưu lịch thi</button></div>
    </form>`;
  document.body.append(host);
  if(manager){
    const button=document.createElement("button");
    button.type="button";button.id="openExamAttemptBtn";button.className="secondary-light exam-open-button";
    button.textContent="＋ Lập lịch thi";
    document.querySelector(".hero-actions")?.append(button);
    button.onclick=()=>open();
  }
  const setValue=(id,value)=>{$(id).value=value??""};
  const getRecords=(id,type)=>records.filter(r=>String(r.student_id)===String(id)&&r.exam_type===type).sort((a,b)=>Number(a.attempt_no)-Number(b.attempt_no));
  function eligibleStudents(){
    return students.filter(s=>s&&s.id&&s.deleted_at==null);
  }
  function updateTypes(){
    const student=eligibleStudents().find(s=>String(s.id)===$("examAttemptStudent").value);
    const bike=isMotorcycleLicense(student?.license_class);
    const type=$("examAttemptType");
    [...type.options].forEach(opt=>{opt.disabled=bike&&opt.value==="graduation";opt.hidden=false;opt.textContent=opt.value==="graduation"?(bike?"Thi tốt nghiệp (không áp dụng A1/A)":"Thi tốt nghiệp"):"Thi sát hạch"});
    if(bike&&type.value==="graduation")type.value="exam";
  }
  function computeNumber(studentId,type){
    return Math.max(0,...getRecords(studentId,type).map(record=>Number(record.attempt_no)||0))+1;
  }
  function renderHistory(){
    updateTypes();
    const id=$("examAttemptStudent").value,type=$("examAttemptType").value;
    const entries=getRecords(id,type);
    const no=currentRecord?Number(currentRecord.attempt_no):computeNumber(id,type);
    $("examAttemptNumber").textContent="Lần "+no;
    $("examAttemptTip").textContent=currentRecord?"Chỉnh sửa lần thi đã lưu.":"Lịch thi mới không ghi đè lịch sử.";
    const box=$("examAttemptHistory");
    box.innerHTML=entries.length?entries.map(r=>`<div class="exam-history-row"><span><b>Lần ${Number(r.attempt_no)} · ${esc(fmt(r.starts_at))}</b><small>${esc(r.location||"Chưa nhập địa điểm")} · ${esc(RESULT_LABELS[r.result]||"Chưa thi")}</small></span>${r.source==="saved"&&manager?`<button type="button" data-exam-id="${esc(r.id)}">Sửa</button>`:""}</div>`).join(""):'<p>Chưa có kỳ thi nào được ghi nhận.</p>';
    const student=eligibleStudents().find(s=>String(s.id)===id);
    const options=isMotorcycleLicense(student?.license_class)?["theory","yard"]:type==="graduation"?[]:["theory","simulation","yard","road"];
    $("examFailedParts").innerHTML=options.map(part=>`<label><input type="checkbox" value="${part}"> ${PART_LABELS[part]}</label>`).join("");
    $("examFailedPartsBox").hidden=$("examAttemptResult").value!=="failed"||type!=="exam";
  }
  function open(record=null,prefillStudentId=""){
    if(!manager||!available){return}
    currentRecord=record;
    $("examAttemptError").textContent="";
    $("examAttemptForm").reset();
    const eligible=eligibleStudents();
    $("examAttemptStudent").innerHTML=eligible.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.student_code||s.course||"Chưa có mã")}</option>`).join("");
    if(!eligible.length)return;
    const id=record?.student_id||prefillStudentId||eligible[0].id;
    setValue("examAttemptStudent",id);
    setValue("examAttemptType",record?.exam_type||"graduation");
    updateTypes();
    setValue("examAttemptStartsAt",record?localDate(record.starts_at):"");
    setValue("examAttemptLocation",record?.location||"");
    setValue("examAttemptResult",record?.result||"scheduled");
    setValue("examAttemptNote",record?.note||"");
    $("examAttemptStudent").disabled=Boolean(record);
    $("examAttemptType").disabled=Boolean(record);
    $("examAttemptTitle").textContent=record?"Cập nhật kết quả / lịch thi":"Lập lịch thi và thi lại";
    renderHistory();
    for(const item of [...$("examFailedParts").querySelectorAll("input")])item.checked=(record?.failed_parts||[]).includes(item.value);
    host.showModal();
  }
  async function load(){
    try{records=await fetchExamAttempts(token,null);available=true;return records}
    catch(error){available=false;console.warn("[exam-attempt] API chưa sẵn sàng",error);if($("openExamAttemptBtn"))$("openExamAttemptBtn").title="Cần cập nhật cơ sở dữ liệu lịch thi";return []}
  }
  function refresh(){return records}
  $("examAttemptStudent").onchange=()=>{currentRecord=null;renderHistory()};
  $("examAttemptType").onchange=()=>{currentRecord=null;renderHistory()};
  $("examAttemptResult").onchange=()=>{$("examFailedPartsBox").hidden=$("examAttemptResult").value!=="failed"||$("examAttemptType").value!=="exam"};
  $("examAttemptHistory").onclick=event=>{
    const id=event.target.closest("[data-exam-id]")?.dataset.examId;
    if(!id)return;
    const record=records.find(item=>String(item.id)===String(id)&&item.source==="saved");
    if(record)open(record);
  };
  host.querySelectorAll(".dialog-close").forEach(button=>button.onclick=()=>host.close());
  $("examAttemptForm").onsubmit=async event=>{
    event.preventDefault();if(busy||!manager)return;
    const studentId=$("examAttemptStudent").value,type=$("examAttemptType").value;
    const attemptNo=currentRecord?Number(currentRecord.attempt_no):computeNumber(studentId,type);
    const siblings=getRecords(studentId,type);
    if(!currentRecord&&siblings.some(r=>r.result==="passed")){
      $("examAttemptError").textContent="Học viên đã đậu kỳ thi này. Không thể lập kỳ thi tiếp theo.";return;
    }
    const fields={p_token:token,p_student_id:studentId,p_exam_type:type,p_attempt_no:attemptNo,
      p_starts_at:new Date($("examAttemptStartsAt").value).toISOString(),
      p_location:$("examAttemptLocation").value.trim(),p_result:$("examAttemptResult").value,
      p_failed_parts:[...$("examFailedParts").querySelectorAll("input:checked")].map(input=>input.value),
      p_note:$("examAttemptNote").value.trim()};
    busy=true;$("examAttemptSave").disabled=true;$("examAttemptError").textContent="";
    try{
      await studentRpc("app_save_exam_schedule_attempt",fields,{proxyTimeoutMs:6500,directTimeoutMs:4500});
      await load();
      host.close();
      onReload?.(records);
      const toast=$("toast");
      if(toast){toast.textContent="Đã lưu lịch thi lần "+attemptNo+" và cập nhật cho học viên";toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),3500)}
    }catch(error){$("examAttemptError").textContent=error?.message||"Không thể lưu kỳ thi."}
    finally{busy=false;$("examAttemptSave").disabled=false}
  };
  return {load,refresh,events:()=>examAttemptEvents(records,students),openById(id){
    const item=records.find(r=>String(r.id)===String(id)&&r.source==="saved");
    if(item&&manager)open(item);
  },openStudent:studentId=>open(null,studentId),getRecords:refresh};
}
