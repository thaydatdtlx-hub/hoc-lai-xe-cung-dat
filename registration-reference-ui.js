const select=document.getElementById("heroLicenseSelect");
const cards=[...document.querySelectorAll("[data-license-card]")];

function syncSelectFromCards(){
  const active=cards.find(card=>card.getAttribute("aria-pressed")==="true");
  if(active&&select&&select.value!==active.dataset.licenseCard)select.value=active.dataset.licenseCard;
}

select?.addEventListener("change",()=>{
  const card=cards.find(item=>item.dataset.licenseCard===select.value);
  card?.click();
});

cards.forEach(card=>card.addEventListener("click",syncSelectFromCards));

const toggle=document.querySelector("[data-mobile-menu-toggle]");
const nav=document.querySelector(".desktop-nav");
toggle?.addEventListener("click",()=>{
  const open=nav?.classList.toggle("mobile-open");
  toggle.setAttribute("aria-expanded",String(Boolean(open)));
});
nav?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>nav.classList.remove("mobile-open")));

syncSelectFromCards();