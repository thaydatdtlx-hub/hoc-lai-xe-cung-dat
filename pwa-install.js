import "./overlay-safety.css";

const isStudentPortal=()=>location.pathname==="/hoc-vien.html";
const isRegistrationLanding=()=>location.pathname==="/dang-ky-hoc-lai-xe.html"||(location.pathname==="/"&&Boolean(document.getElementById("registrationForm")));
let professionalUiPromise=null;
let sharedEnhancementsPromise=null;

function loadProfessionalUi(){
  if(professionalUiPromise)return professionalUiPromise;
  professionalUiPromise=import("./platform-professional.js?v=20260825-1").catch(error=>{
    console.warn("[professional-ui] Không thể tải giao diện dùng chung.",error);
    professionalUiPromise=null;
  });
  return professionalUiPromise;
}

function loadSharedEnhancements(){
  if(sharedEnhancementsPromise)return sharedEnhancementsPromise;
  sharedEnhancementsPromise=Promise.all([
    loadProfessionalUi(),
    import("./site-unification.js"),
    import("./site-config-public.js"),
    import("./professional-public-polish.js"),
    import("./student-portal-polish.js"),
    import("./student-activity-tracker.js"),
    import("./theory-answer-explanations.js?v=2"),
    import("./theory-hero-brand.js"),
    import("./mobile-public-login.js"),
    import("./b-exam-set-picker.js"),
    import("./exam-candidate-screen.js?v=3"),
    import("./exam-candidate-entry.js")
  ]).catch(error=>{
    console.warn("[pwa-enhancements] Không thể tải tiện ích giao diện.",error);
    sharedEnhancementsPromise=null;
  });
  return sharedEnhancementsPromise;
}

function studentFunctionsReady(){
  const state=document.documentElement.getAttribute("data-student-functions");
  return state==="ready"||state==="partial";
}

function afterStudentPaint(callback){requestAnimationFrame(()=>requestAnimationFrame(callback))}
function loadEnhancementsWhenSafe(){
  if(isRegistrationLanding())return;
  if(!isStudentPortal()){void loadSharedEnhancements();return}
  if(studentFunctionsReady()){afterStudentPaint(()=>void loadSharedEnhancements());return}
  window.addEventListener("student-functions-ready",()=>afterStudentPaint(()=>void loadSharedEnhancements()),{once:true});
}
loadEnhancementsWhenSafe();

if(document.getElementById("app")){
  void Promise.all([
    import("./admin-tuition-settings.js"),
    import("./admin-site-config.js"),
    import("./admin-home-logo-link.js"),
    import("./recruitment-operations.js"),
    import("./student-activity-admin.js")
  ]).catch(error=>console.warn("[admin-modules] Không thể tải tiện ích quản trị.",error));
}

const DISMISS_KEY="thay_dat_pwa_install_dismissed";
const DISMISS_DAYS=7;
const PUBLIC_MARKETING_PATHS=new Set(["/dang-ky-hoc-lai-xe.html","/600-cau-hoi.html","/bo-tuc-tay-lai.html","/chinh-sach-bao-mat.html"]);
const SW_REFRESH_KEY="hoclaixecungdat_sw_refresh_v52";
let deferredInstallPrompt=null;
let installBanner=null;

function isStandalone(){return window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true}
function isIos(){return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)}
function isAndroid(){return /android/i.test(navigator.userAgent)}
function isPublicLanding(){return location.pathname==="/dang-ky-hoc-lai-xe.html"||(location.pathname==="/"&&Boolean(document.getElementById("registrationForm")))}
function isPublicMarketingPage(){return PUBLIC_MARKETING_PATHS.has(location.pathname)||isPublicLanding()}
function shouldOfferInstall(){return true}
function recentlyDismissed(){try{const value=Number(localStorage.getItem(DISMISS_KEY)||0);return value&&Date.now()-value<DISMISS_DAYS*86400000}catch{return false}}
function removeInstallBanner(){installBanner?.remove();installBanner=null}
function dismissInstallBanner(){try{localStorage.setItem(DISMISS_KEY,String(Date.now()))}catch{}removeInstallBanner()}

function showLaunchScreen(){
  if(!isStandalone()||sessionStorage.getItem("hoclaixecungdat_pwa_launched"))return;
  sessionStorage.setItem("hoclaixecungdat_pwa_launched","1");
  const splash=document.createElement("div");splash.className="pwa-launch-screen";
  splash.innerHTML='<img src="/app-icon-192.png" alt=""><strong>HỌC LÁI XE CÙNG ĐẠT</strong><span>Cổng học viên và quản lý đào tạo</span>';
  document.body.append(splash);
  requestAnimationFrame(()=>splash.classList.add("visible"));
  window.setTimeout(()=>{splash.classList.add("leaving");window.setTimeout(()=>splash.remove(),320)},950);
}

function showInstallBanner(mode,force=false){
  if(!shouldOfferInstall()||isStandalone()||(!force&&recentlyDismissed())||installBanner)return;
  const ios=mode==="ios";
  installBanner=document.createElement("aside");
  installBanner.className="pwa-install-banner";
  installBanner.setAttribute("aria-label","Cài đặt ứng dụng Học lái xe cùng Đạt");
  installBanner.innerHTML=`<img src="/app-icon-192.png" alt=""><div><strong>Học lái xe cùng Đạt</strong><p>${ios?"Cài trên iPhone/iPad, không cần App Store.":"Cài ứng dụng miễn phí, không cần tải APK."}</p><small class="pwa-ios-help" ${ios?"":"hidden"}>${ios?"<b>1.</b> Mở bằng Safari, nhấn Chia sẻ (□↑). <b>2.</b> Chọn Thêm vào MH chính. <b>3.</b> Nhấn Thêm (bật Mở dưới dạng ứng dụng web nếu có).":"Mở bằng Chrome, nhấn menu ⋮, chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính rồi xác nhận."}</small></div>${ios?"":'<button class="pwa-install-action" type="button">Cài đặt ứng dụng</button>'}<button class="pwa-install-close" type="button" aria-label="Để sau">×</button>`;
  if(ios)installBanner.classList.add("show-instructions");
  document.body.append(installBanner);
  installBanner.querySelector(".pwa-install-close").addEventListener("click",dismissInstallBanner);
  installBanner.querySelector(".pwa-install-action")?.addEventListener("click",async()=>{
    const banner=installBanner;
    if(!deferredInstallPrompt){banner.querySelector(".pwa-ios-help").hidden=false;banner.classList.add("show-instructions");return}
    const prompt=deferredInstallPrompt;
    deferredInstallPrompt=null;
    try{await prompt.prompt();const {outcome}=await prompt.userChoice;if(outcome==="accepted")removeInstallBanner()}
    catch{if(banner.isConnected){banner.querySelector(".pwa-ios-help").hidden=false;banner.classList.add("show-instructions")}}
  });
}
function mountInstallEntry(){
  if(isStandalone()||(!isIos()&&!isAndroid()))return;
  const home=document.querySelector(".hero-actions");
  const login=document.getElementById("loginCourseRegistrationBtn");
  if(!home&&!login)return;
  const button=document.createElement("button");button.type="button";button.className="pwa-install-entry";
  button.innerHTML='<img src="/app-icon-192.png" alt=""><span>Cài đặt ứng dụng</span>';
  button.addEventListener("click",async()=>{
    if(deferredInstallPrompt&&!isIos()){
      const prompt=deferredInstallPrompt;deferredInstallPrompt=null;
      try{await prompt.prompt();const {outcome}=await prompt.userChoice;if(outcome==="accepted"){removeInstallBanner();button.remove()}return}catch{}
    }
    showInstallBanner(isIos()?"ios":"native",true);
    if(!isIos()&&installBanner){installBanner.querySelector(".pwa-ios-help").hidden=false;installBanner.classList.add("show-instructions")}
  });
  if(home)home.append(button);else login.after(button);
  window.addEventListener("appinstalled",()=>button.remove(),{once:true});
}

function activateWaitingWorker(registration){
  registration.waiting?.postMessage({type:"SKIP_WAITING"});
  registration.addEventListener("updatefound",()=>{
    const worker=registration.installing;
    if(!worker)return;
    worker.addEventListener("statechange",()=>{
      if(worker.state==="installed"&&navigator.serviceWorker.controller)worker.postMessage({type:"SKIP_WAITING"});
    });
  });
}

if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost")){
  const hadController=Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(!hadController||isPublicMarketingPage()||sessionStorage.getItem(SW_REFRESH_KEY))return;
    sessionStorage.setItem(SW_REFRESH_KEY,"1");
    location.reload();
  });
  window.addEventListener("load",()=>{
    // Public pages remain network-first in sw.js; keep the registration for installation and push.
    navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).then(registration=>{
      activateWaitingWorker(registration);
      return registration.update();
    }).catch(()=>{});
  },{once:true});
}
showLaunchScreen();
mountInstallEntry();
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;if(shouldOfferInstall())showInstallBanner("native")});
window.addEventListener("appinstalled",()=>{try{localStorage.removeItem(DISMISS_KEY)}catch{}removeInstallBanner()});
if(!isStandalone()&&shouldOfferInstall()&&(isIos()||isAndroid()))window.setTimeout(()=>showInstallBanner(isIos()?"ios":"native"),1200);
