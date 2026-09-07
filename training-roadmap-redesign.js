import "./training-roadmap-redesign.css";

const steps=[
  {
    no:"01",title:"Hoàn thiện hồ sơ",text:"Kiểm tra thông tin cá nhân, giấy tờ và hướng dẫn hồ sơ đầy đủ, chính xác.",
    icon:'<path d="M15 5H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-9Z"/><path d="M15 5v5h5M10 13h4M10 17h3"/><circle cx="18" cy="18" r="4"/><path d="m16.5 18 1 1 2-2"/>'
  },
  {
    no:"02",title:"Học lý thuyết",text:"Ôn tập nội dung lý thuyết, bộ câu hỏi và thi thử trực tiếp trên hệ thống.",
    icon:'<path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v16H7.5A3.5 3.5 0 0 0 4 21.5Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 4H13v16h3.5a3.5 3.5 0 0 1 3.5 1.5Z"/><path d="M7 8h2M7 11h2M15 8h2M15 11h2"/>'
  },
  {
    no:"03",title:"Học thực hành",text:"Làm quen xe, rèn kỹ năng lái cơ bản và luyện các bài thực hành cần thiết.",
    icon:'<path d="m5 15 1.5-5h11L19 15"/><path d="M4 15h16v4H4z"/><path d="M7 10 9 6h6l2 4"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/><path d="M8.5 14h7"/>'
  },
  {
    no:"04",title:"Cabin và DAT",text:"Hoàn thành các mốc đào tạo bắt buộc theo đúng hạng bằng đã đăng ký.",
    icon:'<path d="M4 20c3-1 4-4 6-6s4-2 5-5-1-5-1-5"/><path d="M9 20h7"/><path d="M14 16h5l-1.2 4h-2.6Z"/><path d="M18 4a3 3 0 1 1 0 6c-3 0-4.5 3-4.5 3S12 10 9 10a3 3 0 1 1 0-6"/>'
  },
  {
    no:"05",title:"Thi tốt nghiệp",text:"Nhận thông báo lịch thi và chuẩn bị các nội dung cần ôn tập trước ngày thi.",
    icon:'<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3h6v2M9 10l1.4 1.4L13 9M9 15l1.4 1.4L13 14M15 10h1M15 15h1"/><circle cx="18" cy="18" r="4"/><path d="M18 16v2l1.2 1"/>'
  },
  {
    no:"06",title:"Thi sát hạch",text:"Hoàn thành lộ trình học, tham gia kỳ thi sát hạch và theo dõi kết quả.",
    icon:'<path d="M6 21V4"/><path d="M6 5c3-2 5 2 8 0s4 0 4 0v9s-1-2-4 0-5-2-8 0-3 1-3 1"/><path d="M10 6v7M14 5v8M6 9h12"/>'
  }
];

function card(step,index){
  const arrow=index===0||index===1||index===3||index===4?'<i class="roadmap-v2-arrow" aria-hidden="true"></i>':'';
  return `<article><span class="roadmap-v2-step">${step.no}</span><div class="roadmap-v2-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${step.icon}</svg></div><h3>${step.title}</h3><p>${step.text}</p>${arrow}</article>`;
}

function mountTrainingRoadmap(){
  const section=document.querySelector(".training-map-section");
  if(!section||section.classList.contains("training-roadmap-v2"))return;
  section.classList.add("training-roadmap-v2");
  section.id="noi-dung-dao-tao";
  section.setAttribute("aria-labelledby","trainingRoadmapTitle");
  section.innerHTML=`<div class="roadmap-v2-shell"><div class="roadmap-v2-heading"><p class="roadmap-v2-kicker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 8 10-4 10 4-10 4L2 8Zm4 2.2V15c2.7 2.7 9.3 2.7 12 0v-4.8M21 9v6"/></svg>NỘI DUNG ĐÀO TẠO</p><h2 id="trainingRoadmapTitle">Các mốc chính trong lộ trình học</h2><span>Học viên dễ theo dõi từng giai đoạn từ lúc hoàn thiện hồ sơ đến khi thi sát hạch và nhận kết quả.</span><div class="roadmap-v2-divider" aria-hidden="true"><i></i></div></div><div class="training-map">${steps.map(card).join("")}</div></div>`;
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountTrainingRoadmap,{once:true});else mountTrainingRoadmap();
