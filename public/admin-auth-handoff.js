(()=>{
  const BOOTSTRAP_KEY="hv_manager_bootstrap_v2";
  const BOOTSTRAP_TTL_MS=90000;
  const SUPABASE_RPC_PREFIX="https://pkzxkvcncipfszeukpwu.supabase.co/rest/v1/rpc/";
  const upstreamFetch=window.fetch.bind(window);

  function readBootstrap(){
    try{
      const raw=sessionStorage.getItem(BOOTSTRAP_KEY);
      if(!raw)return null;
      const value=JSON.parse(raw);
      if(!value?.token||!value?.me?.id||Date.now()-Number(value.createdAt||0)>BOOTSTRAP_TTL_MS){
        sessionStorage.removeItem(BOOTSTRAP_KEY);
        return null;
      }
      return value;
    }catch{
      sessionStorage.removeItem(BOOTSTRAP_KEY);
      return null;
    }
  }

  function jsonResponse(value){
    return new Response(JSON.stringify(value),{
      status:200,
      headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
    });
  }

  window.fetch=async function adminAuthHandoffFetch(input,init={}){
    const rawUrl=typeof input==="string"?input:input?.url||"";
    const method=String(init?.method||(typeof input!=="string"?input?.method:"")||"GET").toUpperCase();
    if(method==="POST"&&rawUrl.startsWith(`${SUPABASE_RPC_PREFIX}app_me`)){
      let body={};
      try{if(typeof init?.body==="string")body=JSON.parse(init.body)||{}}catch{}
      const bootstrap=readBootstrap();
      if(bootstrap&&String(body?.p_token||"")===String(bootstrap.token)){
        return jsonResponse(bootstrap.me);
      }
    }
    return upstreamFetch(input,init);
  };

  window.__HOCLAIXECUNGDAT_ADMIN_AUTH_HANDOFF__={version:"20260909-1",active:true};
})();
