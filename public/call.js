/* call.js — Llamadas de voz en grupo (hasta 6 personas) + compartir pantalla.
   WebRTC en malla: cada persona se conecta con cada una. Firestore solo hace de señalización
   (rooms / invites / signals). */
(() => {
  /* Con solo STUN funciona en la mayoría de redes; para el 100% agrega un servidor TURN. */
  const ICE = { iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
    // ,{ urls: "turn:TU_SERVIDOR:443", username: "USUARIO", credential: "CLAVE" }
  ]};
  const RING_MS = 45000, STALE_MS = 60000, MAX_BPS = 25e6, TOTAL_UP = 16e6, MAX_PEOPLE = 6;
  const $ = s => document.querySelector(s);
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  const dlg = $("#social-dlg"), head = $("#chat-head");
  if(!ready || !dlg || !head || !navigator.mediaDevices || !window.RTCPeerConnection) return;
  const db = firebase.firestore(), TS = () => firebase.firestore.FieldValue.serverTimestamp();
  const UA = navigator.userAgent;
  const ANDROID = /Android/i.test(UA), MOBILE = /Android|iPhone|iPad|iPod/i.test(UA);
  const CAN_SHARE = typeof navigator.mediaDevices.getDisplayMedia === "function" && !ANDROID;

  const h = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const letter = n => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8e8e93"/><text x="50" y="66" font-size="48" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#000">${((n||"?")[0]).toUpperCase().replace(/[<>&"']/g,"?")}</text></svg>`);
  const clr = id => { clearTimeout(id); clearInterval(id); };
  const clampInt = (x, a, b, def) => Math.max(a, Math.min(b, Math.round(+x) || def));
  const rid8 = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z"/></svg>';
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z"/></svg>';
  const MICOFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23A6.9 6.9 0 0019 11zm-4.02.17c0-.06.02-.11.02-.17V5a3 3 0 00-5.94-.6l5.92 5.92v.85zM4.27 3L3 4.27l6.01 6.01V11a3 3 0 003.99 2.83l1.67 1.67A5 5 0 017 11H5a7 7 0 006 6.92V21h2v-3.08c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>';
  const SCREEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.11 0-2 .89-2 2v10c0 1.1.89 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>';
  const ADD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

  /* ---------- Estilos ---------- */
  const css = document.createElement("style");
  css.textContent = `
  #callbtn svg{width:16px;height:16px;fill:currentColor;margin-right:6px}
  #callbtn.live{background:#ff453a}
  #backbtn{display:none}
  #social-dlg[open]{display:flex;flex-direction:column}
  #social-dlg .social-wrap{flex:1 1 0;min-height:0;height:auto}
  @media(min-width:721px){#social-dlg.incall{width:min(1000px,calc(100% - 24px));height:min(820px,94dvh)}}
  #call-panel{flex:none;display:flex;flex-direction:column;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line,rgba(255,255,255,.14));background:rgba(255,255,255,.03);max-height:58%;overflow-y:auto}
  #call-panel[hidden]{display:none!important}
  .cp-top{display:flex;justify-content:space-between;font-size:13px;color:var(--mut,#8e8e93);padding-right:44px}
  .cp-users{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  .cp-card{flex:1 1 120px;max-width:200px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 10px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid var(--line,rgba(255,255,255,.14));text-align:center}
  .cp-card b{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cp-card small{font-size:12px;color:var(--mut,#8e8e93)}
  .cp-av{position:relative;width:60px;height:60px;border-radius:50%;transition:box-shadow .15s}
  .cp-av img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
  .cp-x{display:none;position:absolute;right:-4px;bottom:-4px;width:24px;height:24px;border-radius:50%;background:#fff;color:#000;align-items:center;justify-content:center}
  .cp-x svg{width:14px;height:14px;fill:currentColor}
  .cp-card.muted .cp-x{display:flex}
  .cp-card.talk .cp-av{box-shadow:0 0 0 3px #fff,0 0 20px rgba(255,255,255,.55)}
  .cp-card.ring .cp-av{animation:cpr 1.2s infinite}
  @keyframes cpr{0%{box-shadow:0 0 0 0 rgba(255,255,255,.5)}100%{box-shadow:0 0 0 14px rgba(255,255,255,0)}}
  #cp-unmute{align-self:center;width:auto!important;padding:0 20px!important}
  .cp-screens{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
  .cp-screens[hidden],.cp-inv[hidden]{display:none!important}
  .cp-vid{position:relative;flex:1 1 260px;max-width:100%;cursor:zoom-in}
  .cp-vid.small{flex:0 1 190px}
  .cp-vid video{width:100%;max-height:34vh;object-fit:contain;background:#000;border-radius:14px;display:block}
  .cp-vid span{position:absolute;left:10px;top:8px;font-size:12px;padding:3px 9px;border-radius:999px;background:rgba(0,0,0,.6);pointer-events:none}
  .cp-vid em{position:absolute;left:10px;bottom:8px;font-size:11px;font-style:normal;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.6);pointer-events:none}
  .cp-vid .cp-fs{position:absolute;right:8px;top:6px;width:34px;height:34px;background:rgba(0,0,0,.6);font-size:16px}
  .cp-inv{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid var(--line,rgba(255,255,255,.14))}
  .cp-invh{display:flex;justify-content:space-between;align-items:center;font-size:14px}
  .cp-invlist{display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto}
  .cp-bar{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;justify-content:center}
  .cp-btn{width:44px;height:44px;border-radius:50%;border:1px solid var(--line,rgba(255,255,255,.14));background:rgba(255,255,255,.1);color:#fff;cursor:pointer;display:grid;place-items:center;padding:0;margin:0;font:inherit}
  .cp-btn svg{width:20px;height:20px;fill:currentColor}
  .cp-btn.on{background:#fff;color:#000}
  .cp-btn:disabled{opacity:.4;cursor:default}
  .cp-btn.end{background:#ff453a;border-color:#ff453a}
  .cp-btn.end svg{transform:rotate(135deg)}
  .cp-sel,.cp-share label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--mut,#8e8e93);margin:0}
  .cp-sel[hidden]{display:none}
  .cp-sel select,.cp-share select,.cp-share input{margin:0;padding:7px 8px;border-radius:10px;border:1px solid var(--line,rgba(255,255,255,.14));background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:13px;width:auto}
  .cp-sel select{max-width:170px}
  .cp-sel option,.cp-share option{background:#1c1c1e;color:#fff}
  .cp-share{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:flex-end;padding-top:10px;border-top:1px solid var(--line,rgba(255,255,255,.14))}
  .cp-share[hidden],.cp-share [hidden]{display:none!important}
  .cp-share input[type=number]{width:78px}
  .cp-share .cwh{display:flex;gap:6px;align-items:flex-end}
  #call-view{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:#000;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;animation:none}
  #call-view[open]{display:flex;align-items:center;justify-content:center}
  #call-view video{width:100%;height:100%;object-fit:contain;background:#000}
  .cv-bar{position:absolute;top:max(10px,env(safe-area-inset-top));left:12px;right:12px;display:flex;align-items:center;gap:10px;pointer-events:none}
  .cv-bar>*{pointer-events:auto}
  .cv-bar span{margin-right:auto;padding:6px 14px;border-radius:999px;background:rgba(0,0,0,.65);font-size:13px}
  #call-pill,#call-toast{margin:0;border:1px solid var(--line,rgba(255,255,255,.14));background:rgba(20,20,22,.92);color:#fff;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:999px;inset:auto auto 20px 50%;transform:translateX(-50%)}
  #call-pill:popover-open{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 18px}
  #call-pill .cp-btn{width:38px;height:38px}
  #call-toast{padding:10px 18px;font-size:14px;max-width:calc(100vw - 24px);text-align:center}
  #call-in{text-align:center}
  #call-in img{width:84px;height:84px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 10px}
  #call-in .row{display:flex;gap:10px;justify-content:center;margin-top:14px}
  #call-in .row .btn{width:auto;margin:0}
  @media(max-width:720px){
    #backbtn{display:inline-flex;width:40px!important;padding:0!important;font-size:22px}
    #call-panel{padding:10px 12px;max-height:62%}
    .cp-card{padding:10px 6px;flex:1 1 100px}
    .cp-av{width:50px;height:50px}
    .cp-vid video{max-height:30dvh}
    .cp-sel select{max-width:130px}
    .cp-btn{width:42px;height:42px}
  }
  `;
  document.head.append(css);

  /* ---------- Elementos ---------- */
  const unlockEl = new Audio();
  const audioBox = document.createElement("div"); audioBox.hidden = true; document.body.append(audioBox);

  const panel = document.createElement("section");
  panel.id = "call-panel"; panel.hidden = true;
  panel.innerHTML = `
    <div class="cp-top"><span id="cp-title">Llamada de voz</span><span id="cp-time">00:00</span></div>
    <div class="cp-users" id="cp-users"></div>
    <button type="button" class="btn solid sm" id="cp-unmute" hidden>🔊 Toca para activar el audio</button>
    <div class="cp-screens" id="cp-screens" hidden></div>
    <div class="cp-inv" id="cp-inv" hidden>
      <div class="cp-invh"><b>Invitar a la llamada</b><button type="button" class="link" id="cp-invx">Cerrar</button></div>
      <div class="cp-invlist" id="cp-invlist"></div>
    </div>
    <div class="cp-bar">
      <button type="button" class="cp-btn" id="cp-mute" aria-pressed="false" title="Silenciar micrófono">${MIC}</button>
      <label class="cp-sel">Micrófono<select id="cp-mic"></select></label>
      <label class="cp-sel" id="cp-spk-w" hidden>Salida de audio<select id="cp-spk"></select></label>
      <button type="button" class="cp-btn" id="cp-share" title="Compartir pantalla" aria-label="Compartir pantalla" aria-pressed="false" disabled>${SCREEN}</button>
      <button type="button" class="cp-btn" id="cp-invb" title="Invitar a más personas" aria-label="Invitar a más personas">${ADD}</button>
      <button type="button" class="cp-btn end" id="cp-end" title="Colgar" aria-label="Colgar">${PHONE}</button>
    </div>
    <div class="cp-share" id="cp-sharecfg"${CAN_SHARE ? "" : " hidden"}>
      <label>Resolución
        <select id="sh-res">
          <option value="0">Original</option>
          <option value="854x480">480p</option>
          <option value="1280x720">720p (HD)</option>
          <option value="1920x1080" selected>1080p (Full HD)</option>
          <option value="2560x1440">1440p (2K)</option>
          <option value="3840x2160">4K</option>
          <option value="custom">Personalizada…</option>
        </select>
      </label>
      <span class="cwh" id="sh-cw" hidden>
        <label>Ancho<input id="sh-w" type="number" min="160" max="7680" value="1280"></label>
        <label>Alto<input id="sh-h" type="number" min="120" max="4320" value="720"></label>
      </span>
      <label>FPS<input id="sh-fps" type="number" min="1" max="60" value="30" list="sh-fl"></label>
      <datalist id="sh-fl"><option value="5"><option value="10"><option value="15"><option value="24"><option value="30"><option value="60"></datalist>
      <label>Prioridad
        <select id="sh-hint"><option value="motion">Fluidez (juegos / video)</option><option value="detail">Nitidez (texto / código)</option></select>
      </label>
    </div>`;
  const wrap = dlg.querySelector(".social-wrap");
  if(wrap) wrap.before(panel); else head.after(panel);
  const usersEl = $("#cp-users"), screensEl = $("#cp-screens");

  const view = document.createElement("dialog");
  view.id = "call-view";
  view.innerHTML = `<video id="cv-v" autoplay playsinline muted></video>
    <div class="cv-bar"><span id="cv-t"></span>
      <button type="button" class="cp-btn" id="cv-f" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
      <button type="button" class="cp-btn" id="cv-x" title="Cerrar" aria-label="Cerrar">✕</button></div>`;
  document.body.append(view);

  const pill = document.createElement("div");
  pill.id = "call-pill"; pill.setAttribute("popover", "manual");
  pill.innerHTML = `<span id="cl-t">En llamada</span><button type="button" class="cp-btn" id="cl-mute" title="Silenciar micrófono">${MIC}</button><button type="button" class="cp-btn end" id="cl-end" title="Colgar" aria-label="Colgar">${PHONE}</button>`;
  document.body.append(pill);

  const toast = document.createElement("div");
  toast.id = "call-toast"; toast.setAttribute("popover", "manual"); toast.setAttribute("role", "status");
  document.body.append(toast);

  const inDlg = document.createElement("dialog");
  inDlg.id = "call-in";
  inDlg.innerHTML = `<img id="ci-img" alt=""><h3 id="ci-name">Jugador</h3><p>te invita a una llamada…</p>
    <div class="row"><button type="button" class="btn solid" id="ci-yes">Unirme</button><button type="button" class="btn glass" id="ci-no">Rechazar</button></div>`;
  document.body.append(inDlg);

  function pop(el, on){
    if(typeof el.showPopover === "function"){
      const open = el.matches(":popover-open");
      if(on && !open) el.showPopover(); else if(!on && open) el.hidePopover();
    } else el.style.display = on ? "" : "none";
  }
  pop(pill, false); pop(toast, false);
  let toastT;
  function note(m){
    const s = $("#fstatus"); if(s) s.textContent = m;
    toast.textContent = m; pop(toast, true);
    clearTimeout(toastT); toastT = setTimeout(() => pop(toast, false), 4200);
  }
  const syncPill = () => pop(pill, !!R && !dlg.open);

  /* ---------- Estado ---------- */
  let R = null, incoming = null, inTimer, ringTimer, ringCtx, activeUid = null, unsubIn = null, cardTok = 0, monT;
  const infoCache = {};
  async function info(uid){
    if(infoCache[uid]) return infoCache[uid];
    try{ const d = await db.collection("users").doc(uid).get(); infoCache[uid] = d.exists ? d.data() : {}; }
    catch(e){ infoCache[uid] = {}; }
    return infoCache[uid];
  }
  const nameOfUid = uid => (infoCache[uid] && infoCache[uid].name) || "Jugador";
  const roomRef = id => db.collection("rooms").doc(id);
  const peersCol = id => roomRef(id).collection("peers");
  const sigCol = id => roomRef(id).collection("signals");
  const invRef = (rid, uid) => db.collection("invites").doc(rid + "_" + uid);

  /* ---------- Audio remoto ---------- */
  const SILENT = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  function unlockAudio(){ try{ unlockEl.src = SILENT; const p = unlockEl.play(); if(p && p.catch) p.catch(() => {}); }catch(e){} }
  function playEl(el){
    el.muted = false; el.volume = 1;
    const p = el.play();
    if(p && p.then) p.then(() => { $("#cp-unmute").hidden = true; }).catch(() => { $("#cp-unmute").hidden = false; });
  }
  $("#cp-unmute").onclick = () => { if(R) R.peers.forEach(P => P.audio && playEl(P.audio)); };
  const retry = () => {
    if(!R) return;
    R.peers.forEach(P => { if(P.audio && P.audio.srcObject && P.audio.paused) playEl(P.audio); });
    if(R.actx && R.actx.state === "suspended") R.actx.resume().catch(() => {});
  };
  document.addEventListener("click", retry, true);
  document.addEventListener("touchend", retry, true);

  /* ---------- Botones en la cabecera del chat ---------- */
  document.addEventListener("click", e => { const b = e.target.closest("[data-chat]"); if(b) activeUid = b.dataset.chat; }, true);
  function refreshBtn(){
    const b = $("#callbtn"); if(!b) return;
    const inRoom = !!R && (R.peers.has(activeUid) || R.invited.has(activeUid));
    b.classList.toggle("live", inRoom);
    b.disabled = false;
    if(!R) b.innerHTML = PHONE + "Llamar";
    else if(inRoom) b.innerHTML = PHONE + "Colgar";
    else b.innerHTML = ADD + "Invitar";
  }
  function mount(){
    const un = $("#unfriend");
    if(!un){ activeUid = null; return; }
    if(!$("#backbtn")){
      const bb = document.createElement("button");
      bb.type = "button"; bb.id = "backbtn"; bb.className = "btn glass sm"; bb.textContent = "‹"; bb.setAttribute("aria-label", "Volver a la lista de amigos");
      bb.onclick = () => { if(window.deytekResetChat) window.deytekResetChat(); else document.dispatchEvent(new Event("deytek:auth")); };
      head.prepend(bb);
    }
    if(!$("#callbtn")){
      const b = document.createElement("button");
      b.type = "button"; b.id = "callbtn"; b.className = "btn glass sm";
      b.onclick = () => {
        if(!R) startCall(activeUid);
        else if(R.peers.has(activeUid) || R.invited.has(activeUid)) end("");
        else inviteUser(activeUid).catch(inviteError);
      };
      ($("#blockbtn") || un).after(b);
    }
    refreshBtn();
  }
  new MutationObserver(mount).observe(head, {childList:true});

  /* ---------- Tarjetas de personas ---------- */
  const card = (uid, inf) => `<div class="cp-card" data-u="${h(uid)}"><div class="cp-av"><img src="${h(inf.photo || letter(inf.name))}" alt=""><i class="cp-x">${MICOFF}</i></div><b>${h(inf.name || "Jugador")}</b><small>…</small></div>`;
  const cardOf = uid => usersEl.querySelector(`.cp-card[data-u="${CSS.escape(uid)}"]`);
  const setTalk = (uid, t) => { const c = cardOf(uid); if(c) c.classList.toggle("talk", !!t); };
  function paintCard(uid){
    const r = R, c = cardOf(uid); if(!r || !c) return;
    let st = "", muted = false, ring = false;
    if(uid === r.me){ st = r.screen ? "Compartiendo pantalla" : "Tú"; muted = r.muted; }
    else if(r.peers.has(uid)){
      const P = r.peers.get(uid); muted = P.muted;
      st = P.rsharing ? "Compartiendo pantalla" : P.state === "connected" ? "Conectado" : P.state === "failed" ? "Sin conexión" : "Conectando…";
    }else{ st = "Llamando…"; ring = true; }
    c.querySelector("small").textContent = st;
    c.classList.toggle("muted", muted); c.classList.toggle("ring", ring);
  }
  async function renderCards(){
    const r = R; if(!r) return;
    const tok = ++cardTok;
    const uids = [r.me, ...r.peers.keys(), ...[...r.invited.keys()].filter(u => !r.peers.has(u))];
    const infos = await Promise.all(uids.map(info));
    if(R !== r || tok !== cardTok) return;
    usersEl.innerHTML = uids.map((u, i) => card(u, infos[i])).join("");
    uids.forEach(paintCard);
    const n = 1 + r.peers.size;
    $("#cp-title").textContent = n > 2 ? `Llamada en grupo · ${n} personas` : "Llamada de voz";
    refreshBtn(); refreshShareBtn(); tickTime();
  }

  /* ---------- Silencio, micrófono y salida ---------- */
  function paintMute(){
    const m = !!(R && R.muted);
    ["#cp-mute", "#cl-mute"].forEach(s => { const b = $(s); b.classList.toggle("on", m); b.innerHTML = m ? MICOFF : MIC; b.setAttribute("aria-pressed", m); b.title = m ? "Activar micrófono" : "Silenciar micrófono"; });
  }
  function toggleMute(){
    const r = R; if(!r) return;
    r.muted = !r.muted; r.track.enabled = !r.muted;
    if(r.muted) setTalk(r.me, false);
    paintMute(); paintCard(r.me); sendStateAll();
  }
  async function refreshDevices(){
    const r = R; if(!r) return;
    let ds; try{ ds = await navigator.mediaDevices.enumerateDevices(); }catch(e){ return; }
    const fill = (sel, kind, cur, name) => {
      sel.innerHTML = ds.filter(d => d.kind === kind).map((d, i) => `<option value="${h(d.deviceId)}"${d.deviceId === cur ? " selected" : ""}>${h(d.label || name + " " + (i + 1))}</option>`).join("");
    };
    fill($("#cp-mic"), "audioinput", r.track.getSettings().deviceId, "Micrófono");
    const w = $("#cp-spk-w"); w.hidden = typeof unlockEl.setSinkId !== "function";
    if(!w.hidden) fill($("#cp-spk"), "audiooutput", "", "Salida");
  }
  navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener("devicechange", refreshDevices);

  const micConstraints = id => ({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true, ...(id ? {deviceId:{ideal:id}} : {})}});
  async function getMic(){
    let id = ""; try{ id = localStorage.getItem("deytek-mic") || ""; }catch(e){}
    return navigator.mediaDevices.getUserMedia(micConstraints(id));
  }
  async function switchMic(id){
    const r = R; if(!r) return;
    const s = await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:id}, echoCancellation:true, noiseSuppression:true, autoGainControl:true}});
    if(R !== r){ s.getTracks().forEach(t => t.stop()); return; }
    const nt = s.getAudioTracks()[0]; nt.enabled = !r.muted;
    for(const P of r.peers.values()){
      const sd = P.pc.getSenders().find(x => x.track && x.track.kind === "audio");
      if(sd) await sd.replaceTrack(nt);
    }
    r.stream.getTracks().forEach(t => t.stop()); r.stream = s; r.track = nt;
    try{ localStorage.setItem("deytek-mic", id); }catch(e){}
    startMonSoon();
  }
  $("#cp-spk").onchange = e => { if(R) R.peers.forEach(P => P.audio && P.audio.setSinkId && P.audio.setSinkId(e.target.value).catch(() => {})); };

  /* ---------- Quién está hablando (solo en PC) ---------- */
  function stopMon(){
    const r = R; if(!r) return;
    clr(r.mon); r.mon = null;
    if(r.actx){ try{ r.actx.close(); }catch(e){} r.actx = null; }
  }
  const startMonSoon = () => { clearTimeout(monT); monT = setTimeout(startMon, 300); };
  function startMon(){
    const r = R; if(!r) return;
    stopMon();
    if(MOBILE) return;
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    const actx = r.actx = new AC();
    const mk = s => { const an = actx.createAnalyser(); an.fftSize = 512; actx.createMediaStreamSource(s).connect(an); return {an, buf:new Uint8Array(an.fftSize)}; };
    const lvl = x => { x.an.getByteTimeDomainData(x.buf); let m = 0; for(const v of x.buf) m = Math.max(m, Math.abs(v - 128)); return m; };
    const L = mk(r.stream), others = [];
    r.peers.forEach(P => { if(P.remote && P.remote.getAudioTracks().length) others.push([P.uid, mk(P.remote)]); });
    r.mon = setInterval(() => {
      setTalk(r.me, !r.muted && lvl(L) > 6);
      others.forEach(([u, x]) => setTalk(u, lvl(x) > 6));
    }, 120);
  }

  /* ---------- Visor grande de pantalla compartida ---------- */
  function openView(k){
    const r = R; if(!r) return;
    const P = k === "local" ? null : r.peers.get(k);
    const s = k === "local" ? r.screen : (P && P.rsharing ? P.rvideo : null); if(!s) return;
    view.dataset.k = k;
    const v = $("#cv-v"); v.srcObject = s; v.play().catch(() => {});
    $("#cv-t").textContent = k === "local" ? "Tu pantalla" : "Pantalla de " + nameOfUid(k);
    if(!view.open) view.showModal();
  }
  function closeView(){ if(view.open) view.close(); }
  view.addEventListener("close", () => { $("#cv-v").srcObject = null; delete view.dataset.k; if(document.fullscreenElement) document.exitFullscreen().catch(() => {}); });
  function viewFs(){
    const v = $("#cv-v");
    if(document.fullscreenElement){ document.exitFullscreen().catch(() => {}); return; }
    if(view.requestFullscreen) view.requestFullscreen().catch(() => { if(v.webkitEnterFullscreen) v.webkitEnterFullscreen(); });
    else if(v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  }
  $("#cv-x").onclick = closeView; $("#cv-f").onclick = viewFs; $("#cv-v").ondblclick = viewFs;

  /* ---------- Pantallas: una miniatura por cada persona que comparte ---------- */
  function renderScreens(){
    const r = R; if(!r) return;
    const want = [];
    if(r.screen) want.push("local");
    r.peers.forEach(P => { if(P.rsharing && P.rvideo) want.push(P.uid); });
    [...screensEl.children].forEach(el => { if(!want.includes(el.dataset.k)) el.remove(); });
    want.forEach(k => {
      let el = screensEl.querySelector(`[data-k="${CSS.escape(k)}"]`);
      if(!el){
        el = document.createElement("div"); el.className = "cp-vid" + (k === "local" ? " small" : ""); el.dataset.k = k;
        el.innerHTML = `<video autoplay playsinline muted></video><span></span><button type="button" class="cp-btn cp-fs" title="Ampliar" aria-label="Ampliar">⛶</button><em></em>`;
        el.addEventListener("click", () => openView(k));
        screensEl.append(el);
      }
      const v = el.querySelector("video"), stream = k === "local" ? r.screen : r.peers.get(k).rvideo;
      if(v.srcObject !== stream){ v.srcObject = stream; v.play().catch(() => {}); }
      el.querySelector("span").textContent = k === "local" ? "Tu pantalla" : "Pantalla de " + nameOfUid(k);
    });
    screensEl.hidden = !want.length;
    updateShareInfo();
  }
  function updateShareInfo(){
    const el = screensEl.querySelector('[data-k="local"] em'); if(!el) return;
    const t = R && R.screen && R.screen.getVideoTracks()[0]; if(!t){ el.textContent = ""; return; }
    const s = t.getSettings();
    el.textContent = s.width ? `${s.width}×${s.height} · ${Math.round(s.frameRate || 0)} FPS` : "";
  }

  /* ---------- Compartir pantalla ---------- */
  const SH_KEY = "deytek-share";
  function loadShareCfg(){
    try{
      const s = JSON.parse(localStorage.getItem(SH_KEY) || "{}");
      if(s.res && [...$("#sh-res").options].some(o => o.value === s.res)) $("#sh-res").value = s.res;
      if(s.w) $("#sh-w").value = s.w; if(s.h) $("#sh-h").value = s.h;
      if(s.fps) $("#sh-fps").value = s.fps; if(s.hint) $("#sh-hint").value = s.hint;
    }catch(e){}
    $("#sh-cw").hidden = $("#sh-res").value !== "custom";
  }
  function shareOpts(){
    const v = $("#sh-res").value; let w = 0, hh = 0;
    if(v === "custom"){ w = clampInt($("#sh-w").value, 160, 7680, 1280); hh = clampInt($("#sh-h").value, 120, 4320, 720); }
    else if(v !== "0"){ [w, hh] = v.split("x").map(Number); }
    return {w, h:hh, fps:clampInt($("#sh-fps").value, 1, 60, 30), hint:$("#sh-hint").value};
  }
  const vConstraints = o => ({...(o.w ? {width:{ideal:o.w}, height:{ideal:o.h}} : {}), frameRate:{ideal:o.fps}});
  const anyConnected = () => !!R && [...R.peers.values()].some(P => P.state === "connected");
  function refreshShareBtn(){ $("#cp-share").disabled = !anyConnected(); }
  function paintShare(){
    const on = !!(R && R.screen), b = $("#cp-share");
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    b.title = on ? "Dejar de compartir pantalla" : "Compartir pantalla";
    $("#sh-cw").hidden = $("#sh-res").value !== "custom";
  }
  /* El ancho de banda de subida se reparte entre quienes ven tu pantalla */
  async function tune(P, t, o){
    if(!P.vtx || !R) return;
    const st = t.getSettings(), sw = st.width || o.w || 1920, sh = st.height || o.h || 1080;
    const scale = o.w ? Math.max(1, sw / o.w, sh / o.h) : 1;
    const n = Math.max(1, [...R.peers.values()].filter(p => p.vtx).length);
    let bps = Math.round((sw / scale) * (sh / scale) * o.fps * (o.hint === "detail" ? 0.1 : 0.07));
    bps = Math.max(300000, Math.min(MAX_BPS, bps, Math.floor(TOTAL_UP / n)));
    try{
      const p = P.vtx.sender.getParameters();
      if(!p.encodings || !p.encodings.length) p.encodings = [{}];
      Object.assign(p.encodings[0], {maxFramerate:o.fps, maxBitrate:bps, scaleResolutionDownBy:Math.round(scale * 100) / 100});
      await P.vtx.sender.setParameters(p);
    }catch(e){ console.warn("setParameters", e); }
  }
  async function attachScreen(P){
    const r = R; if(!r || !r.screen || !P.vtx) return;
    const t = r.screen.getVideoTracks()[0]; if(!t) return;
    try{ await P.vtx.sender.replaceTrack(t); await tune(P, t, shareOpts()); }catch(e){ console.warn("attachScreen", e); }
  }
  async function startShare(){
    const r = R; if(!r || r.screen || !anyConnected()) return;
    const o = shareOpts(); let s;
    try{ s = await navigator.mediaDevices.getDisplayMedia({video:vConstraints(o), audio:false}); }
    catch(e){
      const n = e && e.name;
      if(n === "NotAllowedError" || n === "AbortError") return;
      note(n === "NotFoundError" ? "No hay pantalla o ventana para compartir."
        : n === "NotReadableError" ? "El sistema no dejó capturar la pantalla. Revisa el permiso de grabación de pantalla del navegador."
        : "No se pudo compartir la pantalla.");
      return;
    }
    if(R !== r){ s.getTracks().forEach(t => t.stop()); return; }
    const t = s.getVideoTracks()[0]; t.contentHint = o.hint;
    try{ await t.applyConstraints(vConstraints(o)); }catch(e){}
    r.screen = s; t.onended = () => stopShare();
    r.peers.forEach(P => attachScreen(P));
    renderScreens(); paintShare(); paintCard(r.me); sendStateAll();
    setTimeout(updateShareInfo, 800);
  }
  async function stopShare(){
    const r = R; if(!r || !r.screen) return;
    const s = r.screen; r.screen = null;
    s.getTracks().forEach(t => { t.onended = null; t.stop(); });
    for(const P of r.peers.values()){ if(P.vtx){ try{ await P.vtx.sender.replaceTrack(null); }catch(e){} } }
    if(view.dataset.k === "local") closeView();
    renderScreens(); paintShare(); paintCard(r.me); sendStateAll();
  }
  async function applyShare(){
    const r = R; if(!r || !r.screen) return;
    const o = shareOpts(), t = r.screen.getVideoTracks()[0]; if(!t) return;
    t.contentHint = o.hint;
    try{ await t.applyConstraints(vConstraints(o)); }catch(e){}
    for(const P of r.peers.values()) await tune(P, t, o);
    setTimeout(updateShareInfo, 800);
  }
  function setPeerSharing(P, on){
    P.rsharing = !!on;
    if(!P.rsharing && view.dataset.k === P.uid) closeView();
    renderScreens(); if(R) paintCard(P.uid);
  }

  /* ---------- Conexiones entre personas (malla) ---------- */
  const rank = s => s.type === "offer" ? 0 : s.type === "answer" ? 1 : 2;
  function signal(P, type, data){
    const r = R; if(!r) return;
    sigCol(r.id).add({from:r.me, to:P.uid, type, sid:P.sid, data, createdAt:TS()}).catch(() => {});
  }
  const stateMsg = () => JSON.stringify({muted: !!(R && R.muted), sharing: !!(R && R.screen)});
  const sendStateTo = P => { if(P.ch && P.ch.readyState === "open") P.ch.send(stateMsg()); };
  const sendStateAll = () => { if(R) R.peers.forEach(sendStateTo); };

  function bindChannel(P, ch){
    P.ch = ch;
    ch.onopen = () => sendStateTo(P);
    ch.onmessage = e => {
      try{
        const m = JSON.parse(e.data);
        if("muted" in m){ P.muted = !!m.muted; if(P.muted) setTalk(P.uid, false); if(R) paintCard(P.uid); }
        if("sharing" in m && !!m.sharing !== !!P.rsharing) setPeerSharing(P, !!m.sharing);
      }catch(_){}
    };
  }

  function buildPC(P){
    const r = R, pc = P.pc = new RTCPeerConnection(ICE);
    r.stream.getTracks().forEach(t => pc.addTrack(t, r.stream));
    if(P.initiator){
      /* Canal de video reservado: compartir pantalla no necesita renegociar */
      P.vtx = pc.addTransceiver("video", {direction:"sendrecv"});
      bindChannel(P, pc.createDataChannel("state"));
    }else pc.ondatachannel = e => bindChannel(P, e.channel);
    pc.ontrack = e => {
      if(R !== r || P.pc !== pc) return;
      if(e.track.kind === "video"){
        P.rvideo = new MediaStream([e.track]);
        e.track.onunmute = () => { if(R === r && r.peers.get(P.uid) === P && !P.rsharing) setPeerSharing(P, true); };
        renderScreens(); return;
      }
      P.remote = e.streams[0] || new MediaStream([e.track]);
      if(!P.audio){
        P.audio = document.createElement("audio"); P.audio.autoplay = true; P.audio.setAttribute("playsinline", "");
        P.audio.onplaying = () => { $("#cp-unmute").hidden = true; };
        audioBox.append(P.audio);
      }
      P.audio.srcObject = P.remote; playEl(P.audio); startMonSoon();
    };
    pc.onicecandidate = e => { if(e.candidate && R === r && P.pc === pc) signal(P, "cand", JSON.stringify(e.candidate)); };
    pc.onconnectionstatechange = () => {
      if(R !== r || P.pc !== pc) return;
      const s = pc.connectionState;
      if(s === "connected") onPeerConnected(P);
      else if(s === "disconnected"){
        P.state = "connecting"; paintCard(P.uid);
        setTimeout(() => { if(R === r && P.pc === pc && pc.connectionState === "disconnected") pcFailed(P); }, 8000);
      }else if(s === "failed") pcFailed(P);
    };
  }
  /* Si una conexión cae, quien inició reintenta con una oferta nueva (hasta 2 veces) */
  function pcFailed(P){
    const r = R; if(!r || r.peers.get(P.uid) !== P) return;
    if(P.initiator && (P.retries || 0) < 2){
      P.retries = (P.retries || 0) + 1; P.state = "connecting"; resetPC(P); makeOffer(P); paintCard(P.uid);
    }else{
      P.state = "failed"; paintCard(P.uid);
      note(`Se perdió la conexión con ${nameOfUid(P.uid)}. Puede faltar un servidor TURN.`);
    }
    refreshShareBtn();
  }
  function resetPC(P){
    try{ P.ch && P.ch.close(); }catch(e){}
    try{ P.pc.close(); }catch(e){}
    P.ch = null; P.sid = ""; P.vtx = null; P.rvideo = null; P.rsharing = false;
    buildPC(P); renderScreens();
  }
  async function makeOffer(P){
    const pc = P.pc; P.sid = rid8();
    try{
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      signal(P, "offer", JSON.stringify({type:offer.type, sdp:offer.sdp}));
    }catch(e){ console.error(e); }
  }
  function flushPend(P){
    const keep = [];
    P.pend.splice(0).forEach(x => { if(x.sid === P.sid) P.pc.addIceCandidate(x.c).catch(() => {}); else keep.push(x); });
    P.pend = keep.slice(-60);
  }
  async function processSignal(P, s){
    const r = R; if(!r || r.peers.get(P.uid) !== P) return;
    try{
      if(s.type === "offer"){
        if(P.initiator) return;
        if(P.sid && P.sid !== s.sid) resetPC(P);
        P.sid = s.sid;
        const pc = P.pc;
        await pc.setRemoteDescription(JSON.parse(s.data)); flushPend(P);
        const vt = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === "video");
        if(vt){ vt.direction = "sendrecv"; P.vtx = vt; }
        const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
        signal(P, "answer", JSON.stringify({type:ans.type, sdp:ans.sdp}));
        attachScreen(P);
      }else if(s.type === "answer"){
        if(!P.initiator || s.sid !== P.sid) return;
        await P.pc.setRemoteDescription(JSON.parse(s.data)); flushPend(P);
      }else if(s.type === "cand"){
        const c = JSON.parse(s.data);
        if(P.pc.remoteDescription && s.sid === P.sid) P.pc.addIceCandidate(c).catch(() => {});
        else P.pend.push({sid:s.sid, c});
      }
    }catch(e){ console.error(e); }
  }
  const enqueue = (P, s) => { P.q = (P.q || Promise.resolve()).then(() => processSignal(P, s)); };
  function handleSignal(s){
    const r = R; if(!r) return;
    const P = r.peers.get(s.from);
    if(P){ enqueue(P, s); return; }
    const list = r.early[s.from] = r.early[s.from] || [];
    if(list.length < 100) list.push(s);
  }

  function addPeer(uid){
    const r = R; if(!r || r.peers.has(uid) || r.peers.size >= MAX_PEOPLE - 1) return;
    const P = {uid, pc:null, ch:null, audio:null, remote:null, rvideo:null, rsharing:false, muted:false, vtx:null, pend:[], sid:"", state:"connecting", initiator: r.me > uid, retries:0, q:null};
    r.peers.set(uid, P);
    if(r.invited.has(uid)){ clr(r.invited.get(uid)); r.invited.delete(uid); }
    buildPC(P);
    const early = (r.early[uid] || []).slice().sort((a, b) => rank(a) - rank(b)); delete r.early[uid];
    if(P.initiator) makeOffer(P);
    early.forEach(s => enqueue(P, s));
    renderCards(); renderInvites();
  }
  function dropPeer(uid){
    const r = R, P = r && r.peers.get(uid); if(!P) return;
    r.peers.delete(uid); r.seen.delete(uid);
    try{ P.ch && P.ch.close(); }catch(e){}
    try{ P.pc.close(); }catch(e){}
    if(P.audio){ P.audio.srcObject = null; P.audio.remove(); }
    if(view.dataset.k === uid) closeView();
    renderCards(); renderScreens(); renderInvites(); startMonSoon();
    if(!r.peers.size && !r.invited.size) end(r.t0 ? "Llamada finalizada" : "");
  }
  function onPeerConnected(P){
    const r = R; if(!r) return;
    P.state = "connected"; P.retries = 0;
    if(!r.t0){ r.t0 = Date.now(); r.timers.push(setInterval(tickTime, 1000)); }
    sendStateTo(P); attachScreen(P);
    paintCard(P.uid); refreshShareBtn(); tickTime(); startMonSoon();
  }
  function tickTime(){
    const r = R; if(!r || !r.t0) return;
    const s = Math.floor((Date.now() - r.t0) / 1000), t = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    $("#cp-time").textContent = t;
    const who = r.peers.size === 1 ? nameOfUid([...r.peers.keys()][0]) : (1 + r.peers.size) + " personas";
    $("#cl-t").textContent = `En llamada · ${who} · ${t}`;
  }
  function janitor(){
    const r = R; if(!r) return; const now = Date.now();
    [...r.peers.keys()].forEach(uid => { if(now - (r.seen.get(uid) || now) > 75000) dropPeer(uid); });
  }

  /* ---------- Salas ---------- */
  async function openRoom(rid, host){
    const me = window.deytekUser;
    const stream = await getMic();
    const r = R = {id:rid, me:me.uid, host, stream, track:stream.getAudioTracks()[0], muted:false, peers:new Map(), invited:new Map(),
      unsubs:[], timers:[], t0:0, ending:false, screen:null, seen:new Map(), early:{}, friends:null};
    try{
      if(host) await roomRef(rid).set({host:me.uid, createdAt:TS()});
      await peersCol(rid).doc(me.uid).set({joinedAt:TS(), ts:TS()});
    }catch(e){ stream.getTracks().forEach(t => t.stop()); R = null; throw e; }

    r.unsubs.push(peersCol(rid).onSnapshot(snap => snap.docChanges().forEach(ch => {
      const uid = ch.doc.id; if(uid === r.me || R !== r) return;
      if(ch.type === "removed"){ dropPeer(uid); return; }
      r.seen.set(uid, Date.now());
      if(ch.type === "added" || !r.peers.has(uid)) addPeer(uid);
    }), err => console.error(err)));

    r.unsubs.push(sigCol(rid).where("to", "==", r.me).onSnapshot(snap => {
      const docs = snap.docChanges().filter(c => c.type === "added").map(c => c.doc);
      docs.sort((a, b) => rank(a.data()) - rank(b.data()));
      docs.forEach(d => { handleSignal(d.data()); d.ref.delete().catch(() => {}); });
    }, err => console.error(err)));

    /* Si alguien rechaza mi invitación, la invitación desaparece */
    r.unsubs.push(db.collection("invites").where("from", "==", r.me).onSnapshot(snap => snap.docChanges().forEach(ch => {
      if(ch.type !== "removed" || R !== r) return;
      const d = ch.doc.data(); if(d.roomId !== r.id) return;
      const tm = r.invited.get(d.to); if(tm === undefined) return;
      clr(tm); r.invited.delete(d.to); renderCards(); renderInvites();
      if(!r.peers.size && !r.invited.size) end("Llamada rechazada");
    }), () => {}));

    r.timers.push(setInterval(() => peersCol(rid).doc(r.me).update({ts:TS()}).catch(() => {}), 20000));
    r.timers.push(setInterval(janitor, 15000));
    showPanel();
    return r;
  }

  function showPanel(){
    panel.hidden = false; dlg.classList.add("incall");
    renderCards(); renderScreens(); paintMute(); paintShare(); refreshDevices(); refreshBtn(); syncPill();
  }

  async function startCall(peerUid){
    unlockAudio();
    const me = window.deytekUser; if(!me || !peerUid || R || incoming) return;
    if(window.deytekChatBlocked && window.deytekChatBlocked()){ note("No puedes llamar a este usuario."); return; }
    try{
      await openRoom(rid8(), true);
      await inviteUser(peerUid);
    }catch(err){
      console.error(err);
      if(R) end("");
      note(err && err.code === "permission-denied" ? "No se pudo llamar. Revisa las reglas de Firestore (rooms / invites)." : micError(err));
    }
  }

  async function inviteUser(uid){
    const r = R; if(!r || !uid) return;
    if(r.peers.has(uid) || r.invited.has(uid)) return;
    if(r.peers.size + r.invited.size + 1 >= MAX_PEOPLE){ note(`Máximo ${MAX_PEOPLE} personas en la llamada.`); return; }
    const ref = invRef(r.id, uid);
    await ref.delete().catch(() => {});
    await ref.set({roomId:r.id, from:r.me, to:uid, createdAt:TS()});
    if(R !== r) return;
    const tm = setTimeout(() => {
      if(R !== r || r.peers.has(uid)) return;
      ref.delete().catch(() => {}); r.invited.delete(uid); renderCards(); renderInvites();
      if(!r.peers.size && !r.invited.size) end("No contestó.");
    }, RING_MS);
    r.invited.set(uid, tm);
    renderCards(); renderInvites();
  }
  const inviteError = err => note(err && err.code === "permission-denied" ? "No se pudo invitar. Puede que te hayan bloqueado." : "No se pudo invitar.");

  const micError = err => err && err.name === "NotAllowedError" ? "Permite el micrófono en el navegador para llamar."
    : err && (err.name === "NotFoundError" || err.name === "OverconstrainedError") ? "No se encontró ningún micrófono." : "No se pudo iniciar la llamada.";

  /* ---------- Invitar a más personas ---------- */
  async function loadFriends(){
    const me = window.deytekUser;
    const s = await db.collection("friendships").where("users", "array-contains", me.uid).get();
    return s.docs.map(d => d.data()).filter(f => f.status === "accepted").map(f => f.users.find(u => u !== me.uid));
  }
  async function renderInvites(){
    const r = R, box = $("#cp-invlist"); if(!r || $("#cp-inv").hidden) return;
    if(!r.friends) r.friends = await loadFriends().catch(() => []);
    const ids = r.friends, infos = await Promise.all(ids.map(info));
    if(R !== r) return;
    box.innerHTML = ids.map((u, i) => {
      const inf = infos[i], inCall = r.peers.has(u), ringing = r.invited.has(u);
      return `<div class="fitem"><img src="${h(inf.photo || letter(inf.name))}" alt="">
        <div class="fmeta"><b>${h(inf.name || "Jugador")}</b><small>${inCall ? "En la llamada" : ringing ? "Llamando…" : h(inf.friendId || "")}</small></div>
        ${inCall || ringing ? "" : `<button type="button" class="btn solid sm" data-inv="${h(u)}">Invitar</button>`}</div>`;
    }).join("") || `<p class="cnone">No tienes amigos para invitar.</p>`;
  }
  $("#cp-invb").onclick = () => { const b = $("#cp-inv"); b.hidden = !b.hidden; if(!b.hidden) renderInvites(); };
  $("#cp-invx").onclick = () => { $("#cp-inv").hidden = true; };
  $("#cp-invlist").addEventListener("click", e => {
    const b = e.target.closest("[data-inv]"); if(!b) return;
    b.disabled = true; inviteUser(b.dataset.inv).catch(inviteError).finally(() => { b.disabled = false; });
  });

  /* ---------- Invitación entrante ---------- */
  function ring(on){
    clr(ringTimer);
    if(!on){ if(ringCtx){ try{ ringCtx.close(); }catch(e){} ringCtx = null; } return; }
    try{
      ringCtx = ringCtx || new (window.AudioContext || window.webkitAudioContext)(); ringCtx.resume();
      const beep = () => { if(!ringCtx) return; [0, .25].forEach(dl => {
        const o = ringCtx.createOscillator(), g = ringCtx.createGain(), t = ringCtx.currentTime + dl;
        o.frequency.value = 880; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .2);
        o.connect(g); g.connect(ringCtx.destination); o.start(t); o.stop(t + .22);
      }); };
      beep(); ringTimer = setInterval(beep, 2000);
    }catch(e){}
  }
  function closeIncoming(){
    const had = incoming; incoming = null; ring(false); clr(inTimer);
    if(inDlg.open) inDlg.close();
    return had;
  }
  async function showIncoming(iid, d){
    incoming = {iid, roomId:d.roomId, from:d.from};
    const u = await info(d.from);
    if(!incoming || incoming.iid !== iid) return;
    $("#ci-img").src = u.photo || letter(u.name); $("#ci-name").textContent = u.name || "Jugador";
    inDlg.showModal(); ring(true);
    inTimer = setTimeout(() => { if(closeIncoming()) note("Llamada perdida."); }, RING_MS);
  }
  function decline(){
    const inc = closeIncoming();
    if(inc) db.collection("invites").doc(inc.iid).delete().catch(() => {});
  }
  async function accept(){
    unlockAudio();
    const inc = closeIncoming(); if(!inc) return;
    try{
      const rs = await roomRef(inc.roomId).get();
      if(!rs.exists) throw {code:"ended"};
      await openRoom(inc.roomId, false);
      if(!dlg.open) dlg.showModal();
      const b = document.querySelector(`[data-chat="${CSS.escape(inc.from)}"]`); if(b) b.click();
      syncPill();
    }catch(err){
      console.error(err);
      if(R) end("");
      db.collection("invites").doc(inc.iid).delete().catch(() => {});
      note(err && (err.code === "ended" || err.code === "permission-denied") ? "La llamada ya terminó." : micError(err));
    }
  }
  $("#ci-yes").onclick = accept;
  $("#ci-no").onclick = decline;
  inDlg.addEventListener("close", () => { if(incoming) decline(); });

  /* ---------- Salir de la llamada ---------- */
  async function end(msg){
    const r = R; if(!r || r.ending) return;
    r.ending = true;
    stopMon(); clearTimeout(monT);
    if(r.screen){ r.screen.getTracks().forEach(t => { t.onended = null; t.stop(); }); r.screen = null; }
    closeView();
    r.unsubs.forEach(f => { try{ f(); }catch(e){} });
    r.timers.forEach(clr); r.invited.forEach(clr);
    const alone = r.peers.size === 0;
    r.peers.forEach(P => {
      try{ P.ch && P.ch.close(); }catch(e){}
      try{ P.pc.close(); }catch(e){}
      if(P.audio){ P.audio.srcObject = null; P.audio.remove(); }
    });
    r.peers.clear();
    r.stream.getTracks().forEach(t => t.stop());
    R = null;
    panel.hidden = true; dlg.classList.remove("incall");
    usersEl.innerHTML = ""; screensEl.innerHTML = ""; screensEl.hidden = true;
    $("#cp-inv").hidden = true; $("#cp-time").textContent = "00:00"; $("#cp-unmute").hidden = true;
    $("#cp-share").disabled = true; paintShare(); syncPill(); refreshBtn();
    if(msg) note(msg);
    /* Limpieza en Firestore */
    const rid = r.id, me = r.me;
    try{
      const sg = await sigCol(rid).where("to", "==", me).get().catch(() => null);
      if(sg) sg.forEach(d => d.ref.delete().catch(() => {}));
      await peersCol(rid).doc(me).delete().catch(() => {});
      if(alone) await roomRef(rid).delete().catch(() => {});
      for(const f of ["from", "to"]){
        const s = await db.collection("invites").where(f, "==", me).get().catch(() => null);
        if(s) s.forEach(d => { if(d.data().roomId === rid) d.ref.delete().catch(() => {}); });
      }
    }catch(e){}
  }

  /* ---------- Eventos de la interfaz ---------- */
  $("#cp-mute").onclick = $("#cl-mute").onclick = toggleMute;
  $("#cp-end").onclick = $("#cl-end").onclick = () => end("");
  $("#cp-mic").onchange = e => switchMic(e.target.value).catch(() => note("No se pudo cambiar el micrófono."));
  $("#cp-share").onclick = () => {
    if(!R) return;
    if(!CAN_SHARE){ note(ANDROID ? "Los navegadores de Android no permiten compartir pantalla. Sí puedes ver la de los demás." : "Tu navegador no permite compartir pantalla."); return; }
    R.screen ? stopShare() : startShare();
  };
  $("#cp-sharecfg").addEventListener("change", () => {
    paintShare();
    const o = shareOpts();
    try{ localStorage.setItem(SH_KEY, JSON.stringify({res:$("#sh-res").value, w:$("#sh-w").value, h:$("#sh-h").value, fps:o.fps, hint:o.hint})); }catch(e){}
    applyShare();
  });
  loadShareCfg();
  new MutationObserver(syncPill).observe(dlg, {attributes:true, attributeFilter:["open"]});
  addEventListener("pagehide", () => { if(R) peersCol(R.id).doc(R.me).delete().catch(() => {}); });

  /* ---------- Escuchar invitaciones ---------- */
  document.addEventListener("deytek:auth", () => {
    const u = window.deytekUser;
    if(unsubIn){ unsubIn(); unsubIn = null; }
    if(R && (!u || u.uid !== R.me)) end("");
    if(incoming) closeIncoming();
    if(!u) return;
    unsubIn = db.collection("invites").where("to", "==", u.uid).onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        const d = ch.doc.data({serverTimestamps:"estimate"});
        if(ch.type === "removed"){ if(incoming && incoming.iid === ch.doc.id) closeIncoming(); return; }
        if(ch.type !== "added") return;
        const t = d.createdAt ? d.createdAt.toMillis() : Date.now();
        if(Date.now() - t > STALE_MS) return;
        if(R && R.id === d.roomId) return;
        if(R || incoming){ ch.doc.ref.delete().catch(() => {}); return; }   // ocupado
        showIncoming(ch.doc.id, d);
      });
    }, err => console.error(err));
  });
})();