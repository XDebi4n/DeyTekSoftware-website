/* IDs de amigo (DTK-xxxxx) de las cuentas admin: ven el botón "Solicitudes".
   Debe ser EXACTAMENTE la que sale en tu perfil ("Tu ID"). */
const ADMIN_IDS = ["DTK-73081"];

/* Ya no se usa: las solicitudes del formulario "Únete" se guardan en Firestore (ver sendApplication). */
const JOIN_ENDPOINT = "";

/* Plataformas disponibles para los botones de descarga */
const PLAT = {steam:"Steam",ps:"PlayStation Store",xbox:"Xbox",switch:"Nintendo Switch",epic:"Epic Games",ios:"App Store",android:"Google Play",pc:"Descargar para PC"};

/* JUEGOS (al tocar una tarjeta se abre su ficha):
   img = imagen principal, shots = más fotos, video = enlace de YouTube "https://www.youtube.com/embed/ID" o un .mp4,
   info = descripción larga,
   characters = personajes destacados de ese juego (n, r, img, data, story), links = botones de "Obtener juego" (sin enlaces sale "Próximamente"). */
const games = [
  {n:"Hollow Jack 2024",g:"Terror",y:2024,p:"PC - Mobiles",d:"Encuentra la llave, abre una tapa de alcantarilla, despierta en un lugar, busca una palanca y acciónala, da comienzo al juego, repara 7 sistemas eléctricos y escapa..",a:"radial-gradient(circle at 70% 30%,#fff,transparent 45%),linear-gradient(135deg,#2a2a2e,#000)",
   img:"img/hollow.png", shots:["img/hollowjackimg2.png", "img/hollowjackimg3.png", "img/hollowjackimg4.png"], video:"img/hollowjacktrailer.mp4",
   info:"Encuentra la llave, abre una tapa de alcantarilla, despierta en un lugar, busca una palanca y acciónala, da comienzo al juego, repara 7 sistemas eléctricos y escapa.",
   characters:[
     {n:"Hollow Jack",r:"Sicario",img:"img/hollowjacki.png",data:{Altura:"1,85 m",Edad:"27 años",Origen:"Estado Unidense"},story:"Un niño al que se le privó de su libertad, convertido ya en hombre, busca el mal en este mundo."},
   ],
      //links:{steam:"https://store.steampowered.com/",ps:"https://store.playstation.com/",xbox:"https://www.xbox.com/games"}},

      links:{android:"https://play.google.com/store/apps/details?id=com.XDebian.HollowJack&hl=es_HN",pc:"https://xdebian.itch.io/hollow-jack"}},

];
const EMPTY_TEAM = `<div class="glass pad empty"><h3>Estamos armando el equipo</h3><p>Aún no hay perfiles publicados. ¿Quieres ser de los primeros?</p><a class="btn solid" href="#unete">Únete a Deytek!</a></div>`;

/*todos los roles xd*/
const roles = [
  {n:"Programación",d:"Gameplay, motores y herramientas"},
  {n:"Arte y animación",d:"2D, 3D, personajes y entornos"},
  {n:"Diseño de juegos",d:"Mecánicas, niveles y narrativa"},
  {n:"Sonido y música",d:"Efectos, banda sonora y mezcla"},
  {n:"Producción y comunidad",d:"Planificación, redes y soporte"},
   {n:"Planificacion  de proyectos",d:"Agrupacion de juegos"},

];

const team = [
  {id: "DTK-73081", r:"Creador"},
  {id: "DTK-64091", r:"Chupador de penes"},
]



const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const plats = g => { const k = Object.keys(PLAT).filter(k => g.links[k]); return k.length ? k.map(k => `<a href="${esc(g.links[k])}" target="_blank" rel="noopener">${PLAT[k]}</a>`).join("") : `<span class="soon">Próximamente</span>`; };
$("#grid").innerHTML = games.map((g,i)=>`<article class="glass game" id="g-${i}" data-g="${g.g}" tabindex="0" role="button" aria-label="Ver ${esc(g.n)}"><div class="art" style="background:${g.a}">${g.img?`<img src="${esc(g.img)}" alt="" loading="lazy" onerror="this.remove()">`:""}</div><div class="body"><h3>${esc(g.n)}</h3><p>${esc(g.d)}</p><div class="meta"><span>${g.g}</span><span>${g.y}</span><span>${esc(g.p)}</span></div></div></article>`).join("");
$("#team").innerHTML = team.length ? '<p class="cnone">Cargando equipo…</p>' : EMPTY_TEAM;
$("#roles").innerHTML = roles.map(r=>`<li class="glass"><b>${esc(r.n)}</b><span>${esc(r.d)}</span></li>`).join("");
$("#area").innerHTML = `<option value="" disabled selected>Elige un área</option>` + roles.map(r=>`<option>${esc(r.n)}</option>`).join("");


const genres = ["Todos", ...new Set(games.map(g=>g.g))];
$("#filters").innerHTML = genres.map((g,i)=>`<button class="${i?"":"on"}">${g}</button>`).join("");
function filter(g){
  document.querySelectorAll("#filters button").forEach(b=>b.classList.toggle("on",b.textContent===g));
  document.querySelectorAll(".game").forEach(c=>c.hidden = g!=="Todos" && c.dataset.g!==g);
}
$("#filters").onclick = e => e.target.tagName==="BUTTON" && filter(e.target.textContent);

const index = [
  ...games.map((g,i)=>({t:"Juego",n:g.n,h:"g-"+i,k:(g.n+g.g+g.d+g.p+Object.keys(g.links).map(k=>PLAT[k]).join(" "))})),
  ...team.map((m,i)=>({t:"Equipo",get n(){return m.name||m.r},h:"m-"+i,get k(){return (m.name||"")+" "+m.r}})),
  ...roles.map(r=>({t:"Vacante",n:r.n,h:"unete",k:r.n+r.d})),
  ...games.flatMap((g,i)=>(g.characters||[]).map(c=>({t:"Personaje",n:c.n,h:"g-"+i,k:c.n+c.r+(c.story||"")}))),
  ...[["Inicio","inicio"],["Juegos","juegos"],["Épicas historias de usuario","historias"],["Quiénes somos","nosotros"],["Equipo","equipo"],["Únete a Deytek","unete"]].map(([n,h])=>({t:"Sección",n,h,k:n}))
];
const q = $("#q"), box = $("#results");
let hits = [], cur = 0;
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function show(){
  const t = norm(q.value.trim());
  if(!t){box.hidden = true; return;}
  hits = index.filter(x=>norm(x.k).includes(t)).slice(0,7); cur = 0;
  box.innerHTML = hits.length ? hits.map((h,i)=>`<li role="option" class="${i?"":"on"}" data-i="${i}"><span>${esc(h.n)}</span><small>${h.t}</small></li>`).join("") : `<li class="none">Sin resultados para «${esc(q.value)}»</li>`;
  box.hidden = false;
}
function go(h){
  box.hidden = true; q.blur();
  const el = document.getElementById(h.h);
  if(!el) return;
  filter("Todos");
  el.scrollIntoView({behavior:"smooth",block:"center"});
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
q.addEventListener("input", show);
q.addEventListener("focus", show);
q.addEventListener("keydown", e => {
  const lis = box.querySelectorAll("li[data-i]");
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault(); if(!lis.length) return;
    cur = (cur + (e.key==="ArrowDown"?1:-1) + lis.length) % lis.length;
    lis.forEach((l,i)=>l.classList.toggle("on",i===cur));
  } else if(e.key==="Enter" && hits[cur]){ go(hits[cur]); }
  else if(e.key==="Escape"){ box.hidden = true; q.blur(); }
});
box.addEventListener("mousedown", e => { const li = e.target.closest("li[data-i]"); if(li) go(hits[+li.dataset.i]); });
document.addEventListener("click", e => { if(!e.target.closest(".search")) box.hidden = true; });
document.addEventListener("keydown", e => { if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); q.focus(); q.select(); } });

/* ===== Brillo de vidrio que sigue al cursor ===== */
document.addEventListener("pointermove", e => {
  const g = e.target.closest(".glass");
  if(g){ const r = g.getBoundingClientRect(); g.style.setProperty("--mx",(e.clientX-r.left)+"px"); g.style.setProperty("--my",(e.clientY-r.top)+"px"); }
  const o = $(".orb");
  if(o){
    o.style.setProperty("--ox",((e.clientX/innerWidth-.5)*40)+"px");
    o.style.setProperty("--oy",((e.clientY/innerHeight-.5)*40)+"px");
  }
});

/* ===== Formulario Únete: hoja de vida + verificación anti-bot ===== */
const form = $("#form"), dlg = $("#verify"), track = $("#track"), knob = $("#knob"), fill = track.querySelector(".fill"), hint = $("#hint");
const st = $("#status");

let drag = false, startX = 0, pos = 0, verified = false;
const maxPos = () => track.clientWidth - knob.offsetWidth - 8;
function setPos(p){ pos = Math.max(0, Math.min(maxPos(), p)); knob.style.transform = `translateX(${pos}px)`; fill.style.width = (pos + 54) + "px"; }
function resetTrack(){ verified = false; track.classList.remove("ok"); hint.textContent = "Desliza para verificar"; knob.style.transition = fill.style.transition = "none"; setPos(0); }
function snapBack(){ knob.style.transition = "transform .4s var(--ease)"; fill.style.transition = "width .4s var(--ease)"; setPos(0); }
function success(){
  if(verified) return; verified = true;
  track.classList.add("ok"); hint.textContent = "Verificado";
  setTimeout(() => { dlg.close(); sendApplication(); }, 700);
}

/* Guarda la solicitud en Firestore (la hoja de vida va como enlace, sin Storage).
   Solo las cuentas admin (ADMIN_IDS + reglas) pueden leerla en el panel "Solicitudes". */

async function sendApplication(){
  const u = window.deytekUser;
  if(!u || !window.firebase || !firebase.apps.length){ st.textContent = "Falta conectar Firebase."; return; }
  st.textContent = "Enviando…";
  try{
    const el = form.elements;
    /* Solo Firestore (sin Storage). Los largos coinciden con los límites de firestore.rules. */
    await firebase.firestore().collection("applications").add({
      uid: u.uid,
      nombre: el.nombre.value.trim().slice(0, 80),
      correo: el.correo.value.trim().slice(0, 120),
      area: el.area.value.slice(0, 60),
      enlace: el.enlace.value.trim().slice(0, 300),
      mensaje: el.mensaje.value.trim().slice(0, 2000),
      cvPath: el.cvlink.value.trim().slice(0, 300),
      cvName: "Enlace",
      seen: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    st.textContent = "¡Solicitud enviada con éxito!";
    form.reset();
  }catch(err){
    console.error("[solicitud]", err);
    st.textContent = err.code === "permission-denied"
      ? "No se pudo enviar: faltan publicar las reglas de Firestore (permission-denied)."
      : "No pudimos enviar tu solicitud. Inténtalo de nuevo." + (err.code ? " (" + err.code + ")" : "");
  }
}
knob.addEventListener("pointerdown", e => { drag = true; startX = e.clientX - pos; knob.setPointerCapture(e.pointerId); knob.style.transition = fill.style.transition = "none"; });
knob.addEventListener("pointermove", e => { if(drag) setPos(e.clientX - startX); });
const release = () => { if(!drag) return; drag = false; pos >= maxPos() - 2 ? success() : snapBack(); };
knob.addEventListener("pointerup", release);
knob.addEventListener("pointercancel", release);
knob.addEventListener("keydown", e => {
  if(e.key === "ArrowRight"){ setPos(pos + maxPos() / 4); if(pos >= maxPos() - 2) success(); }
  if(e.key === "ArrowLeft") setPos(pos - maxPos() / 4);
});
$("#cancel").onclick = () => dlg.close();
dlg.addEventListener("close", () => { if(!verified) resetTrack(); });
form.addEventListener("submit", e => {
  e.preventDefault(); st.textContent = "";
  if(!window.deytekUser){ if(window.openAuth) window.openAuth(); return; }
  if(form.elements.web.value){ form.reset(); return; } // trampa para bots
  const link = form.elements.cvlink.value.trim(); if(!/^https?:\/\//i.test(link)){ st.textContent = "Pon un enlace válido a tu hoja de vida (debe empezar con https://)."; return; }
  resetTrack(); dlg.showModal();
});


const mBtn = document.querySelector("#menu-btn");
const navLinks = document.querySelector(".nav nav");
if(mBtn && navLinks){
  mBtn.style.display = window.innerWidth <= 820 ? "inline-flex" : "none";
  mBtn.onclick = () => {
    navLinks.style.display = navLinks.style.display === "flex" ? "none" : "flex";
    if(navLinks.style.display === "flex"){
      navLinks.style.cssText = "display:flex; flex-direction:column; position:absolute; top:70px; left:0; right:0; background:rgba(18,18,20,0.95); padding:20px; border-radius:20px; text-align:center; backdrop-filter:blur(20px);";
    }
  };
}