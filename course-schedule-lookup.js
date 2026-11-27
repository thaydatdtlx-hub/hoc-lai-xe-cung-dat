import {SCHEDULE_FIELDS,isMotorcycleLicense} from "./schedule-data.js";
import "./course-schedule-lookup.css";

const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=value=>String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d");
export function lookupCourseKey(value){return String(value??"").trim().toLocaleLowerCase("vi-VN").replace(/[‐‑‒–—−]/g,"-").replace(/\s*-\s*/g,"-").replace(/\s+/g," ")}
const COMMON_KEYS=new Set(["online_start","online_end","cabin","dat_auto_start","dat_auto_end","dat_manual_start","dat_manual_end","graduation","exam"]);
const RESULT_LABELS={scheduled:"Chưa thi",passed:"Đậu",failed:"Rớt",absent:"Vắng thi",cancelled:"Đã hủy"};
const PART_LABELS={theory:"Lý thuyết",simulation:"Mô phỏng",yard:"Sa hình",road:"Đường trường"};

function asDate(value){
  const text=String(value??"").trim();
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text))return new Date(text+"+07:00");
  return new Date(text);
}
export function lookupDate(value,dateOnly=false){
  if(!value)return "Chưa lập lịch";
  if(dateOnly||/^\d{4}-\d{2}-\d{2}$/.test(String(value))){
    const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m)return m[3]+"/"+m[2]+"/"+m[1];
  }
  const date=asDate(value);
  if(Number.isNaN(date.valueOf()))return "Ngày giờ chưa xác định";
  return new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
}
export function lookupCourseMembers(students,key){
  return students.filter(student=>student.deleted_at==null&&lookupCourseKey(student.course)===String(key));
}
export function lookupCommonRows(course,members){
  const motorcycle=members.length>0&&members.every(student=>isMotorcycleLicense(student.license_class));
  const schedule=course?.schedule;
  if(!course?.has_schedule||!schedule)return [];
  return SCHEDULE_FIELDS.filter(field=>COMMON_KEYS.has(field.key)&&(!motorcycle||field.key==="exam")&&schedule.dates?.[field.key])
    .map(field=>({key:field.key,label:field.label,icon:field.icon,tone:field.tone,date:schedule.dates[field.key],dateOnly:Boolean(field.dateOnly),location:schedule.locations?.[field.key]||""}));
}
export function lookupExamRows(attempts,members){
  const memberMap=new Map(members.map(student=>[String(student.id),student]));
  return attempts.flatMap(record=>{
    const student=memberMap.get(String(record.student_id));
    if(!student||!["exam","graduation"].includes(record.exam_type)||!record.starts_at)return [];
    if(record.exam_type==="graduation"&&isMotorcycleLicense(student.license_class))return [];
    return [{...record,student,label:record.exam_type==="exam"?"Thi sát hạch":"Thi tốt nghiệp"}];
  }).sort((a,b)=>asDate(a.starts_at)-asDate(b.starts_at)||String(a.student.name).localeCompare(String(b.student.name),"vi"));
}
export function mountCourseLookup({getCourses,getStudents,refresh,loadExams,openEditor}){
  if($("courseLookupPanel"))return null;
  const anchor=document.querySelector(".schedule-stats");
  if(!anchor)return null;
  let selected="",exams=[],examState="idle",examError="",requestVersion=0,refreshing=false;
  const panel=document.createElement("section");
  panel.id="courseLookupPanel";
  panel.className="course-lookup-panel schedule-panel";
  panel.setAttribute("aria-labelledby","courseLookupTitle");
  panel.innerHTML=`
    <div class="panel-head course-lookup-head"><div><h2 id="courseLookupTitle">Tra cứu lịch theo khóa học</h2><p>Xem lịch chung, lịch thi và thi lại của từng khóa mà không cần mở biểu mẫu lập lịch.</p></div><span id="courseLookupCount">0 khóa học</span></div>
    <div class="course-lookup-body">
      <div class="course-lookup-toolbar">
        <label>Tìm khóa học<input id="courseLookupSearch" type="search" placeholder="Nhập tên hoặc mã khóa học..." autocomplete="off"></label>
        <label>Chọn khóa học<select id="courseLookupSelect"><option value="">— Chọn khóa cần tra cứu —</option></select></label>
        <button id="courseLookupRefresh" type="button" class="course-lookup-btn" aria-label="Tải lại dữ liệu các khóa">↻ Tải lại</button>
      </div>
      <p id="courseLookupNotice" class="course-lookup-notice" role="status" aria-live="polite">Chọn khóa để xem lịch đào tạo.</p>
      <div id="courseLookupResult" hidden></div>
    </div>`;
  anchor.insertAdjacentElement("afterend",panel);
  const hero=document.querySelector(".hero-actions");
  if(hero){
    const button=document.createElement("button");
    button.id="openCourseLookupBtn";button.type="button";button.className="secondary-light course-lookup-hero-btn";
    button.textContent="⌕ Tra cứu lịch khóa";
    const before=$("openEditorBtn");
    if(before?.parentElement===hero)hero.insertBefore(button,before);else hero.append(button);
    button.onclick=()=>{panel.scrollIntoView({behavior:"smooth",block:"start"});$("courseLookupSelect").focus({preventScroll:true})};
  }
  const result=$("courseLookupResult"),select=$("courseLookupSelect"),search=$("courseLookupSearch"),notice=$("courseLookupNotice");
  function getSelected(){return getCourses().find(row=>String(row.course_key)===selected)}
  function updateOptions(){
    const rows=getCourses().slice().sort((a,b)=>String(a.course||"").localeCompare(String(b.course||""),"vi",{numeric:true}));
    const query=norm(search.value);
    const filtered=rows.filter(row=>norm(row.course).includes(query)||norm(row.course_key).includes(query));
    $("courseLookupCount").textContent=rows.length+" khóa học";
    select.innerHTML='<option value="">— Chọn khóa cần tra cứu —</option>'+filtered.map(row=>`<option value="${esc(row.course_key)}">${esc(row.course)} · ${Number(row.student_count)||0} học viên</option>`).join("");
    select.disabled=filtered.length===0;
    if(!filtered.some(row=>String(row.course_key)===selected))selected="";
    select.value=selected;
    if(!selected){
      result.hidden=true;result.innerHTML="";
      notice.textContent=filtered.length?"Chọn khóa để xem lịch đào tạo.":rows.length?"Không tìm thấy khóa phù hợp.":"Chưa có khóa học để tra cứu.";
    }
  }
  function render(){
    const course=getSelected();
    if(!course){result.hidden=true;return;}
    const members=lookupCourseMembers(getStudents(),selected);
    const common=lookupCommonRows(course,members);
    const examRows=lookupExamRows(exams,members);
    const licenses=[...new Set(members.map(student=>student.license_class).filter(Boolean))];
    notice.textContent="";
    result.hidden=false;
    result.innerHTML=`
      <div class="course-lookup-summary">
        <div><small>KHÓA HỌC ĐANG XEM</small><h3>${esc(course.course)}</h3><p>${esc(licenses.join(" · ")||"Chưa xác định hạng đào tạo")} · ${Number(course.student_count)||members.length} học viên</p></div>
        <span class="course-lookup-state ${course.has_schedule?"is-synced":""}">${course.has_schedule?"Đã lập lịch chung":"Chưa lập lịch chung"}</span>
      </div>
      <div class="course-lookup-section-head"><div><h3>Lịch đào tạo chung</h3><p>${common.length?"Các mốc đã lưu cho toàn khóa":"Chưa có mốc lịch chung đã lưu"}</p></div><button type="button" data-lookup-edit class="course-lookup-btn">${course.has_schedule?"Chỉnh sửa lịch khóa":"Lập lịch cho khóa"}</button></div>
      ${common.length?`<div class="course-lookup-milestones">${common.map(item=>`<article class="course-lookup-milestone"><span class="course-lookup-icon">${esc(item.icon)}</span><div><strong>${esc(item.label)}</strong><b>${esc(lookupDate(item.date,item.dateOnly))}</b><small>${esc(item.location||"Chưa nhập địa điểm")}</small></div></article>`).join("")}</div>`:`<p class="course-lookup-empty">Chưa có lịch chung. Các lịch riêng của học viên vẫn được lưu trong danh sách lịch đào tạo.</p>`}
      ${course.has_schedule&&course.schedule?.note?`<p class="course-lookup-note"><strong>Ghi chú khóa:</strong> ${esc(course.schedule.note)}</p>`:""}
      <details class="course-lookup-details"${examRows.length&&examRows.length<=5?" open":""}>
        <summary><span>Lịch thi và thi lại của học viên</span><span>${examState==="loading"?"Đang tải…":examState==="error"?"Chưa tải được":examRows.length+" lượt thi"}</span></summary>
        ${examState==="loading"?'<p class="course-lookup-empty">Đang tải lịch thi...</p>':examState==="error"?`<p class="course-lookup-empty">${esc(examError||"Không thể tải lịch thi.")} <button type="button" class="course-lookup-btn" data-lookup-retry>Thử lại</button></p>`:examRows.length?`<div class="course-lookup-exams">${examRows.map(record=>`<article><div><strong>${esc(record.student.name)}</strong><small>${esc(record.student.student_code||"")}</small></div><div><strong>${esc(record.label)} · Lần ${Number(record.attempt_no)||1}</strong><small>${esc(lookupDate(record.starts_at))} · ${esc(record.location||"Chưa nhập địa điểm")}</small>${record.source==="legacy"?'<small>Lịch kế thừa từ hồ sơ</small>':""}</div><div><span class="course-lookup-result result-${esc(record.result||"scheduled")}">${esc(RESULT_LABELS[record.result]||"Chưa thi")}</span>${Array.isArray(record.failed_parts)&&record.failed_parts.length?`<small>${esc(record.failed_parts.map(part=>PART_LABELS[part]||part).join(", "))}</small>`:""}</div></article>`).join("")}</div>`:'<p class="course-lookup-empty">Chưa có lịch thi theo học viên trong khóa này.</p>'}
      </details>
      <div class="course-lookup-footer"><button type="button" class="course-lookup-btn course-lookup-primary" data-lookup-events>Xem toàn bộ lịch học viên của khóa →</button></div>`;
  }
  async function selectCourse(key){
    selected=String(key||"");select.value=selected;exams=[];examError="";examState=selected?"loading":"idle";
    const version=++requestVersion;
    if(!selected){result.hidden=true;notice.textContent="Chọn khóa để xem lịch đào tạo.";return;}
    render();
    try{
      const records=await loadExams();
      if(version!==requestVersion)return;
      exams=Array.isArray(records)?records:[];examState="ready";
    }catch(error){
      if(version!==requestVersion)return;
      examState="error";examError=error?.message||"Không thể tải lịch thi.";
    }
    render();
  }
  search.oninput=()=>{
    const previous=selected;updateOptions();
    if(previous!==selected){++requestVersion;exams=[];examState="idle";}
  };
  select.onchange=()=>void selectCourse(select.value);
  $("courseLookupRefresh").onclick=async()=>{
    if(refreshing)return;
    refreshing=true;$("courseLookupRefresh").disabled=true;
    try{await refresh();updateOptions();if(selected)await selectCourse(selected)}
    catch(error){notice.textContent="Không thể tải lại dữ liệu: "+(error?.message||"Vui lòng thử lại.")}
    finally{refreshing=false;$("courseLookupRefresh").disabled=false}
  };
  result.onclick=event=>{
    if(event.target.closest("[data-lookup-edit]")){if(selected)void openEditor(selected);return;}
    if(event.target.closest("[data-lookup-retry]")){void selectCourse(selected);return;}
    if(event.target.closest("[data-lookup-events]")){
      document.dispatchEvent(new CustomEvent("course-lookup-filter",{detail:{key:selected,name:getSelected()?.course||""}}));
      document.querySelector(".schedule-toolbar")?.scrollIntoView({behavior:"smooth",block:"start"});
    }
  };
  updateOptions();
  return {updateOptions};
}
