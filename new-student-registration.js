import "./student-testimonials.css";
import "./student-testimonials.js";

const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
const $=id=>document.getElementById(id);
const cards=[...document.querySelectorAll("[data-license-card]")];
const form=$("registrationForm"),submit=$("registrationSubmit"),error=$("registrationError");
const licenseInput=$("licenseClass");
const heroLicenseSelect=$("heroLicenseSelect");
const LICENSES=new Set(cards.map(card=>card.dataset.licenseCard).filter(Boolean));
let selectedLicense="B số tự động";

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

  licenseInput.value=storedLicense;
  licenseInput.defaultValue=storedLicense;
  licenseInput.setAttribute("value",storedLicense);
  form.dataset.licenseClass=storedLicense;

  $("selectedLicenseSummary").textContent=nextLicense;
  $("selectedLicenseCard").textContent=nextLicense;
  $("formLicenseBadge").textContent=nextLicense;
  if(heroLicenseSelect&&heroLicenseSelect.value!==nextLicense)heroLicenseSelect.value=nextLicense;

  cards.forEach(card=>{
    const active=card.dataset.licenseCard===nextLicense;
    card.classList.toggle("active",active);
    card.setAttribute("aria-pressed",String(active));
  });
}

function selectedLicenseForSubmit(){
  const activeCard=cards.find(card=>card.getAttribute("aria-pressed")==="true");
  const nextLicense=LICENSES.has(activeCard?.dataset.licenseCard)?activeCard.dataset.licenseCard:selectedLicense;
  setLicense(nextLicense);
  return licenseInput.value;
}

function captureSource(){
  const params=new URLSearchParams(location.search);
  const source=params.get("utm_source")||params.get("source")||document.referrer||"Truy cập trực tiếp";
  sessionStorage.setItem("new_student_source",String(source).slice(0,180));
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

cards.forEach(card=>card.addEventListener("click",()=>{
  setLicense(card.dataset.licenseCard);
  if(matchMedia("(max-width:760px)").matches){
    form.scrollIntoView({behavior:"smooth",block:"start"});
  }
}));

heroLicenseSelect?.addEventListener("change",()=>setLicense(heroLicenseSelect.value));

document.querySelectorAll("[data-scroll-form]").forEach(button=>button.addEventListener("click",()=>form.scrollIntoView({behavior:"smooth",block:"start"})));
document.querySelectorAll("[data-scroll-license]").forEach(button=>button.addEventListener("click",()=>$("hang-bang")?.scrollIntoView({behavior:"smooth",block:"start"})));

const navToggle=document.querySelector("[data-mobile-menu-toggle]");
const nav=document.querySelector(".desktop-nav");
navToggle?.addEventListener("click",()=>{
  const open=nav?.classList.toggle("mobile-open");
  navToggle.setAttribute("aria-expanded",String(Boolean(open)));
});
nav?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>nav.classList.remove("mobile-open")));

captureSource();
const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
$("preferredStartDate").min=localIsoDate(tomorrow);
setLicense("B số tự động");

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
    submit.querySelector("span").textContent="➤ ĐĂNG KÝ NGAY";
  }
});

$("newRegistration").addEventListener("click",()=>{
  form.reset();
  setLicense("B số tự động");
  $("preferredStartDate").min=localIsoDate(tomorrow);
  $("registrationSuccess").hidden=true;
  $("registrationFields").hidden=false;
  error.textContent="";
  $("fullName").focus();
});