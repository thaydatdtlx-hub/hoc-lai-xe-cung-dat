import {readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";

const root=new URL("../",import.meta.url);
const [sql,client,worker,edge,adminHtml,studentHtml]=await Promise.all([
  readFile(new URL("CAP-NHAT-THONG-BAO-DAY-BUOC-12.sql",root),"utf8"),
  readFile(new URL("push-notifications.js",root),"utf8"),
  readFile(new URL("public/sw.js",root),"utf8"),
  readFile(new URL("supabase/functions/web-push/index.ts",root),"utf8"),
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("hoc-vien.html",root),"utf8")
]);

for(const token of ["app_push_subscriptions","app_save_push_subscription","app_disable_push_subscription","app_create_push_test_notification","enable row level security"]){
  if(!sql.includes(token))throw new Error(`SQL Push thiếu: ${token}`);
}
for(const token of ["Notification.requestPermission","pushManager.subscribe","app_save_push_subscription","app_create_push_test_notification","applicationServerKey"]){
  if(!client.includes(token))throw new Error(`Giao diện Push thiếu: ${token}`);
}
for(const token of ['addEventListener("push"','showNotification','addEventListener("notificationclick"','openWindow','setAppBadge']){
  if(!worker.includes(token))throw new Error(`Service Worker Push thiếu: ${token}`);
}
for(const token of ["webpush.setVapidDetails","webpush.sendNotification","SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS","request.headers.get(\"apikey\")","VAPID_PRIVATE_KEY","statusCode===410","app_push_subscriptions"]){
  if(!edge.includes(token))throw new Error(`Edge Function thiếu: ${token}`);
}
for(const [name,html] of [["Admin",adminHtml],["Học viên",studentHtml]]){
  for(const token of ["push-notification-panel","PushNotificationToggle","PushNotificationTest","/push-notifications.js"]){
    if(!html.toLowerCase().includes(token.toLowerCase()))throw new Error(`${name} thiếu điều khiển ${token}.`);
  }
}
const keys=JSON.parse(execFileSync(process.execPath,[new URL("generate-vapid-keys.mjs",import.meta.url).pathname],{encoding:"utf8"}));
if(keys.VAPID_PUBLIC_KEY.length!==87||keys.VAPID_PRIVATE_KEY.length<40)throw new Error("Bộ tạo khóa VAPID không hợp lệ.");
const [migration,proxy]=await Promise.all([readFile(new URL("supabase/migrations/20261125_system_phone_push.sql",root),"utf8"),readFile(new URL("api/student-rpc.js",root),"utf8")]);
for(const token of ["app_get_push_subscription_status","app_get_push_test_status","app_save_push_subscription","app_create_push_test_notification"])if(!proxy.includes('"'+token+'"'))throw new Error("Thiếu RPC Push cùng tên miền: "+token);
if(!client.includes('"/api/student-rpc?push=1"')||!proxy.includes('req.query?.push')||!edge.includes("https://www.hoclaixecungdat.com"))throw new Error("Push config chưa đồng bộ tên miền chính thức.");
if(!edge.includes('.eq("push_delivery_state","pending")')||!edge.includes("push_dispatch_version")||!migration.includes("UPDATE OF push_dispatch_version")||!migration.includes("hv-phone-push-retry")||!migration.includes("private.app_phone_registration_notice"))throw new Error("Thiếu chống gửi trùng, retry hoặc nguồn thông báo mới.");
if(!client.includes("app_get_push_test_status")||!client.includes("app_get_push_subscription_status")||!client.includes("hvDisablePhonePush"))throw new Error("Thiếu xác nhận máy chủ/thiết bị.");
console.log("PASS: Web Push cùng tên miền cho Admin/nhân viên/học viên, xác nhận đăng ký, kiểm thử trạng thái gửi, hàng đợi thử lại và nguồn thông báo máy chủ.");
