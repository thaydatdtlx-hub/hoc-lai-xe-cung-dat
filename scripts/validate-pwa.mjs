import {readFile,stat} from "node:fs/promises";

const root=new URL("../",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("public/site.webmanifest",root),"utf8"));
if(manifest.display!=="standalone"||manifest.start_url!=="/?login=1"||manifest.scope!=="/")throw new Error("Manifest chưa mở đúng cổng đăng nhập ở chế độ ứng dụng độc lập.");
for(const size of ["192x192","512x512"]){
  if(!manifest.icons.some(icon=>icon.sizes===size&&icon.type==="image/png"))throw new Error(`Manifest thiếu biểu tượng PNG ${size}.`);
}
if(!manifest.icons.some(icon=>icon.purpose==="maskable"))throw new Error("Manifest thiếu biểu tượng maskable cho Android.");

for(const icon of manifest.icons){
  const path=new URL(`public/${icon.src.replace(/^\//,"")}`,root);
  if((await stat(path)).size<1000)throw new Error(`Biểu tượng ${icon.src} không hợp lệ.`);
}

const sw=await readFile(new URL("public/sw.js",root),"utf8");
for(const token of ["self.addEventListener(\"install\"","self.addEventListener(\"activate\"","self.addEventListener(\"fetch\"","/offline.html","request.mode===\"navigate\""]){
  if(!sw.includes(token))throw new Error(`Service Worker thiếu: ${token}`);
}

const installer=await readFile(new URL("pwa-install.js",root),"utf8");
for(const token of ["serviceWorker.register","beforeinstallprompt","appinstalled","navigator.standalone","Thêm vào MH chính","showLaunchScreen"]){
  if(!installer.includes(token))throw new Error(`Luồng cài ứng dụng thiếu: ${token}`);
}

for(const file of ["dang-ky-hoc-lai-xe.html","index.html","hoc-vien.html","lich-dao-tao.html","250-cau-hoi.html","600-cau-hoi.html","bo-tuc-tay-lai.html"]){
  const html=await readFile(new URL(file,root),"utf8");
  for(const token of ["/site.webmanifest","/apple-touch-icon-180.png","mobile-web-app-capable","/pwa-install.css","/pwa-install.js"]){
    if(!html.includes(token))throw new Error(`${file} thiếu ${token}.`);
  }
}
const landing=await readFile(new URL("dang-ky-hoc-lai-xe.html",root),"utf8");
const schedule=await readFile(new URL("lich-dao-tao.html",root),"utf8");
if(schedule.includes("registration.unregister()"))throw new Error("Lịch đào tạo không được hủy cài đặt PWA.");
if(!landing.includes("data-pwa-install-action")||!installer.includes("refreshPublicInstall")||installer.includes("clearPublicPwaState")||installer.includes('addEventListener("controllerchange"'))throw new Error("Luồng cài trang chủ chưa an toàn.");
if(sw.includes('"/?login=1",')||sw.includes("cache.put("))throw new Error("Service worker không được lưu nội dung đăng nhập hoặc API.");
if(manifest.name!=="Học lái xe cùng Đạt"||!manifest.shortcuts.some(item=>item.url.startsWith("/250-cau-hoi.html")))throw new Error("Tên ứng dụng hoặc lối tắt xe máy chưa đúng.");
console.log("PWA hợp lệ: cài iPhone/Android, biểu tượng chuẩn, toàn màn hình, màn hình khởi động và ngoại tuyến.");
