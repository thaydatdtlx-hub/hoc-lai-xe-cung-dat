import "./theory-answer-explanations.css";
import {explanationForQuestion} from "./theory-explanation-engine.js";

let questionMap=new Map();
let loading=null;
let applying=false;

function esc(value=""){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function normalize(value=""){
  return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g," ");
}
function contextQuestionId(){
  try{
    const context=typeof window.__THAY_DAT_AI_CONTEXT__==="function"?window.__THAY_DAT_AI_CONTEXT__():null;
    const id=Number(context?.id)||0;
    return id>0?id:0;
  }catch{return 0}
}
function activePaletteSourceId(){
  const active=document.querySelector("#questionPalette [data-palette-index].current");
  const id=Number(active?.dataset.sourceQuestionId)||0;
  return id>0?id:0;
}
function questionFromVisibleText(){
  const visible=normalize(document.getElementById("questionText")?.textContent||"");
  if(!visible||visible==="dang tai cau hoi…"||visible==="dang tai cau hoi...")return null;
  for(const question of questionMap.values()){
    if(normalize(question?.question)===visible)return question;
  }
  return null;
}
function currentSourceQuestion(){
  const contextId=contextQuestionId();
  if(contextId&&questionMap.has(contextId))return questionMap.get(contextId);

  const paletteId=activePaletteSourceId();
  if(paletteId&&questionMap.has(paletteId))return questionMap.get(paletteId);

  const byText=questionFromVisibleText();
  if(byText)return byText;

  // Chỉ dùng số đang hiển thị làm phương án cuối với bộ 600. Bộ 250 được đánh lại
  // số thứ tự nên không được phép coi "CÂU 44" là source id 44.
  if(document.body.dataset.theoryBankCount!=="250"){
    const value=document.getElementById("questionNumber")?.textContent||"";
    const displayedId=Number(value.match(/CÂU\s+(\d+)/i)?.[1])||0;
    if(displayedId&&questionMap.has(displayedId))return questionMap.get(displayedId);
  }
  return null;
}
function correctOption(question){
  return question?.options?.find(option=>Number(option.n)===Number(question.answer));
}
function selectedOption(question){
  const selected=document.querySelector("#answerOptions .answer-option.selected");
  const n=Number(selected?.dataset.answer)||0;
  return question?.options?.find(option=>Number(option.n)===n);
}
function enhanceFeedback(){
  if(applying||location.pathname!=="/600-cau-hoi.html")return;
  const feedback=document.getElementById("answerFeedback");
  if(!feedback||feedback.classList.contains("hidden"))return;
  const question=currentSourceQuestion(),id=Number(question?.id)||0;
  if(!question||!id)return;
  if(feedback.dataset.explanationQuestion===String(id)&&feedback.querySelector(".answer-explanation-box"))return;
  const selected=selectedOption(question),correct=Number(selected?.n)===Number(question.answer),answer=correctOption(question),explanation=explanationForQuestion(question);
  applying=true;
  feedback.dataset.explanationQuestion=String(id);
  feedback.classList.add("answer-feedback-explained");
  feedback.classList.toggle("wrong",!correct);
  feedback.setAttribute("role","status");
  feedback.setAttribute("aria-live","polite");
  feedback.innerHTML=`
    <div class="answer-result-icon" aria-hidden="true">${correct?"✓":"×"}</div>
    <div class="answer-result-copy">
      <strong>${correct?"Bạn trả lời đúng":"Bạn trả lời chưa đúng"}</strong>
      ${!correct&&selected?`<p class="answer-selected-line">Bạn đã chọn: <b>${selected.n}. ${esc(selected.text)}</b></p>`:""}
      <p class="answer-correct-line">Đáp án đúng: <b>${question.answer}. ${esc(answer?.text||"")}</b></p>
      <div class="answer-explanation-box">
        <span>GIẢI THÍCH</span>
        <p>${esc(explanation.text)}</p>
        ${explanation.legal?`<small class="answer-legal-note">${esc(explanation.legal)}</small>`:""}
        ${question.critical?'<small>⚠ Đây là câu điểm liệt. Nếu gặp trong bài thi, cần đặc biệt ghi nhớ đáp án này.</small>':""}
      </div>
    </div>`;
  applying=false;
}
async function loadQuestions(){
  if(loading)return loading;
  loading=fetch("/data/600-cau-hoi-2025.json",{cache:"no-store"})
    .then(response=>response.ok?response.json():[])
    .then(data=>{if(Array.isArray(data))questionMap=new Map(data.map(item=>[Number(item.id),item]));return data})
    .catch(()=>[]);
  return loading;
}
async function init(){
  if(location.pathname!=="/600-cau-hoi.html")return;
  await loadQuestions();
  enhanceFeedback();
  const target=document.getElementById("questionCard")||document.body;
  const observer=new MutationObserver(()=>enhanceFeedback());
  observer.observe(target,{subtree:true,childList:true,attributes:true,characterData:true,attributeFilter:["class"]});
  window.addEventListener("pageshow",enhanceFeedback);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
