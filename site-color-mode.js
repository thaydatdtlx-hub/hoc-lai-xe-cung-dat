/* Shared colour-mode control for Học lái xe cùng Đạt.
   Browser-only preference; no credentials, profiles or Supabase rows are changed. */
const STORAGE_KEY="hoclaixecungdat_color_mode_v1";
const root=document.documentElement;
const modes=["system","light","dark"];
const labels={system:"◐ Tự động",light:"☀ Sáng",dark:"☾ Tối"};
const themeMeta=document.querySelector('meta[name="theme-color"]');
const originalThemeColor=themeMeta?.getAttribute("content")||"#0b63d8";
const preferenceMedia=window.matchMedia?.("(prefers-color-scheme: dark)");
const controls=[];

function readMode(){
  try{const value=localStorage.getItem(STORAGE_KEY);return modes.includes(value)?value:"system"}
  catch{return "system"}
}
let currentMode=readMode();

function effectiveMode(){
  return currentMode==="system"?(preferenceMedia?.matches?"dark":"light"):currentMode;
}
function syncMode(){
  const effective=effectiveMode();
  root.setAttribute("data-hv-theme",effective);
  root.style.colorScheme=effective;
  if(themeMeta)themeMeta.setAttribute("content",effective==="dark"?"#0b1729":originalThemeColor);
  for(const element of controls){
    if(element.value!==currentMode)element.value=currentMode;
    const wrapper=element.closest(".site-color-control");
    if(wrapper)wrapper.dataset.effective=effective;
    element.title="Giao diện "+labels[currentMode].replace(/[☀☾◐]/g,"").trim();
  }
}
function setMode(mode){
  if(!modes.includes(mode))return;
  currentMode=mode;
  try{localStorage.setItem(STORAGE_KEY,mode)}catch{/* Private mode still works for this page */}
  syncMode();
}
function makeControl(placement){
  const label=document.createElement("label");
  label.className="site-color-control site-color-control--"+placement;
  label.setAttribute("data-site-color-control","");
  label.innerHTML='<span class="site-color-control__caption">Giao diện</span><select aria-label="Chọn giao diện sáng, tối hoặc theo thiết bị" class="site-color-control__select">'+
    modes.map(mode=>'<option value="'+mode+'">'+labels[mode]+'</option>').join("")+'</select>';
  const select=label.querySelector("select");
  select.value=currentMode;
  select.addEventListener("change",()=>setMode(select.value));
  controls.push(select);
  return label;
}
function placeControl(target,placement,where="append"){
  if(!target)return;
  const control=makeControl(placement);
  if(where==="prepend")target.prepend(control);
  else target.append(control);
}
function initControls(){
  // Desktop / tablet topbar: visible without leaving the current page.
  const management=document.querySelector("#app .topbar .account");
  const student=document.querySelector(".student-topbar .student-account");
  const schedule=document.querySelector(".schedule-topbar .topbar-actions");
  const theory=document.querySelector(".quiz-topbar nav");
  const marketing=document.querySelector(".site-header nav");
  const desktop=management||student||schedule||theory||marketing;
  if(desktop)placeControl(desktop,"header","prepend");

  // The desktop account bar is hidden on mobile. Keep theme preferences in
  // the existing account menu so there are no extra buttons crowding the bar.
  const mobileMenu=document.querySelector(".mobile-account-menu");
  if(mobileMenu)placeControl(mobileMenu,"mobile-menu","prepend");
  if(marketing)placeControl(document.body,"marketing-mobile");

  // The theory topbar disappears during an exercise. Keep an accessible
  // selector in the workspace too (without modifying quiz state).
  const workspace=document.querySelector(".workspace-tools");
  if(workspace)placeControl(workspace,"workspace","prepend");

  // On the login screen, the management header is not yet visible.
  const login=document.getElementById("login");
  if(login)placeControl(login,"login");

  // Marketing and fallback pages with no desktop header.
  if(!desktop&&!login)placeControl(document.body,"floating");
  syncMode();
}

window.addEventListener("storage",event=>{
  if(event.key===STORAGE_KEY){currentMode=readMode();syncMode()}
});
try{
  preferenceMedia?.addEventListener?.("change",()=>{if(currentMode==="system")syncMode()});
}catch{/* Older Safari: chosen theme remains fully functional */}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initControls,{once:true});
else initControls();
