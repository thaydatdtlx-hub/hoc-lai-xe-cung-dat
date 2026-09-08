// Đồng bộ tổng số câu lý thuyết theo hạng trên giao diện Admin.
// A1, A: 250 câu. Các hạng ô tô: 600 câu.

function normalizeLicense(value){
  return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g," ");
}

function questionTotalForLicense(value){
  const license=normalizeLicense(value);
  return license==="a1"||license==="a"?250:600;
}

function directText(element){
  if(!element)return"";
  return [...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent||"").join(" ").trim();
}

function setProgressTotal(element,total){
  if(!element)return;
  const text=element.textContent||"";
  const next=text.replace(/(\d+)\s*\/\s*(?:250|600)(\s*câu)?/giu,(_,answered,suffix)=>`${answered}/${total}${suffix||""}`);
  if(next!==text)element.textContent=next;
}

function patchStudentRows(){
  document.querySelectorAll("#studentRows tr").forEach(row=>{
    const licenseCell=row.cells?.[1];
    const license=directText(licenseCell)||licenseCell?.textContent?.trim()||"";
    const total=questionTotalForLicense(license);
    const progress=row.querySelector(".theory-table-progress");
    if(!progress)return;
    setProgressTotal(progress.querySelector("div:first-child strong"),total);
    progress.dataset.questionTotal=String(total);
  });
}

function licenseFromSummary(card){
  const meta=card.querySelector(".theory-summary-person small")?.textContent||"";
  const match=meta.match(/Hạng\s+(.+)$/iu);
  return match?.[1]?.trim()||"";
}

function patchTheorySummary(){
  document.querySelectorAll("#theorySummaryList .theory-summary-student").forEach(card=>{
    const total=questionTotalForLicense(licenseFromSummary(card));
    setProgressTotal(card.querySelector(".theory-summary-progress span:first-child b"),total);
    card.dataset.questionTotal=String(total);
  });
}

function licenseFromDetail(){
  const meta=document.getElementById("theoryDetailMeta")?.textContent||"";
  const parts=meta.split("·");
  return (parts.length>1?parts.at(-1):meta).trim();
}

function patchTheoryDetail(){
  const dialog=document.getElementById("theoryProgressDialog");
  if(!dialog)return;
  const total=questionTotalForLicense(licenseFromDetail());
  const kicker=dialog.querySelector(".dialog-kicker");
  if(kicker){
    const next=`LÝ THUYẾT ${total} CÂU`;
    if(kicker.textContent!==next)kicker.textContent=next;
  }
  const learnedArticle=document.querySelector("#theoryDetailMetrics article:first-child");
  const learned=learnedArticle?.querySelector("strong");
  if(!learned)return;
  const match=(learned.textContent||"").match(/(\d+)\s*\/\s*(?:250|600)/u);
  const answered=Number(match?.[1])||0;
  setProgressTotal(learned,total);
  const percent=learnedArticle.querySelector("span");
  if(percent){
    const next=`${Math.min(100,Math.round(answered/total*100))}% bộ câu hỏi`;
    if(percent.textContent!==next)percent.textContent=next;
  }
  dialog.dataset.questionTotal=String(total);
}

function patchMixedClassLabels(){
  const dashboardTitle=document.getElementById("theoryDashboardTitle");
  if(dashboardTitle&&dashboardTitle.textContent!=="Tiến độ học lý thuyết theo hạng")dashboardTitle.textContent="Tiến độ học lý thuyết theo hạng";

  document.querySelectorAll(".panel table thead th").forEach(th=>{
    if(/Học\s*600\s*câu/iu.test(th.textContent||""))th.textContent="Học lý thuyết";
  });

  const warningNotice=document.getElementById("warningDataNotice");
  if(warningNotice){
    const next=(warningNotice.textContent||"").replace(/tiến độ\s*600\s*câu/iu,"tiến độ lý thuyết");
    if(next!==warningNotice.textContent)warningNotice.textContent=next;
  }
}

function patchAll(){
  patchMixedClassLabels();
  patchStudentRows();
  patchTheorySummary();
  patchTheoryDetail();
}

let queued=false;
function queuePatch(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{
    queued=false;
    patchAll();
  });
}

function boot(){
  if(!document.getElementById("app"))return;
  patchAll();
  const observer=new MutationObserver(queuePatch);
  observer.observe(document.getElementById("app"),{subtree:true,childList:true,characterData:true});
  window.addEventListener("pageshow",queuePatch);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")queuePatch()});
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();

export {questionTotalForLicense};