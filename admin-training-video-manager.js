import "./admin-training-video-manager.css";

const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
let videos=[];
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
  return (Array.isArray(items)?items:[]).slice(0,12).map((item,index)=>({
    url:String(item?.url||"").trim(),
    title:String(item?.title||`Video đào tạo ${index+1}`).trim(),
    label:String(item?.label||`VIDEO ĐÀO TẠO ${String(index+1).padStart(2,"0")}`).trim()
  })).filter(item=>youtubeId(item.url));
}
function currentFromDom(){
  return [...document.querySelectorAll(".training-video-card")].map((card,index)=>({
    url:card.querySelector('.training-video-info-actions a[target="_blank"]')?.href||"",
    title:card.querySelector("h3")?.textContent?.trim()||`Video đào tạo ${index+1}`,
    label:card.querySelector("small")?.textContent?.trim()||`VIDEO ĐÀO TẠO ${String(index+1).padStart(2,"0")}`
  })).filter(item=>youtubeId(item.url));
}
function pencil(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4M4 20l4-1"/></svg>'}
function setStatus(text,type=""){const el=document.getElementById("adminVideoManagerStatus");if(!el)return;el.className=`admin-video-manager__status ${type}`;el.textContent=text}
function renderRows(){
  const list=document.getElementById("adminVideoManagerList");if(!list)return;
  if(!videos.length){list.innerHTML='<div class="admin-video-manager__empty">Chưa có video. Nhấn “+ Thêm video” để bắt đầu.</div>';return}
  list.innerHTML=videos.map((video,index)=>`<article class="admin-video-item" data-video-row="${index}"><div class="admin-video-item__number">${String(index+1).padStart(2,"0")}</div><div class="admin-video-item__fields"><label>Link YouTube<input name="url" type="url" value="${escapeHtml(video.url)}" placeholder="https://youtu.be/..."></label><label>Tiêu đề<input name="title" value="${escapeHtml(video.title)}" maxlength="180"></label><label>Nhãn nhỏ<input name="label" value="${escapeHtml(video.label)}" maxlength="80"></label></div><div class="admin-video-item__actions"><button type="button" data-video-up title="Đưa lên">↑</button><button type="button" data-video-down title="Đưa xuống">↓</button><button type="button" class="danger" data-video-remove title="Xóa video">×</button></div></article>`).join("");
  list.querySelectorAll("[data-video-row]").forEach(row=>{
    const index=Number(row.dataset.videoRow);
    row.querySelectorAll("input").forEach(input=>input.addEventListener("input",()=>{videos[index][input.name]=input.value}));
    row.querySelector("[data-video-up]").onclick=()=>{if(index<1)return;[videos[index-1],videos[index]]=[videos[index],videos[index-1]];renderRows()};
    row.querySelector("[data-video-down]").onclick=()=>{if(index>=videos.length-1)return;[videos[index+1],videos[index]]=[videos[index],videos[index+1]];renderRows()};
    row.querySelector("[data-video-remove]").onclick=()=>{videos.splice(index,1);renderRows()};
  });
}
function mountDialog(){
  if(document.getElementById("adminVideoManagerDialog"))return;
  const dialog=document.createElement("dialog");dialog.id="adminVideoManagerDialog";dialog.className="admin-video-manager";
  dialog.innerHTML=`<form id="adminVideoManagerForm"><div class="admin-video-manager__head"><div><p>QUẢN TRỊ VIDEO ĐÀO TẠO</p><h2>Thư viện video</h2><span>Admin có thể thay link YouTube, đổi tiêu đề, thêm video mới, xóa video hoặc thay đổi thứ tự hiển thị.</span></div><button class="admin-video-manager__close" type="button" data-video-close aria-label="Đóng">×</button></div><div class="admin-video-manager__body"><div class="admin-video-manager__toolbar"><strong>Tối đa 12 video</strong><button class="admin-video-add" type="button" data-video-add>+ Thêm video</button></div><div id="adminVideoManagerList" class="admin-video-list"></div></div><p id="adminVideoManagerStatus" class="admin-video-manager__status"></p><div class="admin-video-manager__actions"><button type="button" data-video-close>Hủy</button><button class="primary" type="submit">Lưu video</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelectorAll("[data-video-close]").forEach(button=>button.onclick=()=>dialog.close());
  dialog.querySelector("[data-video-add]").onclick=()=>{
    if(videos.length>=12){setStatus("Tối đa 12 video.","error");return}
    videos.push({url:"",title:`Video đào tạo ${videos.length+1}`,label:`VIDEO ĐÀO TẠO ${String(videos.length+1).padStart(2,"0")}`});renderRows();
    dialog.querySelector(".admin-video-manager__body")?.scrollTo({top:99999,behavior:"smooth"});
  };
  dialog.querySelector("form").addEventListener("submit",saveVideos);
}
async function openManager(){
  mountDialog();setStatus("Đang tải danh sách video…");
  const dialog=document.getElementById("adminVideoManagerDialog");dialog.showModal();
  try{
    const config=await rpc("app_public_site_config",{});
    videos=normalize(config?.video_library);
    if(!videos.length)videos=currentFromDom();
    renderRows();setStatus("");
  }catch(error){videos=currentFromDom();renderRows();setStatus(error?.message||"Không tải được dữ liệu video.","error")}
}
async function saveVideos(event){
  event.preventDefault();
  const submit=event.currentTarget.querySelector('button[type="submit"]');
  const cleaned=[];
  for(let index=0;index<videos.length;index++){
    const item=videos[index],url=String(item.url||"").trim(),title=String(item.title||"").trim(),label=String(item.label||"").trim();
    if(!url&& !title && !label)continue;
    if(!youtubeId(url)){setStatus(`Video ${index+1}: link YouTube không hợp lệ.`,"error");return}
    cleaned.push({url,title:title||`Video đào tạo ${index+1}`,label:label||`VIDEO ĐÀO TẠO ${String(index+1).padStart(2,"0")}`});
  }
  if(!cleaned.length){setStatus("Cần giữ ít nhất 1 video.","error");return}
  submit.disabled=true;setStatus("Đang lưu video…");
  try{
    const result=await rpc("app_admin_save_video_library",{p_token:token(),p_videos:cleaned});
    videos=normalize(result?.video_library||cleaned);renderRows();
    document.dispatchEvent(new CustomEvent("training-video-library-updated",{detail:{videos}}));
    setStatus("Đã lưu. Danh sách video trên trang đã được cập nhật.","success");
    setTimeout(()=>document.getElementById("adminVideoManagerDialog")?.close(),700);
  }catch(error){setStatus(error?.message||"Không thể lưu video.","error")}finally{submit.disabled=false}
}
function addButton(){
  const section=document.querySelector(".training-video-section");if(!section||document.getElementById("adminVideoManageButton"))return;
  const button=document.createElement("button");button.id="adminVideoManageButton";button.type="button";button.className="admin-video-manage-button";button.innerHTML=`${pencil()}<span>Quản lý video</span>`;button.title="Admin: thay đổi hoặc thêm video";button.onclick=openManager;section.append(button);mounted=true;
}
async function ensureAdmin(){
  if(mounted){addButton();return}
  const t=token();if(!t)return;
  try{const me=await rpc("app_me",{p_token:t});if(me?.role==="admin")addButton()}catch{}
}
function boot(){ensureAdmin();document.addEventListener("training-video-library-rendered",ensureAdmin);let count=0;const timer=setInterval(()=>{ensureAdmin();if(mounted||++count>30)clearInterval(timer)},500)}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
