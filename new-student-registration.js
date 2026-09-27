import "./registration-premium-v6.css";

document.body.classList.add("registration-premium-v6");
document.querySelectorAll('link[href*="new-student-registration.css"],link[href*="modern-footer.css"],link[href*="pwa-install.css"],link[href*="mobile-viewport-lock.css"]').forEach(node=>node.remove());

const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
const $=id=>document.getElementById(id);
const cards=[...document.querySelectorAll("[data-license-card]")];
const form=$("registrationForm"),submit=$("registrationSubmit"),error=$("registrationError");
const licenseInput=$("licenseClass");
const LICENSES=new Set(cards.map(card=>card.dataset.licenseCard).filter(Boolean));
let selectedLicense="B số tự động";
let userSelectedLicense=false;

function localIsoDate(date){
  const offset=date.getTimezoneOffset()*60000;
  return new Date(date.getTime()-offset).toISOString().slice(0,10);
}

function normalizeLicenseForStorage(value){
  return value;
}

function setLicense(value){
  const nextLicense=LICENSES.has(value)?value:"B số tự động";
  const storedLicense=normalizeLicenseForStorage(nextLicense);
  selectedLicense=nextLicense;

  // Keep both the live value and the HTML default in sync. This prevents
  // form.reset() or a late page enhancement from silently clearing the class.
  licenseInput.value=storedLicense;
  licenseInput.defaultValue=storedLicense;
  licenseInput.setAttribute("value",storedLicense);
  form.dataset.licenseClass=storedLicense;

  $("selectedLicenseSummary").textContent=nextLicense;
  $("selectedLicenseCard").textContent=nextLicense;
  $("formLicenseBadge").textContent=nextLicense;
  cards.forEach(card=>{
    const active=userSelectedLicense&&card.dataset.licenseCard===nextLicense;
    card.classList.toggle("active",active);
    card.classList.toggle("is-selected",active);
    card.setAttribute("aria-pressed",String(active));
    const state=card.querySelector("i");
    if(state)state.textContent=active?"Đã chọn":"Chọn hạng";
  });
  document.querySelectorAll("[data-price-card]").forEach(card=>{
    card.classList.toggle("is-selected",userSelectedLicense&&card.dataset.priceCard===nextLicense);
  });
  const select=document.getElementById("heroLicenseSelect");
  if(select&&select.value!==nextLicense)select.value=nextLicense;
}

function selectedLicenseForSubmit(){
  const activeCard=cards.find(card=>card.getAttribute("aria-pressed")==="true");
  const nextLicense=LICENSES.has(activeCard?.dataset.licenseCard)?activeCard.dataset.licenseCard:selectedLicense;
  setLicense(nextLicense);
  return licenseInput.value;
}

async function rpc(fn,body){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{
    method:"POST",
    headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||data?.details||"Không thể gửi đăng ký lúc này.");
  return data;
}

async function notifyTelegram(registration){
  if(!registration?.id)return;
  try{
    await fetch("/api/telegram-notify",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({registration}),
      keepalive:true
    });
  }catch{}
}


function premiumPriceCard(license,title,icon,description){
  return '<article class="v6-price-card" data-price-card="'+license+'">'+
    '<div class="v6-price-card__head"><span class="v6-price-card__icon">'+icon+'</span><div><strong>'+title+'</strong><small>'+description+'</small></div></div>'+
    '<div class="v6-price-box"><small>HỌC PHÍ ĐANG ÁP DỤNG</small><del data-price-old hidden></del><strong data-price-value>Đang tải…</strong></div>'+
    '<div class="v6-promo" data-promo hidden><i>◆</i><div><b data-promo-title></b><span data-promo-desc></span><strong data-promo-discount></strong></div></div>'+
    '<div class="v6-price-fees" data-fees></div>'+
    '<ul class="v6-price-included"><li>Lịch học linh hoạt</li><li>Hỗ trợ hồ sơ và thủ tục</li><li>Theo dõi tiến độ đào tạo</li></ul>'+
    '<div class="v6-price-total"><small>Tổng dự kiến theo dữ liệu hiện hành</small><strong data-total>Đang tải…</strong></div>'+
    '<button type="button" data-price-register><span>Đăng ký tư vấn '+title+'</span><b>→</b></button></article>';
}

function preparePremiumLayout(){
  const brand=document.querySelector(".site-header .brand");
  if(brand){
    const strong=brand.querySelector("strong"),small=brand.querySelector("small");
    if(strong)strong.textContent="HỌC LÁI XE CÙNG ĐẠT";
    if(small)small.textContent="Vững tay lái · An toàn tương lai";
  }

  const hero=document.querySelector(".hero");
  if(hero){
    const eyebrow=hero.querySelector(".eyebrow");
    const h1=hero.querySelector("h1");
    const text=hero.querySelector(".hero-text");
    if(eyebrow)eyebrow.textContent="TRUNG TÂM ĐÀO TẠO LÁI XE UY TÍN";
    if(h1)h1.innerHTML='HỌC LÁI XE <span>CÙNG ĐẠT</span>';
    if(text)text.textContent="Đào tạo bài bản · Lịch học linh hoạt · Đồng hành xuyên suốt lộ trình.";
  }

  const heroCard=document.querySelector(".hero-form-card");
  const registrationForm=document.getElementById("registrationForm");
  const selectedCard=document.getElementById("selectedLicenseCard");
  if(heroCard&&registrationForm){
    if(selectedCard){selectedCard.hidden=true;registrationForm.append(selectedCard)}
    heroCard.replaceChildren(registrationForm);
    const heading=registrationForm.querySelector(".form-heading");
    if(heading){
      const p=heading.querySelector("p"),h3=heading.querySelector("h3");
      if(p)p.textContent="ĐĂNG KÝ NGAY";
      if(h3)h3.textContent="Nhận tư vấn khóa học phù hợp";
    }
  }

  [".intro-section",".stats-section",".schedule-section",".training-map-section",".gallery-section",".faq-section",".cta-section"].forEach(selector=>document.querySelector(selector)?.remove());
  const registrationSection=document.querySelector(".registration-section");
  if(registrationSection)registrationSection.remove();

  const quick=document.querySelector(".quick-features");
  if(quick){
    const content=[
      ["◆","UY TÍN - MINH BẠCH","Thông tin rõ ràng, dễ theo dõi"],
      ["♟","GIÁO VIÊN KINH NGHIỆM","Tận tâm, nhiệt tình, dễ hiểu"],
      ["▦","LỊCH HỌC LINH HOẠT","Sáng, chiều, tối, cuối tuần"],
      ["🚗","XE TẬP LÁI ĐỜI MỚI","Trang thiết bị hiện đại, an toàn"]
    ];
    [...quick.querySelectorAll("article")].forEach((article,i)=>{
      if(!content[i])return;
      const icon=article.querySelector(":scope>span"),strong=article.querySelector("strong"),small=article.querySelector("small");
      if(icon)icon.textContent=content[i][0];
      if(strong)strong.textContent=content[i][1];
      if(small)small.textContent=content[i][2];
    });
  }

  const course=document.querySelector(".course-section");
  if(course){
    course.id="khoa-hoc";
    const kicker=course.querySelector(".section-kicker"),title=course.querySelector(".section-heading h2"),desc=course.querySelector(".section-heading>span");
    if(kicker)kicker.textContent="KHÓA HỌC LÁI XE";
    if(title)title.textContent="Các hạng bằng đào tạo tại Học lái xe cùng Đạt";
    if(desc)desc.textContent="Chọn hạng phù hợp với nhu cầu. Khi chưa chọn, 5 thẻ hiển thị đồng đều.";
  }

  if(course&&!document.getElementById("hoc-phi")){
    const section=document.createElement("section");
    section.id="hoc-phi";
    section.className="v6-section v6-tuition";
    section.innerHTML='<div class="v6-shell"><div class="v6-heading"><span class="v6-tuition__label">🎓 HỌC PHÍ & CÁC KHOẢN NỘP RIÊNG</span><h2>Bảng học phí theo từng hạng đào tạo</h2><p>Dữ liệu học phí và ưu đãi được đọc trực tiếp từ hệ thống quản trị.</p></div><div class="v6-tuition__note"><b>!</b><span><strong>Lưu ý:</strong> Các khoản lệ phí nộp riêng được thông báo rõ nếu phát sinh.</span></div><div class="v6-price-grid">'+
      premiumPriceCard("A1","HẠNG A1","🛵","Lái xe mô tô hạng A1")+
      premiumPriceCard("A","HẠNG A","🏍️","Lái xe mô tô hạng A")+
      premiumPriceCard("B số sàn","B SỐ SÀN","🚙","Thời gian dự kiến 2,5–3 tháng")+
      premiumPriceCard("B số tự động","B SỐ TỰ ĐỘNG","🚗","Thời gian dự kiến 2,5–3 tháng")+
      premiumPriceCard("C1","HẠNG C1","🚚","Thời gian dự kiến 3,5–4 tháng")+
      '</div></div>';
    course.insertAdjacentElement("afterend",section);
  }

  const process=document.querySelector(".process-section");
  if(process){
    process.id="quy-trinh";
    const kicker=process.querySelector(".section-kicker"),title=process.querySelector(".section-heading h2"),grid=process.querySelector(".process-grid");
    if(kicker)kicker.textContent="QUY TRÌNH HỌC LÁI XE";
    if(title)title.textContent="Đăng ký đơn giản · Học rõ ràng · Thi thuận tiện";
    if(grid)grid.innerHTML='<article><b>01</b><div><strong>Đăng ký tư vấn</strong><p>Điền thông tin hoặc gọi hotline</p></div></article><article><b>02</b><div><strong>Hoàn thiện hồ sơ</strong><p>Được hướng dẫn chuẩn bị giấy tờ</p></div></article><article><b>03</b><div><strong>Tham gia khóa học</strong><p>Học lý thuyết và thực hành</p></div></article><article><b>04</b><div><strong>Thi sát hạch</strong><p>Được hỗ trợ lịch và hướng dẫn</p></div></article><article><b>05</b><div><strong>Nhận bằng lái xe</strong><p>Hoàn thành lộ trình đào tạo</p></div></article>';
  }

  const header=document.querySelector(".site-header");
  const nav=header?.querySelector("nav");
  if(header&&nav&&!document.getElementById("premiumMenuButton")){
    const button=document.createElement("button");
    button.id="premiumMenuButton";
    button.type="button";
    button.className="v6-menu-button";
    button.textContent="☰";
    button.setAttribute("aria-label","Mở menu");
    header.append(button);
    button.addEventListener("click",()=>nav.classList.toggle("is-open"));
    nav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>nav.classList.remove("is-open")));
  }

  const mobile=document.querySelector(".mobile-bar");
  if(mobile)mobile.classList.add("v6-mobile-existing");

  document.body.classList.add("v6-ready");
}

preparePremiumLayout();

async function loadPremiumTestimonials(){
  try{
    const response=await fetch("/api/student-testimonials",{cache:"no-store"});
    const data=await response.json();
    const images=Array.isArray(data?.images)?data.images:[];
    if(!response.ok||!images.length)return;
    const section=document.createElement("section");
    section.className="v6-testimonials";
    section.innerHTML='<div class="v6-shell"><div class="v6-heading"><p class="v6-kicker">HỌC VIÊN NÓI GÌ VỀ CHÚNG TÔI</p><h2>Cảm nhận từ học viên</h2></div><div class="v6-testimonial-grid">'+images.slice(0,8).map((item,index)=>'<article class="v6-testimonial-card"><img loading="lazy" decoding="async" src="'+item.imageUrl+'" alt="Nhận xét học viên '+(index+1)+'"></article>').join("")+'</div></div>';
    document.querySelector(".pro-footer")?.insertAdjacentElement("beforebegin",section);
  }catch{}
}
loadPremiumTestimonials();

cards.forEach(card=>card.addEventListener("click",()=>{userSelectedLicense=true;setLicense(card.dataset.licenseCard);}));
document.getElementById("heroLicenseSelect")?.addEventListener("change",event=>{userSelectedLicense=true;setLicense(event.target.value);});
document.querySelectorAll("[data-price-card]").forEach(card=>card.addEventListener("click",event=>{userSelectedLicense=true;setLicense(card.dataset.priceCard);if(event.target.closest("[data-price-register]"))document.getElementById("registrationForm")?.scrollIntoView({behavior:"smooth",block:"start"});}));
document.querySelectorAll("[data-scroll-form]").forEach(button=>button.addEventListener("click",()=>$("registrationForm").scrollIntoView({behavior:"smooth",block:"start"})));
document.querySelectorAll("[data-scroll-license]").forEach(button=>button.addEventListener("click",()=>$("hang-bang").scrollIntoView({behavior:"smooth",block:"start"})));

const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
$("preferredStartDate").min=localIsoDate(tomorrow);
setLicense("B số tự động");


function money(value){return new Intl.NumberFormat("vi-VN").format(Number(value)||0)+" VNĐ"}
function promotionActive(item){
  if(!(Number(item?.discount_amount)>0||item?.promotion_title||item?.promotion_description))return false;
  if(!item?.promotion_end)return true;
  const end=new Date(String(item.promotion_end)+"T23:59:59");
  return !Number.isNaN(end.valueOf())&&end.valueOf()>=Date.now();
}
function normalizedFees(value){
  if(!Array.isArray(value))return [];
  return value.map(item=>Array.isArray(item)?[String(item[0]||"Khoản phí"),Number(item[1])||0]:[String(item?.name||"Khoản phí"),Number(item?.value)||0]);
}
async function loadTuitionCards(){
  try{
    const config=await rpc("app_public_tuition_config",{});
    const rows=Array.isArray(config)?config.filter(item=>item?.active!==false):[];
    ["A1","A","B số sàn","B số tự động","C1"].forEach(license=>{
      const item=rows.find(row=>row?.license_class===license);
      const card=document.querySelector('[data-price-card="'+CSS.escape(license)+'"]');
      if(!card)return;
      const price=card.querySelector("[data-price-value]");
      const old=card.querySelector("[data-price-old]");
      const promo=card.querySelector("[data-promo]");
      const fees=card.querySelector("[data-fees]");
      const total=card.querySelector("[data-total]");
      if(!item){price.textContent="Liên hệ tư vấn";total.textContent="Liên hệ tư vấn";old.hidden=true;promo.hidden=true;fees.innerHTML="";return}
      const tuition=Number(item.tuition)||0;
      const discount=promotionActive(item)?Math.min(Number(item.discount_amount)||0,tuition):0;
      const final=Math.max(0,tuition-discount);
      const feeRows=normalizedFees(item.fees);
      price.textContent=tuition?money(final):"Liên hệ tư vấn";
      if(discount){old.textContent=money(tuition);old.hidden=false}else old.hidden=true;
      if(promotionActive(item)){
        promo.hidden=false;
        promo.querySelector("[data-promo-title]").textContent=item.promotion_title||"Ưu đãi hiện tại";
        promo.querySelector("[data-promo-desc]").textContent=item.promotion_description||"";
        promo.querySelector("[data-promo-discount]").textContent=discount?"Giảm "+money(discount):"";
      }else promo.hidden=true;
      fees.innerHTML=feeRows.map(row=>'<div><span>'+row[0]+'</span><b>'+money(row[1])+'</b></div>').join("");
      total.textContent=tuition?money(final+feeRows.reduce((sum,row)=>sum+(Number(row[1])||0),0)):"Liên hệ tư vấn";
    });
  }catch{}
}
loadTuitionCards();

form.addEventListener("submit",async event=>{
  event.preventDefault();
  error.textContent="";
  if(!form.reportValidity())return;
  if(!$("consent").checked){error.textContent="Vui lòng đồng ý để Thầy Đạt liên hệ tư vấn.";return}

  submit.disabled=true;
  submit.querySelector("span").textContent="Đang gửi đăng ký…";
  try{
    const source=sessionStorage.getItem("new_student_source")||"Truy cập trực tiếp";
    const originalNote=$("note").value.trim();
    const trackedNote=[originalNote,`Nguồn đăng ký: ${source}`].filter(Boolean).join("\n").slice(0,800);
    const payload={
      full_name:$("fullName").value.trim(),
      phone:$("phone").value.trim(),
      license_class:selectedLicenseForSubmit(),
      date_of_birth:$("dateOfBirth").value||null,
      area:$("area").value.trim(),
      preferred_start_date:$("preferredStartDate").value||null,
      preferred_contact_time:$("preferredContactTime").value,
      consultation_channel:$("consultationChannel").value,
      learning_history:$("learningHistory").value,
      note:trackedNote,
      consent:true,
      website:$("website").value
    };
    const result=await rpc("app_create_new_student_registration",{p_data:payload});
    notifyTelegram({
      id:result?.id,
      registration_code:result?.registration_code,
      full_name:payload.full_name,
      phone:payload.phone,
      license_class:payload.license_class,
      area:payload.area,
      preferred_start_date:payload.preferred_start_date,
      preferred_contact_time:payload.preferred_contact_time,
      consultation_channel:payload.consultation_channel,
      note:payload.note
    });
    $("successLicense").textContent=selectedLicense;
    $("successCode").textContent=result?.registration_code||"Đã ghi nhận";
    $("registrationFields").hidden=true;
    $("registrationSuccess").hidden=false;
    $("registrationSuccess").scrollIntoView({behavior:"smooth",block:"center"});
  }catch(reason){
    const message=String(reason?.message||"");
    error.innerHTML=/app_create_new_student_registration|schema cache|PGRST202|Could not find/i.test(message)
      ?'Tính năng nhận đăng ký đang được kích hoạt. Vui lòng <a href="https://zalo.me/0984811037" target="_blank" rel="noopener noreferrer">gửi thông tin qua Zalo</a> để được hỗ trợ ngay.'
      :message||"Chưa thể gửi đăng ký. Vui lòng kiểm tra kết nối và thử lại.";
  }finally{
    submit.disabled=false;
    submit.querySelector("span").textContent="Gửi đăng ký học lái xe";
  }
});

$("newRegistration").addEventListener("click",()=>{
  form.reset();
  userSelectedLicense=false;
  setLicense("B số tự động");
  $("preferredStartDate").min=localIsoDate(tomorrow);
  $("registrationSuccess").hidden=true;
  $("registrationFields").hidden=false;
  error.textContent="";
  $("fullName").focus();
});