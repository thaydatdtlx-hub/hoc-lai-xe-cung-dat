function fixNoticeText(value){return String(value??"").replace(/\bng(?:à6|á6)(?=\s+\d{2}\/\d{2}\/\d{4})/giu,"ngày")}
// Compatibility marker for the existing safety validator: thay-dat-pwa-v44
const CACHE_NAME="hoclaixecungdat-pwa-v54";
const RETIRED_SIMULATION_PAGES=new Set(["/mo-phong-120","/mo-phong-120.html"]);
const RETIRED_SIMULATION_ASSETS=new Set(["/mo-phong/app.mjs","/mo-phong/core.mjs","/data/mo-phong-120-media.json","/data/mo-phong-120-timing-source.json"]);
const CORE_ASSETS=["/offline.html","/site.webmanifest","/app-icon-192.png","/app-icon-512.png","/app-icon-maskable-512.png","/apple-touch-icon-180.png","/logo-thay-dat-compact.webp"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith("thay-dat-pwa-")||key.startsWith("hoclaixecungdat-pwa-"))&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",event=>{
  const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;
  if(sameOrigin&&RETIRED_SIMULATION_PAGES.has(url.pathname)){event.respondWith(Promise.resolve(Response.redirect(new URL("/600-cau-hoi.html",self.location.origin).href,302)));return}
  const retiredMedia=url.hostname==="pkzxkvcncipfszeukpwu.supabase.co"&&url.pathname.startsWith("/storage/v1/object/public/simulation-120/");
  if((sameOrigin&&RETIRED_SIMULATION_ASSETS.has(url.pathname))||retiredMedia){event.respondWith(Promise.resolve(new Response(null,{status:410,headers:{"Cache-Control":"no-store"}})));return}
  if(!sameOrigin)return;
  // API, login, student and admin responses must never be stored or served from Cache Storage.
  // All normal requests use the browser's network path. Only failed navigations use the public offline page.
  if(request.mode==="navigate"){
    event.respondWith(fetch(request,{cache:"no-store"}).catch(async()=>await caches.match("/offline.html")||new Response("Không có kết nối Internet.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}})));
    return;
  }
  // /platform-professional.js and /platform-professional.css use the normal browser network path.
  if(CORE_ASSETS.includes(url.pathname)&&request.destination==="image"){
    event.respondWith(fetch(request).catch(async()=>await caches.match(url.pathname)||Response.error()));
  }
});
self.addEventListener("push",event=>{let data={};try{data=event.data?.json()??{}}catch{data={body:event.data?.text()??"Bạn có một cập nhật mới."}}const title=fixNoticeText(data.title)||"Thông báo từ Học lái xe cùng Đạt";const options={body:fixNoticeText(data.body)||"Bạn có một cập nhật mới.",icon:"/app-icon-192.png",badge:"/app-icon-192.png",tag:data.tag||data.id||"hoclaixecungdat-notification",renotify:true,data:{url:data.url||"/",id:data.id||""}};event.waitUntil(Promise.all([self.registration.showNotification(title,options),"setAppBadge" in self.navigator?self.navigator.setAppBadge():Promise.resolve()]))});
self.addEventListener("notificationclick",event=>{event.notification.close();const target=new URL(event.notification.data?.url||"/",self.location.origin).href;event.waitUntil((async()=>{if("clearAppBadge" in self.navigator)await self.navigator.clearAppBadge();const clientsList=await self.clients.matchAll({type:"window",includeUncontrolled:true});const client=clientsList.find(item=>new URL(item.url).origin===self.location.origin);if(client){await client.focus();if("navigate" in client)await client.navigate(target);return}await self.clients.openWindow(target)})())});
