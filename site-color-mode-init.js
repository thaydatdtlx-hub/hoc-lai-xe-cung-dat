// Apply the saved colour mode before CSS paints, preventing a light-mode flash.
(()=>{
  const key="hoclaixecungdat_color_mode_v1";
  let saved="system";
  try{const value=localStorage.getItem(key);if(["light","dark","system"].includes(value))saved=value}catch{}
  const dark=saved==="dark"||(saved==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-hv-theme",dark?"dark":"light");
  document.documentElement.style.colorScheme=dark?"dark":"light";
})();
