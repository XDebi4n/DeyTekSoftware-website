/* Fichas de juegos y personajes, animaciones al hacer scroll y bloqueo del formulario */
const BG = "radial-gradient(circle at 30% 20%,#fff,transparent 50%),linear-gradient(160deg,#3a3a3f,#000)";
const det = $("#detail"), dc = $("#dc");
let curVideo = "";


const media = v => !v ? "" : /\.(mp4|webm)$/i.test(v)
  ? `<video controls playsinline preload="metadata" src="${esc(v)}"></video>`
  : `<iframe src="${esc(v)}" title="Tráiler" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
function showDetail(html){ dc.innerHTML = html; det.showModal(); det.scrollTop = 0; }

function openGame(i){
  const g = games[i], imgs = [g.img, ...(g.shots || [])].filter(Boolean);
  curVideo = media(g.video);
  const first = curVideo || (imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(g.n)}" onerror="this.remove()">` : "");
  const ths = (curVideo ? `<button type="button" class="th" data-v="1">▶ Tráiler</button>` : "") + imgs.map(s => `<button type="button" class="th" data-s="${esc(s)}"><img src="${esc(s)}" alt="" onerror="this.parentNode.remove()"></button>`).join("");
  const has = Object.keys(PLAT).some(k => g.links[k]);
  const cs = g.characters || [];
  const chs = cs.length ? `<h3 class="ch">Personajes destacados</h3><div class="crs">${cs.map(c => `<div class="cr"><div class="cph" style="background:${c.a || BG}"><b>${esc(c.n[0])}</b>${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.n)}" loading="lazy" onerror="this.remove()">` : ""}</div><div><h4>${esc(c.n)}</h4><p class="role">${esc(c.r || "")}</p><dl>${Object.entries(c.data || {}).map(([k,v]) => `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join("")}</dl><p>${esc(c.story || "")}</p></div></div>`).join("")}</div>` : "";
  showDetail(`<div class="dm" id="dm" style="background:${g.a}">${first}</div>${ths ? `<div class="ths">${ths}</div>` : ""}<div class="dbody"><h2>${esc(g.n)}</h2><div class="meta"><span>${g.g}</span><span>${g.y}</span><span>${esc(g.p)}</span></div><p>${esc(g.info || g.d)}</p>${has ? `<button type="button" class="btn solid" id="get">Obtener juego</button><div class="plats" id="plist" hidden>${plats(g)}</div>` : `<div class="plats"><span class="soon">Próximamente</span></div>`}${chs}</div>`);
}

document.addEventListener("click", e => {
  const g = e.target.closest(".game"), th = e.target.closest(".th");
  if(g) openGame(+g.id.slice(2));
  else if(th){ $("#dm").innerHTML = th.dataset.v ? curVideo : `<img src="${th.dataset.s}" alt="" onerror="this.remove()">`; }
  else if(e.target.closest("#get")){ const l = $("#plist"); l.hidden = !l.hidden; }
});
document.addEventListener("keydown", e => {
  if((e.key === "Enter" || e.key === " ") && e.target.matches(".game")){ e.preventDefault(); e.target.click(); }
});
$("#dx").onclick = () => det.close();
det.addEventListener("click", e => { if(e.target === det) det.close(); });
det.addEventListener("close", () => { dc.innerHTML = ""; });

/* Animaciones al aparecer en pantalla */
const io = new IntersectionObserver(list => list.forEach(x => {
  if(x.isIntersecting){ const t = x.target; t.classList.add("in"); io.unobserve(t); setTimeout(() => t.style.transitionDelay = "", 1200); }
}), {threshold:.12});
document.querySelectorAll("h2,.game,.cform,.tw,.values>div,.roles li,.about .big,.join form,.empty").forEach((el,i) => {
  el.classList.add("rv"); el.style.transitionDelay = (i % 4) * 70 + "ms"; io.observe(el);
});

/* El formulario Únete solo se activa con la sesión iniciada */
const lock = $("#lock"), fs = $("#fs"), jf = $("#form");
function sync(){
  const u = window.deytekUser;
  lock.hidden = !!u; fs.disabled = !u;
  if(u){ if(!jf.elements.nombre.value) jf.elements.nombre.value = u.displayName || ""; if(!jf.elements.correo.value) jf.elements.correo.value = u.email || ""; }
}
document.addEventListener("deytek:auth", sync); sync();
$("#lockbtn").onclick = () => { if(window.openAuth) window.openAuth(); };
