import {studentRpc} from "./student-rpc-client.js";
const manager={toggle:document.getElementById("pushNotificationToggle"),test:document.getElementById("pushNotificationTest"),status:document.getElementById("pushNotificationStatus")};
const student={toggle:document.getElementById("studentPushNotificationToggle"),test:document.getElementById("studentPushNotificationTest"),status:document.getElementById("studentPushNotificationStatus")};
const controls=manager.toggle?manager:student.toggle?student:null;
const authToken=()=>localStorage.getItem("hv_token")||sessionStorage.getItem("hv_token")||"";
const configUrl="/api/student-rpc?push=1";
let enabled=false,busy=false,refreshing=false,configPromise=null;
function isIos(){return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)}
function isStandalone(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}
function supported(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window}
function setStatus(message,tone=""){if(!controls)return;controls.status.textContent=message;controls.status.dataset.tone=tone}
function setUi(active){
  if(!controls)return;enabled=Boolean(active);
  controls.toggle.textContent=enabled?"Tắt thông báo điện thoại":"Bật thông báo điện thoại";
  controls.toggle.dataset.enabled=String(enabled);controls.test.hidden=!enabled;
  if(enabled)setStatus("Đã đăng ký nhận thông báo trên thiết bị này.","success");
}
function friendlyError(error){
  const message=String(error?.message||"");
  if(error?.name==="NotAllowedError")return "Điện thoại chưa cấp quyền thông báo. Kiểm tra Cài đặt → Thông báo.";
  if(error?.name==="AbortError"||/load failed|failed to fetch|networkerror|network request failed|timeout|quá thời gian/i.test(message))return "Chưa kết nối được dịch vụ thông báo. Vui lòng kiểm tra mạng và thử lại.";
  return message||"Không thể thiết lập thông báo điện thoại. Vui lòng thử lại.";
}
function applicationServerKey(value){
  const padding="=".repeat((4-value.length%4)%4),raw=atob((value+padding).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(raw,character=>character.charCodeAt(0));
}
function deadline(promise,ms,message){
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms)})]).finally(()=>clearTimeout(timer));
}
async function getVapidKey(){
  if(!configPromise)configPromise=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch(configUrl,{cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.configured||!/^[A-Za-z0-9_-]{87}$/.test(data?.publicKey||""))throw new Error("Dịch vụ thông báo chưa sẵn sàng. Vui lòng thử lại.");
      return data.publicKey;
    }finally{clearTimeout(timer)}
  })().catch(error=>{configPromise=null;throw error});
  return configPromise;
}
async function worker(){
  let registration=await navigator.serviceWorker.getRegistration("/");
  if(!registration)registration=await navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});
  if(registration.active)return registration;
  return deadline(navigator.serviceWorker.ready,10000,"Ứng dụng chưa sẵn sàng. Vui lòng đóng và mở lại ứng dụng.");
}
async function currentSubscription(){return (await worker()).pushManager.getSubscription()}
async function rpc(fn,body={}){return studentRpc(fn,body,{proxyTimeoutMs:3500,directTimeoutMs:5500})}
function sameKey(subscription,key){
  const existing=subscription?.options?.applicationServerKey;
  if(!existing)return true;
  const left=new Uint8Array(existing),right=applicationServerKey(key);
  return left.length===right.length&&left.every((value,index)=>value===right[index]);
}
async function refresh(){
  if(!controls||busy||refreshing)return;
  if(isIos()&&!isStandalone()){setUi(false);controls.toggle.disabled=true;setStatus("iPhone: mở Safari → Chia sẻ → Thêm vào MH chính, sau đó mở ứng dụng.","warning");return}
  if(!supported()){setUi(false);controls.toggle.disabled=true;setStatus("Trình duyệt hoặc ứng dụng này chưa hỗ trợ Web Push. Hãy dùng Safari/Chrome và ứng dụng web đã cài.","warning");return}
  controls.toggle.disabled=false;
  if(!authToken()){setUi(false);setStatus("Đăng nhập để bật thông báo điện thoại.");return}
  if(Notification.permission==="denied"){setUi(false);setStatus("Thông báo bị chặn. Hãy cho phép trong Cài đặt điện thoại hoặc trình duyệt.","warning");return}
  refreshing=true;
  try{
    // Warm the public same-origin config and worker before the user's permission gesture.
    const [key,subscription]=await Promise.all([getVapidKey(),currentSubscription()]);
    if(subscription&&Notification.permission==="granted"&&sameKey(subscription,key)){
      const status=await rpc("app_get_push_subscription_status",{p_token:authToken(),p_endpoint:subscription.endpoint});
      setUi(status?.active===true);
      if(!enabled)setStatus("Thiết bị cần đăng ký lại. Bấm Bật thông báo điện thoại.","warning");
    }else{setUi(false);setStatus("Bật một lần để nhận thông báo cả khi đã đóng ứng dụng.")}
  }catch(error){setUi(false);setStatus(friendlyError(error),"warning")}
  finally{refreshing=false}
}
async function disablePhonePush(token=authToken()){
  if(!supported())return;
  let subscription;
  try{subscription=await deadline(currentSubscription(),2500,"Không tìm thấy thiết bị.")}catch{return}
  if(!subscription)return;
  try{await rpc("app_disable_push_subscription",{p_token:token,p_endpoint:subscription.endpoint})}
  finally{await subscription.unsubscribe().catch(()=>{});setUi(false)}
}
window.hvDisablePhonePush=disablePhonePush;
async function togglePush(){
  if(!controls||busy)return;
  busy=true;controls.toggle.disabled=true;
  try{
    if(!authToken())throw new Error("Vui lòng đăng nhập trước khi bật thông báo.");
    if(isIos()&&!isStandalone())throw new Error("Trên iPhone, hãy Thêm vào MH chính rồi mở ứng dụng từ biểu tượng Học lái xe cùng Đạt.");
    if(!supported())throw new Error("Thiết bị chưa hỗ trợ Web Push.");
    if(enabled){
      await disablePhonePush();setStatus("Đã tắt thông báo trên thiết bị này.");return;
    }
    // Permission must be requested directly inside the click, before network/worker awaits (iOS).
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission!=="granted")throw new Error("Bạn chưa cho phép gửi thông báo. Kiểm tra Cài đặt → Thông báo.");
    setStatus("Đang đăng ký thiết bị với máy chủ…");
    const [registration,key]=await Promise.all([worker(),getVapidKey()]);
    let subscription=await registration.pushManager.getSubscription();
    if(subscription&&!sameKey(subscription,key)){await subscription.unsubscribe();subscription=null}
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationServerKey(key)});
    const saved=await rpc("app_save_push_subscription",{p_token:authToken(),p_subscription:subscription.toJSON(),p_user_agent:navigator.userAgent});
    if(saved!==true)throw new Error("Máy chủ chưa xác nhận đăng ký thiết bị.");
    const status=await rpc("app_get_push_subscription_status",{p_token:authToken(),p_endpoint:subscription.endpoint});
    if(!status?.active)throw new Error("Thiết bị chưa được kích hoạt. Vui lòng bật lại.");
    setUi(true);setStatus("Đã bật. Nhấn Gửi thử để kiểm tra thông báo ngoài màn hình.","success");
  }catch(error){setStatus(friendlyError(error),"warning")}
  finally{busy=false;controls.toggle.disabled=false}
}
async function testPush(){
  if(!controls||busy||!enabled)return;
  busy=true;controls.test.disabled=true;controls.toggle.disabled=true;setStatus("Đang gửi thông báo thử đến các thiết bị của tài khoản…");
  try{
    const id=await rpc("app_create_push_test_notification",{p_token:authToken()});
    let result;
    for(let attempt=0;attempt<6;attempt++){
      result=await rpc("app_get_push_test_status",{p_token:authToken(),p_notification_id:id});
      if(["sent","partial","failed","no_devices"].includes(result?.state))break;
      if(attempt<5)await new Promise(resolve=>setTimeout(resolve,1800));
    }
    if(Number(result?.sent)>0)setStatus("Dịch vụ Push đã chấp nhận gửi tới "+result.sent+" thiết bị. Hãy kiểm tra màn hình khóa hoặc Trung tâm thông báo.","success");
    else if(result?.state==="no_devices"){setUi(false);setStatus("Không có thiết bị hoạt động. Vui lòng bật lại thông báo.","warning")}
    else if(result?.state==="failed")setStatus("Dịch vụ Push chưa gửi được. Hãy bật lại thông báo và gửi thử.","warning");
    else setStatus("Đã đưa vào hàng đợi gửi. Hệ thống sẽ tự thử lại nếu kết nối lỗi; chưa xác nhận nhận được trên điện thoại.","warning");
  }catch(error){setStatus(friendlyError(error),"warning")}
  finally{busy=false;controls.test.disabled=false;controls.toggle.disabled=false}
}
if(controls){
  controls.toggle.addEventListener("click",togglePush);controls.test.addEventListener("click",testPush);void refresh();
  document.addEventListener("click",event=>{if(event.target instanceof Element&&event.target.closest("#notificationBtn,#studentNotificationBtn"))void refresh()});
  window.addEventListener("focus",()=>{void refresh()});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void refresh()});
}
