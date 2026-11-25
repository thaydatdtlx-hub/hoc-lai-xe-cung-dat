import {createClient} from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const SECRET_KEYS=(()=>{
  try{return Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}")) as string[]}
  catch{return[]}
})();
const ADMIN_KEY=SECRET_KEYS[0]||SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY=Deno.env.get("VAPID_PUBLIC_KEY")??"";
const VAPID_PRIVATE_KEY=Deno.env.get("VAPID_PRIVATE_KEY")??"";
const SITE_URL="https://www.hoclaixecungdat.com";
const VAPID_SUBJECT=Deno.env.get("VAPID_SUBJECT")||SITE_URL;
const supabase=createClient(SUPABASE_URL,ADMIN_KEY,{auth:{persistSession:false}});
const allowedOrigins=new Set([SITE_URL,"https://hoclaixecungdat.com","https://hoc-vien-thay-dat.vercel.app","https://hoclaixecungdat.vercel.app","https://daotaolaixe-thaydat.vercel.app"]);
const endpointPattern=/^https:\/\/(fcm[.]googleapis[.]com|android[.]googleapis[.]com|([a-z0-9-]+[.])*push[.]apple[.]com|([a-z0-9-]+[.])*push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com|([a-z0-9-]+[.])*wns[.]windows[.]com|([a-z0-9-]+[.])*push[.]microsoft[.]com|([a-z0-9-]+[.])*push[.]samsungosp[.]com)\//i;
function isAuthorized(request:Request){
  const apiKey=request.headers.get("apikey")??"";
  const authorization=request.headers.get("authorization")??"";
  const bearer=authorization.startsWith("Bearer ")?authorization.slice(7):"";
  return [SERVICE_ROLE_KEY,...SECRET_KEYS].filter(Boolean).some(key=>key===apiKey||key===bearer);
}
function corsHeaders(request:Request){
  const origin=request.headers.get("origin")??"";
  const allowed=allowedOrigins.has(origin)||/^http:\/\/localhost:\d+$/.test(origin)?origin:SITE_URL;
  return {"Access-Control-Allow-Origin":allowed,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store"};
}
function json(request:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(request),"Content-Type":"application/json; charset=utf-8"}})}
function configValid(){
  if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)return false;
  try{webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);return true}catch{return false}
}
function noticeLink(href:string,kind:string){
  const fallback=kind==="student"?"/hoc-vien.html":"/?login=1";
  try{
    const target=new URL(href||fallback,SITE_URL);
    if(!allowedOrigins.has(target.origin))return fallback;
    if(kind==="student"&&target.pathname==="/lich-dao-tao.html")return "/hoc-vien.html#trainingBooking";
    if(kind==="manager"&&(target.pathname==="/"||target.pathname==="/index.html"))target.searchParams.set("login","1");
    return target.pathname+target.search+target.hash;
  }catch{return fallback}
}
async function finish(id:string,version:number,state:string,sent=0,failed=0){
  const {error}=await supabase.from("app_notifications").update({push_delivery_state:state,push_delivered_count:sent,push_failed_count:failed,push_delivery_at:new Date().toISOString()})
    .eq("id",id).eq("push_dispatch_version",version).eq("push_delivery_state","sending");
  if(error)console.error("Unable to record phone push delivery result");
}
Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method==="GET")return json(request,{publicKey:configValid()?VAPID_PUBLIC_KEY:"",configured:configValid()});
  if(request.method!=="POST")return json(request,{error:"Method not allowed"},405);
  if(!ADMIN_KEY||!isAuthorized(request))return json(request,{error:"Unauthorized"},401);
  const payload=await request.json().catch(()=>null);
  const id=String((payload?.record??payload)?.id??"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return json(request,{error:"Invalid notification ID"},400);
  // Never trust the webhook payload for identity, destination or message contents.
  // Claim a new server-generated notification atomically; repeated webhook requests are harmless.
  const {data:notice,error}=await supabase.from("app_notifications")
    .update({push_delivery_state:"sending",push_delivery_at:new Date().toISOString()})
    .eq("id",id).eq("push_delivery_state","pending")
    .select("id,recipient_kind,recipient_id,notification_key,category,title,body,href,push_dispatch_version")
    .maybeSingle();
  if(error){console.error("Unable to claim phone push notification");return json(request,{error:"Unable to claim notification"},500)}
  if(!notice)return json(request,{ok:true,state:"already_processed"});
  const version=Number(notice.push_dispatch_version)||0;
  if(!["manager","student"].includes(notice.recipient_kind)||!configValid()){
    await finish(id,version,"failed",0,1);return json(request,{error:"Push configuration unavailable"},503);
  }
  try{
    const accountTable=notice.recipient_kind==="manager"?"app_users":"app_student_accounts";
    let accountQuery=supabase.from(accountTable).select("id").eq("id",notice.recipient_id).eq("active",true);
    if(notice.recipient_kind==="student")accountQuery=accountQuery.eq("account_type","student");
    const {data:account,error:accountError}=await accountQuery.maybeSingle();
    if(accountError)throw accountError;
    if(!account){await finish(id,version,"no_devices");return json(request,{ok:true,state:"no_devices",sent:0})}
    const {data:subscriptions,error:subscriptionError}=await supabase.from("app_push_subscriptions")
      .select("endpoint,p256dh,auth").eq("recipient_kind",notice.recipient_kind).eq("recipient_id",notice.recipient_id).eq("active",true);
    if(subscriptionError)throw subscriptionError;
    if(!subscriptions?.length){await finish(id,version,"no_devices");return json(request,{ok:true,state:"no_devices",sent:0})}
    const message=JSON.stringify({id:notice.id,title:String(notice.title||"Thông báo từ Học lái xe cùng Đạt").slice(0,160),
      body:String(notice.body||"Bạn có một cập nhật mới.").slice(0,700),url:noticeLink(notice.href,notice.recipient_kind),
      tag:notice.notification_key||notice.id,category:notice.category||"general"});
    let sent=0,failed=0,retryable=0;
    for(let start=0;start<subscriptions.length;start+=8){
      await Promise.all(subscriptions.slice(start,start+8).map(async subscription=>{
        // Restrict delivery to established HTTPS browser push services, not arbitrary network targets.
        if(!endpointPattern.test(subscription.endpoint)){
          failed++;await supabase.from("app_push_subscriptions").update({active:false,last_error:"Unsupported push endpoint",last_error_at:new Date().toISOString()})
            .eq("endpoint",subscription.endpoint).eq("recipient_id",notice.recipient_id).eq("recipient_kind",notice.recipient_kind);return;
        }
        try{
          await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},message,{TTL:86400,urgency:"normal",timeout:10000});
          sent++;
          await supabase.from("app_push_subscriptions").update({last_error:null,last_error_at:null,last_seen_at:new Date().toISOString()})
            .eq("endpoint",subscription.endpoint).eq("recipient_id",notice.recipient_id).eq("recipient_kind",notice.recipient_kind);
        }catch(cause){
          failed++;
          const statusCode=Number((cause as {statusCode?:number})?.statusCode||0);
          const expired=statusCode===404||statusCode===410;
          if(!expired&&(statusCode===0||statusCode===429||statusCode>=500))retryable++;
          await supabase.from("app_push_subscriptions").update({active:!expired,last_error:statusCode?"Push service HTTP "+statusCode:"Push network error",last_error_at:new Date().toISOString()})
            .eq("endpoint",subscription.endpoint).eq("recipient_id",notice.recipient_id).eq("recipient_kind",notice.recipient_kind);
        }
      }));
    }
    // Never retry a partially delivered batch, which would resend successful notifications.
    const state=sent>0?(failed?"partial":"sent"):(retryable>0&&version<2?"retry":"failed");
    await finish(id,version,state,sent,failed);
    return json(request,{ok:sent>0,state,sent,failed});
  }catch{
    console.error("Phone push dispatch failed");
    const state=version<2?"retry":"failed";
    await finish(id,version,state,0,1);
    return json(request,{ok:false,state,error:"Push dispatch unavailable"},500);
  }
});
