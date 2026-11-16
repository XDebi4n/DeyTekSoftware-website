/* Épicas historias de usuario: comentarios con tema y calificación, respuestas, me gusta / no me gusta */
(() => {
  const TOPICS = ["Mi mejor partida", "Sugerencia", "Error o problema", "Opinión", "Otro"];
  const COOLDOWN = 60000; // 1 minuto entre comentarios (también se valida en firestore.rules)
  const $ = s => document.querySelector(s);
  const tb = $("#ctb"), form = $("#cform"), lock = $("#clock"), fs = $("#cfs"), btn = $("#cbtn"), starsBox = $("#stars");
  const say = t => { $("#cstat").textContent = t; };
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  const db = ready ? firebase.firestore() : null;
  const TS = () => firebase.firestore.FieldValue.serverTimestamp();
  const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>';
  const letter = n => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8e8e93"/><text x="50" y="66" font-size="48" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#000">${((n || "?")[0]).toUpperCase().replace(/[<>&"']/g, "?")}</text></svg>`);
  const nameOf = u => (u.displayName || (u.email || "").split("@")[0] || "Jugador").slice(0, 40);
  const stars5 = n => "★".repeat(n) + "☆".repeat(5 - n);
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? "ahora" : s < 3600 ? `hace ${Math.floor(s/60)} min` : s < 86400 ? `hace ${Math.floor(s/3600)} h` : new Date(t).toLocaleDateString("es"); };
  const askLogin = () => { if(window.openAuth) window.openAuth(); };

  let posts = [], replies = {}, open = new Set(), drafts = {}, avatars = {}, until = 0, timer, t2, stars = 0;
  const colspan = (msg) => `<tr><td colspan="7" class="cnone">${msg}</td></tr>`;

  /* Formulario: tema y estrellas */
  form.elements.topic.innerHTML = TOPICS.map(t => `<option>${esc(t)}</option>`).join("");
  starsBox.innerHTML = [1,2,3,4,5].map(n => `<button type="button" data-n="${n}" aria-label="${n} de 5">★</button>`).join("");
  const paint = () => starsBox.querySelectorAll("button").forEach((b, i) => { b.classList.toggle("on", i < stars); b.setAttribute("aria-pressed", i + 1 === stars); });
  starsBox.onclick = e => { const b = e.target.closest("button"); if(b){ stars = +b.dataset.n; paint(); } };

  /* Espera de 1 minuto */
  function tick(){
    const left = Math.ceil((until - Date.now()) / 1000);
    if(left > 0){ btn.disabled = true; btn.textContent = `Espera ${left} s`; }
    else { btn.disabled = false; btn.textContent = "Publicar"; clearInterval(timer); }
  }
  function cool(ms){ until = ms; clearInterval(timer); tick(); timer = setInterval(tick, 500); }
  async function syncCool(){
    const u = window.deytekUser; if(!ready || !u) return;
    try{ const s = await db.collection("limits").doc(u.uid).get(); if(s.exists) cool(s.data().last.toMillis() + COOLDOWN); }catch(e){}
  }

  /* Tabla */
  const av = (uid, name) => `<img src="${esc(avatars[uid] || letter(name))}" alt="">`;
  function replyRow(p, uid){
    const rs = replies[p.id] || [];
    return `<tr class="rep"><td colspan="7"><div class="rl">${rs.map(r => `<div class="rr">${av(r.uid, r.name)}<div><b>${esc(r.name)}</b> <small>${ago(r.t)}</small><p>${esc(r.text)}</p></div></div>`).join("") || `<p class="cnone">Sé el primero en responder.</p>`}</div>${uid ? `<div class="rf"><input class="rin" data-id="${p.id}" maxlength="400" placeholder="Escribe tu respuesta…" aria-label="Respuesta"><button type="button" class="btn solid" data-send="${p.id}">Enviar</button></div>` : `<p class="cnone">Inicia sesión para responder.</p>`}</td></tr>`;
  }
  function row(p, uid){
    const liked = !!uid && p.likedBy.includes(uid), dis = !!uid && p.dislikedBy.includes(uid), n = (replies[p.id] || []).length;
    return `<tr><td><div class="us">${av(p.uid, p.name)}<div><b>${esc(p.name)}</b><small>${ago(p.t)}</small></div></div></td><td><span class="tag">${esc(p.topic)}</span></td><td class="st" aria-label="${p.stars} de 5">${stars5(p.stars)}</td><td class="tx">${esc(p.text)}</td><td><button type="button" class="vb${liked ? " on" : ""}" data-vote="1" data-id="${p.id}" aria-pressed="${liked}" aria-label="Me gusta">${UP}<span>${p.likedBy.length}</span></button></td><td><button type="button" class="vb dn${dis ? " on" : ""}" data-vote="-1" data-id="${p.id}" aria-pressed="${dis}" aria-label="No me gusta">${UP}<span>${p.dislikedBy.length}</span></button></td><td><button type="button" class="rb" data-open="${p.id}" aria-expanded="${open.has(p.id)}">Responder${n ? ` (${n})` : ""}</button>${uid === p.uid ? `<button type="button" class="del" data-del="${p.id}" aria-label="Borrar mi comentario">×</button>` : ""}</td></tr>${open.has(p.id) ? replyRow(p, uid) : ""}`;
  }
  function render(){
    if(!ready) return;
    tb.querySelectorAll(".rin").forEach(i => { drafts[i.dataset.id] = i.value; });
    const fa = document.activeElement, fid = fa && fa.classList && fa.classList.contains("rin") ? fa.dataset.id : null;
    const uid = window.deytekUser ? window.deytekUser.uid : null;
    tb.innerHTML = posts.map(p => row(p, uid)).join("") || colspan("Aún no hay historias. ¡Sé el primero!");
    tb.querySelectorAll(".rin").forEach(i => { i.value = drafts[i.dataset.id] || ""; });
    if(fid){ const i = tb.querySelector(`.rin[data-id="${fid}"]`); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  const sched = () => { clearTimeout(t2); t2 = setTimeout(render, 80); };
  function want(list){
    list.forEach(x => { if(!(x.uid in avatars)){ avatars[x.uid] = ""; db.collection("users").doc(x.uid).get().then(s => { avatars[x.uid] = (s.data() || {}).photo || ""; sched(); }).catch(() => {}); } });
  }

  /* Acciones */
  async function vote(id, v){
    const u = window.deytekUser; if(!u){ askLogin(); return; }
    const p = posts.find(x => x.id === id); if(!p) return;
    const FV = firebase.firestore.FieldValue, liked = p.likedBy.includes(u.uid), dis = p.dislikedBy.includes(u.uid), up = {};
    if(v === 1){ up.likedBy = liked ? FV.arrayRemove(u.uid) : FV.arrayUnion(u.uid); if(dis) up.dislikedBy = FV.arrayRemove(u.uid); }
    else { up.dislikedBy = dis ? FV.arrayRemove(u.uid) : FV.arrayUnion(u.uid); if(liked) up.likedBy = FV.arrayRemove(u.uid); }
    try{ await db.collection("posts").doc(id).update(up); }catch(e){}
  }
  async function sendReply(id){
    const u = window.deytekUser; if(!u){ askLogin(); return; }
    const inp = tb.querySelector(`.rin[data-id="${id}"]`); if(!inp) return;
    const text = inp.value.trim().slice(0, 400); if(!text) return;
    inp.value = ""; drafts[id] = "";
    try{ await db.collection("replies").add({uid:u.uid, name:nameOf(u), postId:id, text, createdAt:TS()}); }
    catch(e){ inp.value = text; drafts[id] = text; }
  }
  tb.addEventListener("click", e => {
    const v = e.target.closest("[data-vote]"), o = e.target.closest("[data-open]"), s = e.target.closest("[data-send]"), d = e.target.closest("[data-del]");
    if(v) vote(v.dataset.id, +v.dataset.vote);
    else if(o){ const id = o.dataset.open; open.has(id) ? open.delete(id) : open.add(id); render(); }
    else if(s) sendReply(s.dataset.send);
    else if(d && confirm("¿Borrar tu comentario?")) db.collection("posts").doc(d.dataset.del).delete().catch(() => {});
  });
  tb.addEventListener("keydown", e => { if(e.key === "Enter" && e.target.classList.contains("rin")){ e.preventDefault(); sendReply(e.target.dataset.id); } });

  form.addEventListener("submit", async e => {
    e.preventDefault(); say("");
    const u = window.deytekUser; if(!u){ askLogin(); return; }
    if(Date.now() < until) return;
    if(!stars){ say("Elige una calificación de 1 a 5 estrellas."); return; }
    const text = form.elements.text.value.trim(); if(!text) return;
    btn.disabled = true;
    try{
      const b = db.batch();
      b.set(db.collection("posts").doc(), {uid:u.uid, name:nameOf(u), topic:form.elements.topic.value, text, stars, createdAt:TS(), likedBy:[], dislikedBy:[]});
      b.set(db.collection("limits").doc(u.uid), {last:TS()});
      await b.commit();
      form.elements.text.value = ""; stars = 0; paint(); cool(Date.now() + COOLDOWN); say("¡Publicado!");
    }catch(err){
      say(err.code === "permission-denied" ? "No se pudo publicar. Espera 1 minuto entre comentarios o revisa las reglas (README)." : "No se pudo publicar. Inténtalo de nuevo.");
      btn.disabled = false; syncCool();
    }
  });

  /* Sesión */
  function syncAuth(){
    const u = window.deytekUser;
    lock.hidden = !!u; fs.disabled = !u;
    if(u) syncCool();
    render();
  }
  document.addEventListener("deytek:auth", syncAuth);
  $("#clockbtn").onclick = askLogin;
  setInterval(render, 60000);

  /* Datos en vivo */
  if(!ready){ tb.innerHTML = colspan("Falta conectar Firebase (ver README) para ver y publicar historias."); return; }
  db.collection("posts").orderBy("createdAt", "desc").limit(50).onSnapshot(snap => {
    posts = snap.docs.map(d => { const x = d.data({serverTimestamps:"estimate"}); return {...x, id:d.id, t:x.createdAt ? x.createdAt.toMillis() : Date.now(), likedBy:x.likedBy || [], dislikedBy:x.dislikedBy || []}; });
    want(posts); render();
  }, err => { tb.innerHTML = colspan(err.code === "permission-denied" ? "Faltan las reglas de Firestore (ver README)." : "No se pudieron cargar las historias."); });
  db.collection("replies").orderBy("createdAt", "desc").limit(500).onSnapshot(snap => {
    replies = {};
    snap.docs.map(d => { const x = d.data({serverTimestamps:"estimate"}); return {...x, id:d.id, t:x.createdAt ? x.createdAt.toMillis() : Date.now()}; })
      .reverse().forEach(r => { (replies[r.postId] = replies[r.postId] || []).push(r); });
    want(Object.values(replies).flat()); render();
  }, () => {});
  syncAuth();
})();
