/* desktop.js - lo propio de la app de escritorio:
   - pantalla de amigos/chat siempre visible al iniciar sesión
   - sirena al recibir una llamada (reemplaza el pitido de call.js, ver scripts/sync.js)
   - sonido + notificación nativa al recibir mensajes o solicitudes de amistad */
(() => {
  const $ = s => document.querySelector(s);
  const D = window.deytekDesktop || {};
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  const dlg = $("#social-dlg"), welcome = $("#welcome"), sndBtn = $("#snd");
  const BASE = "DeyTek Claud";

  /* ---------- Sonidos ---------- */
  let soundOn = true;
  try{ soundOn = localStorage.getItem("deytek-desktop-sound") !== "off"; }catch(e){}
  const paintSnd = () => { sndBtn.textContent = "Sonido: " + (soundOn ? "Sí" : "No"); sndBtn.setAttribute("aria-pressed", soundOn); };
  paintSnd();
  sndBtn.onclick = () => {
    soundOn = !soundOn; paintSnd();
    try{ localStorage.setItem("deytek-desktop-sound", soundOn ? "on" : "off"); }catch(e){}
    if(soundOn) ding();
  };

  let ac = null;
  function getAC(){
    if(!ac){ const AC = window.AudioContext || window.webkitAudioContext; ac = new AC(); }
    if(ac.state === "suspended") ac.resume().catch(() => {});
    return ac;
  }

  /* Mensaje: dos notas cortas */
  function ding(){
    if(!soundOn) return;
    try{
      const a = getAC(), t = a.currentTime;
      [[880, 0], [1318.5, .12]].forEach(([f, d]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t + d);
        g.gain.exponentialRampToValueAtTime(.25, t + d + .02);
        g.gain.exponentialRampToValueAtTime(.0001, t + d + .5);
        o.connect(g); g.connect(a.destination); o.start(t + d); o.stop(t + d + .55);
      });
    }catch(e){}
  }

  /* Llamada: sirena (siempre suena, aunque el sonido de mensajes esté apagado) */
  let sirenT = null;
  function sweep(){
    try{
      const a = getAC(), t = a.currentTime, o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
      o.type = "sawtooth"; lp.type = "lowpass"; lp.frequency.value = 2800;
      o.frequency.setValueAtTime(650, t);
      for(let i = 1; i <= 4; i++) o.frequency.linearRampToValueAtTime(i % 2 ? 1250 : 650, t + i * .4);
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(.22, t + .05);
      g.gain.setValueAtTime(.22, t + 1.5);
      g.gain.linearRampToValueAtTime(.0001, t + 1.6);
      o.connect(lp); lp.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 1.65);
    }catch(e){}
  }
  /* call.js llama a esto en lugar de su pitido (parche de scripts/sync.js) */
  window.deytekRing = on => {
    clearInterval(sirenT); sirenT = null;
    if(on){
      sweep(); sirenT = setInterval(sweep, 1650);
      const name = ($("#ci-name") || {}).textContent || "Alguien";
      if(D.ringing) D.ringing(true, name);
    }else if(D.ringing) D.ringing(false, "");
  };

  /* ---------- No leídos en el título ---------- */
  let unread = 0;
  function paintUnread(){
    document.title = unread ? `(${unread}) ${BASE}` : BASE;
    if(D.unread) D.unread(unread);
  }
  addEventListener("focus", () => { unread = 0; paintUnread(); });

  /* ---------- Avisos de mensajes y solicitudes ---------- */
  const pairId = (a, b) => [a, b].sort().join("_");
  const nameCache = {};
  const db = ready ? firebase.firestore() : null;

  async function nameOf(uid){
    if(nameCache[uid]) return nameCache[uid];
    try{ const d = await db.collection("users").doc(uid).get(); nameCache[uid] = (d.data() || {}).name || "Jugador"; }
    catch(e){ nameCache[uid] = "Jugador"; }
    return nameCache[uid];
  }
  const viewing = uid => {
    const on = document.querySelector("#ffriend-list .fbtn.on");
    return document.hasFocus() && !!on && on.dataset.chat === uid;
  };
  function describe(m){
    if(m.text) return String(m.text).slice(0, 120);
    if(m.mkind === "video") return "Te envió un video";
    if(m.mkind === "gif") return "Te envió un GIF";
    return "Te envió una foto";
  }

  let unsubF = null, firstF = true;
  const chatUn = new Map(); // uid del amigo -> función para dejar de escuchar

  function watchChat(me, friendUid){
    if(chatUn.has(friendUid)) return;
    let first = true;
    const un = db.collection("chats").doc(pairId(me.uid, friendUid)).collection("messages")
      .orderBy("createdAt", "desc").limit(1)
      .onSnapshot(snap => {
        if(first){ first = false; return; } // lo que ya existía no suena
        snap.docChanges().forEach(async ch => {
          if(ch.type !== "added") return;
          const m = ch.doc.data({serverTimestamps: "estimate"});
          if(m.uid === me.uid || ch.doc.metadata.hasPendingWrites) return;
          /* Al borrar el último mensaje aparece uno viejo como "nuevo": se ignora */
          if(m.createdAt && m.createdAt.toMillis() < Date.now() - 60000) return;
          if(viewing(friendUid)) return;
          ding();
          if(!document.hasFocus()){ unread++; paintUnread(); }
          if(D.alert) D.alert({title: await nameOf(friendUid), body: describe(m)});
        });
      }, () => {});
    chatUn.set(friendUid, un);
  }

  function onFriends(me, snap){
    const accepted = new Set();
    snap.docs.forEach(d => {
      const f = d.data();
      if(f.status === "accepted") accepted.add(f.users.find(x => x !== me.uid));
    });
    accepted.forEach(u => watchChat(me, u));
    [...chatUn.keys()].forEach(u => { if(!accepted.has(u)){ chatUn.get(u)(); chatUn.delete(u); } });

    if(!firstF){
      snap.docChanges().forEach(async ch => {
        if(ch.type !== "added") return;
        const f = ch.doc.data();
        if(f.status !== "pending" || f.from === me.uid) return;
        ding();
        if(D.alert) D.alert({title: "Nueva solicitud de amistad", body: (await nameOf(f.from)) + " quiere ser tu amigo"});
      });
    }
    firstF = false;
  }

  function cleanup(){
    if(unsubF){ unsubF(); unsubF = null; }
    chatUn.forEach(f => { try{ f(); }catch(e){} }); chatUn.clear();
    firstF = true; unread = 0; paintUnread();
  }
  /* auth.js reescribe el título cada vez que abre el login: se corrige aquí */
const at = $("#at");
const fixTitle = () => { if(at.textContent === "Entra a Deytek") at.textContent = "Entra a Deytek Claud"; };
new MutationObserver(fixTitle).observe(at, {childList:true, characterData:true, subtree:true});
fixTitle();

  /* ---------- Sesión ---------- */
  $("#welcome-btn").onclick = () => { if(window.openAuth) window.openAuth(); };
  document.addEventListener("deytek:auth", () => {
    const u = window.deytekUser;
    cleanup();
    if(!u || !ready){
      if(dlg.open) dlg.close();
      welcome.hidden = false;
      if(ready && window.openAuth) window.openAuth();
      return;
    }
    welcome.hidden = true;
    if(!dlg.open) dlg.show(); // no modal: queda como pantalla principal
    unsubF = db.collection("friendships").where("users", "array-contains", u.uid)
      .onSnapshot(snap => onFriends(u, snap), err => console.error(err));
  });
})();
