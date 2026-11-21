/* Panel de solicitudes: solo visible para las cuentas de ADMIN_IDS (script.js) */
(() => {
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  if(!ready){ console.warn("[solicitudes] Firebase no está listo."); return; }
  const db = firebase.firestore();
  const btn = $("#req-btn"), dlg = $("#req-dlg"), list = $("#req-list"), badge = $("#rbadge");
  let unsub = null, lastDocs = [], who = {}, fstat = {};

  const css = document.createElement("style");
  css.textContent = ".who{display:flex;gap:10px;align-items:center;margin:4px 0 10px}.who img{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none}.who small{display:block;color:var(--mut)}.req .acts a.btn{text-decoration:none}";
  document.head.appendChild(css);

  const when = ms => new Date(ms).toLocaleString("es", {dateStyle:"medium", timeStyle:"short"});
  const safeUrl = u => /^https?:\/\//i.test(u) ? u : "";
  const sameId = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
  const pairId = (a, b) => [a, b].sort().join("_");
  const letter = n => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8e8e93"/><text x="50" y="66" font-size="48" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#000">${((n || "?")[0]).toUpperCase().replace(/[<>&"']/g, "?")}</text></svg>`);

  function stop(){
    if(unsub){ unsub(); unsub = null; }
    btn.hidden = true; badge.hidden = true; list.innerHTML = "";
    lastDocs = []; who = {}; fstat = {};
  }

  /* Estado de amistad con el postulante: none | out | in | accepted | self */
  async function friendStatus(uid){
    const me = window.deytekUser;
    if(!me || uid === me.uid){ fstat[uid] = "self"; return; }
    try{
      const s = await db.collection("friendships").doc(pairId(me.uid, uid)).get();
      fstat[uid] = !s.exists ? "none" : s.data().status === "accepted" ? "accepted" : s.data().from === me.uid ? "out" : "in";
    }catch(e){ fstat[uid] = "none"; }
  }
  /* Cuenta del postulante (nombre, foto, ID) */
  async function load(uid){
    if(!uid || uid in who) return;
    who[uid] = {};
    try{ const s = await db.collection("users").doc(uid).get(); who[uid] = s.exists ? s.data() : {}; }catch(e){}
    await friendStatus(uid);
    paint(lastDocs);
  }
  async function refreshStatuses(){
    const uids = [...new Set(lastDocs.map(d => d.data().uid).filter(Boolean))];
    await Promise.all(uids.map(friendStatus));
    paint(lastDocs);
  }

  function chatBtn(uid){
    const s = fstat[uid];
    if(!uid || !s || s === "self") return "";
    if(s === "accepted") return `<button type="button" class="btn solid sm" data-chat="${esc(uid)}">Abrir chat</button>`;
    if(s === "out") return `<button type="button" class="btn glass sm" disabled>Solicitud enviada</button>`;
    if(s === "in") return `<button type="button" class="btn solid sm" data-accept="${esc(uid)}">Aceptar su solicitud</button>`;
    return `<button type="button" class="btn solid sm" data-fr="${esc(uid)}">Enviar solicitud de chat</button>`;
  }

  function paint(docs){
    lastDocs = docs;
    const news = docs.filter(d => !d.data().seen).length;
    badge.textContent = news; badge.hidden = !news;
    list.innerHTML = docs.map(d => {
      const x = d.data({serverTimestamps:"estimate"}), w = who[x.uid] || {}, name = w.name || x.nombre || "";
      const site = safeUrl(x.enlace || ""), cv = safeUrl(x.cvPath || "");
      const t = x.createdAt ? when(x.createdAt.toMillis()) : "";
      return `<article class="glass pad req${x.seen ? "" : " new"}" data-id="${d.id}">
        <h4>${esc(x.nombre || "")} <small>${esc(t)}</small></h4>
        <div class="who"><img src="${esc(w.photo || letter(name))}" alt=""><div><b>${esc(name)}</b><small>${esc(w.friendId || "Cuenta")}</small></div></div>
        <p><b>${esc(x.area || "")}</b> · <a href="mailto:${esc(x.correo || "")}">${esc(x.correo || "")}</a></p>
        <p>${esc(x.mensaje || "")}</p>
        <div class="acts">
          ${site ? `<a class="btn glass sm" href="${esc(site)}" target="_blank" rel="noopener">Ver portafolio</a>` : ""}
          ${cv ? `<a class="btn glass sm" href="${esc(cv)}" target="_blank" rel="noopener">Ver hoja de vida</a>` : `<small class="cnone">Sin enlace de hoja de vida</small>`}
          ${chatBtn(x.uid)}
          <button type="button" class="btn glass sm" data-seen="${d.id}">${x.seen ? "Marcar como nueva" : "Marcar como vista"}</button>
          <button type="button" class="btn glass sm" data-del="${d.id}">Borrar</button>
        </div></article>`;
    }).join("") || `<p class="cnone">Aún no hay solicitudes.</p>`;
    docs.forEach(d => load(d.data().uid));
  }

  function start(){
    if(unsub) return;
    btn.hidden = false;
    list.innerHTML = `<p class="cnone">Cargando solicitudes…</p>`;
    unsub = db.collection("applications").orderBy("createdAt", "desc").limit(100)
      .onSnapshot(snap => paint(snap.docs), err => {
        console.error("[solicitudes] Error leyendo solicitudes:", err.code, err.message);
        list.innerHTML = `<p class="cnone">No se pudieron cargar las solicitudes (${esc(err.code || "error")}). Revisa que tu UID esté en las reglas de Firestore y que las hayas publicado.</p>`;
      });
  }

  function check(){
    const u = window.deytekUser, p = window.deytekProfile || {};
    const isAdmin = !!(u && p.friendId && ADMIN_IDS.some(id => sameId(id, p.friendId)));
    isAdmin ? start() : stop();
  }

  /* Abre Amigos y entra al chat con esa persona */
  function openChat(uid){
    dlg.close();
    $("#social-btn").click();
    let n = 0;
    const t = setInterval(() => {
      const b = document.querySelector(`#ffriend-list [data-chat="${CSS.escape(uid)}"]`);
      if(b){ clearInterval(t); b.click(); } else if(++n > 25) clearInterval(t);
    }, 150);
  }

  list.addEventListener("click", async e => {
    const sb = e.target.closest("[data-seen]"), dl = e.target.closest("[data-del]"), fr = e.target.closest("[data-fr]"), ac = e.target.closest("[data-accept]"), ch = e.target.closest("[data-chat]");
    const me = window.deytekUser;
    try{
      if(fr && me){
        fr.disabled = true;
        const uid = fr.dataset.fr;
        await db.collection("friendships").doc(pairId(me.uid, uid)).set({users:[me.uid, uid].sort(), from:me.uid, status:"pending", createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        fstat[uid] = "out"; paint(lastDocs);
      }else if(ac && me){
        const uid = ac.dataset.accept;
        await db.collection("friendships").doc(pairId(me.uid, uid)).update({status:"accepted"});
        fstat[uid] = "accepted"; paint(lastDocs);
      }else if(ch){
        openChat(ch.dataset.chat);
      }else if(sb){
        const card = sb.closest(".req"), seen = !card.classList.contains("new");
        await db.collection("applications").doc(sb.dataset.seen).update({seen: !seen});
      }else if(dl && confirm("¿Borrar esta solicitud?")){
        await db.collection("applications").doc(dl.dataset.del).delete();
      }
    }catch(err){ console.error("[solicitudes]", err); if(fr) fr.disabled = false; }
  });

  btn.onclick = () => { dlg.showModal(); refreshStatuses(); };
  $("#req-x").onclick = () => dlg.close();
  dlg.addEventListener("click", e => { if(e.target === dlg) dlg.close(); });
  document.addEventListener("deytek:auth", check);
  check();
})();
