/* desktop.js - lo propio de la app de escritorio:
   - muestra amigos/chat al iniciar sesión
   - textos del login editables desde index.html (auth.js ya no los pisa)
   - sonido de llamada y de notificación (tus archivos en app/sounds/ o uno sintetizado)
   - notificaciones nativas, parpadeo y contador de no leídos */
(() => {
  /* ======== AJUSTES (puedes cambiarlos) ======== */
  const OPEN_LOGIN_AT_START = false; // true = abre el login solo al iniciar la app
  const VOL_CALL = 1;                // volumen del sonido de llamada (0 a 1)
  const VOL_MSG = 0.8;               // volumen del sonido de notificación (0 a 1)
  /* ============================================= */

  const $ = s => document.querySelector(s);
  const D = window.deytekDesktop || {};
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  const dlg = $("#social-dlg"), welcome = $("#welcome");
  const BASE = document.title || "DeyTek Claud";

  /* ---------- Textos del login: lo que escribas en index.html se queda ---------- */
  const AUTH_TEXTS = [["#at", "Crea tu cuenta"], ["#asubmit", "Crear cuenta"], ["#stxt", "¿Ya tienes cuenta?"], ["#swap", "Iniciar sesión"]];
  const authEls = AUTH_TEXTS.map(([sel, def]) => {
    const el = $(sel); if(!el) return null;
    if(el.dataset.login == null) el.dataset.login = el.textContent.trim();
    if(el.dataset.signup == null) el.dataset.signup = def;
    return el;
  }).filter(Boolean);
  function applyAuthTexts(){
    const signup = !!($("#aname") && !$("#aname").hidden);
    authEls.forEach(el => {
      const want = signup ? el.dataset.signup : el.dataset.login;
      if(el.textContent !== want) el.textContent = want;
    });
  }
  const mo = new MutationObserver(applyAuthTexts);
  authEls.forEach(el => mo.observe(el, {childList: true, characterData: true, subtree: true}));
  if($("#aname")) mo.observe($("#aname"), {attributes: true, attributeFilter: ["hidden"]});
  applyAuthTexts();

  /* ---------- Audio ---------- */
  let ac = null;
  function getAC(){
    if(!ac){ const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null; ac = new AC(); }
    if(ac.state === "suspended") ac.resume().catch(() => {});
    return ac;
  }

  /* Tus sonidos: app/sounds/llamada.(mp3|wav|ogg) y app/sounds/notificacion.(mp3|wav|ogg) */
  const bufs = {call: null, msg: null};
  async function loadBuf(name){
    for(const ext of ["mp3", "wav", "ogg"]){
      try{
        const r = await fetch(`sounds/${name}.${ext}`);
        if(!r.ok) continue;
        const a = getAC(); if(!a) return null;
        return await a.decodeAudioData(await r.arrayBuffer());
      }catch(e){ console.warn(`[sonido] sounds/${name}.${ext} no se pudo leer`, e); }
    }
    return null;
  }
  Promise.all([loadBuf("llamada"), loadBuf("notificacion")]).then(([c, m]) => {
    bufs.call = c; bufs.msg = m;
    console.info(`[sonido] llamada: ${c ? "tu archivo" : "sintetizado (no hay sounds/llamada.*)"} | notificación: ${m ? "tu archivo" : "sintetizado (no hay sounds/notificacion.*)"}`);
  });

  function playBuf(buf, loop, vol){
    const a = getAC(); if(!a) return null;
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; s.loop = loop; g.gain.value = vol;
    s.connect(g); g.connect(a.destination); s.start();
    return s;
  }

  /* Notificación: tu sonido, o dos notas cortas */
  function ding(){
    if(bufs.msg){ playBuf(bufs.msg, false, VOL_MSG); return; }
    try{
      const a = getAC(); if(!a) return;
      const t = a.currentTime;
      [[880, 0], [1318.5, .12]].forEach(([f, d]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t + d);
        g.gain.exponentialRampToValueAtTime(.25 * VOL_MSG, t + d + .02);
        g.gain.exponentialRampToValueAtTime(.0001, t + d + .5);
        o.connect(g); g.connect(a.destination); o.start(t + d); o.stop(t + d + .55);
      });
    }catch(e){}
  }

  /* Llamada: tu sonido en bucle, o una sirena */
  let sirenT = null, callSrc = null;
  function sweep(){
    try{
      const a = getAC(); if(!a) return;
      const t = a.currentTime, o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
      o.type = "sawtooth"; lp.type = "lowpass"; lp.frequency.value = 2800;
      o.frequency.setValueAtTime(650, t);
      for(let i = 1; i <= 4; i++) o.frequency.linearRampToValueAtTime(i % 2 ? 1250 : 650, t + i * .4);
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(.22 * VOL_CALL, t + .05);
      g.gain.setValueAtTime(.22 * VOL_CALL, t + 1.5);
      g.gain.linearRampToValueAtTime(.0001, t + 1.6);
      o.connect(lp); lp.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 1.65);
    }catch(e){}
  }
  function stopRing(){
    clearInterval(sirenT); sirenT = null;
    if(callSrc){ try{ callSrc.stop(); }catch(e){} callSrc = null; }
  }
  /* call.js llama a esto en lugar de su pitido (parche de scripts/sync.js) */
  window.deytekRing = on => {
    stopRing();
    if(on){
      if(bufs.call) callSrc = playBuf(bufs.call, true, VOL_CALL);
      else{ sweep(); sirenT = setInterval(sweep, 1650); }
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
    /* ---------- Botones de ventana (barra personalizada) ---------- */
  const wc = $("#wc"), wmax = $("#w-max");
  if(D.win && wc){
    $("#w-min").onclick = () => D.win("min");
    wmax.onclick = () => D.win("max");
    $("#w-close").onclick = () => D.win("close");
    if(D.onMax) D.onMax(m => { wmax.classList.toggle("is-max", m); wmax.title = m ? "Restaurar" : "Maximizar"; wmax.setAttribute("aria-label", wmax.title); });
  }else if(wc) wc.hidden = true; // en un navegador normal no hay ventana que controlar

  /* ---------- Sesión ---------- */
  const wbtn = $("#welcome-btn");
  if(wbtn) wbtn.onclick = () => { if(window.openAuth) window.openAuth(); };

  /* La pantalla de amigos/chat nunca se queda cerrada mientras haya sesión */
  if(dlg) dlg.addEventListener("close", () => {
    if(window.deytekUser) setTimeout(() => { if(window.deytekUser && !dlg.open) dlg.show(); }, 0);
  });

  document.addEventListener("deytek:auth", () => {
    const u = window.deytekUser;
    cleanup();
    if(!u || !ready){
      if(dlg && dlg.open) dlg.close();
      if(welcome) welcome.hidden = false;
      if(ready && OPEN_LOGIN_AT_START && window.openAuth) window.openAuth();
      return;
    }
    if(welcome) welcome.hidden = true;
    if(dlg && !dlg.open) dlg.show(); // no modal: queda como pantalla principal
    unsubF = db.collection("friendships").where("users", "array-contains", u.uid)
      .onSnapshot(snap => onFriends(u, snap), err => console.error(err));
  });
})();