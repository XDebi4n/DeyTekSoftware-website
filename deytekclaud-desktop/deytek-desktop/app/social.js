/* social.js — Amigos, chat privado (texto, fotos, GIF y videos), borrar mensajes y bloqueo */
(() => {
  const $ = s => document.querySelector(s);
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  const db = ready ? firebase.firestore() : null;
  const TS = () => firebase.firestore.FieldValue.serverTimestamp();
  const hasStorage = ready && typeof firebase.storage === "function";

  const btnOpen = $("#social-btn"), dlg = $("#social-dlg"), closeBtn = $("#sclose");
  const badge = $("#sbadge"), statusEl = $("#fstatus");
  const searchForm = $("#fsearch"), searchInput = $("#fquery");
  const reqList = $("#freq-list"), reqBox = $("#freq-box"), friendList = $("#ffriend-list");
  const chatHead = $("#chat-head"), chatBody = $("#chat-body"), chatForm = $("#chat-form");
  const chatInput = $("#chat-in"), chatPhoto = $("#chat-photo"), photoPrev = $("#chat-prev");
  const lightbox = $("#lightbox"), lbImg = $("#lbimg");

  const MAX_IMG = 500000, MAX_VIDEO = 25 * 1048576, MAX_GIF = 10 * 1048576;
  const STORE = "https://firebasestorage.googleapis.com/";

  let unsubFriends = null, unsubChat = null, unsubBlocks = [], rseq = 0;
  let friendships = [], usersCache = {}, activeFriend = null, pending = null;
  let msgDocs = [], msgReady = false, blockedByMe = false, blockedMe = false, sending = false;

  /* ---------- Estilos propios ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .msg .mvid{display:block;max-width:100%;max-height:300px;border-radius:14px;margin-bottom:6px;background:#000}
  .msg .mdel{position:absolute;top:-8px;left:-12px;width:26px;height:26px;border-radius:50%;border:1px solid var(--line,rgba(255,255,255,.18));background:rgba(20,20,22,.92);color:#fff;font-size:15px;line-height:1;cursor:pointer;opacity:0;transition:opacity .2s;display:grid;place-items:center;padding:0}
  .msg.mine:hover .mdel,.msg.mine:focus-within .mdel{opacity:1}
  @media(hover:none){.msg .mdel{opacity:.85}}
  .blockcard{margin:auto;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:18px 10px}
  .blockcard img{width:100%;max-width:260px;max-height:200px;object-fit:contain;border-radius:16px}
  .blockcard b{font-size:17px}
  .blockcard small{color:var(--mut,#8e8e93);font-size:13px}
  .chat-form.locked{opacity:.4;pointer-events:none}
  .chat-prev .pv{height:76px;max-width:140px;border-radius:12px;border:1px solid var(--line,rgba(255,255,255,.18));background:#000;object-fit:cover}
  .chat-prev .pvt{margin-left:10px;font-size:13px;color:var(--mut,#8e8e93)}
  #blockbtn.on{background:#fff;color:#000}
  `;
  document.head.append(css);

  const h = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const letter = n => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8e8e93"/><text x="50" y="66" font-size="48" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#000">${((n||"?")[0]).toUpperCase().replace(/[<>&"']/g,"?")}</text></svg>`);
  const BLOCK_SVG = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 200"><rect width="260" height="200" rx="24" fill="#1c1c1e"/><circle cx="130" cy="78" r="44" fill="none" stroke="#fff" stroke-width="10"/><line x1="99" y1="109" x2="161" y2="47" stroke="#fff" stroke-width="10" stroke-linecap="round"/><text x="130" y="170" font-size="15" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">Este usuario te ha bloqueado</text></svg>`);
  const pairId = (a, b) => [a, b].sort().join("_");
  const timeFmt = t => t ? new Date(t).toLocaleTimeString("es", {hour:"2-digit", minute:"2-digit"}) : "";
  const say = t => { statusEl.textContent = t; };
  /* Solo se aceptan fotos data:image y archivos que vienen de Firebase Storage */
  const safeImg = s => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) ? s : "";
  const safeUrl = s => typeof s === "string" && s.startsWith(STORE) ? s : "";

  /* Reduce la foto hasta que quepa en un mensaje */
  async function compressChatPhoto(file){
    const img = await new Promise((ok, no) => {
      const i = new Image(), url = URL.createObjectURL(file);
      i.onload = () => { URL.revokeObjectURL(url); ok(i); };
      i.onerror = () => { URL.revokeObjectURL(url); no(new Error("img")); };
      i.src = url;
    });
    for(const [max, q] of [[720, .78], [720, .6], [560, .55], [420, .5]]){
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if(out.length <= MAX_IMG) return out;
    }
    throw new Error("big");
  }

  async function getUserInfo(uid){
    if(usersCache[uid]) return usersCache[uid];
    try{
      const doc = await db.collection("users").doc(uid).get();
      usersCache[uid] = doc.exists ? {uid, ...doc.data()} : {uid, name:"Jugador", friendId:"", photo:""};
    }catch(e){
      return {uid, name:"Jugador", friendId:"", photo:""};
    }
    return usersCache[uid];
  }

  /* ---------- Buscar amigos por ID (DTK-XXXXX) o nombre exacto ---------- */
  searchForm.onsubmit = async e => {
    e.preventDefault(); say("");
    const me = window.deytekUser; if(!me) return;
    const raw = searchInput.value.trim(); if(!raw) return;
    const btn = searchForm.querySelector("button"); btn.disabled = true;
    try{
      const up = raw.toUpperCase(), code = up.startsWith("DTK-") ? up : `DTK-${up}`;
      let snap = await db.collection("users").where("friendId", "==", code).limit(1).get();
      if(snap.empty){
        snap = await db.collection("users").where("name", "==", raw).limit(2).get();
        if(snap.size > 1){ say("Hay varios usuarios con ese nombre. Pídele su ID (DTK-12345)."); return; }
      }
      if(snap.empty){ say("No se encontró ningún usuario con ese ID o nombre."); return; }
      const target = snap.docs[0];
      if(target.id === me.uid){ say("No puedes agregarte a ti mismo."); return; }
      const ref = db.collection("friendships").doc(pairId(me.uid, target.id));
      let existing = null;
      try{ existing = await ref.get(); }catch(err){ if(err.code !== "permission-denied") throw err; }
      if(existing && existing.exists){
        say(existing.data().status === "accepted" ? "Ya son amigos." : "Ya existe una solicitud pendiente.");
        return;
      }
      await ref.set({users:[me.uid, target.id].sort(), from:me.uid, status:"pending", createdAt:TS()});
      searchInput.value = "";
      say(`¡Solicitud enviada a ${target.data().name || "usuario"}!`);
    }catch(err){
      console.error(err);
      say(err.code === "permission-denied" ? "No se pudo enviar. Revisa las reglas de Firestore." : "No se pudo completar. Inténtalo de nuevo.");
    }finally{ btn.disabled = false; }
  };

  /* ---------- Solicitudes y lista de amigos ---------- */
  async function renderSidebar(){
    const me = window.deytekUser; if(!me) return;
    const my = ++rseq;
    const incoming = friendships.filter(f => f.status === "pending" && f.from !== me.uid);
    const accepted = friendships.filter(f => f.status === "accepted");
    badge.textContent = incoming.length; badge.hidden = !incoming.length;
    reqBox.hidden = !incoming.length;
    if(activeFriend && !accepted.some(f => f.users.includes(activeFriend.uid))){ activeFriend = null; resetChatArea(); }

    const reqItems = await Promise.all(incoming.map(async f => {
      const u = await getUserInfo(f.users.find(x => x !== me.uid));
      return `<div class="fitem">
        <img src="${h(u.photo || letter(u.name))}" alt="">
        <div class="fmeta"><b>${h(u.name || "Jugador")}</b><small>${h(u.friendId || "Solicitud")}</small></div>
        <div class="fbtns">
          <button type="button" class="btn solid sm" data-acc="${h(f.id)}" aria-label="Aceptar">✓</button>
          <button type="button" class="btn glass sm" data-rej="${h(f.id)}" aria-label="Rechazar">✕</button>
        </div></div>`;
    }));
    const friendItems = await Promise.all(accepted.map(async f => {
      const otherUid = f.users.find(x => x !== me.uid), u = await getUserInfo(otherUid);
      const on = activeFriend && activeFriend.uid === otherUid;
      return `<button type="button" class="fitem fbtn${on ? " on" : ""}" data-chat="${h(otherUid)}">
        <img src="${h(u.photo || letter(u.name))}" alt="">
        <div class="fmeta"><b>${h(u.name || "Jugador")}</b><small>${h(u.friendId || "Jugador")}</small></div>
      </button>`;
    }));
    if(my !== rseq) return;
    reqList.innerHTML = reqItems.join("");
    friendList.innerHTML = friendItems.join("") || `<p class="cnone" style="padding:20px 0">Parece ser que eres solitario, busca una amistad!.</p>`;
  }

  /* ---------- Bloqueos ---------- */
  function unwatchBlocks(){ unsubBlocks.forEach(f => { try{ f(); }catch(e){} }); unsubBlocks = []; blockedByMe = blockedMe = false; }
  function watchBlocks(meUid, fUid){
    unwatchBlocks();
    unsubBlocks.push(db.collection("blocks").doc(meUid + "_" + fUid).onSnapshot(s => { blockedByMe = s.exists; blockUI(); }, () => {}));
    unsubBlocks.push(db.collection("blocks").doc(fUid + "_" + meUid).onSnapshot(s => { blockedMe = s.exists; blockUI(); }, () => {}));
  }
  function blockUI(){
    const b = $("#blockbtn");
    if(b){ b.textContent = blockedByMe ? "Desbloquear" : "Bloquear"; b.classList.toggle("on", blockedByMe); }
    const off = blockedByMe || blockedMe;
    chatForm.classList.toggle("locked", off); chatInput.disabled = off;
    if(off) clearPending();
    drawChat();
  }
  window.deytekChatBlocked = () => blockedByMe || blockedMe;

  /* ---------- Abrir conversación ---------- */
  async function openChat(friendUid){
    const me = window.deytekUser; if(!me) return;
    const f = await getUserInfo(friendUid);
    activeFriend = f; msgDocs = []; msgReady = false; clearPending();
    renderSidebar();

    chatHead.innerHTML = `<img src="${h(f.photo || letter(f.name))}" alt="">
      <div><b>${h(f.name || "Jugador")}</b><small>${h(f.friendId || "")}</small></div>
      <button type="button" class="btn glass sm" id="unfriend" title="Eliminar amigo" style="margin-left:auto!important">Eliminar</button>
      <button type="button" class="btn glass sm" id="blockbtn" title="Bloquear usuario">Bloquear</button>`;
    $("#unfriend").onclick = async () => {
      if(!confirm(`¿Eliminar a ${f.name || "este usuario"} de tus amigos?`)) return;
      try{ await db.collection("friendships").doc(pairId(me.uid, friendUid)).delete(); }
      catch(err){ console.error(err); say("No se pudo eliminar. Inténtalo de nuevo."); }
    };
    $("#blockbtn").onclick = async () => {
      const ref = db.collection("blocks").doc(me.uid + "_" + friendUid);
      try{
        if(blockedByMe){ await ref.delete(); }
        else{
          if(!confirm(`¿Bloquear a ${f.name || "este usuario"}? No podrá escribirte ni invitarte a llamadas.`)) return;
          await ref.set({by:me.uid, target:friendUid, createdAt:TS()});
        }
      }catch(err){ console.error(err); say("No se pudo cambiar el bloqueo. Revisa las reglas de Firestore (blocks)."); }
    };

    chatForm.hidden = false;
    chatBody.innerHTML = `<p class="cnone">Cargando mensajes…</p>`;
    watchBlocks(me.uid, friendUid);

    if(unsubChat) unsubChat();
    unsubChat = db.collection("chats").doc(pairId(me.uid, friendUid)).collection("messages")
      .orderBy("createdAt", "desc").limit(100)
      .onSnapshot(snap => {
        msgDocs = snap.docs.slice().reverse(); msgReady = true; drawChat();
      }, err => {
        console.error(err);
        chatBody.innerHTML = `<p class="cnone">No se pudieron cargar los mensajes. Revisa las reglas de Firestore.</p>`;
      });
  }

  function drawChat(){
    const me = window.deytekUser; if(!me || !activeFriend || !msgReady) return;
    let html = msgDocs.length ? "" : `<p class="cnone">Envía el primer mensaje de esta gran amistad! ${h(activeFriend.name || "")}.</p>`;
    html += msgDocs.map(d => {
      const m = d.data({serverTimestamps:"estimate"}), mine = m.uid === me.uid;
      const img = safeImg(m.img), murl = safeUrl(m.murl);
      const t = m.createdAt ? timeFmt(m.createdAt.toMillis()) : "";
      const media = !murl ? "" : m.mkind === "video"
        ? `<video class="mvid" src="${h(murl)}" controls playsinline preload="metadata"></video>`
        : `<img class="mimg" src="${h(murl)}" alt="GIF" loading="lazy">`;
      return `<div class="msg ${mine ? "mine" : "theirs"}">
        ${mine ? `<button type="button" class="mdel" data-del="${h(d.id)}" aria-label="Borrar mensaje" title="Borrar mensaje">×</button>` : ""}
        ${img ? `<img class="mimg" src="${h(img)}" alt="Foto enviada" loading="lazy">` : ""}${media}
        ${m.text ? `<p>${h(String(m.text))}</p>` : ""}
        <small>${t}</small></div>`;
    }).join("");
    if(blockedMe) html += `<div class="blockcard"><img src="img/bloqueado.png" data-fb="1" alt="Bloqueado"><b>Este usuario te ha bloqueado</b><small>Ya no puedes escribirle ni invitarlo a llamadas.</small></div>`;
    else if(blockedByMe) html += `<div class="blockcard"><b>Bloqueaste a este usuario</b><small>No podrá escribirte ni invitarte a llamadas.</small><button type="button" class="btn solid sm" data-unblock="1">Desbloquear</button></div>`;
    chatBody.innerHTML = html;
    chatBody.querySelectorAll("img[data-fb]").forEach(i => { i.onerror = () => { i.onerror = null; i.src = BLOCK_SVG; }; });
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function resetChatArea(){
    if(unsubChat){ unsubChat(); unsubChat = null; }
    unwatchBlocks(); msgDocs = []; msgReady = false;
    chatHead.innerHTML = `<span>Selecciona un amigo para chatear</span>`;
    chatBody.innerHTML = `<div class="cnone" style="margin:auto; display:flex; flex-direction:column; align-items:center; gap:12px;">
      <p>Ops! Buscate un amigo... </p>
      <img src="img/deyteknoti.png" alt="Bienvenida" style="width: 520px; height: 520px; max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 16px;">
      <p>Invita a mas amigos a la plataforma deyteksoftware.com</p>
    </div>`;
    chatForm.hidden = true; chatForm.classList.remove("locked"); chatInput.disabled = false;
    clearPending();
  }
  window.deytekResetChat = resetChatArea;

  /* ---------- Borrar mensaje ---------- */
  async function delMsg(id){
    const me = window.deytekUser; if(!me || !activeFriend) return;
    if(!confirm("¿Borrar este mensaje?")) return;
    const ref = db.collection("chats").doc(pairId(me.uid, activeFriend.uid)).collection("messages").doc(id);
    try{
      const snap = await ref.get(), p = snap.exists ? snap.data().mpath : "";
      await ref.delete();
      if(p && hasStorage && String(p).startsWith("chatmedia/")) firebase.storage().ref(p).delete().catch(() => {});
    }catch(err){ console.error(err); say("No se pudo borrar el mensaje."); }
  }

  /* ---------- Clics del panel ---------- */
  dlg.addEventListener("click", async e => {
    if(e.target === dlg){ dlg.close(); return; }
    const acc = e.target.closest("[data-acc]"), rej = e.target.closest("[data-rej]");
    const ch = e.target.closest("[data-chat]"), im = e.target.closest(".mimg");
    const del = e.target.closest("[data-del]"), ub = e.target.closest("[data-unblock]");
    const me = window.deytekUser;
    try{
      if(acc) await db.collection("friendships").doc(acc.dataset.acc).update({status:"accepted"});
      else if(rej) await db.collection("friendships").doc(rej.dataset.rej).delete();
      else if(ub && me && activeFriend) await db.collection("blocks").doc(me.uid + "_" + activeFriend.uid).delete();
      else if(del) delMsg(del.dataset.del);
      else if(ch) openChat(ch.dataset.chat);
      else if(im && lightbox){ lbImg.src = im.src; lightbox.showModal(); }
    }catch(err){ console.error(err); say("No se pudo completar la acción. Inténtalo de nuevo."); }
  });
  if(lightbox){
    lightbox.addEventListener("click", () => lightbox.close());
    lightbox.addEventListener("close", () => { lbImg.removeAttribute("src"); });
  }

  /* ---------- Adjuntos: foto, GIF o video ---------- */
  chatPhoto.accept = "image/*,video/mp4,video/webm,video/quicktime";
  const lbl = document.querySelector(".photo-lbl"); if(lbl) lbl.title = "Enviar foto, GIF o video";

  function clearPending(){
    if(pending && pending.blob) URL.revokeObjectURL(pending.url);
    pending = null; chatPhoto.value = ""; photoPrev.hidden = true; photoPrev.innerHTML = "";
  }
  function setPending(p){
    clearPending(); pending = p;
    photoPrev.hidden = false;
    photoPrev.innerHTML = (p.kind === "video"
      ? `<video class="pv" src="${h(p.url)}" muted playsinline></video>`
      : `<img src="${h(p.url)}" alt="Vista previa">`)
      + `<button type="button" id="rm-prev" aria-label="Quitar">×</button><span class="pvt" id="pv-st">${p.kind === "gif" ? "GIF" : p.kind === "video" ? "Video" : ""}</span>`;
    $("#rm-prev").onclick = clearPending;
  }

  chatPhoto.onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    e.target.value = ""; say("");
    try{
      if(f.type === "image/gif"){
        if(!hasStorage){ say("Falta activar Firebase Storage para enviar GIF."); return; }
        if(f.size > MAX_GIF){ say("El GIF pesa más de 10 MB."); return; }
        setPending({kind:"gif", file:f, url:URL.createObjectURL(f), blob:true});
      }else if(f.type.startsWith("video/")){
        if(!hasStorage){ say("Falta activar Firebase Storage para enviar videos."); return; }
        if(!/^video\/(mp4|webm|quicktime)$/.test(f.type)){ say("Formato no compatible. Usa MP4, WebM o MOV."); return; }
        if(f.size > MAX_VIDEO){ say("El video pesa más de 25 MB."); return; }
        setPending({kind:"video", file:f, url:URL.createObjectURL(f), blob:true});
      }else if(f.type.startsWith("image/")){
        const d = await compressChatPhoto(f);
        setPending({kind:"img", dataUrl:d, url:d});
      }else say("Solo puedes enviar imágenes, GIF o videos.");
    }catch(err){ say("No se pudo procesar el archivo. Prueba con otro más pequeño."); clearPending(); }
  };

  chatForm.onsubmit = async e => {
    e.preventDefault();
    const me = window.deytekUser;
    if(!me || !activeFriend || sending || blockedByMe || blockedMe) return;
    const text = chatInput.value.trim().slice(0, 1000), p = pending;
    if(!text && !p) return;
    sending = true;
    const send = chatForm.querySelector("button[type=submit]"); send.disabled = true;
    const cid = pairId(me.uid, activeFriend.uid);
    let uploaded = "";
    try{
      const data = {uid:me.uid, text, img:"", mkind:"", murl:"", mpath:"", createdAt:TS()};
      if(p && p.kind === "img") data.img = p.dataUrl;
      else if(p){
        const ext = p.kind === "gif" ? "gif" : ((p.file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4");
        const path = `chatmedia/${cid}/${me.uid}_${Date.now()}.${ext}`;
        const task = firebase.storage().ref(path).put(p.file, {contentType: p.kind === "gif" ? "image/gif" : p.file.type});
        task.on("state_changed", s => { const el = $("#pv-st"); if(el) el.textContent = `Subiendo… ${Math.round(100 * s.bytesTransferred / s.totalBytes)}%`; });
        await task;
        uploaded = path;
        data.murl = await task.snapshot.ref.getDownloadURL();
        data.mkind = p.kind; data.mpath = path;
      }
      await db.collection("chats").doc(cid).collection("messages").add(data);
      chatInput.value = ""; clearPending(); say("");
    }catch(err){
      console.error(err);
      if(uploaded) firebase.storage().ref(uploaded).delete().catch(() => {});
      say(String(err.code || "").startsWith("storage/") ? "No se pudo subir el archivo. Revisa las reglas de Storage (chatmedia)."
        : err.code === "permission-denied" ? "No se pudo enviar. Puede que te hayan bloqueado o falten las reglas." : "No se pudo enviar el mensaje. Revisa tu conexión.");
    }finally{ sending = false; send.disabled = false; chatInput.focus(); }
  };

  btnOpen.onclick = () => {
    if(!window.deytekUser){ if(window.openAuth) window.openAuth(); return; }
    dlg.showModal();
  };
  closeBtn.onclick = () => dlg.close();

  document.addEventListener("deytek:auth", () => {
    const u = window.deytekUser;
    if(unsubFriends){ unsubFriends(); unsubFriends = null; }
    friendships = []; activeFriend = null; usersCache = {};
    resetChatArea();
    if(!u || !ready){
      btnOpen.hidden = true; badge.hidden = true;
      reqList.innerHTML = friendList.innerHTML = "";
      if(dlg.open) dlg.close();
      return;
    }
    btnOpen.hidden = false;
    unsubFriends = db.collection("friendships").where("users", "array-contains", u.uid)
      .onSnapshot(snap => {
        friendships = snap.docs.map(d => ({id:d.id, ...d.data()}));
        renderSidebar();
      }, err => console.error(err));
  });
})();