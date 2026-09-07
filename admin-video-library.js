import "./admin-video-library.css";

const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
let currentVideos=[];
let mounted=false;

function token(){return localStorage.getItem("hv_token")||sessionStorage.getItem("hv_token")||""}
async function rpc(fn,body={}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:"POST",headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||data?.details||"Không thể cập nhật thư viện video.");
  return data;
}
function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))}
function youtubeId(value=""){
  try{
    const url=new URL(value);
    const host=url.hostname.replace(/^www\./,"").replace(/^m\./,"");
    if(host==="youtu.be")return url.pathname.replace(/^\//,"").split("/")[0];
    if(host!=="youtube.com")return "";
    return url.searchParams.get("v")||url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]||"";
  }catch{return ""}
}
function normalize(items){
  if(!Array.isArray(items))return [];
  return items.slice(0,12).map((item,index)=>({
    url:String(item?.url||"").trim(),
    title:String(item?.title||`Video đào tạo ${index+1}`).trim(),
    label:String(item?.label||`VIDEO ĐÀO TẠO ${String(index+1).padStart(2,"0")}`).trim()
  })).filter(item=>youtubeId(item.url));
}
function getSection(){return document.querySelector(".training-video-section")}
function pencilIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4M4 20l4-1"/></svg>'}
function mountDialog(){
  if(document.getElementById("adminVideoLibraryDialog"))return;
  const dialog=document.createElement("dialog");dialog.id="adminVideoLibraryDialog";dialog.className="admin-video-library-dialog";
  dialog.innerHTML=`<form id="adminVideoLibraryForm"><div class="admin-video-library-head"><div><p>QUẢN TRỊ VIDEO</p><h2>Thư viện video đào tạo</h2><span>Admin có thể thay video hiện tại, thêm video mới hoặc xóa video khỏi website.</span></div><button type="button" data-video-close aria-label="Đóng">×</button></div><div id="adminVideoRows" class="admin-video-rows"></div><button type="button" id="adminVideoAdd" class="admin-video-add">＋ Thêm video mới</button><p id="adminVideoStatus" class="admin-video-status"></p><div class="admin-video-actions"><button type="button" data-video-close>Hủy</button><button class="primary" type="submit">Lưu thư viện video</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelectorAll("[data-video-close]").forEach(button=>button.onclick=()=>dialog.close());
  dialog.querySelector("#adminVideoAdd").onclick=()=>{if(currentVideos.length>=12){setStatus("Tối đa 12 video.","error");return}currentVideos.push({url:"",title:"",label:`VIDEO ĐÀO TẠO ${String(currentVideos.length+1).padStart(2,"0")}`});renderRows()};
  dialog.querySelector("form").addEventListener("submit",saveVideos);
}
function setStatus(text,type=""){const el=document.getElementById("adminVideoStatus");if(!el)return;el.className=`admin-video-status ${type}`;el.textContent=text}
function syncFromRows(){
  currentVideos=[...document.querySelectorAll(".admin-video-row")].map(row=>({
    url:row.querySelector('[name="url"]')?.value.trim()||"",
    title:row.querySelector('[name="title"]')?.value.trim()||"",
    label:row.querySelector('[name="label"]')?.value.trim()||""
  }));
}
function rowHtml(video,index){
  const id=youtubeId(video.url),preview=id?`https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`:"";
  return `<div class="admin-video-row" data-index="${index}"><div class="admin-video-row-head"><strong>Video ${index+1}</strong><button type="button" data-video-remove="${index}">Xóa</button></div><div class="admin-video-row-grid"><div class="admin-video-preview">${preview?`<img src="${preview}" alt="">`:'<span>Chưa có video</span>'}</div><div class="admin-video-fields"><label>Link YouTube<input name="url" type="url" value="${escapeHtml(video.url)}" placeholder="https://youtu.be/..." required></label><label>Tiêu đề<input name="title" value="${escapeHtml(video.title)}" placeholder="Tiêu đề hiển thị" required></label><label>Nhãn nhỏ<input name="label" value="${escapeHtml(video.label)}" placeholder="VIDEO ĐÀO TẠO 01"></label></div></div></div>`;
}
function renderRows(){
  const box=document.getElementById("adminVideoRows");if(!box)return;
  box.innerHTML=currentVideos.map(rowHtml).join("");
  box.querySelectorAll("[data-video-remove]").forEach(button=>button.onclick=()=>{syncFromRows();const index=Number(button.dataset.videoRemove);currentVideos.splice(index,1);if(!currentVideos.length)currentVideos.push({url:"",title:"",label:"VIDEO ĐÀO TẠO 01"});renderRows()});
  box.querySelectorAll('input[name="url"]').forEach(input=>input.addEventListener("change",()=>{syncFromRows();renderRows()}));
}
async function loadVideos(){
  const config=await rpc("app_public_site_config",{});
  currentVideos=normalize(config?.video_library);
  if(!currentVideos.length){
    currentVideos=normalize([
      {url:config?.video_1_url,title:config?.video_1_title,label:"VIDEO ĐÀO TẠO 01"},
      {url:config?.video_2_url,title:config?.video_2_title,label:"VIDEO ĐÀO TẠO 02"}
    ]);
  }
  if(!currentVideos.length)currentVideos=[{url:"",title:"",label:"VIDEO ĐÀO TẠO 01"}];
  renderRows();
}
async function openEditor(){
  mountDialog();setStatus("Đang tải thư viện video…");document.getElementById("adminVideoLibraryDialog").showModal();
  try{await loadVideos();setStatus("")}catch(error){setStatus(error?.message||"Không tải được video.","error")}
}
async function saveVideos(event){
  event.preventDefault();syncFromRows();
  const valid=currentVideos.map((video,index)=>({...video,label:video.label||`VIDEO ĐÀO TẠO ${String(index+1).padStart(2,"0")}`})).filter(video=>youtubeId(video.url));
  if(!valid.length){setStatus("Cần ít nhất 1 link YouTube hợp lệ.","error");return}
  if(valid.some(video=>!video.title)){setStatus("Vui lòng nhập tiêu đề cho tất cả video.","error");return}
  const submit=event.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;setStatus("Đang lưu video…");
  try{
    const result=await rpc("app_admin_save_video_library",{p_token:token(),p_videos:valid});
    currentVideos=normalize(result?.video_library||valid);
    document.dispatchEvent(new CustomEvent("training-video-library-updated",{detail:{videos:currentVideos}}));
    setStatus("Đã lưu. Danh sách video trên trang đã được cập nhật.","success");
    setTimeout(()=>document.getElementById("adminVideoLibraryDialog")?.close(),700);
  }catch(error){setStatus(error?.message||"Không thể lưu video.","error")}finally{submit.disabled=false}
}
function addButton(){
  const section=getSection();if(!section||section.querySelector(".admin-video-library-open"))return false;
  const heading=section.querySelector(".training-video-heading");if(!heading)return false;
  const button=document.createElement("button");button.type="button";button.className="admin-video-library-open";button.innerHTML=`${pencilIcon()}<span>Chỉnh sửa / thêm video</span>`;button.onclick=openEditor;heading.append(button);section.classList.add("admin-video-editable");mounted=true;return true;
}
async function ensureAdmin(){
  if(mounted){addButton();return}
  const t=token();if(!t)return;
  try{const me=await rpc("app_me",{p_token:t});if(me?.role==="admin")addButton()}catch{}
}
const observer=new MutationObserver(()=>{if(!mounted)ensureAdmin();else addButton()});observer.observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener("training-video-library-rendered",()=>{if(mounted)addButton();else ensureAdmin()});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ensureAdmin,{once:true});else ensureAdmin();
