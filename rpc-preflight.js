(()=>{
  const SUPABASE_ORIGIN="https://pkzxkvcncipfszeukpwu.supabase.co";
  const RPC_PREFIX=`${SUPABASE_ORIGIN}/rest/v1/rpc/`;
  const nativeFetch=window.fetch.bind(window);
  const PROXY_TIMEOUT_MS=3500;
  const DIRECT_TIMEOUT_MS=7000;
  const inflight=new Map();

  async function timedFetch(input,init={},timeoutMs=7000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{return await nativeFetch(input,{...init,signal:controller.signal})}
    finally{clearTimeout(timer)}
  }

  function timeoutResponse(){
    return new Response(JSON.stringify({message:"Kết nối dữ liệu quá thời gian. Vui lòng thử lại."}),{
      status:504,
      headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
    });
  }

  function requestKey(fn,body){return `${fn}:${JSON.stringify(body||{})}`}
  function responseFromSnapshot(snapshot){return new Response(snapshot.text,{status:snapshot.status,statusText:snapshot.statusText,headers:snapshot.headers})}
  async function snapshot(response){
    const text=await response.text();
    return{status:response.status,statusText:response.statusText,headers:[...response.headers.entries()],text};
  }

  function shouldUseDirectFallback(status){
    return status===401||status===403||status===404||status===405||status===408||status===425||status===429||status>=500;
  }

  async function directRpc(input,init,fn){
    try{return await timedFetch(input,{...init,cache:"no-store"},DIRECT_TIMEOUT_MS)}
    catch(error){
      console.warn(`[rpc-preflight] direct ${fn} timed out.`,error);
      return timeoutResponse();
    }
  }

  function prefetchRpc(fn,body){
    const key=requestKey(fn,body);
    if(inflight.has(key))return inflight.get(key);
    const promise=(async()=>{
      try{
        const response=await timedFetch("/api/student-rpc",{
          method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({fn,body})
        },PROXY_TIMEOUT_MS);
        if(!response.ok)throw new Error(`prefetch ${fn} ${response.status}`);
        return await snapshot(response);
      }catch(error){
        inflight.delete(key);
        throw error;
      }
    })();
    inflight.set(key,promise);
    return promise;
  }

  function startAdminWarmup(token){
    const meBody={p_token:token};
    prefetchRpc("app_me",meBody).then(async meSnapshot=>{
      let me=null;
      try{me=JSON.parse(meSnapshot.text)}catch{}
      if(me?.role!=="admin")return;
      const reads=[
        ["app_list_users",{p_token:token}],
        ["app_list_student_accounts",{p_token:token}],
        ["app_admin_list_public_theory_accounts",{p_token:token}],
        ["app_list_deleted_students",{p_token:token}],
        ["app_list_audit_logs",{p_token:token,p_limit:250}],
        ["app_list_student_payments",{p_token:token,p_student_id:null}],
        ["app_list_attendance_records",{p_token:token,p_student_id:null,p_from:null,p_to:null}],
        ["app_list_students",{p_token:token,p_owner_id:null}],
        ["app_list_training_requests",{p_token:token,p_student_id:null}],
        ["app_admin_list_theory_progress",{p_token:token}],
        ["app_list_notifications",{p_token:token}]
      ];
      for(const [fn,body] of reads)prefetchRpc(fn,body).catch(()=>{});
    }).catch(()=>{});
  }

  window.fetch=async function stableFetch(input,init={}){
    const rawUrl=typeof input==="string"?input:input?.url||"";
    const method=String(init?.method||(typeof input!=="string"?input?.method:"")||"GET").toUpperCase();
    if(method!=="POST"||!rawUrl.startsWith(RPC_PREFIX))return nativeFetch(input,init);

    const fn=decodeURIComponent(rawUrl.slice(RPC_PREFIX.length).split(/[?#]/)[0]||"");
    if(!/^app_[a-z0-9_]+$/i.test(fn))return nativeFetch(input,init);

    let body={};
    try{if(typeof init?.body==="string")body=JSON.parse(init.body)||{}}catch{}

    const key=requestKey(fn,body);
    const warmed=inflight.get(key);
    if(warmed){
      try{return responseFromSnapshot(await warmed)}catch{}
    }

    try{
      const proxy=await timedFetch("/api/student-rpc",{
        method:"POST",
        cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({fn,body})
      },PROXY_TIMEOUT_MS);
      if(proxy.ok){
        if(fn==="app_login"){
          try{
            const payload=await proxy.clone().json();
            if(payload?.token)startAdminWarmup(payload.token);
          }catch{}
        }
        return proxy;
      }

      if(proxy.status===400){
        try{
          const payload=await proxy.clone().json();
          if(payload?.error!=="RPC not allowed")return proxy;
        }catch{return proxy}
      }else if(!shouldUseDirectFallback(proxy.status)){
        return proxy;
      }

      console.warn(`[rpc-preflight] same-origin ${fn} returned ${proxy.status}; using direct fallback.`);
    }catch(error){
      console.warn(`[rpc-preflight] same-origin ${fn} unavailable; using direct fallback.`,error);
    }

    return directRpc(input,init,fn);
  };

  window.__HOCLAIXECUNGDAT_RPC_PREFLIGHT__={version:"20260909-2",active:true};
})();
