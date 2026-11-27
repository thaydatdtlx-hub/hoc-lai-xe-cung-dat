import {SCHEDULE_FIELDS,embedScheduleInNotes,parseScheduleFromNotes,isMotorcycleLicense} from "./schedule-data.js";
import {studentRpc} from "./student-rpc-client.js";
import "./ai-chat.js";
import {createExamScheduleManager} from "./exam-attempt-schedule.js";

const $=id=>document.getElementById(id);
const token=localStorage.getItem("hv_token")||sessionStorage.getItem("hv_token")||"";
const authKind=localStorage.getItem("hv_auth_kind")||sessionStorage.getItem("hv_auth_kind")||"";
const REPEATABLE_KEYS=new Set(["familiar","dat_practice","practice"]);
const MILESTONE_FIELDS=SCHEDULE_FIELDS.filter(field=>!REPEATABLE_KEYS.has(field.key));
const ONLINE_RANGE_PAIRS=[
  ["online_start","online_end","lý thuyết online"]
];
const DAT_RANGE_PAIRS=[
  ["dat_auto_start","dat_auto_end","DAT số tự động"],
  ["dat_manual_start","dat_manual_end","DAT số cơ khí"]
];
let me=null,students=[],trainingSessions=[],trainingRequests=[],trainingSlots=[],events=[],sessionFeatureAvailable=true,requestFeatureAvailable=true,slotFeatureAvailable=true,examManager=null;

async function rpc(fn,body={}){
  const started=performance.now();
  console.info("[schedule-rpc] start",{fn});
  try{
    const data=await studentRpc(fn,body,{proxyTimeoutMs:6500,directTimeoutMs:4500});
    console.info("[schedule-rpc] success",{fn,durationMs:Math.round(performance.now()-started)});
    return data;
  }catch(error){
    console.error("[schedule-rpc] failed",{fn,status:error?.status||0,durationMs:Math.round(performance.now()-started),message:error?.message||String(error)});
    throw error;
  }
}
async function recordAudit(action,entityType="schedule",entityId="",entityLabel="",details={}){
  try{await rpc("app_record_audit",{p_token:token,p_action:action,p_entity_type:entityType,p_entity_id:String(entityId||""),p_entity_label:entityLabel||"",p_details:details})}catch{}
}

function normalize(value){
  return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d");
}
function esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]))}
function busy(on){$("loading").classList.toggle("hidden",!on)}
function toast(message){$("toast").textContent=message;$("toast").classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("toast").classList.remove("show"),2800)}
function isAuthenticationError(error){return /phiên (?:quản trị|đăng nhập).*(?:không hợp lệ|hết hạn)|invalid.*session|session.*expired|không phải tài khoản/i.test(error?.message||"")}
function showScheduleLoadError(message="Dữ liệu lịch chưa tải được."){
  let panel=$("scheduleLoadError");
  if(!panel){
    panel=document.createElement("section");
    panel.id="scheduleLoadError";
    panel.className="schedule-load-error";
    document.querySelector(".schedule-hero")?.insertAdjacentElement("afterend",panel);
  }
  panel.innerHTML=`<span>!</span><div><strong>Lịch đào tạo đang kết nối chậm</strong><p>${esc(message)} Phiên đăng nhập vẫn được giữ và trang không còn bị khóa.</p></div><button type="button">Tải lại dữ liệu</button>`;
  panel.querySelector("button").onclick=()=>location.reload();
  panel.classList.remove("hidden");
}
function clearScheduleLoadError(){$("scheduleLoadError")?.remove()}
function dayKey(value){const date=new Date(value);return Number.isNaN(date.valueOf())?"":`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`}
function todayKey(){return dayKey(new Date())}
function startOfToday(){const date=new Date();date.setHours(0,0,0,0);return date}
function endOfWeek(){const date=startOfToday();date.setDate(date.getDate()+7);date.setHours(23,59,59,999);return date}
function formatDate(value){
  const date=new Date(value);
  if(Number.isNaN(date.valueOf()))return"Chưa xác định";
  const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(String(value));
  return new Intl.DateTimeFormat("vi-VN",dateOnly?{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}:{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(date);
}
function formatDuration(minutes){
  const value=Number(minutes)||0,hours=Math.floor(value/60),rest=value%60;
  return [hours?`${hours} giờ`:"",rest?`${rest} phút`:""].filter(Boolean).join(" ")||"Chưa xác định";
}
function formatTimeRange(value,minutes){
  const start=new Date(value);
  if(Number.isNaN(start.valueOf()))return"Chưa chọn khung giờ";
  const end=new Date(start.getTime()+(Number(minutes)||120)*60000);
  const formatter=new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit"});
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
export function splitTrainingMinutes(duration,capacity){
  if(!Number.isInteger(duration)||!Number.isInteger(capacity)||capacity<1||capacity>100||duration<capacity*15)return [];
  return Array.from({length:capacity},(_,i)=>({offset:Math.floor(i*duration/capacity),minutes:Math.floor((i+1)*duration/capacity)-Math.floor(i*duration/capacity)}));
}
function renderSlotTimePreview(){
  const startsAt=$("slotStartsAt").value,duration=Number($("slotDuration").value)||120,capacity=Number($("slotCapacity").value);
  const slot=trainingSlots.find(item=>String(item.id)===String($("trainingSlotId").value));
  const segments=splitTrainingMinutes(duration,capacity);
  if(!startsAt){$("slotTimePreview").textContent="Khung giờ sẽ hiển thị sau khi chọn ngày, giờ bắt đầu và thời lượng.";return}
  if(slot?.split_enabled===false){$("slotTimePreview").textContent="Ca cũ giữ nguyên lịch đã đăng ký.";return}
  if(!segments.length){$("slotTimePreview").textContent="Mỗi khung giờ học phải có ít nhất 15 phút.";return}
  $("slotTimePreview").innerHTML=`<strong>Tự chia ${segments.length} khung giờ · mỗi học viên chọn 1 khung</strong><div class="slot-segment-grid">${segments.map((segment,index)=>`<span><b>${index+1}. ${esc(formatTimeRange(new Date(new Date(startsAt).getTime()+segment.offset*60000),segment.minutes))}</b><small>${esc(formatDuration(segment.minutes))}</small></span>`).join("")}</div>`;
}
function dateParts(value){
  const date=new Date(value);
  const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(String(value));
  return{day:String(date.getDate()).padStart(2,"0"),month:`THÁNG ${date.getMonth()+1}`,time:dateOnly?"CẢ NGÀY":new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit"}).format(date)};
}
function studentSchedule(student){return parseScheduleFromNotes(student.notes)||{version:1,dates:{},locations:{},note:""}}
function isManualBStudent(student){return normalize(student?.license_class).includes("b so co khi")}
function scheduleFieldsForStudent(student){
  return isMotorcycleLicense(student?.license_class)
    ?SCHEDULE_FIELDS.filter(field=>field.key==="exam")
    :SCHEDULE_FIELDS;
}
function editorFieldsFor(student){
  if(isMotorcycleLicense(student?.license_class))return MILESTONE_FIELDS.filter(field=>field.key==="exam");
  return MILESTONE_FIELDS.filter(field=>field.onlyFor!=="b_manual"||isManualBStudent(student));
}
function createEvents(){
  const knownExamRecords=examManager?.getRecords()||[];
  const fixedEvents=students.flatMap(student=>{
    const schedule=studentSchedule(student);
    return scheduleFieldsForStudent(student).filter(field=>schedule.dates?.[field.key]).filter(field=>!["graduation","exam"].includes(field.key)||!knownExamRecords.some(record=>String(record.student_id)===String(student.id)&&record.exam_type===field.key)).map(field=>({
      id:`${student.id}-${field.key}`,
      student,
      field,
      date:schedule.dates[field.key],
      location:schedule.locations?.[field.key]||"",
      note:schedule.note||"",
      source:"milestone"
    }));
  });
  const studentMap=new Map(students.map(student=>[String(student.id),student]));
  const repeatEvents=trainingSessions.map(session=>({
    id:String(session.id),
    student:studentMap.get(String(session.student_id)),
    field:SCHEDULE_FIELDS.find(field=>field.key===session.session_type),
    date:session.starts_at,
    location:session.location||"",
    note:session.note||"",
    instructorName:session.instructor_name||"",
    vehiclePlate:session.vehicle_plate||"",
    durationMinutes:Number(session.duration_minutes)||120,
    source:"session",
    session
  })).filter(event=>event.student&&event.field&&!isMotorcycleLicense(event.student.license_class));
  events=[...fixedEvents,...repeatEvents,...(examManager?.events()||[])].sort((a,b)=>new Date(a.date)-new Date(b.date));
}

function renderStats(){
  const today=todayKey(),start=startOfToday(),weekEnd=endOfWeek();
  $("upcomingCount").textContent=events.filter(event=>new Date(event.date)>=start).length;
  $("weekCount").textContent=events.filter(event=>new Date(event.date)>=start&&new Date(event.date)<=weekEnd).length;
  $("todayCount").textContent=events.filter(event=>dayKey(event.date)===today).length;
  const carIds=new Set(students.filter(student=>!isMotorcycleLicense(student.license_class)).map(student=>String(student.id)));
  const scheduledIds=new Set(trainingSessions.filter(session=>carIds.has(String(session.student_id))).map(session=>String(session.student_id)));
  $("unscheduledCount").textContent=students.filter(student=>!scheduledIds.has(String(student.id))&&!scheduleFieldsForStudent(student).some(field=>studentSchedule(student).dates?.[field.key])).length;
}

function renderEvents(){
  const query=normalize($("scheduleSearch").value),type=$("typeFilter").value,period=$("periodFilter").value;
  const today=todayKey(),start=startOfToday(),weekEnd=endOfWeek();
  const filtered=events.filter(event=>{
    const eventDate=new Date(event.date),haystack=normalize([event.student.name,event.student.student_code,event.student.course,event.student.owner_username].join(" "));
    if(query&&!haystack.includes(query))return false;
    if(type&&event.field.key!==type)return false;
    if(period==="upcoming"&&eventDate<start)return false;
    if(period==="today"&&dayKey(event.date)!==today)return false;
    if(period==="week"&&(eventDate<start||eventDate>weekEnd))return false;
    if(period==="past"&&eventDate>=start)return false;
    return true;
  });
  if(period==="past")filtered.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const titles={upcoming:["Lịch sắp tới","Sắp xếp theo thời gian gần nhất"],today:["Lịch hôm nay","Các nội dung đào tạo diễn ra trong ngày"],week:["Lịch trong 7 ngày tới","Những lịch cần chuẩn bị trong tuần"],past:["Lịch đã qua","Các nội dung đào tạo đã diễn ra"],all:["Toàn bộ lịch đào tạo","Tất cả mốc lịch đã được cập nhật"]};
  $("listTitle").textContent=titles[period][0];$("listNote").textContent=titles[period][1];$("resultCount").textContent=`${filtered.length} sự kiện`;
  $("emptyState").classList.toggle("hidden",filtered.length>0);
  $("eventList").innerHTML=filtered.map(event=>{
    const part=dateParts(event.date),past=new Date(event.date)<start;
    return `<article class="event-card ${past?"is-past":""}">
      <div class="event-date"><strong>${part.day}</strong><span>${part.month}</span><em>${part.time}</em></div>
      <div class="event-type tone-${event.field.tone}"><span>${event.field.icon}</span><div><small>NỘI DUNG ĐÀO TẠO</small><strong>${esc(event.field.label)}${event.source==="exam_attempt"?` · Lần ${event.attemptNo}`:""}</strong></div></div>
      <div class="event-student"><small>HỌC VIÊN</small><strong>${esc(event.student.name)}</strong><span>${esc(event.student.student_code||"Chưa có mã")} · ${esc(event.student.course||"Chưa có khóa")}</span></div>
      <div class="event-detail">${event.source==="session"?`<span class="repeat-label">${event.session?.slot_id?"Ca học đã duyệt":"Buổi thực hành riêng"}</span>`:""}<span>◷ ${esc(formatDate(event.date))}${event.source==="session"?` · ${esc(formatDuration(event.durationMinutes))}`:""}</span><span>⌖ ${esc(event.location||"Chưa nhập địa điểm")}</span>${event.source==="exam_attempt"?`<span class="repeat-label exam-result-${esc(event.attempt?.result||"scheduled")}">Kết quả: ${esc(event.statusText)}</span>${event.attempt?.failed_parts?.length?`<span>Phần chưa đạt: ${esc(event.attempt.failed_parts.map(k=>({theory:"Lý thuyết",simulation:"Mô phỏng",yard:"Sa hình",road:"Đường trường"}[k]||k)).join(", "))}</span>`:""}`:""}${event.instructorName?`<span>👤 Giáo viên: ${esc(event.instructorName)}</span>`:""}${event.vehiclePlate?`<span>🚘 Xe: ${esc(event.vehiclePlate)}</span>`:""}${event.note?`<span>ⓘ ${esc(event.note)}</span>`:""}</div>
      ${me.role==="admin"||me.role==="user"
        ?event.source==="exam_attempt"
          ?(event.attempt?.source==="saved"?`<div class="event-actions"><button class="edit-event" type="button" data-edit-exam="${esc(event.attempt.id)}">Sửa lịch thi</button></div>`:"")
          :event.source==="session"
          ?event.session?.slot_id
            ?(me.role==="admin"?`<div class="event-actions"><button class="edit-event" type="button" data-edit-slot="${event.session.slot_id}">Sửa ca</button><button class="delete-event" type="button" data-delete-session="${event.id}">Xóa khỏi ca</button></div>`:"")
            :`<div class="event-actions"><button class="edit-event" type="button" data-edit-session="${event.id}">Sửa buổi</button><button class="delete-event" type="button" data-delete-session="${event.id}">Xóa buổi</button></div>`
          :`<div class="event-actions"><button class="edit-event" type="button" data-edit-student="${event.student.id}">Sửa mốc</button><button class="delete-event" type="button" data-delete-student="${event.student.id}" data-delete-key="${event.field.key}">Xóa mốc</button></div>`
        :""}
    </article>`;
  }).join("");
}

function renderAll(){createEvents();renderStats();renderEvents()}

function renderEditorFields(student){
  const motorcycle=isMotorcycleLicense(student?.license_class);
  const host=$("scheduleFields");
  host.style.gridTemplateColumns=motorcycle?"minmax(0,1fr)":"";
  const noteLabel=$("scheduleNote")?.closest("label");
  if(noteLabel)noteLabel.hidden=motorcycle;
  host.innerHTML=editorFieldsFor(student).map(field=>`
    <section class="schedule-field tone-${field.tone}">
      <div class="field-title"><span>${field.icon}</span><strong>${field.label}</strong></div>
      <label>${field.dateOnly?"Ngày":"Ngày và giờ"}<input id="date-${field.key}" type="${field.dateOnly?"date":"datetime-local"}" ${motorcycle&&field.key==="exam"?"required":""}></label>
      <label>Địa điểm / hình thức<input id="location-${field.key}" placeholder="${field.key==="exam"?"Ví dụ: Trung tâm sát hạch · Thi trực tiếp":field.key.startsWith("online_")?"Link hoặc nền tảng học":"Nhập địa điểm"}" ${motorcycle&&field.key==="exam"?"required":""}></label>
    </section>`).join("");
  if(motorcycle)return;
  host.insertAdjacentHTML("afterbegin",`
    <div class="dat-range-note">
      <strong>Thời gian lý thuyết online</strong>
      <span>Nhập đủ ngày bắt đầu và ngày kết thúc của khóa học online.</span>
    </div>`);
  if(isManualBStudent(student))host.insertAdjacentHTML("afterbegin",`
    <div class="dat-range-note">
      <strong>DAT dành cho học viên B số cơ khí</strong>
      <span>Nhập đủ ngày bắt đầu và kết thúc cho DAT số tự động, DAT số cơ khí.</span>
    </div>`);
}

function fillEditor(studentId){
  const student=students.find(item=>item.id===studentId)||students[0];
  if(!student)return;
  $("scheduleStudent").value=student.id;
  renderEditorFields(student);
  const schedule=studentSchedule(student);
  const sharedMotorcycleExam=me.role==="user"&&isMotorcycleLicense(student.license_class)&&schedule.source==="course";
  $("saveScheduleBtn").disabled=sharedMotorcycleExam;
  if(sharedMotorcycleExam){
    $("scheduleFields").insertAdjacentHTML("beforeend",
      '<div class="dat-range-note" role="status"><strong>Lịch thi sát hạch đã lập chung theo khóa</strong><span>Nhân viên có thể xem lịch nhưng chỉ Quản trị viên được sửa lịch chung của cả khóa.</span></div>');
    for(const field of editorFieldsFor(student)){
      const date=$(`date-${field.key}`),location=$(`location-${field.key}`);
      if(date)date.disabled=true;
      if(location)location.disabled=true;
    }
  }
  for(const field of editorFieldsFor(student)){
    $(`date-${field.key}`).value=schedule.dates?.[field.key]||"";
    $(`location-${field.key}`).value=schedule.locations?.[field.key]||"";
  }
  $("scheduleNote").value=schedule.note||"";
  const motorcycle=isMotorcycleLicense(student.license_class);
  $("deleteAllScheduleBtn").textContent=motorcycle?"Xóa lịch thi sát hạch":"Xóa toàn bộ mốc";
  $("deleteAllScheduleBtn").classList.toggle("hidden",me.role==="student"||!scheduleFieldsForStudent(student).some(field=>schedule.dates?.[field.key]));
}

function openEditor(studentId=""){
  if(me.role!=="admin"&&me.role!=="user")return;
  $("scheduleError").textContent="";
  fillEditor(studentId||$("scheduleStudent").value);
  $("scheduleDialog").showModal();
}

function toDatetimeLocal(value){
  if(!value)return"";
  const date=new Date(value);
  if(Number.isNaN(date.valueOf()))return"";
  const offset=date.getTimezoneOffset()*60000;
  return new Date(date-offset).toISOString().slice(0,16);
}
async function loadTrainingSessions(){
  try{
    trainingSessions=await rpc("app_list_training_sessions",{p_token:token,p_student_id:null})||[];
    sessionFeatureAvailable=true;
  }catch(error){
    trainingSessions=[];
    sessionFeatureAvailable=false;
    console.warn("[schedule] training sessions unavailable",{message:error?.message||String(error)});
  }
}
async function loadTrainingRequests(){
  try{
    trainingRequests=await rpc("app_list_training_requests",{p_token:token,p_student_id:null})||[];
    requestFeatureAvailable=true;
  }catch(error){
    trainingRequests=[];
    requestFeatureAvailable=false;
    console.warn("[schedule] training requests unavailable",{message:error?.message||String(error)});
  }
}
async function loadTrainingSlots(){
  try{
    trainingSlots=await rpc("app_list_training_slots",{p_token:token,p_session_type:null})||[];
    slotFeatureAvailable=true;
  }catch(error){
    trainingSlots=[];
    slotFeatureAvailable=false;
    console.warn("[schedule] training slots unavailable",{message:error?.message||String(error)});
  }
}
function slotStatusLabel(status){
  return{open:"Đang mở",closed:"Đã đóng",cancelled:"Đã hủy"}[status]||status;
}
function renderTrainingSlots(){
  if(me.role!=="admin")return;
  const openSlots=trainingSlots.filter(slot=>slot.status==="open"&&new Date(slot.starts_at)>new Date());
  $("openSlotCount").textContent=`${openSlots.length} ca đang mở`;
  $("trainingSlotList").innerHTML=trainingSlots.length?trainingSlots.map(slot=>{
    const field=SCHEDULE_FIELDS.find(item=>item.key===slot.session_type)||{icon:"▣",label:"Buổi thực hành"};
    const booked=Number(slot.booked_count)||0,capacity=Math.max(1,Number(slot.capacity)||1),percent=Math.min(100,Math.round(booked/capacity*100));
    return `<article class="training-slot-card ${slot.status!=="open"?"is-closed":""}">
      <div class="training-slot-head">
        <div><span>${field.icon}</span><div><small>${esc(formatDate(slot.starts_at))} · ${esc(formatTimeRange(slot.starts_at,slot.duration_minutes))}</small><strong>${esc(field.label)}</strong></div></div>
        <span class="slot-status ${esc(slot.status)}">${esc(slotStatusLabel(slot.status))}</span>
      </div>
      <div class="training-slot-info">
        <span>◷ ${esc(formatDuration(slot.duration_minutes))}</span>
        <span>⌖ ${esc(slot.location||"Chưa nhập địa điểm")}</span>
        <span>👤 ${esc(slot.instructor_name||"Chưa gán giáo viên")}</span>
        <span>🚘 ${esc(slot.vehicle_plate||"Chưa gán xe")}</span>
      </div>
      <div class="training-slot-capacity"><div class="capacity-bar"><i style="width:${percent}%"></i></div><strong>${booked}/${capacity} học viên${Number(slot.pending_count)?` · ${Number(slot.pending_count)} chờ duyệt`:""}</strong></div>
      ${slot.split_enabled&&Array.isArray(slot.segments)?`<div class="slot-segment-grid">${slot.segments.map(segment=>{
        const session=trainingSessions.find(s=>String(s.slot_id)===String(slot.id)&&s.slot_segment_index===segment.index);
        const request=trainingRequests.find(r=>String(r.slot_id)===String(slot.id)&&r.slot_segment_index===segment.index&&r.status==="pending");
        const person=students.find(s=>String(s.id)===String(session?.student_id||request?.student_id));
        const label=segment.status==="booked"?"Đã duyệt":segment.status==="pending"?"Chờ duyệt":segment.status==="available"?"Còn trống":segment.status==="expired"?"Đã qua giờ":"Đã đóng";
        return `<span class="slot-segment-${esc(segment.status)}"><b>${esc(formatTimeRange(segment.starts_at,segment.duration_minutes))}</b><small>${esc(label)}${person?" · "+esc(person.name):""}</small></span>`;
      }).join("")}</div>`:""}
      <p class="slot-audience-summary">${Array.isArray(slot.allowed_student_ids)?`Chỉ ${slot.allowed_student_ids.length} học viên được đăng ký`:"Tất cả học viên phù hợp được đăng ký"}</p>
      <div class="training-slot-actions"><button class="edit-slot" type="button" data-edit-slot="${slot.id}">${slot.status==="cancelled"?"Xem ca học":"Sửa ca học"}</button>${slot.status==="open"?`<button class="close-slot" type="button" data-close-slot="${slot.id}">Đóng đăng ký</button>`:""}${slot.status!=="cancelled"||booked||Number(slot.pending_count)?`<button class="danger-action" type="button" data-cancel-slot="${slot.id}">Hủy ca học</button>`:""}<button class="danger-action" type="button" data-remove-slot="${slot.id}">Xóa ca học</button></div>
    </article>`;
  }).join(""):`<div class="slot-empty">Chưa có ca học thực hành. Bấm “Tạo ca học” để mở lịch cho học viên đăng ký.</div>`;
}
// The audience is independent of capacity. Selected IDs survive filtering.
export function eligibleSlotStudents(students){
  return (Array.isArray(students)?students:[]).filter(student=>student?.id&&!student.deleted_at&&String(student.license_class||"").trim()&&!isMotorcycleLicense(student.license_class));
}
export function filterSlotStudents(students,{search="",license="",course=""}={}){
  const query=normalize(search);
  return eligibleSlotStudents(students).filter(student=>(!license||student.license_class===license)&&(!course||(student.course||"")===course)&&(!query||normalize([student.name,student.student_code,student.course,student.license_class].filter(Boolean).join(" ")).includes(query)));
}
let slotSelectedStudentIds=new Set();
function slotAudienceOptions(){
  const eligible=eligibleSlotStudents(students);
  const options=(values,placeholder)=>`<option value="">${placeholder}</option>`+[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi")).map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join("");
  $("slotAudienceLicense").innerHTML=options(eligible.map(student=>student.license_class),"Tất cả hạng");
  $("slotAudienceCourse").innerHTML=options(eligible.map(student=>student.course),"Tất cả khóa");
}
function visibleSlotStudents(){
  return filterSlotStudents(students,{search:$("slotAudienceSearch").value,license:$("slotAudienceLicense").value,course:$("slotAudienceCourse").value});
}
function renderSlotAudience(){
  const restricted=$("slotAudienceMode").value==="selected";
  $("slotAudiencePicker").classList.toggle("hidden",!restricted);
  const eligible=eligibleSlotStudents(students);
  const visible=visibleSlotStudents();
  $("slotAudienceCount").textContent=restricted?`Đã chọn ${slotSelectedStudentIds.size}/${eligible.length} học viên`:`Mở cho ${eligible.length} học viên phù hợp hiện tại`;
  $("slotAudienceList").innerHTML=visible.length?visible.map(student=>`<label class="slot-audience-row"><input type="checkbox" value="${esc(student.id)}" ${slotSelectedStudentIds.has(String(student.id))?"checked":""}><span><strong>${esc(student.name||"Học viên")}</strong><small>${esc(student.student_code||"Chưa có mã")} · ${esc(student.license_class)} · ${esc(student.course||"Chưa có khóa")}</small></span></label>`).join(""):'<p class="slot-audience-empty">Không có học viên phù hợp với bộ lọc.</p>';
  $("slotAudienceSelectAll").disabled=!visible.length;
  $("slotAudienceClear").disabled=!slotSelectedStudentIds.size;
}
function resetSlotAudience(slot){
  // Existing unrestricted slots stay unrestricted. New slots default to explicit selection.
  $("slotAudienceMode").value=slot&&slot.allowed_student_ids===null?"all":"selected";
  slotSelectedStudentIds=new Set(Array.isArray(slot?.allowed_student_ids)?slot.allowed_student_ids.map(String):[]);
  $("slotAudienceSearch").value="";
  slotAudienceOptions();
  renderSlotAudience();
}

function openSlotEditor(slotId=""){
  if(me.role!=="admin")return;
  if(!slotFeatureAvailable){
    return alert("Admin cần chạy file CAP-NHAT-CA-HOC-CHONG-TRUNG-LICH.sql trong Supabase trước khi tạo ca học.");
  }
  const slot=trainingSlots.find(item=>String(item.id)===String(slotId));
  if(slot&&!Object.prototype.hasOwnProperty.call(slot,"allowed_student_ids"))return alert("Chưa tải được quyền đăng ký của ca học. Vui lòng tải lại trang.");
  $("slotForm").reset();
  $("slotError").textContent="";
  resetSlotAudience(slot);
  $("trainingSlotId").value=slot?.id||"";
  $("slotType").value=slot?.session_type||"familiar";
  $("slotStartsAt").value=toDatetimeLocal(slot?.starts_at);
  $("slotDuration").value=String(slot?.duration_minutes||120);
  $("slotCapacity").value=String(slot?.capacity||1);
  $("slotInstructor").value=slot?.instructor_name||"";
  $("slotVehicle").value=slot?.vehicle_plate||"";
  $("slotLocation").value=slot?.location||"";
  $("slotStatus").value=slot?.status||"open";
  $("slotNote").value=slot?.note||"";
  renderSlotTimePreview();
  $("slotDialogTitle").textContent=slot?"Sửa ca học thực hành":"Tạo ca học thực hành";
  $("saveSlotBtn").textContent=slot?"Lưu thay đổi":"Tạo ca học";
  $("deleteSlotBtn").classList.toggle("hidden",!slot);
  $("cancelSlotBtn").classList.toggle("hidden",!slot||(slot.status==="cancelled"&&!Number(slot.booked_count)&&!Number(slot.pending_count)));
  $("saveSlotBtn").disabled=slot?.status==="cancelled";
  $("slotStatus").disabled=slot?.status==="cancelled";
  if(slot?.status==="cancelled")$("slotError").textContent="Ca đã hủy. Có thể xóa ca nếu chưa có dữ liệu điểm danh.";
  $("slotDialog").showModal();
}
async function closeTrainingSlot(slotId){
  const slot=trainingSlots.find(item=>String(item.id)===String(slotId));
  if(!slot||!confirm(`Đóng đăng ký ca ${formatDate(slot.starts_at)}?`))return;
  busy(true);
  try{
    await rpc("app_admin_save_training_slot",{
      p_token:token,p_slot_id:slot.id,p_session_type:slot.session_type,p_starts_at:slot.starts_at,
      p_duration_minutes:Number(slot.duration_minutes),p_location:slot.location||"",
      p_instructor_name:slot.instructor_name||"",p_vehicle_plate:slot.vehicle_plate||"",
      p_capacity:Number(slot.capacity),p_note:slot.note||"",p_status:"closed"
    });
    await loadTrainingSlots();renderTrainingSlots();toast("Đã đóng đăng ký ca học");
  }catch(error){alert(error?.message||"Không thể đóng ca học.")}
  finally{busy(false)}
}
function renderTrainingRequests(){
  if(me.role!=="admin")return;
  const pending=trainingRequests.filter(request=>request.status==="pending");
  $("requestCountBadge").textContent=pending.length;
  $("pendingRequestCount").textContent=`${pending.length} chờ duyệt`;
  $("adminRequestList").innerHTML=pending.length?pending.map(request=>{
    const student=students.find(item=>String(item.id)===String(request.student_id));
    const field=SCHEDULE_FIELDS.find(item=>item.key===request.request_type)||{icon:"▣",label:"Buổi thực hành"};
    return `<article class="admin-request">
      <span>${field.icon}</span>
      <div><small>HỌC VIÊN</small><strong>${esc(student?.name||request.student_name||"Học viên")}</strong><em>${esc(student?.student_code||request.student_code||"Chưa có mã")}</em></div>
      <div><small>NỘI DUNG</small><strong>${esc(field.label)}</strong><em>${esc(formatDate(request.slot_starts_at||request.requested_at))}</em></div>
      <div><small>CHI TIẾT CA HỌC</small><em class="${request.slot_id?"request-slot-summary":""}">${request.slot_id?`⌖ ${esc(request.slot_location||"Chưa nhập địa điểm")} · 👤 ${esc(request.slot_instructor_name||"Chưa gán giáo viên")} · 🚘 ${esc(request.slot_vehicle_plate||"Chưa gán xe")}`:esc(request.note||"Yêu cầu lịch cũ, chưa gắn ca học")}</em>${request.note&&request.slot_id?`<em>Học viên: ${esc(request.note)}</em>`:""}</div>
      <div class="request-actions"><button class="approve-request" type="button" data-approve-request="${request.id}">Duyệt</button><button class="reject-request" type="button" data-reject-request="${request.id}">Từ chối</button></div>
    </article>`;
  }).join(""):`<div class="request-empty">Không có yêu cầu đăng ký nào đang chờ duyệt.</div>`;
}
function openSessionEditor(sessionId=""){
  if(me.role!=="admin"&&me.role!=="user")return;
  if(!sessionFeatureAvailable){
    return alert("Admin cần chạy file CAP-NHAT-NHIEU-BUOI-THUC-HANH.sql trong Supabase trước khi thêm nhiều buổi thực hành.");
  }
  const session=trainingSessions.find(item=>String(item.id)===String(sessionId));
  const chosen=students.find(item=>String(item.id)===String(session?.student_id||$("trainingStudent").value));
  if(session&&isMotorcycleLicense(chosen?.license_class)){
    return alert("Học viên A1/A chỉ có lịch Thi sát hạch; các buổi thực hành ô tô cũ được giữ trong dữ liệu nhưng không được sửa tại đây.");
  }
  if(![...$("trainingStudent").options].length)return alert("Chỉ học viên ô tô B/C1 mới có ca học thực hành.");
  $("sessionForm").reset();
  $("sessionError").textContent="";
  $("trainingSessionId").value=session?.id||"";
  $("trainingRequestId").value="";
  $("trainingStudent").disabled=false;
  $("trainingType").disabled=false;
  $("trainingStudent").value=session?.student_id||students.find(item=>!isMotorcycleLicense(item.license_class))?.id||"";
  $("trainingType").value=session?.session_type||"familiar";
  $("trainingStartsAt").value=toDatetimeLocal(session?.starts_at);
  $("trainingLocation").value=session?.location||"";
  $("trainingNote").value=session?.note||"";
  $("sessionDialogTitle").textContent=session?"Sửa ca học riêng":"Tạo ca học riêng";
  $("saveSessionBtn").textContent=session?"Lưu thay đổi":"Lưu ca học riêng";
  $("sessionDialog").showModal();
}
function openRequestApproval(requestId){
  if(me.role!=="admin"||!requestFeatureAvailable)return;
  const request=trainingRequests.find(item=>String(item.id)===String(requestId));
  if(!request||request.status!=="pending")return;
  if(request.slot_id)return approveTrainingRequest(request);
  openSessionEditor();
  $("trainingRequestId").value=request.id;
  $("trainingStudent").value=request.student_id;
  $("trainingType").value=request.request_type;
  $("trainingStudent").disabled=true;
  $("trainingType").disabled=true;
  $("trainingStartsAt").value=toDatetimeLocal(request.requested_at);
  $("trainingNote").value="";
  $("sessionDialogTitle").textContent="Duyệt yêu cầu đăng ký";
  $("saveSessionBtn").textContent="Duyệt và tạo lịch";
}
async function approveTrainingRequest(request){
  const slot=trainingSlots.find(item=>String(item.id)===String(request.slot_id));
  const detail=slot?`${formatDate(request.slot_starts_at||request.requested_at)} · ${formatTimeRange(request.slot_starts_at||request.requested_at,request.slot_duration_minutes||slot.duration_minutes)} · ${slot.location||"Chưa có địa điểm"}`:formatDate(request.requested_at);
  if(!confirm(`Duyệt yêu cầu của ${request.student_name||"học viên"} vào ca ${detail}?`))return;
  busy(true);
  try{
    await rpc("app_admin_review_training_request_slot",{
      p_token:token,p_request_id:request.id,p_decision:"approved",
      p_slot_id:request.slot_id,p_admin_note:""
    });
    await recordAudit("schedule_changed","training_request",request.id,request.student_name||"Học viên",{decision:"approved",slot_id:request.slot_id});
    await Promise.all([loadTrainingSessions(),loadTrainingRequests(),loadTrainingSlots()]);
    renderAll();renderTrainingRequests();renderTrainingSlots();toast("Đã duyệt học viên vào ca học");
  }catch(error){
    const missing=/app_admin_review_training_request_slot|schema cache|PGRST202/i.test(error?.message||"");
    alert(missing?"Admin cần chạy file CAP-NHAT-CA-HOC-CHONG-TRUNG-LICH.sql trong Supabase.":error?.message||"Không thể duyệt yêu cầu.");
  }finally{busy(false)}
}
async function rejectTrainingRequest(requestId){
  if(me.role!=="admin")return;
  const request=trainingRequests.find(item=>String(item.id)===String(requestId));
  if(!request)return;
  const reason=prompt("Nhập lý do từ chối để học viên biết (có thể để trống):","");
  if(reason===null)return;
  busy(true);
  try{
    if(request.slot_id){
      await rpc("app_admin_review_training_request_slot",{
        p_token:token,p_request_id:request.id,p_decision:"rejected",
        p_slot_id:request.slot_id,p_admin_note:reason.trim()
      });
    }else{
      await rpc("app_admin_review_training_request",{
        p_token:token,p_request_id:request.id,p_decision:"rejected",
        p_starts_at:null,p_location:"",p_admin_note:reason.trim()
      });
    }
    await recordAudit("schedule_changed","training_request",request.id,request.student_name||"Học viên",{decision:"rejected",reason:reason.trim()});
    await Promise.all([loadTrainingRequests(),loadTrainingSlots()]);
    renderTrainingRequests();renderTrainingSlots();toast("Đã từ chối yêu cầu");
  }catch(error){alert(error?.message||"Không thể từ chối yêu cầu.")}
  finally{busy(false)}
}
async function deleteTrainingSession(sessionId){
  if(me.role!=="admin"&&me.role!=="user")return;
  const session=trainingSessions.find(item=>String(item.id)===String(sessionId));
  const student=students.find(item=>String(item.id)===String(session?.student_id));
  const field=SCHEDULE_FIELDS.find(item=>item.key===session?.session_type);
  if(!session||!student||!field)return;
  if(!confirm(`${session.slot_id?"Xóa học viên khỏi ca":"Xóa buổi"} “${field.label}” của ${student.name} vào ${formatDate(session.starts_at)}?`))return;
  busy(true);
  try{
    await rpc(me.role==="admin"?"app_admin_delete_training_session":"app_staff_delete_training_session",{p_token:token,p_session_id:session.id});
    await recordAudit("schedule_changed","training_session",session.id,student.name,{operation:"deleted",session_type:session.session_type,starts_at:session.starts_at});
    trainingSessions=trainingSessions.filter(item=>String(item.id)!==String(session.id));
    await loadTrainingSlots();renderAll();renderTrainingSlots();toast(session.slot_id?"Đã xóa học viên khỏi ca":"Đã xóa buổi thực hành");
  }catch(error){alert(error?.message||"Không thể xóa buổi thực hành.")}
  finally{busy(false)}
}

function studentPayload(student,notes){
  return{
    name:student.name||"",date_of_birth:student.date_of_birth||null,cccd:student.cccd||"",phone:student.phone||"",
    license_class:student.license_class||"B số tự động",course:student.course||"",profile_status:student.profile_status||"Đã ghi nhận",
    online_status:student.online_status||"Chưa hoàn thành",cabin_status:student.cabin_status||"Chưa hoàn thành",
    dat_status:student.dat_status||"Chưa thực hiện",graduation_status:student.graduation_status||"Chưa hoàn thành",
    exam_status:student.exam_status||"Chưa thi sát hạch",tuition_total:Number(student.tuition_total||0),paid:Number(student.paid||0),
    address:student.address||"",notes,photo_data:student.photo_data||""
  };
}
async function saveScheduleNotes(student,notes,allowLegacyFallback=false){
  if(me.role!=="admin"&&me.role!=="user")throw new Error("Không có quyền cập nhật lịch đào tạo.");
  if(me.role==="user"){
    await rpc("app_staff_save_student_schedule",{p_token:token,p_student_id:student.id,p_notes:notes});
    return;
  }
  try{
    await rpc("app_admin_save_student_schedule",{p_token:token,p_student_id:student.id,p_notes:notes});
  }catch(error){
    const missing=/app_admin_save_student_schedule|schema cache|PGRST202/i.test(error?.message||"");
    if(missing&&allowLegacyFallback){
      await rpc("app_save_student",{p_token:token,p_student_id:student.id,p_data:studentPayload(student,notes),p_owner_id:student.owner_id||me.id});
      return;
    }
    if(missing)throw new Error("Admin cần chạy file CAP-NHAT-XOA-LICH-DAO-TAO.sql trong Supabase trước khi xóa lịch.");
    throw error;
  }
}
async function deleteOneSchedule(studentId,fieldKey){
  if(me.role!=="admin"&&me.role!=="user")return;
  const student=students.find(item=>String(item.id)===String(studentId)),field=SCHEDULE_FIELDS.find(item=>item.key===fieldKey);
  if(!student||!field)return;
  if(!confirm(`Xóa lịch “${field.label}” của học viên ${student.name}?`))return;
  const schedule=studentSchedule(student);
  delete schedule.dates?.[fieldKey];delete schedule.locations?.[fieldKey];
  schedule.updatedAt=new Date().toISOString();
  const hasSchedule=Object.keys(schedule.dates||{}).length||Object.keys(schedule.locations||{}).length||schedule.note;
  const notes=embedScheduleInNotes(student.notes,hasSchedule?schedule:null);
  busy(true);
  try{
    await saveScheduleNotes(student,notes,true);
    await recordAudit("schedule_changed","student",student.id,student.name,{operation:"milestone_deleted",field:fieldKey});
    student.notes=notes;renderAll();toast(`Đã xóa lịch ${field.label}`);
  }catch(error){alert(error?.message||"Không thể xóa lịch đào tạo.")}
  finally{busy(false)}
}

$("slotForm").onsubmit=async event=>{
  event.preventDefault();$("slotError").textContent="";
  const startsAt=$("slotStartsAt").value;
  if(!startsAt)return $("slotError").textContent="Vui lòng chọn ngày và giờ bắt đầu.";
  const editingSlot=trainingSlots.find(s=>String(s.id)===String($("trainingSlotId").value));
  if(editingSlot?.status==="cancelled")return $("slotError").textContent="Ca đã hủy. Vui lòng tạo ca mới hoặc xóa ca cũ.";
  if(editingSlot?.split_enabled!==false&&!splitTrainingMinutes(Number($("slotDuration").value),Number($("slotCapacity").value)).length)return $("slotError").textContent="Mỗi khung giờ học phải có ít nhất 15 phút.";
  const allowedIds=$("slotAudienceMode").value==="all"?null:[...slotSelectedStudentIds];
  if(allowedIds!==null&&!allowedIds.length)return $("slotError").textContent="Vui lòng chọn ít nhất một học viên hoặc mở đăng ký cho tất cả học viên phù hợp.";
  $("saveSlotBtn").disabled=true;busy(true);
  try{
    const savedSlotId=await rpc("app_admin_save_training_slot_audience",{
      p_token:token,
      p_slot_id:$("trainingSlotId").value||null,
      p_session_type:$("slotType").value,
      p_starts_at:new Date(startsAt).toISOString(),
      p_duration_minutes:Number($("slotDuration").value),
      p_location:$("slotLocation").value.trim(),
      p_instructor_name:$("slotInstructor").value.trim(),
      p_vehicle_plate:$("slotVehicle").value.trim(),
      p_capacity:Number($("slotCapacity").value),
      p_note:$("slotNote").value.trim(),
      p_status:$("slotStatus").value,
      p_allowed_student_ids:allowedIds
    });
    await recordAudit("schedule_changed","training_slot",savedSlotId||$("trainingSlotId").value||"",$("slotLocation").value.trim()||"Ca học",{operation:$("trainingSlotId").value?"updated":"created",session_type:$("slotType").value,starts_at:new Date(startsAt).toISOString()});
    await Promise.all([loadTrainingSlots(),loadTrainingSessions(),loadTrainingRequests()]);
    $("slotDialog").close();renderTrainingSlots();renderTrainingRequests();renderAll();
    toast($("trainingSlotId").value?"Đã cập nhật ca học":"Đã tạo ca học");
  }catch(error){$("slotError").textContent=error?.message||"Không thể lưu ca học."}
  finally{$("saveSlotBtn").disabled=false;busy(false)}
};
$("slotAudienceMode").onchange=renderSlotAudience;
$("slotAudienceSearch").oninput=renderSlotAudience;
$("slotAudienceLicense").onchange=renderSlotAudience;
$("slotAudienceCourse").onchange=renderSlotAudience;
$("slotAudienceSelectAll").onclick=()=>{visibleSlotStudents().forEach(student=>slotSelectedStudentIds.add(String(student.id)));renderSlotAudience()};
$("slotAudienceClear").onclick=()=>{slotSelectedStudentIds.clear();renderSlotAudience()};
$("slotAudienceList").onchange=event=>{
  const input=event.target;
  if(input.type!=="checkbox")return;
  if(input.checked)slotSelectedStudentIds.add(input.value);else slotSelectedStudentIds.delete(input.value);
  $("slotAudienceCount").textContent=`Đã chọn ${slotSelectedStudentIds.size}/${eligibleSlotStudents(students).length} học viên`;
  $("slotAudienceClear").disabled=!slotSelectedStudentIds.size;
};
$("slotStartsAt").oninput=renderSlotTimePreview;
$("slotDuration").onchange=renderSlotTimePreview;
$("slotCapacity").oninput=renderSlotTimePreview;

// The confirmation snapshot is checked again inside the locked server transaction.
let removalSnapshot=null,removalBusy=false;
function openSlotRemoval(slotId,mode){
  if(me?.role!=="admin"||removalBusy||!["cancel","delete"].includes(mode))return;
  const slot=trainingSlots.find(item=>String(item.id)===String(slotId));
  if(!slot)return;
  const booked=Number(slot.booked_count)||0,pending=Number(slot.pending_count)||0;
  const hasAttendance=trainingSessions.some(session=>String(session.slot_id)===String(slot.id)&&session.attendance);
  const field=SCHEDULE_FIELDS.find(item=>item.key===slot.session_type);
  removalSnapshot={slotId:String(slot.id),mode,booked,pending};
  $("slotRemovalForm").reset();
  $("slotRemovalTitle").textContent=mode==="delete"?"Xác nhận xóa ca học":"Xác nhận hủy ca học";
  $("slotRemovalDetail").textContent=(field?.label||"Ca thực hành")+" · "+formatDate(slot.starts_at)+" · "+formatTimeRange(slot.starts_at,slot.duration_minutes);
  $("slotRemovalBooked").textContent=String(booked);
  $("slotRemovalPending").textContent=String(pending);
  $("slotRemovalExplanation").textContent=mode==="delete"?"Xóa vĩnh viễn ca học và các yêu cầu, lịch học liên quan. Thao tác không thể hoàn tác.":"Hủy toàn bộ lịch đã duyệt và yêu cầu đang chờ. Ca học và lịch sử yêu cầu vẫn được giữ với trạng thái Đã hủy.";
  $("slotRemovalNotify").checked=true;
  $("slotRemovalError").textContent=hasAttendance?"Ca đã có điểm danh, không thể hủy hoặc xóa. Hãy đóng đăng ký để giữ lịch sử.":"";
  $("slotRemovalSubmit").textContent=mode==="delete"?"Xác nhận xóa":"Xác nhận hủy ca";
  $("slotRemovalSubmit").disabled=hasAttendance;
  $("slotRemovalDialog").showModal();
}
$("deleteSlotBtn").onclick=()=>openSlotRemoval($("trainingSlotId").value,"delete");
$("cancelSlotBtn").onclick=()=>openSlotRemoval($("trainingSlotId").value,"cancel");
$("slotRemovalDialog").addEventListener("cancel",event=>{if(removalBusy)event.preventDefault()});
$("slotRemovalForm").onsubmit=async event=>{
  event.preventDefault();
  if(!removalSnapshot||removalBusy||me?.role!=="admin")return;
  const {slotId,mode,booked,pending}=removalSnapshot;
  removalBusy=true;$("slotRemovalSubmit").disabled=true;
  $("slotRemovalDialog").querySelectorAll(".dialog-close").forEach(button=>button.disabled=true);
  $("slotRemovalError").textContent="";busy(true);
  try{
    const result=await rpc("app_admin_remove_training_slot",{p_token:token,p_slot_id:slotId,p_mode:mode,p_notify:$("slotRemovalNotify").checked,p_expected_booked:booked,p_expected_pending:pending});
    await Promise.all([loadTrainingSlots(),loadTrainingSessions(),loadTrainingRequests()]);
    $("slotRemovalDialog").close();
    if($("slotDialog").open)$("slotDialog").close();
    renderTrainingSlots();renderTrainingRequests();renderAll();
    toast((mode==="delete"?"Đã xóa ca học":"Đã hủy ca học")+(Number(result?.notifications)>0?` · Đã tạo ${result.notifications} thông báo`:""));
  }catch(error){
    $("slotRemovalError").textContent=error?.message||"Không thể thực hiện thao tác. Vui lòng kiểm tra lại dữ liệu.";
  }finally{
    removalBusy=false;$("slotRemovalSubmit").disabled=false;
    $("slotRemovalDialog").querySelectorAll(".dialog-close").forEach(button=>button.disabled=false);
    busy(false);
  }
};

$("scheduleForm").onsubmit=async event=>{
  event.preventDefault();$("scheduleError").textContent="";
  const student=students.find(item=>item.id===$("scheduleStudent").value);
  if(!student)return $("scheduleError").textContent="Vui lòng chọn học viên.";
  const previous=studentSchedule(student),motorcycle=isMotorcycleLicense(student.license_class);
  // Preserve previously stored non-motorcycle milestones as historical data.
  // Only the exam field is editable or presented for A1/A.
  const schedule=motorcycle
    ?{...previous,version:previous.version||1,dates:{...(previous.dates||{})},locations:{...(previous.locations||{})},note:previous.note||"",updatedAt:new Date().toISOString()}
    :{version:1,dates:{},locations:{},note:$("scheduleNote").value.trim(),updatedAt:new Date().toISOString()};
  if(!motorcycle)for(const key of REPEATABLE_KEYS){
    if(previous.dates?.[key])schedule.dates[key]=previous.dates[key];
    if(previous.locations?.[key])schedule.locations[key]=previous.locations[key];
  }
  for(const field of editorFieldsFor(student)){
    const date=$(`date-${field.key}`).value,location=$(`location-${field.key}`).value.trim();
    if(date)schedule.dates[field.key]=date;
    else delete schedule.dates[field.key];
    if(date&&location)schedule.locations[field.key]=location;
    else delete schedule.locations[field.key];
  }
  if(motorcycle){
    if(!schedule.dates.exam)return $("scheduleError").textContent="Vui lòng nhập ngày và giờ thi sát hạch.";
    if(!schedule.locations.exam)return $("scheduleError").textContent="Vui lòng nhập địa điểm / hình thức thi sát hạch.";
  }
  const rangePairs=motorcycle?[]:[...ONLINE_RANGE_PAIRS,...(isManualBStudent(student)?DAT_RANGE_PAIRS:[])];
  for(const [startKey,endKey,label] of rangePairs){
      const start=schedule.dates[startKey],end=schedule.dates[endKey];
      if(Boolean(start)!==Boolean(end))return $("scheduleError").textContent=`Vui lòng nhập đủ ngày bắt đầu và kết thúc ${label}.`;
      if(start&&new Date(end)<new Date(start))return $("scheduleError").textContent=`Ngày kết thúc ${label} không được trước ngày bắt đầu.`;
  }
  if(!Object.keys(schedule.dates).length)return $("scheduleError").textContent="Vui lòng nhập ít nhất một mốc đào tạo.";
  $("saveScheduleBtn").disabled=true;busy(true);
  try{
    const notes=embedScheduleInNotes(student.notes,schedule);
    await saveScheduleNotes(student,notes,true);
    await recordAudit("schedule_changed","student",student.id,student.name,{operation:"milestones_updated"});
    student.notes=notes;$("scheduleDialog").close();renderAll();toast("Đã lưu lịch đào tạo");
  }catch(error){$("scheduleError").textContent=error?.message||"Không thể lưu lịch đào tạo."}
  finally{$("saveScheduleBtn").disabled=false;busy(false)}
};

$("sessionForm").onsubmit=async event=>{
  event.preventDefault();$("sessionError").textContent="";
  if(!sessionFeatureAvailable)return $("sessionError").textContent="Cơ sở dữ liệu chưa được cập nhật chức năng nhiều buổi.";
  const chosenStudent=students.find(item=>String(item.id)===String($("trainingStudent").value));
  if(chosenStudent&&isMotorcycleLicense(chosenStudent.license_class))
    return $("sessionError").textContent="A1/A chỉ có lịch Thi sát hạch; không thể tạo ca thực hành ô tô.";
  const startsAt=$("trainingStartsAt").value;
  if(!startsAt)return $("sessionError").textContent="Vui lòng chọn ngày và giờ đào tạo.";
  $("saveSessionBtn").disabled=true;busy(true);
  try{
    const requestId=$("trainingRequestId").value;
    if(requestId){
      await rpc("app_admin_review_training_request",{
        p_token:token,p_request_id:requestId,p_decision:"approved",
        p_starts_at:new Date(startsAt).toISOString(),
        p_location:$("trainingLocation").value.trim(),
        p_admin_note:$("trainingNote").value.trim()
      });
      const request=trainingRequests.find(item=>String(item.id)===String(requestId));
      await recordAudit("schedule_changed","training_request",requestId,request?.student_name||"Học viên",{decision:"approved",starts_at:new Date(startsAt).toISOString()});
      await Promise.all([loadTrainingSessions(),loadTrainingRequests()]);
      $("sessionDialog").close();renderAll();renderTrainingRequests();toast("Đã duyệt và tạo lịch chính thức");
    }else{
      await rpc(me.role==="admin"?"app_admin_save_training_session":"app_staff_save_training_session",{
        p_token:token,
        p_session_id:$("trainingSessionId").value||null,
        p_student_id:$("trainingStudent").value,
        p_session_type:$("trainingType").value,
        p_starts_at:new Date(startsAt).toISOString(),
        p_location:$("trainingLocation").value.trim(),
        p_note:$("trainingNote").value.trim()
      });
      const student=students.find(item=>String(item.id)===String($("trainingStudent").value));
      await recordAudit("schedule_changed","training_session",$("trainingSessionId").value||"",student?.name||"Học viên",{operation:$("trainingSessionId").value?"updated":"created",session_type:$("trainingType").value,starts_at:new Date(startsAt).toISOString()});
      await loadTrainingSessions();
      $("sessionDialog").close();renderAll();toast($("trainingSessionId").value?"Đã cập nhật ca học riêng":"Đã tạo ca học riêng");
    }
  }catch(error){$("sessionError").textContent=error?.message||"Không thể lưu buổi thực hành."}
  finally{$("saveSessionBtn").disabled=false;busy(false)}
};

$("scheduleStudent").onchange=event=>fillEditor(event.target.value);
$("openEditorBtn").onclick=()=>openEditor();
$("openSlotBtn").onclick=()=>openSlotEditor();
$("openSessionBtn").onclick=()=>openSessionEditor();
$("openRequestsBtn").onclick=()=>{$("trainingRequests").scrollIntoView({behavior:"smooth",block:"start"})};
$("scheduleSearch").oninput=renderEvents;
$("typeFilter").onchange=renderEvents;
$("periodFilter").onchange=renderEvents;
$("eventList").onclick=event=>{
  const editId=event.target.dataset.editStudent,deleteId=event.target.dataset.deleteStudent,fieldKey=event.target.dataset.deleteKey;
  const editSessionId=event.target.dataset.editSession,deleteSessionId=event.target.dataset.deleteSession,editSlotId=event.target.dataset.editSlot;
  const editExam=event.target.closest("[data-edit-exam]")?.dataset.editExam;
  if(editExam)return examManager?.openById(editExam);
  if(editSlotId)return openSlotEditor(editSlotId);
  if(editSessionId)return openSessionEditor(editSessionId);
  if(deleteSessionId)return deleteTrainingSession(deleteSessionId);
  if(editId)return openEditor(editId);
  if(deleteId&&fieldKey)return deleteOneSchedule(deleteId,fieldKey);
};
$("trainingSlotList").onclick=event=>{
  const {editSlot,closeSlot,cancelSlot,removeSlot}=event.target.dataset;
  if(editSlot)return openSlotEditor(editSlot);
  if(closeSlot)return closeTrainingSlot(closeSlot);
  if(cancelSlot)return openSlotRemoval(cancelSlot,"cancel");
  if(removeSlot)return openSlotRemoval(removeSlot,"delete");
};
$("adminRequestList").onclick=event=>{
  const approveId=event.target.dataset.approveRequest,rejectId=event.target.dataset.rejectRequest;
  if(approveId)return openRequestApproval(approveId);
  if(rejectId)return rejectTrainingRequest(rejectId);
};
$("deleteAllScheduleBtn").onclick=async()=>{
  if(me.role!=="admin"&&me.role!=="user")return;
  const student=students.find(item=>String(item.id)===String($("scheduleStudent").value));
  if(!student)return;
  const motorcycle=isMotorcycleLicense(student.license_class);
  if(!confirm(motorcycle
    ?`Xóa riêng lịch Thi sát hạch của ${student.name}? Các lịch sử khác được giữ nguyên.`
    :`Xóa toàn bộ mốc Online, Cabin, DAT và kỳ thi của học viên ${student.name}? Các buổi thực hành riêng không bị xóa.`))return;
  const previous=studentSchedule(student);
  let notes;
  if(motorcycle){
    const updated={...previous,dates:{...(previous.dates||{})},locations:{...(previous.locations||{})},updatedAt:new Date().toISOString()};
    delete updated.dates.exam;
    delete updated.locations.exam;
    const stillHasData=Object.keys(updated.dates).length||Object.keys(updated.locations).length||updated.note;
    notes=embedScheduleInNotes(student.notes,stillHasData?updated:null);
  }else notes=embedScheduleInNotes(student.notes,null);
  $("deleteAllScheduleBtn").disabled=true;busy(true);$("scheduleError").textContent="";
  try{
    await saveScheduleNotes(student,notes,true);
    await recordAudit("schedule_changed","student",student.id,student.name,{operation:"all_milestones_deleted"});
    student.notes=notes;$("scheduleDialog").close();renderAll();toast("Đã xóa toàn bộ mốc đào tạo");
  }catch(error){$("scheduleError").textContent=error?.message||"Không thể xóa lịch đào tạo."}
  finally{$("deleteAllScheduleBtn").disabled=false;busy(false)}
};
document.querySelectorAll(".dialog-close").forEach(button=>button.onclick=()=>button.closest("dialog").close());

async function boot(){
  if(!token)return location.replace("/?login=1");
  busy(true);
  const scheduleLoadWatchdog=setTimeout(()=>{
    busy(false);
    showScheduleLoadError("Máy chủ phản hồi lâu hơn dự kiến.");
  },9000);
  try{
    let coreLoadWarning="";
    if(authKind==="student"){
      me=await rpc("app_student_me",{p_token:token});
      try{students=[await rpc("app_student_portal",{p_token:token})]}
      catch(error){if(isAuthenticationError(error))throw error;students=[];coreLoadWarning=error?.message||"Chưa tải được hồ sơ học viên."}
    }else{
      try{
        me=await rpc("app_me",{p_token:token});
      }catch(error){
        if(!isAuthenticationError(error))throw error;
        me=await rpc("app_student_me",{p_token:token});
      }
      if(me?.role==="student"){
        try{students=[await rpc("app_student_portal",{p_token:token})]}
        catch(error){if(isAuthenticationError(error))throw error;students=[];coreLoadWarning=error?.message||"Chưa tải được hồ sơ học viên."}
      }else{
        try{students=await rpc("app_list_students",{p_token:token,p_owner_id:null})||[]}
        catch(error){if(isAuthenticationError(error))throw error;students=[];coreLoadWarning=error?.message||"Chưa tải được danh sách học viên."}
      }
    }
    if(!me?.id)throw new Error("Phiên đăng nhập đã hết hạn");
    $("accountName").textContent=me.role==="admin"?`${me.username} · Admin`:me.role==="student"?`${me.username} · Học viên`:me.username;
    if(me.role==="student"){
      document.querySelectorAll('a[href="/?login=1"]').forEach(link=>link.href="/hoc-vien.html");
      document.querySelector(".topbar-actions a").textContent="← Về cổng học viên";
      $("emptyState").querySelector("p").textContent="Lịch mới sẽ hiển thị tại đây khi được trung tâm cập nhật.";
    }
    document.querySelectorAll(".admin-only").forEach(element=>element.classList.toggle("hidden",me.role!=="admin"));
    document.querySelectorAll(".manager-only").forEach(element=>element.classList.toggle("hidden",!["admin","user"].includes(me.role)));
    if(me.role==="user"){
      document.body.classList.add("staff-schedule");
      $("emptyState").querySelector("p").textContent="Lập lịch cho học viên do tài khoản này nhập.";
      document.querySelector(".schedule-hero .hero-kicker").textContent="LỊCH HỌC VIÊN CỦA TÔI";
    }
    $("scheduleStudent").innerHTML=students.map(student=>`<option value="${student.id}">${esc(student.name)} · ${esc(student.student_code||student.course||"Chưa có mã")}</option>`).join("");
    const carStudents=students.filter(student=>!isMotorcycleLicense(student.license_class));
    $("trainingStudent").innerHTML=carStudents.map(student=>`<option value="${student.id}">${esc(student.name)} · ${esc(student.student_code||student.course||"Chưa có mã")}</option>`).join("");
    $("openSessionBtn").classList.toggle("hidden",me.role==="student"||!carStudents.length);
    const availableFields=carStudents.length?SCHEDULE_FIELDS:SCHEDULE_FIELDS.filter(field=>field.key==="exam");
    $("typeFilter").innerHTML+=availableFields.map(field=>`<option value="${field.key}">${field.label}</option>`).join("");
    await loadTrainingSessions();
    if(me.role==="admin")await Promise.all([loadTrainingRequests(),loadTrainingSlots()]);
    examManager=createExamScheduleManager({me,students,token,onReload:()=>renderAll()});
    if(examManager)await examManager.load();
    if(students.length)renderEditorFields(students[0]);renderAll();renderTrainingRequests();renderTrainingSlots();
    if(coreLoadWarning)showScheduleLoadError(coreLoadWarning);else clearScheduleLoadError();
    if(me.role==="admin"&&!sessionFeatureAvailable)toast("Cần chạy file SQL cập nhật để mở chức năng nhiều buổi");
    if(me.role==="admin"&&!requestFeatureAvailable)toast("Cần chạy file SQL đăng ký lịch để nhận yêu cầu từ học viên");
    if(me.role==="admin"&&!slotFeatureAvailable)toast("Cần chạy file SQL ca học để bật chống trùng lịch");
  }catch(error){
    if(isAuthenticationError(error)){
      for(const store of [localStorage,sessionStorage]){store.removeItem("hv_token");store.removeItem("hv_auth_kind")}
      location.replace("/?login=1");
      return;
    }
    console.error("[schedule] boot failed",{message:error?.message||String(error)});
    showScheduleLoadError(error?.message||"Không thể tải dữ liệu lịch lúc này.");
  }finally{clearTimeout(scheduleLoadWatchdog);busy(false)}
}

boot();
