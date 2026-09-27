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