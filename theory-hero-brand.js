import "./theory-hero-brand.css";
import "./driving-refresh-skills-image.css";

const PUBLIC_BRAND="Học Lái Xe Cùng Đạt";

function ensureTheoryHeroPolish(){
  if(document.querySelector('link[data-theory-hero-polish-v2]'))return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href="/theory-hero-polish-v2.css?v=20260902-1";
  link.dataset.theoryHeroPolishV2="1";
  document.head.append(link);
}

function enhanceTheoryHero(){
  if(location.pathname!=="/600-cau-hoi.html")return;
  ensureTheoryHeroPolish();
  const hero=document.querySelector(".study-hero");
  const copy=hero?.querySelector(".hero-copy");
  const visual=hero?.querySelector(".hero-visual");
  const title=copy?.querySelector("h1");
  if(!hero||!copy||!visual||!title||hero.dataset.brandRefresh==="1")return;

  hero.dataset.brandRefresh="1";
  hero.classList.add("theory-brand-hero");

  const brand=document.createElement("div");
  brand.className="theory-hero-brandline";
  brand.innerHTML=`
    <img src="/logo-thay-dat-compact.webp?v=15" alt="Học lái xe cùng Đạt">
    <div><strong>Học lái xe</strong><span>cùng <b>Đạt</b></span></div>
    <i></i>`;
  copy.prepend(brand);

  title.innerHTML=`<span class="theory-title-blue"><b>600</b> câu hỏi</span><span class="theory-title-green">sát hạch lái xe</span>`;

  visual.innerHTML=`
    <div class="theory-visual-brand"><img src="/logo-thay-dat-compact.webp?v=15" alt=""></div>
    <div class="theory-round-sign"><strong>600</strong><small>CÂU HỎI</small></div>
    <div class="theory-pass-dot">✓</div>
    <div class="theory-license-card"><strong>A1&nbsp;&nbsp;A&nbsp;&nbsp;B&nbsp;&nbsp;C1</strong><span>✓</span><i></i><span>✓</span><i></i><span>✓</span><i></i></div>
    <div class="theory-road-label">TẬP LÁI</div>`;
}

function replaceBrandText(value=""){
  return String(value).replace(/Thầy Đạt|THẦY ĐẠT/g,PUBLIC_BRAND);
}

function normalizeBrandNode(root){
  if(!root)return;
  if(root.nodeType===Node.TEXT_NODE){
    if(root.parentElement?.matches("script,style,noscript"))return;
    const next=replaceBrandText(root.nodeValue||"");
    if(next!==root.nodeValue)root.nodeValue=next;
    return;
  }
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
  if(root.nodeType===Node.ELEMENT_NODE){
    for(const attribute of ["aria-label","alt","title"]){
      if(root.hasAttribute?.(attribute)){
        const current=root.getAttribute(attribute)||"";
        const next=replaceBrandText(current);
        if(next!==current)root.setAttribute(attribute,next);
      }
    }
  }
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(node.parentElement?.matches("script,style,noscript"))continue;
    const current=node.nodeValue||"";
    const next=replaceBrandText(current);
    if(next!==current)node.nodeValue=next;
  }
}

function ensureDrivingRefreshSkillsStyle(){
  // CSS is bundled through the import above so the deployed Vite build always includes it.
}

function drivingRefreshSkillsMarkup(){
  return `<section id="noi-dung" class="refresh-skills-image" aria-labelledby="skillsTitle">
    <div class="refresh-skills-image__inner">
      <div class="refresh-skills-image__left">
        <p class="refresh-skills-image__eyebrow">NỘI DUNG THỰC HÀNH</p>
        <h2 id="skillsTitle">Bạn muốn tự tin hơn ở kỹ năng nào?</h2>
        <p class="refresh-skills-image__desc">Chọn trong biểu mẫu để Học Lái Xe Cùng Đạt chuẩn bị buổi luyện phù hợp.</p>
        <div class="refresh-skills-image__signature"><span>Tự tin cầm lái</span><strong>vững vàng tương lai</strong></div>
        <div class="refresh-skills-image__wheel" aria-hidden="true"></div>
        <div class="refresh-skills-image__road" aria-hidden="true"></div>
      </div>
      <div class="refresh-skills-image__right">
        <article class="refresh-skill-image-card">
          <div class="refresh-skill-image-card__icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"/><path d="M5 18l2-8h10l2 8"/><path d="M9 14h6"/></svg></div>
          <div class="refresh-skill-image-card__content"><h3>Làm quen &amp; kiểm soát xe</h3><p>Vô lăng, chân ga, chân phanh và cảm nhận kích thước xe.</p></div><span class="refresh-skill-image-card__arrow">›</span>
        </article>
        <article class="refresh-skill-image-card">
          <div class="refresh-skill-image-card__icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4h6v16"/><path d="M14 20V8h6v12"/><path d="M2 20h20"/><path d="M7 8h.01M7 12h.01M17 12h.01M17 16h.01"/></svg></div>
          <div class="refresh-skill-image-card__content"><h3>Lái xe trong đô thị</h3><p>Chuyển làn, qua giao lộ và giữ khoảng cách trong đường đông.</p></div><span class="refresh-skill-image-card__arrow">›</span>
        </article>
        <article class="refresh-skill-image-card">
          <div class="refresh-skill-image-card__icon gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h10M8 11h8M6 19v2M18 19v2"/></svg></div>
          <div class="refresh-skill-image-card__content"><h3>Ghép xe &amp; đỗ xe</h3><p>Ghép dọc, ghép ngang, lùi chuồng và căn khoảng cách an toàn.</p></div><span class="refresh-skill-image-card__arrow">›</span>
        </article>
        <article class="refresh-skill-image-card">
          <div class="refresh-skill-image-card__icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 9 4h6l5 16"/><path d="M8 13h8M10 8h4"/></svg></div>
          <div class="refresh-skill-image-card__content"><h3>Đường trường</h3><p>Kiểm soát tốc độ, vượt xe, chuyển hướng và xử lý đường dài.</p></div><span class="refresh-skill-image-card__arrow">›</span>
        </article>
      </div>
    </div>
    <div class="refresh-skills-image__footer">
      <div class="refresh-skills-image__footer-left"><span class="refresh-skills-image__footer-icon">→</span><div><small>BƯỚC TIẾP THEO</small><strong>Chọn loại xe và số giờ muốn học</strong></div></div>
      <button type="button" class="refresh-skills-image__cta" data-skills-next>TÍNH CHI PHÍ <span>→</span></button>
    </div>
  </section>`;
}

function replaceDrivingRefreshSkills(){
  if(location.pathname!=="/bo-tuc-tay-lai.html")return;
  ensureDrivingRefreshSkillsStyle();
  const current=document.getElementById("noi-dung");
  if(!current)return;
  if(current.classList.contains("refresh-skills-image"))return;

  const oldNext=current.nextElementSibling;
  const template=document.createElement("template");
  template.innerHTML=drivingRefreshSkillsMarkup().trim();
  const replacement=template.content.firstElementChild;
  current.replaceWith(replacement);
  if(oldNext?.matches(".refresh-view-actions.refresh-view-actions-dark"))oldNext.remove();

  replacement.querySelector("[data-skills-next]")?.addEventListener("click",()=>{
    document.querySelector('[data-refresh-step="2"]')?.click();
  });
}

let drivingRefreshBrandObserver=null;
function normalizeDrivingRefreshBrand(){
  if(location.pathname!=="/bo-tuc-tay-lai.html")return;

  document.title=replaceBrandText(document.title);
  document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').forEach(meta=>{
    const current=meta.getAttribute("content")||"";
    const next=replaceBrandText(current);
    if(next!==current)meta.setAttribute("content",next);
  });
  normalizeBrandNode(document.body);

  if(drivingRefreshBrandObserver||!document.body)return;
  drivingRefreshBrandObserver=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type==="characterData")normalizeBrandNode(mutation.target);
      mutation.addedNodes?.forEach(normalizeBrandNode);
    }
  });
  drivingRefreshBrandObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
}

function initPublicBranding(){
  enhanceTheoryHero();
  replaceDrivingRefreshSkills();
  normalizeDrivingRefreshBrand();
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initPublicBranding,{once:true});
else initPublicBranding();
window.addEventListener("pageshow",initPublicBranding);
