/* Sistema de amigos y chat privado en tiempo real con envío de fotos */
(() => {
  const $ = s => document.querySelector(s);
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  const db = ready ? firebase.firestore() : null;
  const TS = () => firebase.firestore.FieldValue.serverTimestamp();

  const btnOpen = $("#social-btn"), dlg = $("#social-dlg"), closeBtn = $("#sclose");
  const badge = $("#sbadge"), statusEl = $("#fstatus");
  const searchForm = $("#fsearch"), searchInput = $("#fquery");
  const reqList = $("#freq-list"), reqBox = $("#freq-box"), friendList = $("#ffriend-list");
  const chatHead = $("#chat-head"), chatBody = $("#chat-body"), chatForm = $("#chat-form");
  const chatInput = $("#chat-in"), chatPhoto = $("#chat-photo"), photoPrev = $("#chat-prev");

  let unsubFriends = null, unsubChat = null;
  let friendships = [], usersCache = {}, activeFriend = null, pendingImg = "";

  const letter = n => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8e8e93"/><text x="50" y="66" font-size="48" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#000">${((n||"?")[0]).toUpperCase().replace(/[<>&"']/g,"?")}</text></svg>`);
  const pairId = (a, b) => [a, b].sort().join("_");
  const timeFmt = t => t ? new Date(t).toLocaleTimeString("es", {hour:"2-digit", minute:"2-digit"}) : "";

  /* Comprimir foto del chat (máx 720px para envío rápido y ligero en Firestore) */
  function compressChatPhoto(file){
    return new Promise((ok, no) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 720;
        let w = img.width, h = img.height;
        if(w > max || h > max){
          if(w > h){ h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = no;
      img.src = url;
    });
  }

  async function getUserInfo(uid){
    if(usersCache[uid]) return usersCache[uid];
    try{
      const doc = await db.collection("users").doc(uid).get();
      usersCache[uid] = doc.exists ? {uid, ...doc.data()} : {uid, name:"Jugador", email:"", photo:""};
    }catch(e){
      usersCache[uid] = {uid, name:"Jugador", email:"", photo:""};
    }
    return usersCache[uid];
  }

  /* Buscar y enviar solicitud de amistad */
  searchForm.onsubmit = async e => {
    e.preventDefault();
    statusEl.textContent = "";
    const me = window.deytekUser; if(!me) return;
    const term = searchInput.value.trim();
    if(!term) return;

    try{
      // Busca por correo exacto o por nombre exacto
      let snap = await db.collection("users").where("email", "==", term.toLowerCase()).limit(1).get();
      if(snap.empty){
        snap = await db.collection("users").where("name", "==", term).limit(1).get();
      }
      if(snap.empty){
        statusEl.textContent = "No se encontró ningún usuario con ese correo o nombre.";
        return;
      }
      const target = snap.docs[0];
      if(target.id === me.uid){
        statusEl.textContent = "No puedes agregarte a ti mismo.";
        return;
      }

      const id = pairId(me.uid, target.id);
      const ref = db.collection("friendships").doc(id);
      const existing = await ref.get();

      if(existing.exists){
        const st = existing.data().status;
        statusEl.textContent = st === "accepted" ? "Ya son amigos." : "Ya existe una solicitud pendiente.";
        return;
      }

      await ref.set({
        users: [me.uid, target.id],
        from: me.uid,
        status: "pending",
        createdAt: TS()
      });
      searchInput.value = "";
      statusEl.textContent = `¡Solicitud enviada a ${target.data().name || "usuario"}!`;
    }catch(err){
      console.error(err);
      statusEl.textContent = "Error al buscar usuario. Revisa las reglas de Firebase.";
    }
  };

  /* Renderizar solicitudes y lista de amigos */
  async function renderSidebar(){
    const me = window.deytekUser; if(!me) return;
    const incoming = friendships.filter(f => f.status === "pending" && f.from !== me.uid);
    const accepted = friendships.filter(f => f.status === "accepted");

    badge.textContent = incoming.length;
    badge.hidden = incoming.length === 0;

    // Solicitudes recibidas
    reqBox.hidden = incoming.length === 0;
    const reqItems = await Promise.all(incoming.map(async f => {
      const otherUid = f.users.find(u => u !== me.uid);
      const u = await getUserInfo(otherUid);
      return `<div class="fitem">
        <img src="${esc(u.photo || letter(u.name))}" alt="">
        <div class="fmeta"><b>${esc(u.name)}</b><small>Quiere ser tu amigo</small></div>
        <div class="fbtns">
          <button type="button" class="btn solid sm" data-acc="${f.id}">✓</button>
          <button type="button" class="btn glass sm" data-rej="${f.id}">✕</button>
        </div>
      </div>`;
    }));
    reqList.innerHTML = reqItems.join("");

    // Amigos aceptados
    if(!accepted.length){
      friendList.innerHTML = `<p class="cnone" style="padding:20px 0">Aún no tienes amigos agregados.</p>`;
      return;
    }
    const friendItems = await Promise.all(accepted.map(async f => {
      const otherUid = f.users.find(u => u !== me.uid);
      const u = await getUserInfo(otherUid);
      const isAct = activeFriend && activeFriend.uid === otherUid;
      return `<button type="button" class="fitem fbtn${isAct ? " on" : ""}" data-chat="${otherUid}">
        <img src="${esc(u.photo || letter(u.name))}" alt="">
        <div class="fmeta"><b>${esc(u.name)}</b><small>${esc(u.email || "En línea")}</small></div>
      </button>`;
    }));
    friendList.innerHTML = friendItems.join("");
  }

  /* Abrir conversación con un amigo */
  async function openChat(friendUid){
    const me = window.deytekUser; if(!me) return;
    activeFriend = await getUserInfo(friendUid);
    renderSidebar();

    chatHead.innerHTML = `<img src="${esc(activeFriend.photo || letter(activeFriend.name))}" alt="">
      <div><b>${esc(activeFriend.name)}</b><small>${esc(activeFriend.email || "")}</small></div>
      <button type="button" class="btn glass sm" id="unfriend" title="Eliminar amigo" style="margin-left:auto">Eliminar</button>`;

    $("#unfriend").onclick = async () => {
      if(!confirm(`¿Eliminar a ${activeFriend.name} de tus amigos?`)) return;
      await db.collection("friendships").doc(pairId(me.uid, friendUid)).delete();
      activeFriend = null;
      resetChatArea();
    };

    chatForm.hidden = false;
    chatBody.innerHTML = `<p class="cnone">Cargando mensajes…</p>`;

    if(unsubChat) unsubChat();
    const cid = pairId(me.uid, friendUid);
    unsubChat = db.collection("chats").doc(cid).collection("messages")
      .orderBy("createdAt", "asc").limit(100)
      .onSnapshot(snap => {
        if(snap.empty){
          chatBody.innerHTML = `<p class="cnone">Envía el primer mensaje o una foto a ${esc(activeFriend.name)}.</p>`;
          return;
        }
        chatBody.innerHTML = snap.docs.map(d => {
          const m = d.data({serverTimestamps:"estimate"});
          const mine = m.uid === me.uid;
          const t = m.createdAt ? timeFmt(m.createdAt.toMillis()) : "";
          return `<div class="msg ${mine ? "mine" : "theirs"}">
            ${m.img ? `<img class="mimg" src="${esc(m.img)}" alt="Foto enviada" loading="lazy">` : ""}
            ${m.text ? `<p>${esc(m.text)}</p>` : ""}
            <small>${t}</small>
          </div>`;
        }).join("");
        chatBody.scrollTop = chatBody.scrollHeight;
      });
  }

  function resetChatArea(){
    if(unsubChat){ unsubChat(); unsubChat = null; }
    chatHead.innerHTML = `<span>Selecciona un amigo para chatear</span>`;
    chatBody.innerHTML = `<div class="cnone" style="margin:auto"><p>Tus mensajes y fotos son privados entre tú y tus amigos.</p></div>`;
    chatForm.hidden = true;
    clearPendingPhoto();
  }

  /* Eventos delegación en panel izquierdo */
  dlg.addEventListener("click", async e => {
    const acc = e.target.closest("[data-acc]");
    const rej = e.target.closest("[data-rej]");
    const ch = e.target.closest("[data-chat]");
    const imgClick = e.target.closest(".mimg");

    if(acc){
      await db.collection("friendships").doc(acc.dataset.acc).update({status:"accepted"});
    } else if(rej){
      await db.collection("friendships").doc(rej.dataset.rej).delete();
    } else if(ch){
      openChat(ch.dataset.chat);
    } else if(imgClick){
      window.open(imgClick.src, "_blank");
    }
  });

  /* Selección y vista previa de foto en el chat */
  function clearPendingPhoto(){
    pendingImg = "";
    chatPhoto.value = "";
    photoPrev.hidden = true;
    photoPrev.innerHTML = "";
  }

  chatPhoto.onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    if(!f.type.startsWith("image/")){ statusEl.textContent = "Solo puedes enviar imágenes."; return; }
    try{
      pendingImg = await compressChatPhoto(f);
      photoPrev.hidden = false;
      photoPrev.innerHTML = `<img src="${pendingImg}" alt="Vista previa"><button type="button" id="rm-prev" aria-label="Quitar foto">×</button>`;
      $("#rm-prev").onclick = clearPendingPhoto;
    }catch(err){
      statusEl.textContent = "No se pudo procesar la imagen.";
    }
  };

  /* Enviar mensaje (texto y/o foto) */
  chatForm.onsubmit = async e => {
    e.preventDefault();
    const me = window.deytekUser;
    if(!me || !activeFriend) return;
    const text = chatInput.value.trim().slice(0, 1000);
    const img = pendingImg;
    if(!text && !img) return;

    chatInput.value = "";
    clearPendingPhoto();

    try{
      const cid = pairId(me.uid, activeFriend.uid);
      await db.collection("chats").doc(cid).collection("messages").add({
        uid: me.uid,
        text,
        img,
        createdAt: TS()
      });
    }catch(err){
      console.error(err);
      chatInput.value = text;
      statusEl.textContent = "No se pudo enviar el mensaje (la foto puede ser muy pesada).";
    }
  };

  /* Abrir / cerrar ventana social */
  btnOpen.onclick = () => {
    if(!window.deytekUser){ if(window.openAuth) window.openAuth(); return; }
    dlg.showModal();
  };
  closeBtn.onclick = () => dlg.close();
  dlg.addEventListener("click", e => { if(e.target === dlg) dlg.close(); });

  /* Sincronizar con sesión */
  document.addEventListener("deytek:auth", () => {
    const u = window.deytekUser;
    if(unsubFriends){ unsubFriends(); unsubFriends = null; }
    friendships = []; activeFriend = null;
    resetChatArea();

    if(!u || !ready){
      btnOpen.hidden = true;
      if(dlg.open) dlg.close();
      return;
    }

    btnOpen.hidden = false;
    unsubFriends = db.collection("friendships")
      .where("users", "array-contains", u.uid)
      .onSnapshot(snap => {
        friendships = snap.docs.map(d => ({id: d.id, ...d.data()}));
        renderSidebar();
      }, err => console.error(err));
  });
})();