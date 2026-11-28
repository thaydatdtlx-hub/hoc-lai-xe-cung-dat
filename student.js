import {SCHEDULE_FIELDS,parseScheduleFromNotes} from "./schedule-data.js";
import {markNoticesRead,readNoticeIds,studentNotifications} from "./account-notifications.js";
import {openPaymentReceipt,paymentMethodLabel} from "./payment-receipt.js";
import {attendanceStatusLabel,attendanceSummary,attendanceTypeLabel,formatAttendanceDuration} from "./attendance-utils.js";
import {studentRpc} from "./student-rpc-client.js";
import {createStudentNoticeCenter} from "./notice-v5.js";
import {fetchExamAttempts,examAttemptEvents} from "./exam-attempt-schedule.js";
import {isStudentAuthError,normalizeCoreRpcPayload} from "./student-payload.js";

const $=id=>document.getElementById(id);
let token=localStorage.getItem("hv_token")||sessionStorage.getItem("hv_token")||"",me=null,student=null,trainingSessions=[],trainingRequests=[],trainingSlots=[],studentPayments=[],studentAttendance=[],studentNotices=[],serverNotices=[],examAttempts=[],theoryProgress=null,forcePasswordChange=false,bookingFeatureAvailable=true,slotFeatureAvailable=true,theoryFeatureAvailable=true,paymentHistoryAvailable=true,attendanceHistoryAvailable=true,studentNotificationFilter="all",notificationTimer=null;

async function rpc(fn,body={}){
  return studentRpc(fn,body,{proxyTimeoutMs:9500,directTimeoutMs:6500});
}
const noticeV5=createStudentNoticeCenter({rpc,getToken:()=>token,getMe:()=>me,getStudentName:()=>student?.name||"",onChange:()=>{if(student&&me)renderStudentNotifications()},toast});
function clearAuth(){for(const store of [localStorage,sessionStorage]){store.removeItem("hv_token");store.removeItem("hv_auth_kind")}}
function showRuntimeWarning(message=""){
  let box=$("studentRuntimeWarning");
  if(!message){box?.remove();return}
  if(!box){
    box=document.createElement("div");
    box.id="studentRuntimeWarning";
    box.style.cssText="margin:14px auto;padding:12px 14px;max-width:1200px;border:1px solid #f0d5a8;border-radius:12px;background:#fff8e9;color:#76551c;font:700 12px/1.5 system-ui";
    $("studentPortal")?.prepend(box);
  }
  box.textContent=message;
}
function esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]))}
function normalize(value){return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d")}
function fixNoticeText(value){return String(value??"").replace(/\bng(?:à6|á6)(?=\s+\d{2}\/\d{2}\/\d{4})/giu,"ngày")}
function money(value){return new Intl.NumberFormat("vi-VN").format(Number(value||0))+" ₫"}
function paymentReference(){
  const studentName=String(student?.name||"HOC VIEN")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d")
    .replace(/[^a-zA-Z0-9 ]/g," ").replace(/\s+/g," ").trim().toUpperCase();
  return `HP DTLX ${studentName}`.slice(0,50).trim();
}
function date(value,withTime=false){
  if(!value)return"Chưa cập nhật";
  const dateOnly=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(dateOnly)return`${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const parsed=new Date(value);if(Number.isNaN(parsed.valueOf()))return String(value);
  return new Intl.DateTimeFormat("vi-VN",withTime?{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}:{day:"2-digit",month:"2-digit",year:"numeric"}).format(parsed);
}
function dateRange(start,end){return start&&end?`${date(start)} – ${date(end)}`:""}
function toast(message){$("studentToast").textContent=message;$("studentToast").classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("studentToast").classList.remove("show"),2800)}
function progressTone(value){
  const status=normalize(value);
  if(status.includes("thi rot"))return"fail";
  if(status.includes("dang"))return"doing";
  if(status.includes("da hoan thanh")||status==="da dau"||status.includes("da nhan bang"))return"done";
  return"pending";
}
function hasReceivedLicense(value){return normalize(value).includes("da nhan bang")}
function renderDrivingRefreshAccess(){
  const unlocked=hasReceivedLicense(student.exam_status);
  document.querySelectorAll(".student-refresh-access").forEach(link=>{
    link.classList.toggle("is-locked",!unlocked);
    link.setAttribute("aria-disabled",String(!unlocked));
  });
  $("studentDrivingRefreshStatus").textContent=unlocked?"Tính chi phí và chọn lịch luyện phù hợp":"Tính năng mở khi Admin ghi nhận đã nhận bằng lái";
  $("studentDrivingRefreshShortcutStatus").textContent=unlocked?"Tính giá và đăng ký ngay":"Mở sau khi nhận bằng";
}
const requestStatus={
  pending:{label:"Chờ Admin duyệt",className:"pending"},
  approved:{label:"Đã duyệt",className:"approved"},
  rejected:{label:"Từ chối",className:"rejected"},
  cancelled:{label:"Đã hủy",className:"cancelled"}
};
function requestField(type){return SCHEDULE_FIELDS.find(field=>field.key===type)}
async function loadTrainingRequests(){
  try{
    trainingRequests=await rpc("app_list_training_requests",{p_token:token,p_student_id:student.id})||[];
    bookingFeatureAvailable=true;
  }catch(error){
    trainingRequests=[];
    bookingFeatureAvailable=false;
    if(!/app_list_training_requests|schema cache|PGRST202/i.test(error?.message||""))throw error;
  }
  student.training_requests=trainingRequests;
}
async function loadTrainingSlots(){
  try{
    trainingSlots=await rpc("app_list_training_slots",{p_token:token,p_session_type:null})||[];
    slotFeatureAvailable=true;
  }catch(error){
    trainingSlots=[];
    slotFeatureAvailable=false;
    if(!/app_list_training_slots|schema cache|PGRST202/i.test(error?.message||""))throw error;
  }
}
function formatDuration(minutes){
  const value=Number(minutes)||0,hours=Math.floor(value/60),rest=value%60;
  return [hours?`${hours} giờ`:"",rest?`${rest} phút`:""].filter(Boolean).join(" ")||"Chưa xác định";
}
async function loadTheoryProgress(){
  try{
    theoryProgress=await rpc("app_student_get_theory_progress",{p_token:token});
    theoryFeatureAvailable=true;
  }catch(error){
    theoryProgress=null;
    theoryFeatureAvailable=false;
    if(!/app_student_get_theory_progress|schema cache|PGRST202/i.test(error?.message||""))throw error;
  }
}
async function loadStudentPayments(){
  try{
    studentPayments=await rpc("app_student_list_payments",{p_token:token})||[];
    paymentHistoryAvailable=true;
  }catch(error){
    studentPayments=[];paymentHistoryAvailable=false;
    if(!/app_student_list_payments|schema cache|PGRST202/i.test(error?.message||""))throw error;
  }
}
async function loadStudentAttendance(){
  try{
    studentAttendance=await rpc("app_student_list_attendance",{p_token:token})||[];
    attendanceHistoryAvailable=true;
  }catch(error){
    studentAttendance=[];attendanceHistoryAvailable=false;
    if(!/app_student_list_attendance|schema cache|PGRST202/i.test(error?.message||""))throw error;
  }
}
function renderStudentAttendance(){
  const summary=attendanceSummary(studentAttendance);
  $("studentAttendanceRate").textContent=`${summary.rate}% chuyên cần`;
  $("studentAttendanceSessions").textContent=summary.sessions;
  $("studentAttendancePresent").textContent=summary.present;
  $("studentAttendanceHours").textContent=formatAttendanceDuration(summary.actualMinutes);
  $("studentAttendanceAbsent").textContent=`${summary.absent} / ${summary.excused}`;
  $("studentAttendanceNotice").classList.toggle("hidden",attendanceHistoryAvailable);
  $("studentAttendanceList").innerHTML=studentAttendance.length?studentAttendance.slice(0,30).map(record=>`
    <article class="student-attendance-item status-${esc(record.status)}">
      <span class="student-attendance-date"><b>${esc(date(record.session_date))}</b><small>${esc(attendanceTypeLabel(record.session_type))}</small></span>
      <div><strong>${esc(attendanceStatusLabel(record.status))}</strong><small>${record.started_at&&record.ended_at?`${esc(String(record.started_at).slice(0,5))} – ${esc(String(record.ended_at).slice(0,5))}`:"Không ghi khung giờ"}</small>${record.note?`<em>${esc(record.note)}</em>`:""}</div>
      <b>${esc(formatAttendanceDuration(record.actual_minutes))}</b>
    </article>`).join(""):`<div class="student-attendance-empty"><span>◷</span><strong>Chưa có dữ liệu điểm danh</strong><small>Buổi học được Admin ghi nhận sẽ hiển thị tại đây.</small></div>`;
}
function renderStudentPaymentHistory(){
  $("studentPaymentHistoryCount").textContent=`${studentPayments.length} phiếu thu`;
  $("studentPaymentHistoryNotice").classList.toggle("hidden",paymentHistoryAvailable);
  $("studentPaymentHistoryList").innerHTML=studentPayments.length?studentPayments.map(payment=>`
    <article class="student-payment-item">
      <span class="student-payment-icon">✓</span>
      <div><strong>${esc(payment.receipt_no)}</strong><small>${esc(date(payment.payment_date))} · ${esc(paymentMethodLabel(payment.payment_method))}</small><em>${esc(payment.note||"Thu học phí")}</em></div>
      <b>${money(payment.amount)}</b>
      <button type="button" data-student-receipt="${payment.id}">Xem / In phiếu</button>
    </article>`).join(""):`<div class="student-payment-empty"><span>₫</span><strong>Chưa có phiếu thu</strong><small>Các lần đóng học phí được xác nhận sẽ hiển thị tại đây.</small></div>`;
}
function renderTheoryProgress(){
  const summary=theoryProgress||{};
  const answered=Number(summary.answered_count)||0,correct=Number(summary.correct_count)||0,examCount=Number(summary.exam_count)||0;
  $("theoryLearned").textContent=`${answered}/600`;
  $("theoryCorrect").textContent=`${correct} câu`;
  $("theoryExamCount").textContent=`${examCount} lần`;
  $("theoryBestScore").textContent=summary.best_total?`${summary.best_score}/${summary.best_total}`:"Chưa thi";
  if(!theoryFeatureAvailable){
    $("theoryLatestExam").className="theory-latest-exam warning";
    $("theoryLatestExam").innerHTML="<span>!</span><p>Hệ thống đồng bộ tiến độ đang được Admin cập nhật. Bạn vẫn có thể học trên thiết bị này.</p>";
    return;
  }
  const latest=summary.latest_exam;
  if(!latest){
    $("theoryLatestExam").className="theory-latest-exam";
    $("theoryLatestExam").innerHTML="<span>i</span><p>Hãy bắt đầu học và thi thử để Admin có thể theo dõi, hỗ trợ quá trình ôn tập.</p>";
    return;
  }
  $("theoryLatestExam").className=`theory-latest-exam ${latest.passed?"passed":"failed"}`;
  $("theoryLatestExam").innerHTML=`<span>${latest.passed?"✓":"!"}</span><p><strong>Bài thi gần nhất: hạng ${esc(latest.license_class)} · ${Number(latest.score)||0}/${Number(latest.total)||0}</strong><br>${latest.passed?"Đạt yêu cầu":"Chưa đạt"} · ${esc(date(latest.submitted_at,true))}${latest.critical_correct?"":" · Sai câu điểm liệt"}</p>`;
}
function segmentTimeRange(start,end){
  const f=new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  return f.format(new Date(start))+" – "+f.format(new Date(end));
}
let bookingSlotFilter="";
function availableSlots(type){
  return trainingSlots.filter(slot=>slot.session_type===type&&slot.status==="open"&&new Date(slot.ends_at||slot.starts_at)>new Date()&&(!bookingSlotFilter||String(slot.id)===bookingSlotFilter));
}
function slotChoices(type){
  return availableSlots(type).flatMap(slot=>{
    if(slot.split_enabled&&Array.isArray(slot.segments))return slot.segments.map(segment=>({
      key:slot.id+":"+segment.index,slot,index:segment.index,start:segment.starts_at,end:segment.ends_at,minutes:segment.duration_minutes,
      status:segment.status,available:segment.status==="available"&&!slot.student_registered&&new Date(segment.starts_at)>new Date()
    }));
    return [{key:String(slot.id),slot,index:null,start:slot.starts_at,end:slot.ends_at,minutes:slot.duration_minutes,status:Number(slot.available_count)>0?"available":"booked",available:Number(slot.available_count)>0&&!slot.student_registered&&new Date(slot.starts_at)>new Date()}];
  });
}
function selectedSlotChoice(){return slotChoices($("requestType").value).find(choice=>choice.key===$("requestSlot").value)}
function choiceStatus(choice){
  if(choice.status==="booked"||choice.status==="pending")return "Ca học đã được đăng ký";
  if(choice.slot.student_registered)return "Bạn đã đăng ký trong ca này";
  if(choice.status==="expired"||new Date(choice.start)<=new Date())return "Đã qua giờ đăng ký";
  if(choice.status==="closed")return "Đã đóng đăng ký";
  return choice.available?"Còn trống":"Không thể đăng ký";
}
function renderRequestSlotDetails(){
  const choice=selectedSlotChoice(),choices=slotChoices($("requestType").value);
  $("submitTrainingRequest").disabled=!choice?.available;
  if(!choice){
    $("requestSlotDetails").className="request-slot-details is-empty";
    $("requestSlotDetails").textContent=choices.length?(choices.some(c=>c.available)?"Chọn khung giờ phù hợp. Khung giờ đã đăng ký được khóa.":"Không còn khung giờ trống. Ca học đã được đăng ký hoặc đã qua giờ."):"Hiện chưa có ca học phù hợp. Vui lòng quay lại sau.";
    return;
  }
  const slot=choice.slot;
  $("requestSlotDetails").className="request-slot-details";
  $("requestSlotDetails").innerHTML=`
    <strong>${esc(date(choice.start))} · ${esc(choice.end?segmentTimeRange(choice.start,choice.end):date(choice.start,true))} · ${esc(formatDuration(choice.minutes))}</strong>
    <span>⌖ ${esc(slot.location||"Địa điểm sẽ được Admin cập nhật")}</span>
    <span>👤 ${esc(slot.instructor_name||"Chưa gán giáo viên")} · 🚘 ${esc(slot.vehicle_plate||"Chưa gán xe")}</span>
    <span>${esc(choiceStatus(choice))}</span>`;
}
function fillSlotOptions(type,preserve=false){
  const current=preserve?$("requestSlot").value:"", choices=slotChoices(type);
  $("requestSlot").innerHTML='<option value="">Chọn khung giờ học</option>'+choices.map(choice=>
    `<option value="${esc(choice.key)}" ${choice.available?"":"disabled"}>${esc(date(choice.start))} · ${esc(choice.end?segmentTimeRange(choice.start,choice.end):date(choice.start,true))} · ${esc(choiceStatus(choice))}</option>`
  ).join("");
  $("requestSlot").value=choices.some(c=>c.key===current&&c.available)?current:"";
  $("requestSlot").disabled=choices.length===0;
  renderRequestSlotDetails();
}
let slotRefreshBusy=false,slotSubmitBusy=false;
async function refreshBookingChoices(){
  if(slotRefreshBusy||slotSubmitBusy||!$("trainingRequestDialog").open||!slotFeatureAvailable)return;
  slotRefreshBusy=true;
  try{await loadTrainingSlots();if($("trainingRequestDialog").open&&!slotSubmitBusy&&slotFeatureAvailable)fillSlotOptions($("requestType").value,true)}catch{}finally{slotRefreshBusy=false}
}
setInterval(()=>{if(document.visibilityState!=="hidden")void refreshBookingChoices()},10000);
function renderTrainingRequests(){
  const pending=trainingRequests.filter(request=>request.status==="pending").length;
  $("bookingPendingBadge").textContent=`${pending} yêu cầu chờ duyệt`;
  $("studentBookingRequests").innerHTML=trainingRequests.length?trainingRequests.slice(0,8).map(request=>{
    const field=requestField(request.request_type)||{icon:"▣",label:"Buổi thực hành"};
    const status=requestStatus[request.status]||requestStatus.pending;
    return `<article class="booking-request">
      <span>${field.icon}</span>
      <div><strong>${esc(field.label)}</strong><small>${esc(date(request.slot_starts_at||request.requested_at,true))}${request.slot_segment_index!=null?` · ${esc(formatDuration(request.slot_duration_minutes))}`:""}</small>${request.slot_id?`<em class="slot-meta">⌖ ${esc(request.slot_location||"Chưa có địa điểm")} · 👤 ${esc(request.slot_instructor_name||"Chưa gán giáo viên")} · 🚘 ${esc(request.slot_vehicle_plate||"Chưa gán xe")}</em>`:""}${request.note?`<em>Ghi chú: ${esc(request.note)}</em>`:""}${request.admin_note?`<em>Admin: ${esc(request.admin_note)}</em>`:""}</div>
      <span class="request-status ${status.className}">${status.label}</span>
      ${request.status==="pending"?`<button class="cancel-request" type="button" data-cancel-request="${request.id}">Hủy yêu cầu</button>`:""}
    </article>`;
  }).join(""):`<div class="booking-empty">Chưa có yêu cầu đăng ký lịch thực hành.</div>`;
}
function openTrainingRequest(type,slotId=""){
  if(!bookingFeatureAvailable)return alert("Chức năng đăng ký đang được Admin cập nhật. Vui lòng thử lại sau.");
  bookingSlotFilter=String(slotId||"");
  $("trainingRequestForm").reset();
  $("requestType").value=type;
  $("requestType").disabled=true;
  $("trainingRequestTitle").textContent=type==="practice"?"Đăng ký học sa hình":type==="dat_practice"?"Đăng ký thực hành DAT":"Đăng ký làm quen xe";
  $("trainingRequestError").textContent="";
  $("requestSlotField").classList.toggle("hidden",!slotFeatureAvailable);
  $("requestSlotDetails").classList.toggle("hidden",!slotFeatureAvailable);
  $("requestLegacyTimeField").classList.toggle("hidden",slotFeatureAvailable);
  if(slotFeatureAvailable){
    fillSlotOptions(type);
  }else{
    $("submitTrainingRequest").disabled=false;
    const now=new Date(Date.now()+30*60000),offset=now.getTimezoneOffset()*60000;
    $("requestStartsAt").min=new Date(now-offset).toISOString().slice(0,16);
  }
  $("trainingRequestDialog").showModal();
  void refreshBookingChoices();
}
function openInvitedTrainingSlot(){
  const url=new URL(location.href);
  const slotId=url.searchParams.get("training_slot");
  if(!slotId)return;
  if(me?.force_change_password)return;
  if(!slotFeatureAvailable){toast("Chưa tải được ca học. Vui lòng thử lại.");return}
  url.searchParams.delete("training_slot");
  history.replaceState(history.state,"",url.pathname+url.search+url.hash);
  const slot=trainingSlots.find(item=>String(item.id)===slotId&&item.status==="open");
  if(!slot){toast("Ca học không còn mở hoặc anh/chị không thuộc danh sách được đăng ký.");return}
  openTrainingRequest(slot.session_type,slotId);
}
function renderPortal(){
  $("studentUsername").textContent=`${me.username} · Học viên`;
  $("studentName").textContent=student.name||"Học viên";
  $("studentCode").textContent=student.student_code||"Chưa có mã";
  $("studentCourse").textContent=student.course||"Chưa có khóa";
  $("studentLicense").textContent=student.license_class||"Chưa có hạng";
  renderDrivingRefreshAccess();
  if(student.photo_data){$("studentPhoto").src=student.photo_data;$("studentPhoto").classList.remove("hidden");$("studentPhotoPlaceholder").classList.add("hidden")}
  renderTheoryProgress();

  const total=Math.max(0,Number(student.tuition_total)||0),paid=Math.max(0,Number(student.paid)||0),debt=Math.max(0,total-paid),rate=total?Math.min(100,Math.round(paid/total*100)):0;
  $("tuitionTotal").textContent=money(total);$("tuitionPaid").textContent=money(paid);$("tuitionDebt").textContent=money(debt);
  $("tuitionRate").textContent=`Đã đóng ${rate}% tổng học phí`;
  $("tuitionStatus").textContent=debt?"Còn học phí cần hoàn tất":"Đã hoàn tất học phí";
  $("tuitionStatus").className=debt?"has-debt":"complete";
  $("tuitionDebtNote").textContent=debt?"Vui lòng hoàn tất theo lịch hẹn":"Không còn công nợ";
  $("tuitionPaymentLink").classList.toggle("hidden",debt===0);
  renderStudentPaymentHistory();
  renderStudentAttendance();

  const paymentContent=paymentReference();
  $("paymentDebt").textContent=money(debt);
  $("paymentAmountBadge").textContent=debt?`Còn nợ ${money(debt)}`:"Đã hoàn tất";
  $("paymentAmountBadge").className=debt?"has-debt":"complete";
  $("paymentContent").textContent=paymentContent;
  $("paymentPending").classList.toggle("hidden",debt===0);
  $("paymentComplete").classList.toggle("hidden",debt>0);
  if(debt===0){
    $("tuitionQr").removeAttribute("src");
    $("tuitionQrOpen").removeAttribute("href");
  }

  const schedule=parseScheduleFromNotes(student.notes||"")||{dates:{},locations:{},note:""};
  const motorcycle=/^(A1|A)$/.test(String(student.license_class||"").trim().toUpperCase());
  const progress=[
    ["▤","Hồ sơ",student.profile_status||"Chưa cập nhật",""],
    ["◉","Lý thuyết online",student.online_status||"Chưa hoàn thành",dateRange(schedule.dates?.online_start,schedule.dates?.online_end)],
    ["▣","Cabin",student.cabin_status||"Chưa hoàn thành",""],
    ["⌖","DAT",student.dat_status||"Chưa thực hiện",""],
    ["✓","Thi tốt nghiệp",student.graduation_status||"Chưa hoàn thành",""],
    ["★","Thi sát hạch",student.exam_status||"Chưa thi sát hạch",""]
  ].filter(([,label])=>!motorcycle||label==="Hồ sơ"||label==="Thi sát hạch");
  $("studentProgress").innerHTML=progress.map(([icon,label,status,detail])=>`<article class="progress-card ${progressTone(status)}"><span>${icon}</span><div><small>${esc(label)}</small><strong>${esc(status)}</strong>${detail?`<em>${esc(detail)}</em>`:""}</div><i></i></article>`).join("");

  const profile=[
    ["Ngày sinh",date(student.date_of_birth)],
    ["Số CCCD",student.cccd||"Chưa cập nhật"],
    ["Điện thoại",student.phone||"Chưa cập nhật"],
    ["Địa chỉ",student.address||"Chưa cập nhật"],
    ["Hạng đào tạo",student.license_class||"Chưa cập nhật"],
    ["Sát hạch / bằng lái",student.exam_status||"Chưa thi sát hạch"],
    ["Trạng thái hồ sơ",student.profile_status||"Chưa cập nhật"]
  ];
  $("studentProfile").innerHTML=profile.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("");

  const now=new Date();
  const fixedEvents=SCHEDULE_FIELDS.filter(field=>schedule.dates?.[field.key]&&(!["graduation","exam"].includes(field.key)||!examAttempts.some(record=>record.exam_type===field.key))).map(field=>({field,date:schedule.dates[field.key],location:schedule.locations?.[field.key]||""}));
  const repeatEvents=trainingSessions.map(session=>({
    field:SCHEDULE_FIELDS.find(field=>field.key===session.session_type),
    date:session.starts_at,
    location:session.location||""
  })).filter(event=>event.field);
  const examEvents=examAttemptEvents(examAttempts,[student]);
  const events=[...fixedEvents,...repeatEvents,...examEvents.filter(item=>item.attempt?.result!=="cancelled")].filter(event=>new Date(event.date)>=now).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,3);
  $("studentUpcoming").innerHTML=events.length?events.map(event=>`<article><span class="tone-${event.field.tone}">${event.field.icon}</span><div><strong>${esc(event.field.label)}${event.source==="exam_attempt"?` · Lần ${event.attemptNo}`:""}</strong><small>${esc(date(event.date,true))}</small><em>${esc(event.location||"Chưa cập nhật địa điểm")}</em></div></article>`).join(""):`<div class="no-schedule"><span>📅</span><strong>Chưa có lịch sắp tới</strong><small>Lịch mới sẽ hiển thị tại đây khi được cập nhật.</small></div>`;
  renderTrainingRequests();
  renderStudentNotifications();
  $("studentLoading").classList.add("hidden");$("studentPortal").classList.remove("hidden");
  document.documentElement.setAttribute("data-student-profile","ready");
  window.dispatchEvent(new CustomEvent("student-profile-ready"));
}
function renderCoreIdentity(){
  $("studentUsername")?.replaceChildren(document.createTextNode(`${me?.username||"Học viên"} · Học viên`));
  $("studentName")?.replaceChildren(document.createTextNode(student?.name||"Học viên"));
  $("studentCode")?.replaceChildren(document.createTextNode(student?.student_code||"Chưa có mã"));
  $("studentCourse")?.replaceChildren(document.createTextNode(student?.course||"Chưa có khóa"));
  $("studentLicense")?.replaceChildren(document.createTextNode(student?.license_class||"Chưa có hạng"));
  $("studentPortal")?.classList.remove("hidden");
  $("studentLoading")?.classList.add("hidden");
  document.documentElement.setAttribute("data-student-profile","ready");
}
document.querySelectorAll(".student-refresh-access").forEach(link=>link.addEventListener("click",event=>{
  if(!hasReceivedLicense(student?.exam_status)){
    event.preventDefault();
    toast("Chức năng bổ túc tay lái sẽ mở sau khi Admin ghi nhận bạn đã nhận bằng lái.");
    return;
  }
  sessionStorage.setItem("driving_refresh_student_prefill",JSON.stringify({
    fullName:student.name||"",
    phone:student.phone||"",
    licenseStatus:"Đã có bằng lái"
  }));
}));
$("studentPaymentHistoryList").onclick=event=>{
  const id=event.target.dataset.studentReceipt;if(!id)return;
  const payment=studentPayments.find(item=>String(item.id)===String(id));
  if(payment&&!openPaymentReceipt(payment,student))toast("Trình duyệt đang chặn cửa sổ phiếu thu.");
};
$("copyPaymentContent").onclick=()=>copyPaymentValue($("paymentContent").textContent,"Đã sao chép nội dung chuyển khoản");
document.querySelectorAll(".copy-payment[data-copy]").forEach(button=>button.onclick=()=>copyPaymentValue(button.dataset.copy,"Đã sao chép số tài khoản"));
async function copyPaymentValue(value,successMessage){
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
    else{
      const input=document.createElement("textarea");input.value=value;input.setAttribute("readonly","");input.style.position="fixed";input.style.opacity="0";document.body.appendChild(input);input.select();document.execCommand("copy");input.remove();
    }
    toast(successMessage);
  }catch{toast("Không thể sao chép. Vui lòng nhấn giữ để sao chép thủ công.")}
}
async function loadServerNotifications(){
  try{
    const [rows]=await Promise.all([rpc("app_list_notifications",{p_token:token}),noticeV5.load()]);
    serverNotices=(rows||[]).map(notice=>({...notice,title:fixNoticeText(notice.title),body:fixNoticeText(notice.body),id:`server-${notice.id}`,server_id:String(notice.id)}));
  }catch(error){
    serverNotices=[];
  }
}
function isNoticeRead(notice,read){return notice.server_id||notice.manual_id?Boolean(notice.read_at):read.has(notice.id)}
const notificationCategoryLabels={general:"Hệ thống",schedule:"Lịch học",attendance:"Điểm danh",training:"Giờ học",theory:"Kết quả thi",finance:"Học phí",profile:"Hồ sơ"};
function notificationCategory(notice){
  if(notice.category&&notice.category!=="general")return notice.category;
  const text=normalize(`${notice.title} ${notice.body}`);
  if(text.includes("hoc phi")||text.includes("con no")||text.includes("da dong"))return"finance";
  if(text.includes("ho so")||text.includes("giay to"))return"profile";
  if(text.includes("diem danh")||text.includes("chuyen can")||text.includes("vang"))return"attendance";
  if(text.includes("gio thuc")||text.includes("thieu gio"))return"training";
  if(text.includes("thi thu")||text.includes("600 cau")||text.includes("diem liet")||text.includes("ket qua thi"))return"theory";
  if(text.includes("lich")||text.includes("ca hoc")||text.includes("duyet")||text.includes("dao tao"))return"schedule";
  return"general";
}
function noticeTime(notice){return notice.event_at||notice.created_at?date(notice.event_at||notice.created_at,true):""}
function renderStudentNotifications(){
  const local=studentNotifications(student,trainingSlots),serverKeys=new Set(serverNotices.map(notice=>`${notice.title}|${notice.body}`)),serverIds=new Set(serverNotices.map(notice=>notice.key).filter(Boolean));
  studentNotices=[...noticeV5.list(),...serverNotices,...local.filter(notice=>!serverIds.has(notice.id)&&!serverKeys.has(`${notice.title}|${notice.body}`))];
  const read=readNoticeIds(me),unread=studentNotices.filter(notice=>!isNoticeRead(notice,read)).length;
  const query=normalize($("studentNotificationSearch").value),source=studentNotificationFilter==="history"?noticeV5.list(true):studentNotices,visible=source.filter(notice=>(studentNotificationFilter==="all"||studentNotificationFilter==="history"||notificationCategory(notice)===studentNotificationFilter)&&(!query||normalize(`${notice.title} ${notice.body} ${notice.manual?.place||""} ${notice.manual?.address||""}`).includes(query)));
  $("studentNotificationBadge").textContent=unread;$("studentNotificationBadge").classList.toggle("hidden",unread===0);
  if(unread&&"setAppBadge" in navigator)navigator.setAppBadge(unread).catch(()=>{});else if(!unread&&"clearAppBadge" in navigator)navigator.clearAppBadge().catch(()=>{});
  const pendingAck=studentNotices.filter(n=>n.pending_ack).length;
  $("studentNotificationSummary").textContent=`${visible.length} thông báo · ${unread} chưa xem${pendingAck?" · "+pendingAck+" cần xác nhận":""}`;
  document.querySelectorAll("[data-student-notification-filter]").forEach(button=>button.classList.toggle("active",button.dataset.studentNotificationFilter===studentNotificationFilter));
  $("studentNotificationList").innerHTML=visible.length?visible.map(notice=>`
    <article class="notification-item tone-${esc(notice.tone||"blue")} ${isNoticeRead(notice,read)?"is-read":""}">
      <span class="notification-icon">${esc(notice.icon||"•")}</span>
      <div><div class="notification-item-meta"><span>${esc(notificationCategoryLabels[notificationCategory(notice)]||"Hệ thống")}</span>${noticeTime(notice)?`<time>${esc(noticeTime(notice))}</time>`:""}${!isNoticeRead(notice,read)?"<b>Mới</b>":""}</div><strong>${esc(notice.title)}</strong><p>${esc(notice.body)}</p>${notice.manual_id?`<div>${notice.pending_ack?'<span class="hv5-bell-pending">Cần xác nhận</span>':notice.ack_at?'<span class="hv5-bell-ok">Đã xác nhận</span>':""} ${notice.manual?.reminded&&!notice.ack_at?'<span class="hv5-bell-pending"> · Đã nhắc lại</span>':""}</div><button type="button" class="hv5-bell-open" data-hv5-open="${esc(notice.manual_id)}">Xem thông báo</button>`:""}${notice.href?`<a href="${esc(notice.href)}">${esc(notice.action||"Xem chi tiết")} →</a>`:""}</div>
    </article>`).join(""):`<div class="notification-empty"><span>🔔</span><strong>Chưa có thông báo</strong><p>Các cập nhật của trung tâm sẽ hiển thị tại đây.</p></div>`;
}
$("studentNotificationList").addEventListener("click",event=>{const button=event.target.closest("[data-hv5-open]");if(button)void noticeV5.openById(button.dataset.hv5Open)});
$("studentNotificationBtn").onclick=async()=>{
  await loadServerNotifications();renderStudentNotifications();
  $("studentNotificationDialog").showModal();
};
$("studentMarkNotificationsRead").onclick=async()=>{
  const serverIds=serverNotices.filter(notice=>!notice.read_at).map(notice=>notice.server_id);
  try{
    if(serverIds.length)await rpc("app_mark_notifications_read",{p_token:token,p_ids:serverIds});
    await noticeV5.seenAll();
    const now=new Date().toISOString();serverNotices.forEach(notice=>notice.read_at=notice.read_at||now);
    markNoticesRead(me,studentNotices.filter(notice=>!notice.server_id&&!notice.manual_id));
    renderStudentNotifications();toast("Đã đánh dấu đã xem; tin cần xác nhận vẫn phải xác nhận riêng");
  }catch(error){toast(error?.message||"Không thể cập nhật thông báo.")}
};
$("studentNotificationSearch").oninput=renderStudentNotifications;
document.querySelectorAll("[data-student-notification-filter]").forEach(button=>button.onclick=()=>{studentNotificationFilter=button.dataset.studentNotificationFilter;renderStudentNotifications()});
document.querySelectorAll("[data-booking-type]").forEach(button=>button.onclick=()=>openTrainingRequest(button.dataset.bookingType));
$("requestSlot").onchange=renderRequestSlotDetails;
$("trainingRequestForm").onsubmit=async event=>{
  event.preventDefault();$("trainingRequestError").textContent="";
  const choice=selectedSlotChoice(),startsAt=$("requestStartsAt").value;
  if(slotFeatureAvailable&&!choice?.available)return $("trainingRequestError").textContent="Vui lòng chọn khung giờ còn trống.";
  if(!slotFeatureAvailable&&!startsAt)return $("trainingRequestError").textContent="Vui lòng chọn ngày và giờ mong muốn.";
  $("submitTrainingRequest").disabled=true;
  slotSubmitBusy=true;
  try{
    if(slotFeatureAvailable){
      if(choice.index===null&&!choice.slot.split_enabled){
        await rpc("app_student_create_training_request_slot",{p_token:token,p_slot_id:choice.slot.id,p_note:$("requestNote").value.trim()});
      }else{
        await rpc("app_student_create_training_request_segment",{
          p_token:token,p_slot_id:choice.slot.id,p_segment_index:choice.index,p_note:$("requestNote").value.trim()
        });
      }
    }else{
      await rpc("app_student_create_training_request",{
        p_token:token,p_request_type:$("requestType").value,
        p_requested_at:new Date(startsAt).toISOString(),p_note:$("requestNote").value.trim()
      });
    }
    await Promise.all([loadTrainingRequests(),loadTrainingSlots()]);
    $("trainingRequestDialog").close();renderTrainingRequests();renderStudentNotifications();toast("Đã gửi yêu cầu đến Admin");
  }catch(error){
    const message=error?.message||"Không thể gửi yêu cầu đăng ký.";
    if(slotFeatureAvailable){try{await loadTrainingSlots();fillSlotOptions($("requestType").value,true)}catch{}}
    $("trainingRequestError").textContent=message;
  }
  finally{slotSubmitBusy=false;$("submitTrainingRequest").disabled=slotFeatureAvailable&&!selectedSlotChoice()?.available}
};
$("studentBookingRequests").onclick=async event=>{
  const requestId=event.target.dataset.cancelRequest;
  if(!requestId||!confirm("Hủy yêu cầu đăng ký đang chờ Admin duyệt?"))return;
  event.target.disabled=true;
  try{
    await rpc("app_student_cancel_training_request",{p_token:token,p_request_id:requestId});
    await Promise.all([loadTrainingRequests(),loadTrainingSlots()]);renderTrainingRequests();renderStudentNotifications();toast("Đã hủy yêu cầu");
  }catch(error){toast(error?.message||"Không thể hủy yêu cầu.")}
  finally{event.target.disabled=false}
};
function openPassword(forced=false){
  forcePasswordChange=forced;
  $("studentPasswordNotice").textContent=forced?"Đây là lần đăng nhập đầu tiên. Vui lòng đổi mật khẩu trước khi xem thông tin.":"Mật khẩu mới phải có ít nhất 8 ký tự.";
  $("studentPasswordClose").classList.toggle("hidden",forced);$("studentPasswordCancel").classList.toggle("hidden",forced);
  $("studentPasswordError").textContent="";$("studentPasswordDialog").showModal();
}
$("studentChangePasswordBtn").onclick=()=>openPassword(false);
document.querySelectorAll(".dialog-close").forEach(button=>button.onclick=()=>{if(!forcePasswordChange)button.closest("dialog").close()});
$("studentPasswordDialog").addEventListener("cancel",event=>{if(forcePasswordChange)event.preventDefault()});
$("studentPasswordForm").onsubmit=async event=>{
  event.preventDefault();$("studentPasswordError").textContent="";
  if($("studentNewPassword").value!==$("studentConfirmPassword").value)return $("studentPasswordError").textContent="Hai lần nhập mật khẩu mới không giống nhau.";
  $("studentSavePasswordBtn").disabled=true;
  try{
    await rpc("app_student_change_password",{p_token:token,p_old_password:$("studentOldPassword").value,p_new_password:$("studentNewPassword").value});
    forcePasswordChange=false;me.force_change_password=false;$("studentPasswordDialog").close();event.target.reset();toast("Đã đổi mật khẩu thành công");void noticeV5.load().then(()=>{renderStudentNotifications();noticeV5.claim()});
  }catch(error){$("studentPasswordError").textContent=error?.message||"Không thể đổi mật khẩu."}
  finally{$("studentSavePasswordBtn").disabled=false}
};
$("studentLogoutBtn").onclick=async()=>{
  try{await window.hvDisablePhonePush?.(token)}catch{}
  try{await rpc("app_student_logout",{p_token:token})}catch{}
  clearAuth();location.replace("/?login=1");
};
async function boot(){
  if(!token)return location.replace("/?login=1");
  showRuntimeWarning("Đang đồng bộ dữ liệu học viên…");
  const [meResult,studentResult]=await Promise.allSettled([
    rpc("app_student_me",{p_token:token}),
    rpc("app_student_portal",{p_token:token})
  ]);
  if(meResult.status==="fulfilled")me=normalizeCoreRpcPayload(meResult.value);
  if(studentResult.status==="fulfilled")student=normalizeCoreRpcPayload(studentResult.value);
  const coreError=meResult.status==="rejected"?meResult.reason:studentResult.status==="rejected"?studentResult.reason:null;
  if(coreError&&isStudentAuthError(coreError)){
    clearAuth();
    location.replace("/?login=1");
    return;
  }
  if(!me?.id||!student?.id){
    $("studentPortal")?.classList.remove("hidden");
    $("studentLoading")?.classList.add("hidden");
    showRuntimeWarning(coreError?.message||"Hồ sơ chưa tải được đầy đủ. Phiên đăng nhập vẫn được giữ; vui lòng thử tải lại trang.");
    document.documentElement.setAttribute("data-student-functions","core-error");
    return;
  }

  student.training_sessions=[];
  renderCoreIdentity();
  showRuntimeWarning("Hồ sơ đã khôi phục. Đang tải lịch học, học phí, điểm danh và thông báo…");

  const optionalResults=await Promise.allSettled([
    rpc("app_list_training_sessions",{p_token:token,p_student_id:student.id}).then(value=>{trainingSessions=Array.isArray(value)?value:[]}),
    fetchExamAttempts(token,student.id).then(value=>{examAttempts=value}).catch(error=>{console.warn("[student] Lịch thi nhiều lần chưa sẵn sàng",error);examAttempts=[]}),
    loadTrainingRequests(),
    loadTrainingSlots(),
    loadServerNotifications(),
    loadTheoryProgress(),
    loadStudentPayments(),
    loadStudentAttendance()
  ]);
  student.training_sessions=trainingSessions;
  try{renderPortal()}catch(error){console.error("[student-portal] Full render failed",error)}
  const failedCount=optionalResults.filter(result=>result.status==="rejected").length;
  document.documentElement.setAttribute("data-student-functions",failedCount?"partial":"ready");
  window.dispatchEvent(new CustomEvent("student-functions-ready",{detail:{failedCount}}));
  showRuntimeWarning(failedCount?`Đã khôi phục hồ sơ; ${failedCount} mục dữ liệu đang tạm thời tải lại. Các chức năng còn lại vẫn sử dụng bình thường.`:"");
  notificationTimer=setInterval(async()=>{
    if(document.visibilityState!=="visible")return;
    try{
      if(!slotSubmitBusy&&!slotRefreshBusy)await Promise.allSettled([loadServerNotifications(),loadTrainingSlots()]);
      else await loadServerNotifications();
      renderStudentNotifications();
    }catch{}
  },60000);
  if(me.force_change_password)openPassword(true);
  else {openInvitedTrainingSlot();noticeV5.claim()}
}
boot().catch(error=>{
  console.error("[student-portal] Boot failed",error);
  $("studentPortal")?.classList.remove("hidden");
  $("studentLoading")?.classList.add("hidden");
  showRuntimeWarning(`${error?.message||"Không thể hoàn tất đồng bộ hồ sơ."} Phiên đăng nhập vẫn được giữ.`);
  document.documentElement.setAttribute("data-student-functions","error");
});
