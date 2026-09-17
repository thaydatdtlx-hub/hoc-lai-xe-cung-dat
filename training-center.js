const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
const FIELDS=[
  {id:"trainingCenter",key:"training_center",label:"Trung tâm đào tạo",placeholder:"Ví dụ: Trường lái Khôi Việt",heading:"Trung tâm đào tạo",cellClass:"training-center-cell"},
  {id:"examCenter",key:"exam_center",label:"Trung tâm sát hạch",placeholder:"Ví dụ: Trung tâm sát hạch Hóc Môn",heading:"Trung tâm sát hạch",cellClass:"exam-center-cell"}
];
const studentMeta=new Map();
let refreshTimer=null;
let rowsObserver=null;
let dialogObserver=null;

function currentToken(){return localStorage.getItem("hv_token")||sessionStorage.getItem("hv_token")||""}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]))}
function isAdminDashboard(){return Boolean(document.getElementById("studentRows")&&document.getElementById("studentForm"))}
function ensureStyles(){
  if(document.getElementById("trainingCenterStyles"))return;
  const style=document.createElement("style");style.id="trainingCenterStyles";
  style.textContent=`th[data-center-heading],td.training-center-cell,td.exam-center-cell{min-width:150px}td.training-center-cell,td.exam-center-cell{vertical-align:middle}.center-value{display:block;font-weight:700;line-height:1.35}.center-empty{display:block;color:var(--muted,#6b7280);font-size:.82rem;line-height:1.35}`;
  document.head.append(style);
}
function ensureHeaders(){
  const headerRow=document.querySelector("#studentRows")?.closest("table")?.querySelector("thead tr");if(!headerRow)return;
  const cells=[...headerRow.children],licenseHeader=cells.find(cell=>/hạng\s*\/\s*khóa/i.test(cell.textContent||""))||cells[1];if(!licenseHeader)return;
  let anchor=licenseHeader;
  for(const field of FIELDS){
    let th=headerRow.querySelector(`th[data-center-heading="${field.key}"]`);
    if(!th){th=document.createElement("th");th.dataset.centerHeading=field.key;th.textContent=field.heading;anchor.insertAdjacentElement("afterend",th)}
    anchor=th;
  }
}
function ensureFormFields(){
  const form=document.getElementById("studentForm");if(!form)return;
  const courseLabel=document.getElementById("course")?.closest("label");if(!courseLabel)return;
  let anchor=courseLabel;
  for(const field of FIELDS){
    let label=form.querySelector(`label[data-center-field="${field.key}"]`);
    if(!label){
      label=document.createElement("label");label.dataset.centerField=field.key;label.textContent=field.label;
      const input=document.createElement("input");input.id=field.id;input.name=field.key;input.maxLength=160;input.autocomplete="organization";input.placeholder=field.placeholder;label.append(input);
      anchor.insertAdjacentElement("afterend",label);
    }
    anchor=label;
  }
}
function studentIdForRow(row){return row.querySelector("[data-edit]")?.dataset.edit||row.querySelector("[data-student-account]")?.dataset.studentAccount||""}
function paintRows(){
  ensureHeaders();const tbody=document.getElementById("studentRows");if(!tbody)return;
  for(const row of tbody.querySelectorAll(":scope > tr")){
    const id=String(studentIdForRow(row)||"");if(!id)continue;
    let anchor=row.children[1];if(!anchor)continue;
    const meta=studentMeta.get(id)||{};
    for(const field of FIELDS){
      let cell=row.querySelector(`td[data-center-cell="${field.key}"]`);
      if(!cell){cell=document.createElement("td");cell.dataset.centerCell=field.key;cell.className=field.cellClass;anchor.insertAdjacentElement("afterend",cell)}
      const value=String(meta[field.key]||"").trim();cell.innerHTML=value?`<span class="center-value">${escapeHtml(value)}</span>`:'<span class="center-empty">Chưa cập nhật</span>';anchor=cell;
    }
  }
}
function syncFieldsFromDialog(){
  ensureFormFields();const id=String(document.getElementById("studentId")?.value||""),meta=studentMeta.get(id)||{};
  for(const field of FIELDS){const input=document.getElementById(field.id);if(input)input.value=id?String(meta[field.key]||""):""}
}
function rememberStudents(rows){
  if(!Array.isArray(rows))return;
  for(const student of rows){if(student?.id!=null)studentMeta.set(String(student.id),{training_center:String(student.training_center||""),exam_center:String(student.exam_center||"")})}
  paintRows();if(document.getElementById("studentDialog")?.open)syncFieldsFromDialog();
}
async function refreshCenters(){
  const token=currentToken();if(!token||!isAdminDashboard())return;
  try{const response=await nativeFetch(`${SUPABASE_URL}/rest/v1/rpc/app_list_students`,{method:"POST",headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_token:token,p_owner_id:null})});if(response.ok)rememberStudents(await response.json())}catch(error){console.warn("[student-centers] Không thể đồng bộ thông tin trung tâm.",error)}
}
function scheduleRefresh(delay=80){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refreshCenters(),delay)}

const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const url=typeof input==="string"?input:input?.url||"";let nextInit=init;let savedMeta=null;
  if(/\/rest\/v1\/rpc\/app_save_student(?:\?|$)/.test(url)){
    try{
      const sourceBody=init?.body??(typeof input!=="string"?input?.body:null);
      if(typeof sourceBody==="string"){
        const payload=JSON.parse(sourceBody);
        if(payload&&payload.p_data&&typeof payload.p_data==="object"){
          ensureFormFields();savedMeta={};
          for(const field of FIELDS){savedMeta[field.key]=String(document.getElementById(field.id)?.value||"").trim();payload.p_data[field.key]=savedMeta[field.key]}
          nextInit={...init,body:JSON.stringify(payload)};
        }
      }
    }catch(error){console.warn("[student-centers] Không thể gắn dữ liệu trung tâm vào yêu cầu lưu.",error)}
  }
  const response=await nativeFetch(input,nextInit);
  if(/\/rest\/v1\/rpc\/app_list_students(?:\?|$)/.test(url)&&response.ok)response.clone().json().then(rememberStudents).catch(()=>{});
  if(savedMeta&&response.ok){response.clone().json().then(savedId=>{if(savedId!=null)studentMeta.set(String(savedId),savedMeta);paintRows();scheduleRefresh(250)}).catch(()=>scheduleRefresh(250))}
  return response;
};

function watchUi(){
  if(!isAdminDashboard())return;ensureStyles();ensureHeaders();ensureFormFields();paintRows();
  const tbody=document.getElementById("studentRows");
  if(tbody&&!rowsObserver){rowsObserver=new MutationObserver(()=>{paintRows();if(tbody.children.length&&!studentMeta.size)scheduleRefresh(0)});rowsObserver.observe(tbody,{childList:true})}
  const dialog=document.getElementById("studentDialog");
  if(dialog&&!dialogObserver){dialogObserver=new MutationObserver(()=>{if(dialog.open)queueMicrotask(syncFieldsFromDialog)});dialogObserver.observe(dialog,{attributes:true,attributeFilter:["open"]})}
  document.addEventListener("click",event=>{
    const edit=event.target.closest?.("[data-edit]");
    if(edit){const id=String(edit.dataset.edit||"");setTimeout(()=>{ensureFormFields();const meta=studentMeta.get(id)||{};for(const field of FIELDS){const input=document.getElementById(field.id);if(input)input.value=String(meta[field.key]||"")}},0);return}
    if(event.target.closest?.("#addStudentBtn"))setTimeout(()=>{ensureFormFields();for(const field of FIELDS){const input=document.getElementById(field.id);if(input)input.value=""}},0);
  },true);
  scheduleRefresh(0);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",watchUi,{once:true});else watchUi();
