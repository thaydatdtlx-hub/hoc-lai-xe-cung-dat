import "./training-video-section.css";

const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";

const DEFAULT_VIDEOS=[
  {
    url:"https://youtu.be/eBx6gAFa9a8?si=Heckare8yAd4omLJ",
    label:"VIDEO ĐÀO TẠO 01",
    title:"Nội dung đào tạo thực tế cùng Thầy Đạt"
  },
  {
    url:"https://youtu.be/5YEjYy8a6NI?si=n49G52_z2fug3HDB",
    label:"VIDEO ĐÀO TẠO 02",
    title:"Xem thêm nội dung hướng dẫn học lái xe"
  }
];

function escapeHtml(value=""){
  return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function youtubeId(value=""){
  try{
    const url=new URL(value);
    const host=url.hostname.replace(/^www\./,"").replace(/^m\./,"");
    if(host==="youtu.be")return url.pathname.replace(/^\//,"").split("/")[0];
    if(host!=="youtube.com")return "";
    return url.searchParams.get("v")||url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]||"";
  }catch{return ""}
}
function normalizeVideo(video,index){
  const url=String(video?.url||"").trim();
  const id=youtubeId(url);
  if(!id)return null;
  return {
    id,
    url,
    label:String(video?.label||`VIDEO ĐÀO TẠO ${String(index+1).padStart(2,"0")}`).trim().slice(0,80),
    title:String(video?.title||`Video đào tạo ${index+1}`).trim().slice(0,180)
  };
}
function normalizeVideos(items){
  if(!Array.isArray(items))return [];
  return items.slice(0,12).map(normalizeVideo).filter(Boolean);
}
function legacyVideos(config={}){
  return normalizeVideos([
    {url:config.video_1_url,title:config.video_1_title,label:"VIDEO ĐÀO TẠO 01"},
    {url:config.video_2_url,title:config.video_2_title,label:"VIDEO ĐÀO TẠO 02"}
  ]);
}
function videoCard(video,index){
  const title=escapeHtml(video.title),label=escapeHtml(video.label),url=escapeHtml(video.url),id=encodeURIComponent(video.id);
  return `
    <article class="training-video-card" data-training-video-index="${index}">
      <div class="training-video-frame">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1"
          title="${title}"
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </div>
      <div class="training-video-info">
        <span>▶</span>
        <small>${label}</small>
        <h3>${title}</h3>
        <p>Học viên có thể xem trực tiếp trên website hoặc mở video trong YouTube để theo dõi toàn màn hình.</p>
        <ul>
          <li>Hiển thị tốt trên máy tính và điện thoại</li>
          <li>Không tự động phát âm thanh</li>
          <li>Có thể xem toàn màn hình</li>
          <li>Liên kết trực tiếp đến video gốc</li>
        </ul>
        <div class="training-video-info-actions">
          <a href="${url}" target="_blank" rel="noopener noreferrer">Mở video ${index+1} trên YouTube</a>
          <a class="training-video-register" href="#dang-ky">Đăng ký sau khi xem</a>
        </div>
      </div>
    </article>`;
}
function sectionHtml(videos){
  return `
    <div class="training-video-shell">
      <div class="training-video-heading">
        <div>
          <p>VIDEO ĐÀO TẠO THỰC TẾ</p>
          <h2>Xem trước nội dung học cùng Thầy Đạt</h2>
          <span>Các video giúp học viên hình dung rõ hơn về quá trình học, cách hướng dẫn và những nội dung cần chuẩn bị trước khi bắt đầu khóa đào tạo.</span>
        </div>
        <div class="training-video-heading-actions" data-training-video-heading-actions>
          ${videos.map((video,index)=>`<a href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">Video ${index+1} trên YouTube</a>`).join("")}
        </div>
      </div>
      <div class="training-video-list">${videos.map(videoCard).join("")}</div>
      <p class="training-video-note">Video được nhúng từ YouTube. Việc phát video phụ thuộc vào kết nối mạng và cài đặt quyền riêng tư của trình duyệt.</p>
    </div>`;
}
function ensureSection(){
  let section=document.querySelector(".training-video-section");
  if(section)return section;
  const target=document.querySelector(".training-map-section")||document.querySelector(".gallery-section")||document.querySelector(".registration-section");
  if(!target)return null;
  section=document.createElement("section");
  section.className="training-video-section";
  section.id="video-dao-tao";
  target.insertAdjacentElement("afterend",section);
  return section;
}
function renderTrainingVideos(videos,{dynamic=false}={}){
  const section=ensureSection();if(!section)return;
  const safeVideos=normalizeVideos(videos);
  if(!safeVideos.length)return;
  section.innerHTML=sectionHtml(safeVideos);
  section.dataset.videoLibrary=dynamic?"1":"0";
  document.dispatchEvent(new CustomEvent("training-video-library-rendered",{detail:{videos:safeVideos}}));
}
async function loadTrainingVideos(){
  renderTrainingVideos(DEFAULT_VIDEOS);
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_public_site_config`,{method:"POST",headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},body:"{}"});
    if(!response.ok)return;
    const config=await response.json();
    const library=normalizeVideos(config?.video_library);
    if(library.length){renderTrainingVideos(library,{dynamic:true});return}
    const legacy=legacyVideos(config);
    if(legacy.length)renderTrainingVideos(legacy);
  }catch{}
}

document.addEventListener("training-video-library-updated",event=>{
  const videos=normalizeVideos(event.detail?.videos);
  if(videos.length)renderTrainingVideos(videos,{dynamic:true});
});

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadTrainingVideos,{once:true});else loadTrainingVideos();
