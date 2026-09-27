import "./registration-premium-v6.css";

const SUPABASE_URL="https://pkzxkvcncipfszeukpwu.supabase.co";
const SUPABASE_KEY="sb_publishable_rrQ2fAG7ZpIKizN3-tss1w_4xPxq3Vo";
const LICENSES=["A1","A","B số sàn","B số tự động","C1"];
const PRICE_META={
  "A1":{title:"HẠNG A1",icon:"🛵",desc:"Lái xe mô tô hạng A1"},
  "A":{title:"HẠNG A",icon:"🏍️",desc:"Lái xe mô tô hạng A"},
  "B số sàn":{title:"B SỐ SÀN",icon:"🚙",desc:"Thời gian đào tạo dự kiến 2,5–3 tháng"},
  "B số tự động":{title:"B SỐ TỰ ĐỘNG",icon:"🚗",desc:"Thời gian đào tạo dự kiến 2,5–3 tháng"},
  "C1":{title:"HẠNG C1",icon:"🚚",desc:"Thời gian đào tạo dự kiến 3,5–4 tháng"}
};
const COURSE_META={
  "A1":{code:"A1",title:"Bằng lái xe máy A1",desc:"Dành cho xe máy đến 175cc",icon:"🛵"},
  "A":{code:"A",title:"Bằng lái xe mô tô A",desc:"Dành cho xe mô tô trên 175cc",icon:"🏍️"},
  "B số sàn":{code:"B",title:"B số sàn",desc:"Lộ trình đầy đủ, linh hoạt nhu cầu sử dụng",icon:"🚙"},
  "B số tự động":{code:"B",title:"B số tự động",desc:"Thuận tiện, dễ làm quen và sử dụng",icon:"🚗"},
  "C1":{code:"C1",title:"Bằng lái xe tải C1",desc:"Dành cho xe tải theo quy định hạng C1",icon:"🚚"}
};
let selectedLicense="B số tự động";
let userSelected=false;

const money=value=>new Intl.NumberFormat("vi-VN").format(Number(value)||0)+" VNĐ";
const $=id=>document.getElementById(id);

function escapeHtml(value=""){
  return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function localIsoDate(date){
  const offset=date.getTimezoneOffset()*60000;
  return new Date(date.getTime()-offset).toISOString().slice(0,10);
}
function captureSource(){
  const params=new URLSearchParams(location.search);
  const source=params.get("utm_source")||params.get("source")||document.referrer||"Truy cập trực tiếp";
  sessionStorage.setItem("new_student_source",String(source).slice(0,180));
}
async function rpc(fn,body){
  const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+fn,{
    method:"POST",
    headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify(body),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||data?.details||"Không thể xử lý yêu cầu lúc này.");
  return data;
}
async function notifyTelegram(registration){
  if(!registration?.id)return;
  try{
    await fetch("/api/telegram-notify",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({registration}),
      keepalive:true
    });
  }catch{}
}
function promotionActive(item){
  if(!(Number(item?.discount_amount)>0||item?.promotion_title||item?.promotion_description))return false;
  if(!item?.promotion_end)return true;
  const end=new Date(String(item.promotion_end)+"T23:59:59");
  return !Number.isNaN(end.valueOf())&&end.valueOf()>=Date.now();
}
function normalizedFees(value){
  if(!Array.isArray(value))return [];
  return value.map(item=>Array.isArray(item)
    ?[String(item[0]||"Khoản phí"),Number(item[1])||0]
    :[String(item?.name||"Khoản phí"),Number(item?.value)||0]);
}

function courseCards(){
  return LICENSES.map(license=>{
    const item=COURSE_META[license];
    return '<button type="button" class="v6-license-card" data-license-card="'+escapeHtml(license)+'" aria-pressed="false">'+
      '<span class="v6-license-card__copy"><b class="v6-license-card__code">'+escapeHtml(item.code)+'</b><strong>'+escapeHtml(item.title)+'</strong><small>'+escapeHtml(item.desc)+'</small></span>'+
      '<span class="v6-license-card__visual">'+item.icon+'</span>'+
      '<span class="v6-license-card__action"><i>Tìm hiểu chi tiết →</i></span>'+
    '</button>';
  }).join("");
}

function priceCards(){
  return LICENSES.map(license=>{
    const item=PRICE_META[license];
    return '<article class="v6-price-card" data-price-card="'+escapeHtml(license)+'">'+
      '<div class="v6-price-card__head"><span class="v6-price-card__icon">'+item.icon+'</span><div><strong>'+escapeHtml(item.title)+'</strong><small>'+escapeHtml(item.desc)+'</small></div></div>'+
      '<div class="v6-price-box"><small>HỌC PHÍ ĐANG ÁP DỤNG</small><del data-price-old hidden></del><strong data-price-value>Đang tải…</strong></div>'+
      '<div class="v6-promo" data-promo hidden><i>◆</i><div><b data-promo-title></b><span data-promo-desc></span><strong data-promo-discount></strong></div></div>'+
      '<div class="v6-price-fees" data-fees></div>'+
      '<ul class="v6-price-included"><li>Lịch học linh hoạt</li><li>Hỗ trợ hồ sơ và thủ tục</li><li>Theo dõi tiến độ đào tạo</li></ul>'+
      '<div class="v6-price-total"><small>Tổng dự kiến theo dữ liệu hiện hành</small><strong data-total>Đang tải…</strong></div>'+
      '<button type="button" data-price-register><span>Đăng ký tư vấn '+escapeHtml(item.title)+'</span><b>→</b></button>'+
    '</article>';
  }).join("");
}

function buildPage(){
  document.querySelectorAll('link[href*="new-student-registration.css"],link[href*="modern-footer.css"],link[href*="pwa-install.css"],link[href*="mobile-viewport-lock.css"],link[href*="taplai-inspired"]').forEach(node=>node.remove());
  document.body.className="registration-premium-v6 v6-building";
  document.body.innerHTML=
  '<div class="v6-top-note"><div class="v6-shell"><span>Đào tạo lái xe rõ ràng · Tư vấn trực tiếp · Hỗ trợ xuyên suốt</span><a href="tel:0984811037">Hotline 0984 811 037</a></div></div>'+
  '<header class="v6-header"><div class="v6-shell v6-header__inner">'+
    '<a class="v6-brand" href="/" aria-label="Trang chủ Học lái xe cùng Đạt"><img src="/logo-thay-dat-compact.webp?v=15" alt="Logo Học lái xe cùng Đạt"><span class="v6-brand__copy"><strong>HỌC LÁI XE <span>CÙNG ĐẠT</span></strong><small>Vững tay lái · An toàn tương lai</small></span></a>'+
    '<nav id="mainNav" class="v6-nav" aria-label="Điều hướng chính"><a href="/">Trang chủ</a><a href="#gioi-thieu">Giới thiệu</a><a href="#khoa-hoc">Các khóa học</a><a href="#hoc-phi">Học phí</a><a href="#quy-trinh">Quy trình</a><a href="#lien-he">Liên hệ</a></nav>'+
    '<a class="v6-hotline" href="tel:0984811037"><i>☎</i><span><strong>0984 811 037</strong><small>Tư vấn miễn phí</small></span></a>'+
    '<button id="mobileMenuButton" class="v6-menu-button" type="button" aria-label="Mở menu" aria-expanded="false">☰</button>'+
  '</div></header>'+

  '<main>'+
  '<section class="v6-hero" id="gioi-thieu"><img class="v6-hero__image" src="/hero-student-car.webp" alt="" aria-hidden="true" fetchpriority="high"><div class="v6-hero__inner">'+
    '<div class="v6-hero__copy"><span class="v6-hero__badge">TRUNG TÂM ĐÀO TẠO LÁI XE UY TÍN</span><h1>HỌC LÁI XE <span>CÙNG ĐẠT</span></h1><p class="v6-hero__lead">Đào tạo bài bản · Lịch học linh hoạt · Vững vàng tay lái</p><p class="v6-hero__text">Tiếp nhận đăng ký A1, A, B số sàn, B số tự động và C1. Lộ trình, lịch học và hồ sơ được tư vấn rõ theo từng hạng.</p><ul class="v6-hero__checks"><li><i>✓</i>Giáo viên kinh nghiệm</li><li><i>✓</i>Xe tập lái đời mới</li><li><i>✓</i>Lịch học linh hoạt</li><li><i>✓</i>Hỗ trợ xuyên suốt khóa học</li></ul><div class="v6-hero__actions"><button class="v6-btn v6-btn--primary" type="button" data-scroll-form>Đăng ký tư vấn ngay</button><a class="v6-btn v6-btn--ghost" href="tel:0984811037">Gọi 0984 811 037</a></div></div>'+

    '<form id="registrationForm" class="v6-consult v6-registration-anchor" novalidate><div id="registrationFields">'+
      '<div class="v6-consult__head"><p class="v6-kicker">ĐĂNG KÝ NGAY</p><h2>Nhận tư vấn khóa học phù hợp</h2><p>Điền thông tin, Học lái xe cùng Đạt sẽ liên hệ hỗ trợ bạn.</p></div>'+
      '<div class="v6-form-grid">'+
        '<label class="v6-form-label"><span>Họ và tên *</span><span class="v6-control"><i>♙</i><input id="fullName" name="fullName" autocomplete="name" minlength="2" maxlength="80" required placeholder="Họ và tên của bạn"></span></label>'+
        '<label class="v6-form-label"><span>Số điện thoại *</span><span class="v6-control"><i>☎</i><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" minlength="9" maxlength="15" required placeholder="Số điện thoại"></span></label>'+
        '<label class="v6-form-label"><span>Khóa học quan tâm</span><span class="v6-control"><i>◇</i><select id="licenseClass" name="licenseClass"><option value="A1">Hạng A1</option><option value="A">Hạng A</option><option value="B số sàn">Hạng B số sàn</option><option value="B số tự động" selected>Hạng B số tự động</option><option value="C1">Hạng C1</option></select></span></label>'+
        '<label class="v6-form-label"><span>Khu vực *</span><span class="v6-control"><i>⌖</i><input id="area" name="area" maxlength="160" required placeholder="Ví dụ: Quận 7, TP.HCM"></span></label>'+
        '<label class="v6-form-label"><span>Ghi chú thêm</span><textarea id="note" name="note" rows="2" maxlength="800" placeholder="Nhu cầu hoặc thời gian học mong muốn..."></textarea></label>'+
      '</div>'+
      '<details class="v6-form-details"><summary>Thông tin bổ sung</summary><div class="v6-form-extra">'+
        '<label class="v6-form-label"><span>Ngày sinh</span><span class="v6-control"><input id="dateOfBirth" name="dateOfBirth" type="date"></span></label>'+
        '<label class="v6-form-label"><span>Ngày dự kiến bắt đầu</span><span class="v6-control"><input id="preferredStartDate" name="preferredStartDate" type="date"></span></label>'+
        '<label class="v6-form-label"><span>Khung giờ dễ liên hệ</span><span class="v6-control"><select id="preferredContactTime" name="preferredContactTime"><option value="Linh hoạt">Linh hoạt</option><option value="Buổi sáng">Buổi sáng</option><option value="Buổi chiều">Buổi chiều</option><option value="Buổi tối">Buổi tối</option><option value="Cuối tuần">Cuối tuần</option></select></span></label>'+
        '<label class="v6-form-label"><span>Kênh tư vấn</span><span class="v6-control"><select id="consultationChannel" name="consultationChannel"><option value="Zalo">Zalo</option><option value="Gọi điện">Gọi điện</option><option value="Zalo hoặc gọi điện">Zalo hoặc gọi điện</option></select></span></label>'+
        '<label class="v6-form-label"><span>Đã từng học lái xe chưa?</span><span class="v6-control"><select id="learningHistory" name="learningHistory"><option value="Chưa từng học">Chưa từng học</option><option value="Đã từng học nhưng chưa thi">Đã từng học nhưng chưa thi</option><option value="Đã thi nhưng chưa đạt">Đã thi nhưng chưa đạt</option><option value="Cần tư vấn thêm">Cần tư vấn thêm</option></select></span></label>'+
      '</div></details>'+
      '<label class="v6-consent"><input id="consent" type="checkbox" required><span>Tôi đồng ý để Học lái xe cùng Đạt sử dụng thông tin đã cung cấp nhằm liên hệ, tư vấn khóa học. Xem <a href="/chinh-sach-bao-mat.html" target="_blank" rel="noopener noreferrer">chính sách bảo mật</a>.</span></label>'+
      '<label class="honeypot" aria-hidden="true">Website<input id="website" name="website" tabindex="-1" autocomplete="off"></label>'+
      '<p id="registrationError" class="v6-form-error" role="alert"></p>'+
      '<button id="registrationSubmit" class="v6-submit" type="submit"><span>ĐĂNG KÝ TƯ VẤN MIỄN PHÍ</span> →</button>'+
      '<p class="v6-privacy">🔒 Thông tin của bạn được bảo mật.</p>'+
    '</div><section id="registrationSuccess" class="v6-success" hidden aria-live="polite"><span>✓</span><p>ĐĂNG KÝ THÀNH CÔNG</p><h3>Cảm ơn bạn đã đăng ký!</h3><div>Hạng đào tạo: <strong id="successLicense">B số tự động</strong></div><div>Mã đăng ký: <strong id="successCode">Đang cập nhật</strong></div><small>Học lái xe cùng Đạt sẽ liên hệ để tư vấn hồ sơ và lộ trình phù hợp.</small><a href="https://zalo.me/0984811037" target="_blank" rel="noopener noreferrer">Nhắn Zalo hỗ trợ</a><button id="newRegistration" type="button">Tạo đăng ký khác</button></section></form>'+
  '</div></section>'+

  '<section class="v6-trust"><div class="v6-shell v6-trust__grid"><article class="v6-trust__item"><span class="v6-trust__icon">◆</span><div><strong>UY TÍN - MINH BẠCH</strong><small>Thông tin rõ ràng, dễ theo dõi</small></div></article><article class="v6-trust__item"><span class="v6-trust__icon">♟</span><div><strong>GIÁO VIÊN KINH NGHIỆM</strong><small>Tận tâm, nhiệt tình, dễ hiểu</small></div></article><article class="v6-trust__item"><span class="v6-trust__icon">▦</span><div><strong>LỊCH HỌC LINH HOẠT</strong><small>Sáng, chiều, tối, cuối tuần</small></div></article><article class="v6-trust__item"><span class="v6-trust__icon">🚗</span><div><strong>XE TẬP LÁI ĐỜI MỚI</strong><small>Trang thiết bị hiện đại, an toàn</small></div></article></div></section>'+

  '<section id="khoa-hoc" class="v6-section v6-courses"><div class="v6-shell"><div class="v6-heading"><p class="v6-kicker">KHÓA HỌC LÁI XE</p><h2>Các hạng bằng đào tạo tại Học lái xe cùng Đạt</h2><p>Chọn hạng phù hợp với nhu cầu. Khi chưa chọn, 5 thẻ hiển thị đồng đều.</p></div><div class="v6-license-grid">'+courseCards()+'</div><p class="v6-course-note">Chọn một hạng để đồng bộ với biểu mẫu đăng ký và bảng học phí.</p></div></section>'+

  '<section id="hoc-phi" class="v6-section v6-tuition"><div class="v6-shell"><div class="v6-heading"><span class="v6-tuition__label">🎓 HỌC PHÍ & CÁC KHOẢN NỘP RIÊNG</span><h2>Bảng học phí theo từng hạng đào tạo</h2><p>Dữ liệu học phí và ưu đãi được đọc trực tiếp từ hệ thống quản trị hiện có.</p></div><div class="v6-tuition__note"><b>!</b><span><strong>Lưu ý:</strong> Lệ phí khám sức khỏe (nếu áp dụng), sát hạch, cấp giấy phép, thi lại và các khoản nộp riêng được thông báo rõ nếu phát sinh.</span></div><div class="v6-price-grid">'+priceCards()+'</div></div></section>'+

  '<section class="v6-section v6-why"><div class="v6-shell v6-why__grid"><div class="v6-why__intro"><h2>Vì sao nên học lái xe cùng Đạt?</h2><p>Trải nghiệm học rõ ràng, thuận tiện và dễ theo dõi trong toàn bộ lộ trình.</p><button class="v6-btn v6-btn--primary" type="button" data-scroll-form>Đăng ký tư vấn →</button></div><div class="v6-why__col"><article class="v6-why__card green"><i>🎓</i><div><strong>Đào tạo bài bản</strong><small>Lộ trình rõ ràng, bám sát chương trình</small></div></article><article class="v6-why__card"><i>♟</i><div><strong>Giáo viên tận tâm</strong><small>Hướng dẫn chi tiết, dễ hiểu</small></div></article></div><div class="v6-why__col"><article class="v6-why__card"><i>▦</i><div><strong>Hỗ trợ linh hoạt</strong><small>Sắp xếp lịch theo thời gian của bạn</small></div></article><article class="v6-why__card green"><i>☎</i><div><strong>Hỗ trợ trọn gói</strong><small>Tư vấn hồ sơ, lịch học và lịch thi</small></div></article></div></div></section>'+

  '<section id="quy-trinh" class="v6-process"><div class="v6-shell"><h2>Quy trình học lái xe đơn giản · Rõ ràng · Thuận tiện</h2><div class="v6-process__grid"><article class="v6-step"><b>01</b><strong>Đăng ký tư vấn</strong><small>Điền thông tin hoặc gọi hotline</small></article><article class="v6-step"><b>02</b><strong>Hoàn thiện hồ sơ</strong><small>Được hướng dẫn chuẩn bị giấy tờ</small></article><article class="v6-step"><b>03</b><strong>Tham gia khóa học</strong><small>Học lý thuyết và thực hành</small></article><article class="v6-step"><b>04</b><strong>Thi sát hạch</strong><small>Được hỗ trợ lịch và hướng dẫn</small></article><article class="v6-step"><b>05</b><strong>Nhận bằng lái xe</strong><small>Hoàn thành lộ trình đào tạo</small></article></div></div></section>'+

  '<section id="testimonialsSection" class="v6-testimonials" hidden><div class="v6-shell"><div class="v6-heading"><p class="v6-kicker">HỌC VIÊN NÓI GÌ VỀ CHÚNG TÔI</p><h2>Cảm nhận từ học viên</h2></div><div id="testimonialGrid" class="v6-testimonial-grid"></div></div></section>'+
  '</main>'+

  '<footer id="lien-he" class="v6-footer"><div class="v6-shell v6-footer__main"><section class="v6-footer__brand"><div><div class="v6-footer__brand"><img src="/logo-thay-dat-compact.webp?v=15" alt="Logo Học lái xe cùng Đạt"><div><strong>HỌC LÁI XE CÙNG ĐẠT</strong><small>Vững tay lái · An toàn tương lai</small></div></div><p>Đồng hành cùng bạn trong hành trình chinh phục tay lái.</p></div></section><section><h3>Liên hệ với chúng tôi</h3><ul><li><a href="tel:0984811037">0984 811 037</a></li><li><a href="mailto:thaydat.dtlx@gmail.com">thaydat.dtlx@gmail.com</a></li><li>TP. Hồ Chí Minh</li></ul></section><section><h3>Liên kết nhanh</h3><ul><li><a href="/">Trang chủ</a></li><li><a href="#hoc-phi">Học phí</a></li><li><a href="/600-cau-hoi.html">Học lý thuyết</a></li><li><a href="/?login=1">Hệ thống học viên</a></li></ul></section><section><h3>Hỗ trợ</h3><ul><li><a href="/chinh-sach-bao-mat.html">Chính sách bảo mật</a></li><li><a href="https://zalo.me/0984811037" target="_blank" rel="noopener noreferrer">Hỗ trợ qua Zalo</a></li></ul><div class="v6-footer__socials"><a href="https://www.facebook.com/profile.php?id=61579863779611" target="_blank" rel="noopener noreferrer">f</a><a href="https://www.tiktok.com/@datdidaydo99" target="_blank" rel="noopener noreferrer">♪</a><a href="https://zalo.me/0984811037" target="_blank" rel="noopener noreferrer">Zalo</a></div></section></div><div class="v6-shell v6-footer__bottom"><span>© 2026 Học lái xe cùng Đạt. Tất cả quyền được bảo lưu.</span><span>Thiết kế tối ưu cho máy tính và điện thoại</span></div></footer>'+
  '<div class="v6-mobile-cta"><a href="tel:0984811037">☎ Gọi tư vấn</a><button type="button" data-scroll-form>Đăng ký ngay</button></div>';

  requestAnimationFrame(()=>document.body.classList.remove("v6-building"));
  requestAnimationFrame(()=>document.body.classList.add("v6-ready"));
}

function setLicense(license,{scroll=false}={}){
  if(!LICENSES.includes(license))return;
  selectedLicense=license;
  $("licenseClass").value=license;
  if(userSelected){
    document.querySelectorAll("[data-license-card]").forEach(card=>{
      const active=card.dataset.licenseCard===license;
      card.classList.toggle("is-selected",active);
      card.setAttribute("aria-pressed",String(active));
    });
    document.querySelectorAll("[data-price-card]").forEach(card=>card.classList.toggle("is-selected",card.dataset.priceCard===license));
  }else{
    document.querySelectorAll("[data-license-card],[data-price-card]").forEach(card=>card.classList.remove("is-selected"));
  }
  if(scroll)$("registrationForm")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function bindUi(){
  const nav=$("mainNav"),menu=$("mobileMenuButton");
  menu?.addEventListener("click",()=>{
    const open=nav.classList.toggle("is-open");
    menu.setAttribute("aria-expanded",String(open));
  });
  nav?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>nav.classList.remove("is-open")));

  document.querySelectorAll("[data-scroll-form]").forEach(btn=>btn.addEventListener("click",()=>$("registrationForm")?.scrollIntoView({behavior:"smooth",block:"start"})));
  document.querySelectorAll("[data-license-card]").forEach(card=>card.addEventListener("click",()=>{userSelected=true;setLicense(card.dataset.licenseCard);}));
  document.querySelectorAll("[data-price-card]").forEach(card=>card.addEventListener("click",event=>{
    userSelected=true;
    setLicense(card.dataset.priceCard,{scroll:Boolean(event.target.closest("[data-price-register]"))});
  }));
  $("licenseClass")?.addEventListener("change",event=>{userSelected=true;setLicense(event.target.value);});
}

async function loadTuition(){
  try{
    const config=await rpc("app_public_tuition_config",{});
    const rows=Array.isArray(config)?config.filter(item=>item?.active!==false):[];
    for(const license of LICENSES){
      const card=document.querySelector('[data-price-card="'+CSS.escape(license)+'"]');
      if(!card)continue;
      const item=rows.find(row=>row?.license_class===license);
      const price=card.querySelector("[data-price-value]");
      const old=card.querySelector("[data-price-old]");
      const promo=card.querySelector("[data-promo]");
      const fees=card.querySelector("[data-fees]");
      const total=card.querySelector("[data-total]");
      if(!item){
        price.textContent="Liên hệ tư vấn";old.hidden=true;promo.hidden=true;fees.innerHTML="";total.textContent="Liên hệ tư vấn";
        continue;
      }
      const tuition=Number(item.tuition)||0;
      const discount=promotionActive(item)?Math.min(Number(item.discount_amount)||0,tuition):0;
      const final=Math.max(0,tuition-discount);
      const feeRows=normalizedFees(item.fees);
      const feeTotal=feeRows.reduce((sum,row)=>sum+(Number(row[1])||0),0);
      price.textContent=tuition?money(final):"Liên hệ tư vấn";
      if(discount){old.textContent=money(tuition);old.hidden=false}else old.hidden=true;
      if(promotionActive(item)){
        promo.hidden=false;
        promo.querySelector("[data-promo-title]").textContent=item.promotion_title||"Ưu đãi hiện tại";
        promo.querySelector("[data-promo-desc]").textContent=item.promotion_description||"";
        promo.querySelector("[data-promo-discount]").textContent=discount?"Giảm "+money(discount):"";
      }else promo.hidden=true;
      fees.innerHTML=feeRows.map(row=>'<div><span>'+escapeHtml(row[0])+'</span><b>'+money(row[1])+'</b></div>').join("");
      total.textContent=tuition?money(final+feeTotal):"Liên hệ tư vấn";
    }
  }catch{
    document.querySelectorAll("[data-price-value],[data-total]").forEach(node=>node.textContent="Liên hệ tư vấn");
  }
}

async function loadTestimonials(){
  try{
    const response=await fetch("/api/student-testimonials",{cache:"no-store"});
    const data=await response.json();
    const images=Array.isArray(data?.images)?data.images:[];
    if(!response.ok||!images.length)return;
    $("testimonialGrid").innerHTML=images.slice(0,8).map((item,index)=>'<article class="v6-testimonial-card"><img loading="lazy" decoding="async" src="'+item.imageUrl+'" alt="Nhận xét học viên '+(index+1)+'"></article>').join("");
    $("testimonialsSection").hidden=false;
  }catch{}
}

function bindForm(){
  const form=$("registrationForm"),submit=$("registrationSubmit"),error=$("registrationError");
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  $("preferredStartDate").min=localIsoDate(tomorrow);

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    error.textContent="";
    if(!form.reportValidity())return;
    if(!$("consent").checked){error.textContent="Vui lòng đồng ý để Học lái xe cùng Đạt liên hệ tư vấn.";return}
    submit.disabled=true;
    submit.querySelector("span").textContent="Đang gửi đăng ký…";
    try{
      const source=sessionStorage.getItem("new_student_source")||"Truy cập trực tiếp";
      const originalNote=$("note").value.trim();
      const trackedNote=[originalNote,"Nguồn đăng ký: "+source].filter(Boolean).join("\n").slice(0,800);
      const payload={
        full_name:$("fullName").value.trim(),
        phone:$("phone").value.trim(),
        license_class:$("licenseClass").value,
        date_of_birth:$("dateOfBirth").value||null,
        area:$("area").value.trim(),
        preferred_start_date:$("preferredStartDate").value||null,
        preferred_contact_time:$("preferredContactTime").value,
        consultation_channel:$("consultationChannel").value,
        learning_history:$("learningHistory").value,
        note:trackedNote,
        consent:true,
        website:$("website").value
      };
      const result=await rpc("app_create_new_student_registration",{p_data:payload});
      notifyTelegram({id:result?.id,registration_code:result?.registration_code,full_name:payload.full_name,phone:payload.phone,license_class:payload.license_class,area:payload.area,preferred_start_date:payload.preferred_start_date,preferred_contact_time:payload.preferred_contact_time,consultation_channel:payload.consultation_channel,note:payload.note});
      $("successLicense").textContent=payload.license_class;
      $("successCode").textContent=result?.registration_code||"Đã ghi nhận";
      $("registrationFields").hidden=true;
      $("registrationSuccess").hidden=false;
      $("registrationSuccess").scrollIntoView({behavior:"smooth",block:"center"});
    }catch(reason){
      const message=String(reason?.message||"");
      error.innerHTML=/app_create_new_student_registration|schema cache|PGRST202|Could not find/i.test(message)
        ?'Tính năng nhận đăng ký đang được kích hoạt. Vui lòng <a href="https://zalo.me/0984811037" target="_blank" rel="noopener noreferrer">gửi thông tin qua Zalo</a> để được hỗ trợ ngay.'
        :message||"Chưa thể gửi đăng ký. Vui lòng kiểm tra kết nối và thử lại.";
    }finally{
      submit.disabled=false;
      submit.querySelector("span").textContent="ĐĂNG KÝ TƯ VẤN MIỄN PHÍ";
    }
  });

  $("newRegistration")?.addEventListener("click",()=>{
    form.reset();
    selectedLicense="B số tự động";
    userSelected=false;
    setLicense(selectedLicense);
    $("preferredStartDate").min=localIsoDate(tomorrow);
    $("registrationSuccess").hidden=true;
    $("registrationFields").hidden=false;
    error.textContent="";
    $("fullName").focus();
  });
}

captureSource();
buildPage();
bindUi();
bindForm();
setLicense(selectedLicense);
loadTuition();
loadTestimonials();
