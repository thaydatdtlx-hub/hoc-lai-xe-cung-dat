import "./theory-hero-brand.css";

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
  normalizeDrivingRefreshBrand();
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initPublicBranding,{once:true});
else initPublicBranding();
window.addEventListener("pageshow",initPublicBranding);
