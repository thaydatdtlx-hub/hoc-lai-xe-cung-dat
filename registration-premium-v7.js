const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
const LICENSES=["A1","A","B số sàn","B số tự động","C1"];
const $=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat("vi-VN").format(Number(value)||0)+" VNĐ";
let selectedLicense="B số tự động";
let userSelected=false;

function localIsoDate(date){
  const offset=date.getTimezoneOffset()*60000;
  return new Date(date.getTime()-offset).toISOString().slice(0,10);
}
function captureSource(){
  const params=new URLSearchParams(location.search);
  const source=params.get("utm_source")||params.get("source")||document.referrer||"Truy cập trực tiếp";
  sessionStorage.setItem("new_student_source",String(source).slice(0,180));
}
async function rpc(fn,body){
  const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+fn,{
    method:"POST",
    headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify(body),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||data?.details||"Không thể xử lý yêu cầu lúc này.");
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
function dateLabel(value){
  if(!value)return"";
  const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?match[3]+"/"+match[2]+"/"+match[1]:value;
}
function setLicense(license,{scroll=false}={}){
  if(!LICENSES.includes(license))return;
  selectedLicense=license;
  $("licenseClass").value=license;
  document.querySelectorAll("[data-license-card]").forEach(card=>{
    const active=userSelected&&card.dataset.licenseCard===license;
    card.classList.toggle("is-selected",active);
    card.setAttribute("aria-pressed",String(active));
  });
  document.querySelectorAll("[data-price-card]").forEach(card=>{
    card.classList.toggle("is-selected",userSelected&&card.dataset.priceCard===license);
  });
  if(scroll)$("registrationForm")?.scrollIntoView({behavior:"smooth",block:"center"});
}
function bindUi(){
  const nav=$("mainNav"),menu=$("menuBtn");
  menu?.addEventListener("click",()=>{
    const open=nav.classList.toggle("is-open");
    menu.setAttribute("aria-expanded",String(open));
  });
  nav?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>nav.classList.remove("is-open")));
  document.querySelectorAll("[data-scroll-form]").forEach(btn=>btn.addEventListener("click",()=>$("registrationForm")?.scrollIntoView({behavior:"smooth",block:"center"})));
  document.querySelectorAll("[data-license-card]").forEach(card=>card.addEventListener("click",()=>{
    userSelected=true;
    setLicense(card.dataset.licenseCard);
  }));
  document.querySelectorAll("[data-price-card]").forEach(card=>card.addEventListener("click",event=>{
    userSelected=true;
    setLicense(card.dataset.priceCard,{scroll:Boolean(event.target.closest("[data-price-register]"))});
  }));
  $("licenseClass")?.addEventListener("change",event=>{
    userSelected=true;
    setLicense(event.target.value);
  });
}
async function loadTuition(){
  try{
    const config=await rpc("app_public_tuition_config",{});
    const rows=Array.isArray(config)?config.filter(item=>item?.active!==false):[];
    for(const license of LICENSES){
      const card=document.querySelector('[data-price-card="'+CSS.escape(license)+'"]');
      if(!card)continue;
      const item=rows.find(row=>row?.license_class===license);
      const price=card.querySelector("[data-price-value]");
      const old=card.querySelector("[data-price-old]");
      const promo=card.querySelector("[data-promo]");
      const fees=card.querySelector("[data-fees]");
      const total=card.querySelector("[data-total]");
      if(!item){
        price.textContent="Liên hệ tư vấn";
        old.hidden=true;
        promo.hidden=true;
        fees.innerHTML="";
        total.textContent="Liên hệ tư vấn";
        continue;
      }
      const tuition=Number(item.tuition)||0;
      const discount=promotionActive(item)?Math.min(Number(item.discount_amount)||0,tuition):0;
      const final=Math.max(0,tuition-discount);
      const feeRows=normalizedFees(item.fees);
      const feeTotal=feeRows.reduce((sum,row)=>sum+(Number(row[1])||0),0);
      price.textContent=tuition?money(final):"Liên hệ tư vấn";
      if(discount){
        old.textContent=money(tuition);
        old.hidden=false;
      }else old.hidden=true;
      if(promotionActive(item)){
        promo.hidden=false;
        promo.querySelector("[data-promo-title]").textContent=item.promotion_title||"Ưu đãi hiện tại";
        promo.querySelector("[data-promo-desc]").textContent=item.promotion_description||"";
        promo.querySelector("[data-promo-discount]").textContent=discount?"Giảm "+money(discount):"";
        promo.querySelector("[data-promo-end]").textContent=item.promotion_end?"Áp dụng đến "+dateLabel(item.promotion_end):"";
      }else promo.hidden=true;
      fees.innerHTML=feeRows.map(([name,value])=>'<div><span>'+name+'</span><b>'+money(value)+'</b></div>').join("");
      total.textContent=tuition?money(final+feeTotal):"Liên hệ tư vấn";
    }
  }catch{
    document.querySelectorAll("[data-price-value],[data-total]").forEach(node=>node.textContent="Liên hệ tư vấn");
  }
}
async function loadTestimonials(){
  try{
    const response=await fetch("/api/student-testimonials",{cache:"no-store"});
    const data=await response.json();
    const images=Array.isArray(data?.images)?data.images:[];
    if(!response.ok||!images.length)return;
    $("testimonialGrid").innerHTML=images.slice(0,6).map((item,index)=>'<article class="testimonial-card"><img loading="lazy" decoding="async" src="'+item.imageUrl+'" alt="Nhận xét học viên '+(index+1)+'"></article>').join("");
    $("testimonialsSection").hidden=false;
  }catch{}
}
function bindForm(){
  const form=$("registrationForm"),submit=$("registrationSubmit"),error=$("registrationError");
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  $("preferredStartDate").min=localIsoDate(tomorrow);
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    error.textContent="";
    if(!form.reportValidity())return;
    if(!$("consent").checked){
      error.textContent="Vui lòng đồng ý để Học lái xe cùng Đạt liên hệ tư vấn.";
      return;
    }
    submit.disabled=true;
    submit.querySelector("span").textContent="Đang gửi đăng ký…";
    try{
      const source=sessionStorage.getItem("new_student_source")||"Truy cập trực tiếp";
      const originalNote=$("note").value.trim();
      const trackedNote=[originalNote,"Nguồn đăng ký: "+source].filter(Boolean).join("\n").slice(0,800);
      const payload={
        full_name:$("fullName").value.trim(),
        phone:$("phone").value.trim(),
        license_class:$("licenseClass").value,
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
      $("successLicense").textContent=payload.license_class;
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
      submit.querySelector("span").textContent="ĐĂNG KÝ TƯ VẤN MIỄN PHÍ";
    }
  });
  $("newRegistration")?.addEventListener("click",()=>{
    form.reset();
    userSelected=false;
    setLicense("B số tự động");
    $("preferredStartDate").min=localIsoDate(tomorrow);
    $("registrationSuccess").hidden=true;
    $("registrationFields").hidden=false;
    error.textContent="";
    $("fullName").focus();
  });
}
captureSource();
bindUi();
bindForm();
setLicense(selectedLicense);
loadTuition();
loadTestimonials();
