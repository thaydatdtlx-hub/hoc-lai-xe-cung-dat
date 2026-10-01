import "./tuition-details.css";

const tuitionAnchor=document.querySelector(".course-section")||document.querySelector(".training-detail-section")||document.querySelector(".license-info-section");
const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
const money=value=>new Intl.NumberFormat("vi-VN").format(Number(value)||0)+" VNĐ";

const basePlans=[
  {license:"A1",badge:"XE MÔ TÔ HẠNG A1",title:"Hạng A1",description:"Lịch học và học phí được xác nhận khi tư vấn",tuition:0,fees:[],included:["Hướng dẫn hồ sơ ghi danh","Ôn tập lý thuyết theo kế hoạch","Hướng dẫn kỹ năng thực hành trong hình","Theo dõi lịch học và lịch sát hạch"]},
  {license:"A",badge:"XE MÔ TÔ HẠNG A",title:"Hạng A",description:"Lịch học và học phí được xác nhận khi tư vấn",tuition:0,fees:[],included:["Hướng dẫn hồ sơ ghi danh","Ôn tập lý thuyết theo kế hoạch","Hướng dẫn kỹ năng thực hành trong hình","Theo dõi lịch học và lịch sát hạch"]},
  {license:"B số tự động",badge:"Ô TÔ HẠNG B",title:"B số tự động",description:"Thời gian đào tạo dự kiến 2,5–3 tháng",tuition:22000000,fees:[],included:["Hồ sơ và thủ tục ghi danh","Học lý thuyết theo kế hoạch khóa","Thực hành, nhiên liệu, giáo viên và sân tập","Cabin điện tử theo chương trình hiện hành","DAT và quãng đường đào tạo theo quy định"]},
  {license:"B số sàn",badge:"Ô TÔ HẠNG B",title:"B số sàn",description:"Thời gian đào tạo dự kiến 2,5–3 tháng",tuition:22000000,fees:[],included:["Hồ sơ và thủ tục ghi danh","Học lý thuyết theo kế hoạch khóa","Thực hành, nhiên liệu, giáo viên và sân tập","Cabin điện tử theo chương trình hiện hành","DAT và quãng đường đào tạo theo quy định"]},
  {license:"C1",badge:"Ô TÔ HẠNG C1",title:"Hạng C1",description:"Thời gian đào tạo dự kiến 3,5–4 tháng",tuition:25000000,fees:[],included:["Hồ sơ và thủ tục ghi danh","Học lý thuyết theo kế hoạch khóa","Thực hành xe tải, nhiên liệu, giáo viên và sân tập","Cabin điện tử theo chương trình hiện hành","DAT và quãng đường đào tạo theo quy định","Theo dõi tiến độ học và lịch thi trên hệ thống"]}
];

function promotionActive(item){
  if(!(Number(item.discount_amount)>0||item.promotion_title||item.promotion_description))return false;
  if(!item.promotion_end)return true;
  const end=new Date(`${item.promotion_end}T23:59:59`);
  return !Number.isNaN(end.valueOf())&&end.valueOf()>=Date.now();
}

function normalizedFees(value,fallback){
  if(!Array.isArray(value))return fallback;
  return value.map(item=>Array.isArray(item)?[String(item[0]||"Khoản phí"),Number(item[1])||0]:[String(item?.name||"Khoản phí"),Number(item?.value)||0]);
}

function mergeConfig(config=[]){
  return basePlans.map(base=>{
    const saved=config.find(item=>item?.license_class===base.license&&item?.active!==false);
    if(!saved)return {...base,promotion_title:"",promotion_description:"",discount_amount:0,promotion_end:null};
    return {...base,tuition:Number(saved.tuition)||0,fees:normalizedFees(saved.fees,base.fees),promotion_title:saved.promotion_title||"",promotion_description:saved.promotion_description||"",discount_amount:Number(saved.discount_amount)||0,promotion_end:saved.promotion_end||null};
  });
}

async function loadPublicConfig(){
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_public_tuition_config`,{method:"POST",headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},body:"{}"});
    if(!response.ok)throw new Error("tuition config unavailable");
    const data=await response.json();
    return Array.isArray(data)?data:[];
  }catch{return []}
}

function total(plan,tuitionValue=plan.tuition){return tuitionValue+plan.fees.reduce((sum,item)=>sum+(Number(item[1])||0),0)}
function dateLabel(value){
  if(!value)return"";
  const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:value;
}

function visualIcon(license){
  const icons={
    "A1":"🛵",
    "A":"🏍️",
    "B số sàn":"🚙",
    "B số tự động":"🚗",
    "C1":"🚚"
  };
  return icons[license]||"🚘";
}

function card(plan,index){
  const hasSeparateFees=plan.fees.length>0;
  const hasQuotedTuition=Number(plan.tuition)>0;
  const promo=promotionActive(plan);
  const discount=promo?Math.min(Number(plan.discount_amount)||0,Number(plan.tuition)||0):0;
  const finalTuition=Math.max(0,(Number(plan.tuition)||0)-discount);
  const finalTotal=hasQuotedTuition?total(plan,finalTuition):0;
  const priceLabel=discount?"Học phí ưu đãi":"Học phí khóa học";
  const priceValue=hasQuotedTuition?money(finalTuition):"Liên hệ tư vấn";
  const feeRows=hasSeparateFees?plan.fees.map(([name,value])=>`<div class="tuition-fee-row"><span>${name}</span><b>${money(value)}</b></div>`).join(""):"";
  const promoHtml=promo?`<div class="tuition-promotion"><div class="tuition-promotion__icon">◆</div><div><b>${plan.promotion_title||"Ưu đãi hiện tại"}</b>${plan.promotion_description?`<span>${plan.promotion_description}</span>`:""}${discount?`<strong>Giảm ${money(discount)}</strong>`:""}${plan.promotion_end?`<small>Áp dụng đến ${dateLabel(plan.promotion_end)}</small>`:""}</div></div>`:"";
  const totalHtml=hasSeparateFees?`<div class="tuition-summary"><span>Tổng dự kiến${discount?' sau ưu đãi':''}</span><strong>${hasQuotedTuition?money(finalTotal):"Liên hệ tư vấn"}</strong></div>`:`<div class="tuition-summary tuition-summary--simple"><span>Học phí khóa đào tạo</span><strong>${priceValue}</strong></div>`;
  return `<article class="tuition-card${promo?' has-promotion':''}" data-tuition-card="${plan.license}">
    <div class="tuition-card__header">
      <div class="tuition-card__identity">
        <span class="tuition-card__icon" aria-hidden="true">${visualIcon(plan.license)}</span>
        <div><span class="tuition-card__badge">${plan.badge}</span><h3>${plan.title}</h3><p>${plan.description}</p></div>
      </div>
      <span class="tuition-card__selected">Đang chọn</span>
    </div>
    <div class="tuition-card__body">
      <div class="tuition-price-panel"><small>${priceLabel}</small>${discount?`<del>${money(plan.tuition)}</del>`:""}<strong>${priceValue}</strong></div>
      ${promoHtml}
      ${feeRows?`<div class="tuition-fees">${feeRows}</div>`:""}
      ${totalHtml}
      <ul class="tuition-included">${plan.included.map(item=>`<li>${item}</li>`).join("")}</ul>
      <button type="button" data-tuition-license="${plan.license}"><span>Đăng ký tư vấn ${plan.title}</span><b>→</b></button>
    </div>
  </article>`;
}

function selectTuitionCard(section,license){
  section.querySelectorAll("[data-tuition-card]").forEach(card=>{
    card.classList.toggle("is-selected",card.dataset.tuitionCard===license);
  });
}

function bindButtons(section){
  section.querySelectorAll("[data-tuition-card]").forEach(card=>card.addEventListener("click",event=>{
    if(event.target.closest("[data-tuition-license]"))return;
    selectTuitionCard(section,card.dataset.tuitionCard);
  }));

  section.querySelectorAll("[data-tuition-license]").forEach(button=>button.addEventListener("click",()=>{
    selectTuitionCard(section,button.dataset.tuitionLicense);
    document.querySelector(`[data-license-card="${CSS.escape(button.dataset.tuitionLicense)}"]`)?.click();
    document.getElementById("registrationForm")?.scrollIntoView({behavior:"smooth",block:"start"});
  }));

  document.querySelectorAll("[data-license-card]").forEach(card=>card.addEventListener("click",()=>{
    selectTuitionCard(section,card.dataset.licenseCard);
  }));
}

async function mountTuition(){
  if(!tuitionAnchor||document.getElementById("hoc-phi-tu-van"))return;
  document.documentElement.dataset.tuitionDetails="loading";
  const config=await loadPublicConfig();
  const plans=mergeConfig(config);
  const section=document.createElement("section");
  section.id="hoc-phi-tu-van";
  section.className="site-upgrade-section site-pricing tuition-section";
  section.innerHTML=`<div class="tuition-shell">
    <div class="tuition-heading"><p>HỌC PHÍ & CÁC KHOẢN NỘP RIÊNG</p><h2>Bảng học phí theo từng hạng đào tạo</h2><span>Học phí và ưu đãi được cập nhật từ hệ thống quản trị Thầy Đạt. Các khoản nộp riêng được trình bày tách biệt để học viên dễ theo dõi.</span></div>
    <div class="tuition-alert"><b>!</b><span><strong>Lưu ý:</strong> Lệ phí khám sức khỏe (nếu áp dụng), sát hạch, cấp giấy phép, thi lại và tập xe cảm biến được thông báo riêng nếu phát sinh. Học phí áp dụng được xác nhận lại khi tư vấn.</span></div>
    <div class="tuition-grid">${plans.map(card).join("")}</div>
  </div>`;
  tuitionAnchor.insertAdjacentElement("afterend",section);
  bindButtons(section);
  const activeLicense=document.querySelector("[data-license-card].active")?.dataset.licenseCard;
  if(activeLicense)selectTuitionCard(section,activeLicense);
  document.documentElement.dataset.tuitionDetails="ready";
}

mountTuition();
