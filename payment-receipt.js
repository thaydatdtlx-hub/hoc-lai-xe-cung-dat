const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));

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
  return Number.isNaN(parsed.valueOf())?String(value):new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(parsed);
}

export function receiptMoney(value){
  return new Intl.NumberFormat("vi-VN").format(Math.max(0,Number(value)||0)+0)+" ₫";
}

export function receiptStudentProfile(payment={},student={}){
  return{
    ...payment,
    student_name:payment.student_name||student?.name||"",
    student_code:payment.student_code||student?.student_code||"",
    student_phone:payment.student_phone||student?.phone||"",
    date_of_birth:payment.date_of_birth||student?.date_of_birth||null,
    cccd:String(payment.cccd||student?.cccd||"").trim(),
    address:String(payment.address||student?.address||"").trim(),
    course:payment.course||student?.course||"",
    license_class:payment.license_class||student?.license_class||"",
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
    if(hundred){parts.push(digits[hundred],"trăm")}
    if(tens>1){parts.push(digits[tens],"mươi");if(ones===1)parts.push("mốt");else if(ones===5)parts.push("lăm");else if(ones)parts.push(digits[ones])}
    else if(tens===1){parts.push("mười");if(ones===5)parts.push("lăm");else if(ones)parts.push(digits[ones])}
    else if(ones){if(hundred)parts.push("lẻ");parts.push(digits[ones])}
    return parts.join(" ");
  };
  const groups=[];let rest=number;
  while(rest>0){groups.push(rest%1000);rest=Math.floor(rest/1000)}
  const parts=[];
  for(let index=groups.length-1;index>=0;index--){
    const group=groups[index];if(!group)continue;
    parts.push(readThree(group));
    if(units[index])parts.push(units[index]);
  }
  const text=parts.join(" ").replace(/\s+/g," ").trim();
  return text.charAt(0).toUpperCase()+text.slice(1)+" đồng";
}

function receiptCourseDescription(payment){
  const course=String(payment.course||"").trim();
  const license=String(payment.license_class||"").trim();
  if(course&&license&&!course.toLowerCase().includes(license.toLowerCase()))return`${course} · Hạng ${license}`;
  if(course)return course;
  if(license)return`Hạng ${license}`;
  return"Khóa đào tạo lái xe";
}

function receiptBaseUrl(){
  if(typeof window!=="undefined"&&/^https?:$/.test(window.location.protocol))return`${window.location.origin}/`;
  return"https://www.hoclaixecungdat.com/";
}

function receiptContent(payment){
  const note=String(payment.note||"").trim();
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
  const receiptNo=payment.receipt_no||"—";
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
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="${escapeHtml(baseUrl)}">
  <title>Biên lai học phí ${escapeHtml(receiptNo)}</title>
  <style>
    :root{--navy:#07366e;--blue:#0f6fc8;--sky:#dff0ff;--soft:#f6fbff;--line:#b9d7f3;--ink:#0c2f5d;--muted:#617997;--danger:#b8273c}
    *{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#eaf1f8;color:var(--ink);font:10.4px/1.25 Arial,"Helvetica Neue",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:flex-end;gap:8px;padding:9px max(12px,calc((100% - 210mm)/2));background:#17344ee8;backdrop-filter:blur(8px);box-shadow:0 4px 16px #06192b25}
    .toolbar button{min-height:38px;border:1px solid #ffffff30;border-radius:8px;padding:0 17px;color:#fff;font-weight:800;font-size:12px;cursor:pointer}.toolbar .close{background:#eef3f8;color:#24384b}.toolbar .save{background:#199857}.toolbar .print{background:#1768d7}.toolbar button:disabled{opacity:.6;cursor:wait}
    .paper{position:relative;width:210mm;min-height:148mm;margin:18px auto 34px;background:#fff;padding:5.5mm 7mm 4.6mm;box-shadow:0 16px 42px #16334f22;overflow:hidden}
    .paper:before{content:"";position:absolute;right:-17mm;top:-14mm;width:78mm;height:38mm;border-radius:50%;background:radial-gradient(ellipse at center,#dcefff 0,#eef7ff 43%,#fff0 70%);transform:rotate(-8deg);pointer-events:none}
    .paper:after{content:"";position:absolute;right:-9mm;top:0;width:60mm;height:25mm;border-top:2px solid #d8ebfb;border-radius:50%;transform:rotate(-8deg);pointer-events:none}
    .brand-row{position:relative;z-index:1;display:grid;grid-template-columns:1fr auto;gap:8mm;align-items:center;padding-bottom:2.2mm;border-bottom:.35mm solid #79addc}
    .brand{display:flex;align-items:center;gap:3.2mm}.brand-logo{width:20mm;height:20mm;border:.3mm solid #8abce8;border-radius:4mm;padding:1.2mm;background:#fff;display:flex;align-items:center;justify-content:center}.brand-logo img{width:100%;height:100%;object-fit:contain}.brand-copy strong{display:block;color:var(--navy);font-size:18px;line-height:1.02;letter-spacing:.03em}.brand-copy span{display:block;margin-top:1mm;color:#1c64a8;font-size:8.5px;font-weight:700;letter-spacing:.14em}
    .contact{display:grid;gap:1.2mm;min-width:67mm;color:#254b75;font-size:8.5px}.contact-row{display:flex;align-items:center;gap:1.6mm;white-space:nowrap}.contact-dot{width:4.2mm;height:4.2mm;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#0d4b88;color:#fff;font-size:8px;font-weight:900}.contact a{color:inherit;text-decoration:none;font-weight:700}
    .title-block{position:relative;z-index:1;text-align:center;padding:2.4mm 0 1.8mm}.title-block h1{margin:0;color:var(--navy);font-family:Georgia,"Times New Roman",serif;font-size:28px;line-height:1;font-weight:900;letter-spacing:.02em}.title-block p{margin:1.2mm 0 0;color:#184e87;font-size:8.2px;font-weight:700;letter-spacing:.23em}.title-line{display:inline-block;width:17mm;border-top:.35mm solid #5b9bd5;vertical-align:middle;margin:0 3mm}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:2mm}.meta-box{height:10.5mm;border:.3mm solid #87bcef;border-radius:2.3mm;background:linear-gradient(90deg,#f6fbff,#eaf5ff);display:flex;align-items:center;justify-content:center;gap:2.2mm;color:#244b75}.meta-box .meta-icon{font-size:14px;color:#0d5ca6}.meta-box span{font-size:9px}.meta-box strong{font-size:11px;color:var(--navy)}
    .section{margin-top:1.8mm}.section-title{height:7.6mm;border-radius:2.1mm 2.1mm 0 0;background:linear-gradient(90deg,#0b467f,#1774bd);color:#fff;display:flex;align-items:center;padding:0 3.2mm;font-family:Georgia,"Times New Roman",serif;font-size:11.5px;font-weight:900;letter-spacing:.02em}.section-title .section-no{display:inline-flex;width:5.2mm;height:5.2mm;border-radius:50%;align-items:center;justify-content:center;background:#fff;color:#0b4f8f;font-family:Arial,sans-serif;font-size:8px;margin-right:2mm}
    .student-card{border:.3mm solid #8fc1ec;border-top:0;border-radius:0 0 2.2mm 2.2mm;padding:2.2mm 3mm;background:linear-gradient(180deg,#fff,#fbfdff)}.student-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:5mm}.student-col{display:grid;gap:1.6mm}.student-col+.student-col{border-left:.3mm solid #b6d6f1;padding-left:4.2mm}.field{display:grid;grid-template-columns:27mm 1fr;gap:2mm;align-items:start}.field span{color:#31597f}.field strong{color:#103b6d;font-size:9.2px;overflow-wrap:anywhere}.field.address strong{line-height:1.2}
    .payment-card{border:.3mm solid #8fc1ec;border-top:0;border-radius:0 0 2.2mm 2.2mm;overflow:hidden;background:#fff}.payment-table{width:100%;border-collapse:collapse;table-layout:fixed}.payment-table th,.payment-table td{border-right:.25mm solid #bad8f1;border-bottom:.25mm solid #c8dff2;padding:1.35mm 2mm}.payment-table th:last-child,.payment-table td:last-child{border-right:0}.payment-table tr:last-child td{border-bottom:0}.payment-table th{background:#e8f4fe;color:#123d70;font-family:Georgia,"Times New Roman",serif;font-size:9.5px}.payment-table td{font-size:8.9px;color:#1b4169}.payment-table .stt{width:16mm;text-align:center}.payment-table .money{width:43mm;text-align:right;font-weight:800;color:#0f396a}.payment-table td:nth-child(2){font-weight:700}
    .detail-grid{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:2.5mm;margin-top:1.8mm}.detail-box{min-height:12.2mm;border:.3mm solid #9cc7ed;border-radius:2.2mm;background:linear-gradient(180deg,#f7fbff,#eef7ff);display:grid;grid-template-columns:8mm 1fr;align-items:center;padding:1.4mm 2.2mm}.detail-icon{width:6mm;height:6mm;border-radius:1.4mm;background:#e1f0ff;display:flex;align-items:center;justify-content:center;color:#0d579c;font-weight:900}.detail-copy span{display:block;color:#46698c;font-size:7.8px}.detail-copy strong{display:block;margin-top:.5mm;color:#123d70;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.detail-copy strong.words{white-space:normal;line-height:1.1}
    .total-strip{margin-top:1.8mm;height:12.7mm;border:.35mm solid #6cafe5;border-radius:2.4mm;background:linear-gradient(90deg,#e7f4ff,#d8edff,#edf8ff);display:flex;align-items:center;justify-content:center;gap:3mm;color:var(--navy)}.total-strip .coin{width:8.5mm;height:8.5mm;border-radius:50%;background:#1776bf;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px}.total-strip b{font-family:Georgia,"Times New Roman",serif;font-size:21px;letter-spacing:.02em}.total-strip.is-voided{border-color:#e49aa4;background:#fff0f2;color:var(--danger)}.total-strip.is-voided .coin{background:var(--danger)}
    .void-reason{margin-top:1.4mm;text-align:center;color:var(--danger);font-size:8px;font-weight:700}
    .signature-row{display:grid;grid-template-columns:1fr 1fr;gap:42mm;margin-top:3mm;padding:0 10mm;text-align:center}.signature strong{display:block;color:#173f6c;font-family:Georgia,"Times New Roman",serif;font-size:10px}.signature small{display:block;margin-top:.5mm;color:#4e6c8b;font-style:italic;font-size:7.5px}.signature-space{height:12mm}.signature-line{width:42mm;margin:0 auto;border-top:.35mm solid #4d7eaa}.signature-name{display:block;margin-top:1mm;color:#153c69;font-family:Georgia,"Times New Roman",serif;font-size:9.6px;font-weight:800}
    .footer{margin-top:2.2mm;display:flex;align-items:center;justify-content:center;gap:2.5mm;color:#2666a1;font-size:6.7px;font-weight:800;letter-spacing:.18em}.footer:before,.footer:after{content:"";width:22mm;border-top:.3mm solid #66a3d4}
    @media(max-width:860px){body{background:#fff}.toolbar{position:static;justify-content:center;flex-wrap:wrap}.toolbar button{flex:1;min-width:110px}.paper{width:100%;min-height:0;margin:0;padding:18px 14px;box-shadow:none}.brand-row{grid-template-columns:1fr}.contact{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;min-width:0}.contact-row{white-space:normal}.title-block h1{font-size:27px}.student-grid{grid-template-columns:1fr}.student-col+.student-col{border-left:0;border-top:1px solid #cce0f1;padding-left:0;padding-top:8px}.detail-grid{grid-template-columns:1fr}.detail-copy strong{white-space:normal}.signature-row{gap:30px;padding:0}.paper{overflow:visible}}
    @media print{@page{size:A5 landscape;margin:0}html,body{width:210mm;height:148mm;background:#fff}.toolbar{display:none!important}.paper{width:210mm;height:148mm;min-height:148mm;margin:0;padding:5.5mm 7mm 4.6mm;box-shadow:none;overflow:hidden}.brand-copy strong{font-size:18px}.title-block h1{font-size:28px}.contact{font-size:8.5px}.signature-row{break-inside:avoid}.section,.detail-grid,.total-strip{break-inside:avoid}}
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="close" type="button" id="closeReceipt">Đóng</button>
    <button class="save" type="button" id="saveReceiptPng">Lưu biên lai (PNG)</button>
    <button class="print" type="button" id="printReceipt">In / Lưu PDF A5</button>
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
      <h1><span class="title-line"></span>BIÊN LAI HỌC PHÍ<span class="title-line"></span></h1>
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
            <div class="field address"><span>Địa chỉ:</span><strong>${escapeHtml(payment.address||"—")}</strong></div>
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
            <tr><td class="stt">2</td><td>Đã thanh toán trước</td><td class="money">${escapeHtml(displayMoney(paidBefore))}</td></tr>
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
    function safeFileName(value){return String(value||"bien-lai-hoc-phi").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"bien-lai-hoc-phi"}
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
      }catch(error){alert("Chưa thể lưu PNG. Bạn vẫn có thể dùng nút In / Lưu PDF A5.")}
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
