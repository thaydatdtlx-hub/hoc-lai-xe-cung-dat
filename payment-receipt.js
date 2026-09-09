const normalizeVi=value=>String(value??"").normalize("NFC");
const escapeHtml=value=>normalizeVi(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));

export const paymentMethodLabel=method=>({
  cash:"Tiền mặt",
  bank_transfer:"Chuyển khoản",
  card:"Thẻ",
  other:"Khác"
}[method]||"Khác");

export function receiptDate(value){
  if(!value)return"—";
  const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(match)return`${match[3]}/${match[2]}/${match[1]}`;
  const parsed=new Date(value);
  return Number.isNaN(parsed.valueOf())?normalizeVi(value):new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(parsed);
}

export function receiptMoney(value){
  return new Intl.NumberFormat("vi-VN").format(Math.max(0,Number(value)||0))+" ₫";
}

export function receiptStudentProfile(payment={},student={}){
  return{
    ...payment,
    student_name:normalizeVi(payment.student_name||student?.name||""),
    student_code:normalizeVi(payment.student_code||student?.student_code||""),
    student_phone:normalizeVi(payment.student_phone||student?.phone||""),
    date_of_birth:payment.date_of_birth||student?.date_of_birth||null,
    cccd:normalizeVi(payment.cccd||student?.cccd||"").trim(),
    address:normalizeVi(payment.address||student?.address||"").trim(),
    course:normalizeVi(payment.course||student?.course||""),
    license_class:normalizeVi(payment.license_class||student?.license_class||""),
    note:normalizeVi(payment.note||""),
    tuition_total:Number(payment.tuition_total??student?.tuition_total)||0,
    paid:Number(payment.paid??student?.paid)||0
  };
}

export function paymentTotals(student,payments=[]){
  const total=Math.max(0,Number(student?.tuition_total)||0);
  const activePaid=payments.filter(item=>!item.voided_at).reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0);
  const paid=payments.length?activePaid:Math.max(0,Number(student?.paid)||0);
  return{total,paid,debt:Math.max(0,total-paid)};
}

function numberToVietnamese(value){
  const number=Math.max(0,Math.round(Number(value)||0));
  if(number===0)return"Không đồng";
  const digits=["không","một","hai","ba","bốn","năm","sáu","bảy","tám","chín"];
  const units=["","nghìn","triệu","tỷ","nghìn tỷ","triệu tỷ"];
  const readThree=value=>{
    const hundred=Math.floor(value/100),tens=Math.floor(value%100/10),ones=value%10;
    const parts=[];
    if(hundred)parts.push(digits[hundred],"trăm");
    if(tens>1){
      parts.push(digits[tens],"mươi");
      if(ones===1)parts.push("mốt");
      else if(ones===5)parts.push("lăm");
      else if(ones)parts.push(digits[ones]);
    }else if(tens===1){
      parts.push("mười");
      if(ones===5)parts.push("lăm");
      else if(ones)parts.push(digits[ones]);
    }else if(ones){
      if(hundred)parts.push("lẻ");
      parts.push(digits[ones]);
    }
    return parts.join(" ");
  };
  const groups=[];let rest=number;
  while(rest>0){groups.push(rest%1000);rest=Math.floor(rest/1000)}
  const parts=[];
  for(let index=groups.length-1;index>=0;index--){
    const group=groups[index];
    if(!group)continue;
    parts.push(readThree(group));
    if(units[index])parts.push(units[index]);
  }
  const text=parts.join(" ").replace(/\s+/g," ").trim();
  return normalizeVi(text.charAt(0).toUpperCase()+text.slice(1)+" đồng");
}

function receiptCourseDescription(payment){
  const course=normalizeVi(payment.course||"").trim();
  const license=normalizeVi(payment.license_class||"").trim();
  if(course&&license&&!course.toLocaleLowerCase("vi").includes(license.toLocaleLowerCase("vi")))return`${course} · Hạng ${license}`;
  if(course)return course;
  if(license)return`Hạng ${license}`;
  return"Khóa đào tạo lái xe";
}

function receiptBaseUrl(){
  if(typeof window!=="undefined"&&/^https?:$/.test(window.location.protocol))return`${window.location.origin}/`;
  return"https://www.hoclaixecungdat.com/";
}

function receiptContent(payment){
  const note=normalizeVi(payment.note||"").trim();
  return note||"Thu học phí";
}

export function buildReceiptHtml(payment){
  const rawAmount=Math.max(0,Number(payment.amount)||0);
  const amount=receiptMoney(rawAmount);
  const date=receiptDate(payment.payment_date);
  const birthDate=receiptDate(payment.date_of_birth);
  const method=paymentMethodLabel(payment.payment_method);
  const courseDescription=receiptCourseDescription(payment);
  const content=receiptContent(payment);
  const receiptNo=normalizeVi(payment.receipt_no||"—");
  const baseUrl=receiptBaseUrl();
  const tuitionTotal=Math.max(0,Number(payment.tuition_total)||0);
  const totalPaid=Math.max(0,Number(payment.paid)||0);
  const explicitPaidBefore=payment.paid_before;
  const paidBefore=explicitPaidBefore!==undefined&&explicitPaidBefore!==null&&explicitPaidBefore!==""
    ?Math.max(0,Number(explicitPaidBefore)||0)
    :Math.max(0,totalPaid-rawAmount);
  const debt=Math.max(0,tuitionTotal-totalPaid);
  const isVoided=Boolean(payment.voided_at);
  const amountWords=numberToVietnamese(rawAmount);
  const displayMoney=value=>value>0?receiptMoney(value):"—";
  const totalLabel=isVoided?"PHIẾU ĐÃ HỦY":"ĐÃ THU";

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="${escapeHtml(baseUrl)}">
  <title>Biên lai học phí ${escapeHtml(receiptNo)}</title>
  <style>
    :root{--navy:#083b73;--blue:#0d69b7;--blue-2:#1786d4;--sky:#eaf5ff;--soft:#f7fbff;--line:#b8d6ef;--ink:#173a5d;--muted:#607b96;--danger:#b3263b}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{background:#e9f0f7;color:var(--ink);font-family:"Segoe UI",Tahoma,Arial,sans-serif;font-size:14px;line-height:1.45;font-kerning:normal;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    button,input,select,textarea{font:inherit}
    .toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:flex-end;gap:10px;padding:12px max(18px,calc((100% - 210mm)/2));background:#24445fe8;backdrop-filter:blur(10px);box-shadow:0 4px 18px #06192b25}
    .toolbar button{min-height:44px;border:1px solid #ffffff30;border-radius:10px;padding:0 20px;color:#fff;font-weight:800;font-size:14px;cursor:pointer}.toolbar .close{background:#eef3f8;color:#24384b}.toolbar .save{background:#169457}.toolbar .print{background:#1768d7}.toolbar button:disabled{opacity:.6;cursor:wait}
    .paper{position:relative;width:210mm;min-height:297mm;margin:22px auto 38px;background:#fff;padding:11mm 12mm 10mm;box-shadow:0 18px 48px #17334f24;overflow:hidden}
    .paper:before{content:"";position:absolute;right:-26mm;top:-17mm;width:104mm;height:62mm;border-radius:50%;background:radial-gradient(ellipse at center,#d9ecfb 0,#eef7ff 46%,#fff0 73%);transform:rotate(-9deg);pointer-events:none}
    .paper:after{content:"";position:absolute;right:-8mm;top:10mm;width:72mm;height:31mm;border-top:2px solid #d5eafb;border-radius:50%;transform:rotate(-10deg);pointer-events:none}
    .brand-row{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) 72mm;gap:8mm;align-items:center;padding-bottom:5mm;border-bottom:.45mm solid #6ea9da}
    .brand{display:flex;align-items:center;gap:5mm}.brand-logo{width:27mm;height:27mm;border:.35mm solid #86b8e4;border-radius:5mm;padding:1.8mm;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2mm 5mm #13558a10}.brand-logo img{display:block;width:100%;height:100%;object-fit:contain}.brand-copy strong{display:block;color:var(--navy);font-size:26px;line-height:1.05;letter-spacing:.02em;font-weight:900}.brand-copy span{display:block;margin-top:2mm;color:#1d64a5;font-size:11px;font-weight:800;letter-spacing:.12em}
    .contact{display:grid;gap:2mm;color:#244d77;font-size:11px}.contact-row{display:flex;align-items:center;gap:2.1mm}.contact-dot{width:5.2mm;height:5.2mm;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#0b4f8d;color:#fff;font-size:10px;font-weight:900;flex:0 0 auto}.contact a{color:inherit;text-decoration:none;font-weight:700;overflow-wrap:anywhere}
    .title-block{position:relative;z-index:1;text-align:center;padding:8mm 0 5mm}.title-block h1{margin:0;color:var(--navy);font-size:36px;line-height:1.05;font-weight:900;letter-spacing:.02em}.title-block p{margin:2.2mm 0 0;color:#215a91;font-size:12px;font-weight:800;letter-spacing:.24em}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:4mm}.meta-box{min-height:15mm;border:.35mm solid #8abce8;border-radius:3mm;background:linear-gradient(90deg,#f8fcff,#eaf5ff);display:flex;align-items:center;justify-content:center;gap:3mm;color:#345a80}.meta-box .meta-icon{font-size:19px;color:#0d5ca6}.meta-box span{font-size:13px}.meta-box strong{font-size:15px;color:var(--navy)}
    .section{margin-top:4mm}.section-title{min-height:11mm;border-radius:3mm 3mm 0 0;background:linear-gradient(90deg,#0a477f,#1778bd);color:#fff;display:flex;align-items:center;padding:0 4mm;font-size:18px;font-weight:900;letter-spacing:.01em}.section-title .section-no{display:inline-flex;width:7mm;height:7mm;border-radius:50%;align-items:center;justify-content:center;background:#fff;color:#0b4f8f;font-size:11px;margin-right:2.8mm;flex:0 0 auto}
    .student-card{border:.35mm solid #8fc1ec;border-top:0;border-radius:0 0 3mm 3mm;padding:5mm;background:linear-gradient(180deg,#fff,#fbfdff)}.student-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:8mm}.student-col{display:grid;gap:3.2mm}.student-col+.student-col{border-left:.35mm solid #b6d6f1;padding-left:7mm}.field{display:grid;grid-template-columns:32mm 1fr;gap:3mm;align-items:start}.field span{color:#416787;font-size:13px}.field strong{color:#103c6c;font-size:14px;line-height:1.35;font-weight:800;overflow-wrap:anywhere;word-break:normal}
    .payment-card{border:.35mm solid #8fc1ec;border-top:0;border-radius:0 0 3mm 3mm;overflow:hidden;background:#fff}.payment-table{width:100%;border-collapse:collapse;table-layout:fixed}.payment-table th,.payment-table td{border-right:.3mm solid #bad8f1;border-bottom:.3mm solid #c8dff2;padding:3.1mm 3.5mm}.payment-table th:last-child,.payment-table td:last-child{border-right:0}.payment-table tr:last-child td{border-bottom:0}.payment-table th{background:#e7f3fd;color:#123d70;font-size:14px;font-weight:900}.payment-table td{font-size:14px;color:#1b4169}.payment-table .stt{width:19mm;text-align:center}.payment-table .money{width:49mm;text-align:right;font-weight:900;color:#0f396a}.payment-table td:nth-child(2){font-weight:700}
    .detail-grid{display:grid;grid-template-columns:1fr 1.1fr 1.15fr;gap:4mm;margin-top:4mm}.detail-box{min-height:20mm;border:.35mm solid #9cc7ed;border-radius:3mm;background:linear-gradient(180deg,#f8fcff,#edf7ff);display:grid;grid-template-columns:10mm 1fr;align-items:center;padding:3mm}.detail-icon{width:8mm;height:8mm;border-radius:2mm;background:#ddecfb;display:flex;align-items:center;justify-content:center;color:#0d579c;font-size:14px;font-weight:900}.detail-copy span{display:block;color:#557492;font-size:11px}.detail-copy strong{display:block;margin-top:1mm;color:#123d70;font-size:13px;line-height:1.3;font-weight:900;overflow-wrap:anywhere}.detail-copy strong.words{font-size:12px}
    .total-strip{margin-top:4mm;min-height:19mm;border:.4mm solid #69abe2;border-radius:3.2mm;background:linear-gradient(90deg,#e8f4ff,#d8edff,#edf8ff);display:flex;align-items:center;justify-content:center;gap:4mm;color:var(--navy)}.total-strip .coin{width:11mm;height:11mm;border-radius:50%;background:#1776bf;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900}.total-strip b{font-size:29px;letter-spacing:.01em;font-weight:900}.total-strip.is-voided{border-color:#e49aa4;background:#fff0f2;color:var(--danger)}.total-strip.is-voided .coin{background:var(--danger)}
    .void-reason{margin-top:2.5mm;text-align:center;color:var(--danger);font-size:12px;font-weight:800}
    .signature-row{display:grid;grid-template-columns:1fr 1fr;gap:34mm;margin-top:9mm;padding:0 14mm;text-align:center}.signature strong{display:block;color:#173f6c;font-size:15px;font-weight:900}.signature small{display:block;margin-top:1mm;color:#617d99;font-style:italic;font-size:11px}.signature-space{height:32mm}.signature-line{width:52mm;margin:0 auto;border-top:.4mm solid #4d7eaa}.signature-name{display:block;margin-top:2mm;color:#153c69;font-size:14px;font-weight:900}
    .footer{margin-top:8mm;display:flex;align-items:center;justify-content:center;gap:3mm;color:#2f6fa7;font-size:9px;font-weight:900;letter-spacing:.16em;text-align:center}.footer:before,.footer:after{content:"";width:25mm;border-top:.35mm solid #66a3d4}
    @media(max-width:880px){body{background:#fff}.toolbar{position:static;justify-content:center;flex-wrap:wrap}.toolbar button{flex:1;min-width:120px}.paper{width:100%;min-height:0;margin:0;padding:24px 18px;box-shadow:none;overflow:visible}.brand-row{grid-template-columns:1fr}.contact{grid-template-columns:1fr;gap:7px}.brand-copy strong{font-size:24px}.title-block h1{font-size:31px}.student-grid{grid-template-columns:1fr}.student-col+.student-col{border-left:0;border-top:1px solid #cce0f1;padding-left:0;padding-top:12px}.detail-grid{grid-template-columns:1fr}.signature-row{gap:28px;padding:0}.total-strip b{font-size:23px}}
    @media print{@page{size:A4 portrait;margin:0}html,body{width:210mm;min-height:297mm;background:#fff}.toolbar{display:none!important}.paper{width:210mm;min-height:297mm;margin:0;padding:11mm 12mm 10mm;box-shadow:none;overflow:hidden}.brand-row,.section,.detail-grid,.total-strip,.signature-row,.footer{break-inside:avoid}}
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="close" type="button" id="closeReceipt">Đóng</button>
    <button class="save" type="button" id="saveReceiptPng">Lưu biên lai (PNG)</button>
    <button class="print" type="button" id="printReceipt">In / Lưu PDF A4</button>
  </div>

  <main class="paper" id="receiptPaper">
    <header class="brand-row">
      <div class="brand">
        <div class="brand-logo"><img src="/logo-thay-dat-compact.webp?v=15" alt="Học lái xe cùng Đạt"></div>
        <div class="brand-copy">
          <strong>HỌC LÁI XE CÙNG ĐẠT</strong>
          <span>AN TOÀN HÔM NAY · VỮNG TAY TƯƠNG LAI</span>
        </div>
      </div>
      <div class="contact" aria-label="Thông tin liên hệ">
        <div class="contact-row"><span class="contact-dot">☎</span><span>Hotline: <a href="tel:0984811037">0984811037</a></span></div>
        <div class="contact-row"><span class="contact-dot">@</span><a href="mailto:thaydat.dtlx@gmail.com">thaydat.dtlx@gmail.com</a></div>
        <div class="contact-row"><span class="contact-dot">W</span><a href="https://www.hoclaixecungdat.com/">www.hoclaixecungdat.com</a></div>
      </div>
    </header>

    <section class="title-block">
      <h1>BIÊN LAI HỌC PHÍ</h1>
      <p>PHIẾU XÁC NHẬN THANH TOÁN HỌC PHÍ</p>
    </section>

    <div class="meta-grid">
      <div class="meta-box"><span class="meta-icon">▣</span><span>Số phiếu:</span><strong>${escapeHtml(receiptNo)}</strong></div>
      <div class="meta-box"><span class="meta-icon">▦</span><span>Ngày thu:</span><strong>${escapeHtml(date)}</strong></div>
    </div>

    <section class="section">
      <div class="section-title"><span class="section-no">1</span>THÔNG TIN HỌC VIÊN</div>
      <div class="student-card">
        <div class="student-grid">
          <div class="student-col">
            <div class="field"><span>Họ và tên:</span><strong>${escapeHtml(payment.student_name||"—")}</strong></div>
            <div class="field"><span>Ngày sinh:</span><strong>${escapeHtml(birthDate)}</strong></div>
            <div class="field"><span>Khóa học:</span><strong>${escapeHtml(courseDescription)}</strong></div>
            <div class="field"><span>Địa chỉ:</span><strong>${escapeHtml(payment.address||"—")}</strong></div>
          </div>
          <div class="student-col">
            <div class="field"><span>Mã học viên:</span><strong>${escapeHtml(payment.student_code||"—")}</strong></div>
            <div class="field"><span>Số CCCD:</span><strong>${escapeHtml(payment.cccd||"—")}</strong></div>
            <div class="field"><span>Số điện thoại:</span><strong>${escapeHtml(payment.student_phone||"—")}</strong></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title"><span class="section-no">2</span>CHI TIẾT THANH TOÁN</div>
      <div class="payment-card">
        <table class="payment-table" aria-label="Chi tiết thanh toán học phí">
          <thead><tr><th class="stt">STT</th><th>Nội dung</th><th class="money">Số tiền</th></tr></thead>
          <tbody>
            <tr><td class="stt">1</td><td>Học phí khóa học</td><td class="money">${escapeHtml(displayMoney(tuitionTotal))}</td></tr>
            <tr><td class="stt">2</td><td>Đóng học phí lần 1</td><td class="money">${escapeHtml(displayMoney(paidBefore))}</td></tr>
            <tr><td class="stt">3</td><td>Thanh toán kỳ này</td><td class="money">${escapeHtml(amount)}</td></tr>
            <tr><td class="stt">4</td><td>Còn lại</td><td class="money">${escapeHtml(displayMoney(debt))}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="detail-grid">
      <div class="detail-box"><div class="detail-icon">▰</div><div class="detail-copy"><span>Phương thức thanh toán:</span><strong>${escapeHtml(method)}</strong></div></div>
      <div class="detail-box"><div class="detail-icon">▤</div><div class="detail-copy"><span>Nội dung thu:</span><strong>${escapeHtml(content)}</strong></div></div>
      <div class="detail-box"><div class="detail-icon">₫</div><div class="detail-copy"><span>Số tiền bằng chữ:</span><strong class="words">${escapeHtml(amountWords)}</strong></div></div>
    </div>

    <div class="total-strip ${isVoided?"is-voided":""}"><span class="coin">${isVoided?"!":"✓"}</span><b>${escapeHtml(totalLabel)}: ${escapeHtml(amount)}</b></div>
    ${isVoided&&payment.void_reason?`<div class="void-reason">Lý do hủy: ${escapeHtml(payment.void_reason)}</div>`:""}

    <div class="signature-row">
      <div class="signature"><strong>Người nộp tiền</strong><small>(Ký và ghi rõ họ tên)</small><span class="signature-space"></span><div class="signature-line"></div></div>
      <div class="signature"><strong>Người thu tiền</strong><small>(Ký và ghi rõ họ tên)</small><span class="signature-space"></span><div class="signature-line"></div><span class="signature-name">Trần Quốc Đạt</span></div>
    </div>

    <footer class="footer">HỌC LÁI XE CÙNG ĐẠT · AN TOÀN HÔM NAY · VỮNG TAY TƯƠNG LAI</footer>
  </main>

  <script>
    const receiptNo=${JSON.stringify(String(receiptNo))};
    const closeButton=document.getElementById("closeReceipt");
    const saveButton=document.getElementById("saveReceiptPng");
    const printButton=document.getElementById("printReceipt");
    closeButton.addEventListener("click",()=>window.close());
    printButton.addEventListener("click",()=>window.print());
    function safeFileName(value){return String(value||"bien-lai-hoc-phi").normalize("NFC").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"bien-lai-hoc-phi"}
    function loadHtml2Canvas(){
      if(window.html2canvas)return Promise.resolve(window.html2canvas);
      return new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
        script.onload=()=>resolve(window.html2canvas);
        script.onerror=()=>reject(new Error("Không tải được trình xuất PNG"));
        document.head.appendChild(script);
      });
    }
    saveButton.addEventListener("click",async()=>{
      const original=saveButton.textContent;saveButton.disabled=true;saveButton.textContent="Đang lưu PNG…";
      try{
        const html2canvas=await loadHtml2Canvas();
        await Promise.all([...document.images].filter(image=>!image.complete).map(image=>new Promise(resolve=>{image.onload=image.onerror=resolve})));
        const canvas=await html2canvas(document.getElementById("receiptPaper"),{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
        const link=document.createElement("a");link.download=safeFileName("bien-lai-"+receiptNo)+".png";link.href=canvas.toDataURL("image/png");link.click();
      }catch(error){alert("Chưa thể lưu PNG. Bạn vẫn có thể dùng nút In / Lưu PDF A4.")}
      finally{saveButton.disabled=false;saveButton.textContent=original}
    });
  </script>
</body>
</html>`;
}

export function openPaymentReceipt(payment,studentProfile={}){
  const receiptWindow=window.open("","_blank");
  if(!receiptWindow)return false;
  receiptWindow.opener=null;
  receiptWindow.document.open();
  receiptWindow.document.write(buildReceiptHtml(receiptStudentProfile(payment,studentProfile)));
  receiptWindow.document.close();
  return true;
}
