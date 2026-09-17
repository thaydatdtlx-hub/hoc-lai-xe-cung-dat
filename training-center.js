const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
const CENTER_FIELD_ID="trainingCenter";
const centerByStudentId=new Map();
let refreshTimer=null;
let rowsObserver=null;
let dialogObserver=null;

function currentToken(){
  return localStorage.getItem("hv_token")||sessionStorage.getItem("hv_token")||"";
}
function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
}
function isAdminDashboard(){
  return Boolean(document.getElementById("studentRows")&&document.getElementById("studentForm"));
}
function ensureStyles(){
  if(document.getElementById("trainingCenterStyles"))return;
  const style=document.createElement("style");
  style.id="trainingCenterStyles";
  style.textContent=`
    th[data-training-center-heading],td.training-center-cell{min-width:150px}
    td.training-center-cell{vertical-align:middle}
    .training-center-value{display:block;font-weight:700;line-height:1.35}
    .training-center-empty{display:block;color:var(--muted,#6b7280);font-size:.82rem;line-height:1.35}
  `;
  document.head.append(style);
}
function ensureHeader(){
  const headerRow=document.querySelector("#studentRows")?.closest("table")?.querySelector("thead tr");
  if(!headerRow||headerRow.querySelector("th[data-training-center-heading]"))return;
  const cells=[...headerRow.children];
  const licenseHeader=cells.find(cell=>/hạng\s*\/\s*khóa/i.test(cell.textContent||""))||cells[1];
  if(!licenseHeader)return;
  const th=document.createElement("th");
  th.dataset.trainingCenterHeading="true";
  th.textContent="Trung tâm đào tạo";
  licenseHeader.insertAdjacentElement("afterend",th);
}
function ensureFormField(){
  const form=document.getElementById("studentForm");
  if(!form||document.getElementById(CENTER_FIELD_ID))return;
  const course=document.getElementById("course");
  const courseLabel=course?.closest("label");
  if(!courseLabel)return;
  const label=document.createElement("label");
  label.dataset.trainingCenterField="true";
  label.textContent="Trung tâm đào tạo";
  const input=document.createElement("input");
  input.id=CENTER_FIELD_ID;
  input.name="training_center";
  input.maxLength=160;
  input.autocomplete="organization";
  input.placeholder="Ví dụ: Trường lái Khôi Việt";
  label.append(input);
  courseLabel.insertAdjacentElement("afterend",label);
}
function studentIdForRow(row){
  return row.querySelector("[data-edit]")?.dataset.edit||row.querySelector("[data-student-account]")?.dataset.studentAccount||"";
}
function paintRows(){
  ensureHeader();
  const tbody=document.getElementById("studentRows");
  if(!tbody)return;
  for(const row of tbody.querySelectorAll(":scope > tr")){
    const id=String(studentIdForRow(row)||"");
    if(!id)continue;
    let cell=row.querySelector("td.training-center-cell");
    if(!cell){
      const licenseCell=row.children[1];
      if(!licenseCell)continue;
      cell=document.createElement("td");
      cell.className="training-center-cell";
      cell.dataset.trainingCenterStudent=id;
      licenseCell.insertAdjacentElement("afterend",cell);
    }
    const center=String(centerByStudentId.get(id)||"").trim();
    cell.innerHTML=center?`<span class="training-center-value">${escapeHtml(center)}</span>`:'<span class="training-center-empty">Chưa cập nhật</span>';
  }
}
function syncFieldFromDialog(){
  ensureFormField();
  const field=document.getElementById(CENTER_FIELD_ID);
  if(!field)return;
  const id=String(document.getElementById("studentId")?.value||"");
  field.value=id?String(centerByStudentId.get(id)||""):"";
}
function rememberStudents(rows){
  if(!Array.isArray(rows))return;
  for(const student of rows){
    if(student?.id!=null)centerByStudentId.set(String(student.id),String(student.training_center||""));
  }
  paintRows();
  if(document.getElementById("studentDialog")?.open)syncFieldFromDialog();
}
async function refreshCenters(){
  const token=currentToken();
  if(!token||!isAdminDashboard())return;
  try{
    const response=await nativeFetch(`${SUPABASE_URL}/rest/v1/rpc/app_list_students`,{
      method:"POST",
      headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({p_token:token,p_owner_id:null})
    });
    if(!response.ok)return;
    rememberStudents(await response.json());
  }catch(error){
    console.warn("[training-center] Không thể đồng bộ trung tâm đào tạo.",error);
  }
}
function scheduleRefresh(delay=80){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>void refreshCenters(),delay);
}

const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const url=typeof input==="string"?input:input?.url||"";
  let nextInit=init;
  let savedCenter=null;
  if(/\/rest\/v1\/rpc\/app_save_student(?:\?|$)/.test(url)){
    try{
      const sourceBody=init?.body??(typeof input!=="string"?input?.body:null);
      if(typeof sourceBody==="string"){
        const payload=JSON.parse(sourceBody);
        if(payload&&payload.p_data&&typeof payload.p_data==="object"){
          ensureFormField();
          savedCenter=String(document.getElementById(CENTER_FIELD_ID)?.value||"").trim();
          payload.p_data={...payload.p_data,training_center:savedCenter};
          nextInit={...init,body:JSON.stringify(payload)};
        }
      }
    }catch(error){
      console.warn("[training-center] Không thể gắn dữ liệu trung tâm vào yêu cầu lưu.",error);
    }
  }
  const response=await nativeFetch(input,nextInit);
  if(/\/rest\/v1\/rpc\/app_list_students(?:\?|$)/.test(url)&&response.ok){
    response.clone().json().then(rememberStudents).catch(()=>{});
  }
  if(savedCenter!==null&&response.ok){
    response.clone().json().then(savedId=>{
      if(savedId!=null)centerByStudentId.set(String(savedId),savedCenter);
      paintRows();
      scheduleRefresh(250);
    }).catch(()=>scheduleRefresh(250));
  }
  return response;
};

function watchUi(){
  if(!isAdminDashboard())return;
  ensureStyles();
  ensureHeader();
  ensureFormField();
  paintRows();
  const tbody=document.getElementById("studentRows");
  if(tbody&&!rowsObserver){
    rowsObserver=new MutationObserver(()=>{
      paintRows();
      if(tbody.children.length&&!centerByStudentId.size)scheduleRefresh(0);
    });
    rowsObserver.observe(tbody,{childList:true});
  }
  const dialog=document.getElementById("studentDialog");
  if(dialog&&!dialogObserver){
    dialogObserver=new MutationObserver(()=>{if(dialog.open)queueMicrotask(syncFieldFromDialog)});
    dialogObserver.observe(dialog,{attributes:true,attributeFilter:["open"]});
  }
  document.addEventListener("click",event=>{
    const edit=event.target.closest?.("[data-edit]");
    if(edit){
      const id=String(edit.dataset.edit||"");
      setTimeout(()=>{ensureFormField();const field=document.getElementById(CENTER_FIELD_ID);if(field)field.value=String(centerByStudentId.get(id)||"")},0);
      return;
    }
    if(event.target.closest?.("#addStudentBtn"))setTimeout(()=>{ensureFormField();const field=document.getElementById(CENTER_FIELD_ID);if(field)field.value=""},0);
  },true);
  scheduleRefresh(0);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",watchUi,{once:true});else watchUi();
