import "./admin-intake-editor.css";

const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
const INTAKE_ORDER=["A1","A","B số tự động","B số sàn","C1"];
const DEFAULT_INTAKE={
  kicker:"LỊCH TIẾP NHẬN HỒ SƠ",
  title:"Đăng ký trước để được xếp khóa phù hợp",
  description:"Ngày khai giảng và số chỗ còn lại cần được xác nhận theo từng hạng; website không hiển thị số lượng giả định.",
  cards:{
    "A1":{label:"A1",status:"ĐANG NHẬN TƯ VẤN",summary:"Lịch tiếp nhận hồ sơ được xác nhận khi tư vấn.",start:"xác nhận khi tư vấn",deadline:"theo kế hoạch khóa",seats:"cập nhật trực tiếp",cta:"Đăng ký giữ thông tin"},
    "A":{label:"A",status:"ĐANG NHẬN TƯ VẤN",summary:"Lịch tiếp nhận hồ sơ được xác nhận khi tư vấn.",start:"xác nhận khi tư vấn",deadline:"theo kế hoạch khóa",seats:"cập nhật trực tiếp",cta:"Đăng ký giữ thông tin"},
    "B số tự động":{label:"B tự động",status:"ĐANG NHẬN TƯ VẤN",summary:"Thời gian đào tạo dự kiến 2,5–3 tháng.",start:"xác nhận khi tư vấn",deadline:"theo kế hoạch khóa",seats:"cập nhật trực tiếp",cta:"Đăng ký giữ thông tin"},
    "B số sàn":{label:"B số sàn",status:"ĐANG NHẬN TƯ VẤN",summary:"Thời gian đào tạo dự kiến 2,5–3 tháng.",start:"xác nhận khi tư vấn",deadline:"theo kế hoạch khóa",seats:"cập nhật trực tiếp",cta:"Đăng ký giữ thông tin"},
    "C1":{label:"C1",status:"ĐANG NHẬN TƯ VẤN",summary:"Thời gian đào tạo dự kiến 3,5–4 tháng.",start:"xác nhận khi tư vấn",deadline:"theo kế hoạch khóa",seats:"cập nhật trực tiếp",cta:"Đăng ký giữ thông tin"}
  }
};
let currentConfig=normalizeConfig();
let editMode="section",editKey="";

function token(){return localStorage.getItem("hv_token")||sessionStorage.getItem("hv_token")||""}
async function rpc(fn,body={}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:"POST",headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||data?.details||"Không thể cập nhật nội dung lúc này.");
  return data;
}
function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))}
function normalizeCard(key,input={}){
  const item={...DEFAULT_INTAKE.cards[key],...(input&&typeof input==="object"?input:{})};
  if(key==="B số tự động"&&item.label==="B số tự động")item.label="B tự động";
  return item;
}
function normalizeConfig(input={}){
  const source=input&&typeof input==="object"?input:{};
  return {
    kicker:source.kicker??DEFAULT_INTAKE.kicker,
    title:source.title??DEFAULT_INTAKE.title,
    description:source.description??DEFAULT_INTAKE.description,
    cards:Object.fromEntries(INTAKE_ORDER.map(key=>[key,normalizeCard(key,source.cards?.[key])]))
  };
}
function pencilIcon(){return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4M4 20l4-1"/></svg>'}
function intakeSection(){return document.getElementById("lich-khai-giang")}
function cardFor(key){return [...(intakeSection()?.querySelectorAll(".site-intake-card")||[])].find(card=>card.querySelector("[data-intake-license]")?.dataset.intakeLicense===key)}
function applyConfig(config=currentConfig){
  const section=intakeSection();if(!section)return;
  const heading=section.querySelector(".site-upgrade-heading");
  if(heading){
    const kicker=heading.querySelector("p"),title=heading.querySelector("h2"),description=heading.querySelector("span");
    if(kicker)kicker.textContent=config.kicker;
    if(title)title.textContent=config.title;
    if(description)description.textContent=config.description;
  }
  INTAKE_ORDER.forEach(key=>{
    const card=cardFor(key),item=config.cards[key];if(!card||!item)return;
    const status=card.querySelector(":scope > span"),label=card.querySelector("h3"),summary=card.querySelector("p"),rows=card.querySelectorAll("li"),cta=card.querySelector("[data-intake-license]");
    if(status)status.textContent=item.status;
    if(label)label.textContent=item.label;
    if(summary)summary.textContent=item.summary;
    if(rows[0])rows[0].textContent=`Ngày bắt đầu: ${item.start}`;
    if(rows[1])rows[1].textContent=`Hạn hồ sơ: ${item.deadline}`;
    if(rows[2])rows[2].textContent=`Số chỗ: ${item.seats}`;
    if(cta)cta.textContent=item.cta;
  });
}
function waitForSection(){return new Promise(resolve=>{let tries=0;const tick=()=>{const section=intakeSection();if(section||tries++>=30)return resolve(section);setTimeout(tick,100)};tick()})}
function setDialogStatus(text,type=""){const el=document.getElementById("adminIntakeEditorStatus");if(!el)return;el.className=`admin-intake-editor__status ${type}`;el.textContent=text}
function field(name,label,value,textarea=false){return `<label>${label}${textarea?`<textarea name="${name}" rows="3">${escapeHtml(value)}</textarea>`:`<input name="${name}" value="${escapeHtml(value)}">`}</label>`}
function mountDialog(){
  if(document.getElementById("adminIntakeEditorDialog"))return;
  const dialog=document.createElement("dialog");dialog.id="adminIntakeEditorDialog";dialog.className="admin-intake-editor";
  dialog.innerHTML=`<form id="adminIntakeEditorForm"><div class="admin-intake-editor__head"><div><p>QUẢN TRỊ NỘI DUNG</p><h2 id="adminIntakeEditorTitle">Chỉnh sửa lịch tiếp nhận</h2></div><button type="button" class="admin-intake-editor__close" data-intake-close aria-label="Đóng">×</button></div><div id="adminIntakeEditorFields" class="admin-intake-editor__fields"></div><p id="adminIntakeEditorStatus" class="admin-intake-editor__status"></p><div class="admin-intake-editor__actions"><button type="button" data-intake-close>Hủy</button><button class="primary" type="submit">Lưu cập nhật</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelectorAll("[data-intake-close]").forEach(button=>button.addEventListener("click",()=>dialog.close()));
  dialog.querySelector("form").addEventListener("submit",saveEditor);
}
function openSectionEditor(){
  mountDialog();editMode="section";editKey="";
  document.getElementById("adminIntakeEditorTitle").textContent="Chỉnh sửa tiêu đề khu vực";
  document.getElementById("adminIntakeEditorFields").innerHTML=field("kicker","Dòng nhỏ phía trên",currentConfig.kicker)+field("title","Tiêu đề chính",currentConfig.title)+field("description","Mô tả",currentConfig.description,true);
  setDialogStatus("");document.getElementById("adminIntakeEditorDialog").showModal();
}
function openCardEditor(key){
  mountDialog();editMode="card";editKey=key;const item=currentConfig.cards[key];
  document.getElementById("adminIntakeEditorTitle").textContent=`Chỉnh sửa ${item.label}`;
  document.getElementById("adminIntakeEditorFields").innerHTML=field("status","Trạng thái",item.status)+field("label","Tên hiển thị",item.label)+field("summary","Mô tả",item.summary,true)+field("start","Ngày bắt đầu",item.start)+field("deadline","Hạn hồ sơ",item.deadline)+field("seats","Số chỗ",item.seats)+field("cta","Nội dung nút đăng ký",item.cta);
  setDialogStatus("");document.getElementById("adminIntakeEditorDialog").showModal();
}
async function saveEditor(event){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form),submit=form.querySelector('button[type="submit"]');
  if(editMode==="section"){
    currentConfig.kicker=String(data.get("kicker")||"").trim();
    currentConfig.title=String(data.get("title")||"").trim();
    currentConfig.description=String(data.get("description")||"").trim();
  }else if(editKey){
    const item=currentConfig.cards[editKey];["status","label","summary","start","deadline","seats","cta"].forEach(name=>item[name]=String(data.get(name)||"").trim());
  }
  submit.disabled=true;setDialogStatus("Đang lưu cập nhật…");
  try{
    const result=await rpc("app_admin_save_intake_config",{p_token:token(),p_data:currentConfig});
    currentConfig=normalizeConfig(result?.intake_config||currentConfig);applyConfig();setDialogStatus("Đã lưu. Nội dung mới đã được áp dụng.","success");
    setTimeout(()=>document.getElementById("adminIntakeEditorDialog")?.close(),650);
  }catch(error){setDialogStatus(error?.message||"Không thể lưu nội dung.","error")}finally{submit.disabled=false}
}
function addAdminControls(){
  const section=intakeSection();if(!section)return;
  const heading=section.querySelector(".site-upgrade-heading");
  if(heading&&!heading.querySelector("[data-intake-edit-section]")){
    const button=document.createElement("button");button.type="button";button.className="admin-intake-pencil admin-intake-pencil--section";button.dataset.intakeEditSection="true";button.innerHTML=pencilIcon();button.title="Admin: chỉnh sửa tiêu đề";button.setAttribute("aria-label","Chỉnh sửa tiêu đề lịch tiếp nhận");button.addEventListener("click",openSectionEditor);heading.append(button);
  }
  INTAKE_ORDER.forEach(key=>{
    const card=cardFor(key);if(!card||card.querySelector("[data-intake-edit-card]"))return;
    const button=document.createElement("button");button.type="button";button.className="admin-intake-pencil admin-intake-pencil--card";button.dataset.intakeEditCard=key;button.innerHTML=`${pencilIcon()}<span>Chỉnh sửa</span>`;button.title=`Admin: chỉnh sửa ${key}`;button.setAttribute("aria-label",`Chỉnh sửa nội dung ${key}`);button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();openCardEditor(key)});card.append(button);
  });
  section.classList.add("admin-intake-editable");
}
async function enableForAdmin(){
  const t=token();if(!t)return;
  try{const me=await rpc("app_me",{p_token:t});if(me?.role==="admin")addAdminControls()}catch{}
}
async function boot(){
  if(!await waitForSection())return;
  try{const config=await rpc("app_public_site_config",{});currentConfig=normalizeConfig(config?.intake_config)}catch{currentConfig=normalizeConfig()}
  applyConfig();enableForAdmin();
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();