/* call.js — Llamadas de voz 1 a 1 + compartir pantalla (WebRTC + Firestore como señalización) */
(() => {
  /* Servidores para conectar. Con solo STUN funciona en la mayoría de redes;
     para el 100% agrega un servidor TURN. */
  const ICE = { iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
    // ,{ urls: "turn:TU_SERVIDOR:443", username: "USUARIO", credential: "CLAVE" }
  ]};
  const RING_MS = 45000, STALE_MS = 60000, MAX_BPS = 25e6;
  const $ = s => document.querySelector(s);
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  const dlg = $("#social-dlg"), head = $("#chat-head");
  if(!ready || !dlg || !head || !navigator.mediaDevices || !window.RTCPeerConnection) return;
  const db = firebase.firestore(), TS = () => firebase.firestore.FieldValue.serverTimestamp();
  const UA = navigator.userAgent;
  const ANDROID = /Android/i.test(UA), MOBILE = /Android|iPhone|iPad|iPod/i.test(UA);
  /* Los navegadores de Android no implementan compartir pantalla */
  const CAN_SHARE = typeof navigator.mediaDevices.getDisplayMedia === "function" && !ANDROID;

  const h = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const letter = n => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8e8e93"/><text x="50" y="66" font-size="48" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#000">${((n||"?")[0]).toUpperCase().replace(/[<>&"']/g,"?")}</text></svg>`);
  const pairId = (a, b) => [a, b].sort().join("_");
  const clr = id => { clearTimeout(id); clearInterval(id); };
  const clampInt = (x, a, b, def) => Math.max(a, Math.min(b, Math.round(+x) || def));
  const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z"/></svg>';
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z"/></svg>';
  const MICOFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23A6.9 6.9 0 0019 11zm-4.02.17c0-.06.02-.11.02-.17V5a3 3 0 00-5.94-.6l5.92 5.92v.85zM4.27 3L3 4.27l6.01 6.01V11a3 3 0 003.99 2.83l1.67 1.67A5 5 0 017 11H5a7 7 0 006 6.92V21h2v-3.08c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>';
  const SCREEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.11 0-2 .89-2 2v10c0 1.1.89 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>';

  /* ---------- Estilos ---------- */
  const css = document.createElement("style");
  css.textContent = `
  #callbtn svg{width:16px;height:16px;fill:currentColor;margin-right:6px}
  #callbtn.live{background:#ff453a}
  #backbtn{display:none}
  /* El panel de llamada va arriba del diálogo de Amigos */
  #social-dlg[open]{display:flex;flex-direction:column}
  #social-dlg .social-wrap{flex:1 1 0;min-height:0;height:auto}
  @media(min-width:721px){#social-dlg.incall{width:min(1000px,calc(100% - 24px));height:min(820px,94dvh)}}
  #call-panel{flex:none;display:flex;flex-direction:column;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line,rgba(255,255,255,.14));background:rgba(255,255,255,.03);max-height:58%;overflow-y:auto}
  #call-panel[hidden]{display:none!important}
  .cp-top{display:flex;justify-content:space-between;font-size:13px;color:var(--mut,#8e8e93);padding-right:44px}
  .cp-users{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  .cp-card{flex:1 1 130px;max-width:210px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 10px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid var(--line,rgba(255,255,255,.14));text-align:center}
  .cp-card b{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cp-card small{font-size:12px;color:var(--mut,#8e8e93)}
  .cp-av{position:relative;width:64px;height:64px;border-radius:50%;transition:box-shadow .15s}
  .cp-av img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
  .cp-x{display:none;position:absolute;right:-4px;bottom:-4px;width:24px;height:24px;border-radius:50%;background:#fff;color:#000;align-items:center;justify-content:center}
  .cp-x svg{width:14px;height:14px;fill:currentColor}
  .cp-card.muted .cp-x{display:flex}
  .cp-card.talk .cp-av{box-shadow:0 0 0 3px #fff,0 0 20px rgba(255,255,255,.55)}
  .cp-card.ring .cp-av{animation:cpr 1.2s infinite}
  @keyframes cpr{0%{box-shadow:0 0 0 0 rgba(255,255,255,.5)}100%{box-shadow:0 0 0 14px rgba(255,255,255,0)}}
  #cp-unmute{align-self:center;width:auto!important;padding:0 20px!important}
  .cp-screens{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
  .cp-screens[hidden],.cp-vid[hidden]{display:none!important}
  .cp-vid{position:relative;flex:1 1 280px;max-width:100%}
  .cp-vid.small{flex:0 1 180px}
  .cp-vid video{width:100%;max-height:34vh;object-fit:contain;background:#000;border-radius:14px;display:block;cursor:zoom-in}
  .cp-vid span{position:absolute;left:10px;top:8px;font-size:12px;padding:3px 9px;border-radius:999px;background:rgba(0,0,0,.6);pointer-events:none}
  .cp-vid .cp-fs{position:absolute;right:8px;top:6px;width:34px;height:34px;background:rgba(0,0,0,.6);font-size:16px}
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
  /* Visor grande de la pantalla compartida */
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
    .cp-card{padding:10px 6px;flex:1 1 110px}
    .cp-av{width:52px;height:52px}
    .cp-vid video{max-height:30dvh}
    .cp-sel select{max-width:130px}
    .cp-btn{width:42px;height:42px}
  }
  `;
  document.head.append(css);

  /* ---------- Elementos ---------- */
  const audio = document.createElement("audio"); audio.autoplay = true; audio.setAttribute("playsinline", ""); document.body.append(audio);

  const panel = document.createElement("section");
  panel.id = "call-panel"; panel.hidden = true;
  panel.innerHTML = `
    <div class="cp-top"><span>Llamada de voz</span><span id="cp-time">00:00</span></div>
    <div class="cp-users" id="cp-users"></div>
    <button type="button" class="btn solid sm" id="cp-unmute" hidden>🔊 Toca para activar el audio</button>
    <div class="cp-screens" id="cp-screens" hidden>
      <div class="cp-vid" id="cp-rv" hidden><video id="cp-rvid" autoplay playsinline muted title="Toca para ampliar"></video><span id="cp-rl">Pantalla</span><button type="button" class="cp-btn cp-fs" id="cp-fs" title="Ampliar" aria-label="Ampliar pantalla">⛶</button></div>
      <div class="cp-vid small" id="cp-lv" hidden><video id="cp-lvid" autoplay playsinline muted title="Toca para ampliar"></video><span>Tu pantalla</span></div>
    </div>
    <div class="cp-bar">
      <button type="button" class="cp-btn" id="cp-mute" aria-pressed="false" title="Silenciar micrófono">${MIC}</button>
      <label class="cp-sel">Micrófono<select id="cp-mic"></select></label>
      <label class="cp-sel" id="cp-spk-w" hidden>Salida de audio<select id="cp-spk"></select></label>
      <button type="button" class="cp-btn" id="cp-share" title="Compartir pantalla" aria-label="Compartir pantalla" aria-pressed="false" disabled>${SCREEN}</button>
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
  inDlg.innerHTML = `<img id="ci-img" alt=""><h3 id="ci-name">Jugador</h3><p>te está llamando…</p>
    <div class="row"><button type="button" class="btn solid" id="ci-yes">Contestar</button><button type="button" class="btn glass" id="ci-no">Rechazar</button></div>`;
  document.body.append(inDlg);

  /* Los "popover" salen por encima de cualquier ventana modal */
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
  const syncPill = () => pop(pill, !!call && !dlg.open);

  /* ---------- Estado ---------- */
  let call = null, incoming = null, inTimer, ringTimer, ringCtx, activeUid = null, unsubIn = null;
  const infoCache = {};
  async function info(uid){
    if(infoCache[uid]) return infoCache[uid];
    try{ const d = await db.collection("users").doc(uid).get(); infoCache[uid] = d.exists ? d.data() : {}; }
    catch(e){ infoCache[uid] = {}; }
    return infoCache[uid];
  }

  /* ---------- Audio remoto: desbloqueo para celulares ---------- */
  const SILENT = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  /* Se llama dentro del toque del usuario (Llamar / Contestar): así el navegador permite sonar después */
  function unlockAudio(){
    try{ audio.srcObject = null; audio.src = SILENT; audio.muted = false; const p = audio.play(); if(p && p.catch) p.catch(() => {}); }catch(e){}
  }
  function playRemote(){
    audio.muted = false; audio.volume = 1;
    const p = audio.play();
    if(p && p.then) p.then(() => { $("#cp-unmute").hidden = true; }).catch(() => { $("#cp-unmute").hidden = false; });
  }
  audio.onplaying = () => { if(audio.srcObject) $("#cp-unmute").hidden = true; };
  $("#cp-unmute").onclick = playRemote;
  /* Cualquier toque durante la llamada reintenta el audio si quedó bloqueado */
  const retry = () => {
    if(!call) return;
    if(audio.srcObject && audio.paused) playRemote();
    if(call.actx && call.actx.state === "suspended") call.actx.resume().catch(() => {});
  };
  document.addEventListener("click", retry, true);
  document.addEventListener("touchend", retry, true);

  /* ---------- Botones en la cabecera del chat ---------- */
  document.addEventListener("click", e => { const b = e.target.closest("[data-chat]"); if(b) activeUid = b.dataset.chat; }, true);
  function refreshBtn(){
    const b = $("#callbtn"); if(!b) return;
    b.classList.toggle("live", !!call && call.peer === activeUid);
    if(!call){ b.innerHTML = PHONE + "Llamar"; b.disabled = false; }
    else if(call.peer === activeUid){ b.innerHTML = PHONE + "Colgar"; b.disabled = false; }
    else { b.innerHTML = PHONE + "En llamada"; b.disabled = true; }
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
      b.onclick = () => call ? end("") : startCall(activeUid);
      un.after(b);
    }
    refreshBtn();
  }
  new MutationObserver(mount).observe(head, {childList:true});

  /* ---------- Tarjetas de usuarios ---------- */
  const card = (uid, name, photo) => `<div class="cp-card" data-u="${h(uid)}"><div class="cp-av"><img src="${h(photo || letter(name))}" alt=""><i class="cp-x">${MICOFF}</i></div><b>${h(name)}</b><small>…</small></div>`;
  const cardOf = uid => panel.querySelector(`.cp-card[data-u="${CSS.escape(uid)}"]`);
  const setStatus = (uid, t) => { const c = cardOf(uid); if(c) c.querySelector("small").textContent = t; };
  const setMuted = (uid, m) => { const c = cardOf(uid); if(c) c.classList.toggle("muted", !!m); };
  const setTalk = (uid, t) => { const c = cardOf(uid); if(c) c.classList.toggle("talk", !!t); };
  const setRing = (uid, r) => { const c = cardOf(uid); if(c) c.classList.toggle("ring", !!r); };
  const baseStatus = c => c.t0 ? "Conectado" : c.role === "caller" ? "Llamando…" : "Conectando…";

  async function showPanel(){
    const c = call, me = window.deytekUser;
    const [a, b] = await Promise.all([info(me.uid), info(c.peer)]);
    if(call !== c) return;
    c.name = b.name || "Jugador";
    $("#cp-users").innerHTML = card(me.uid, a.name || me.displayName || "Tú", a.photo || me.photoURL) + card(c.peer, c.name, b.photo);
    $("#cl-t").textContent = "En llamada · " + c.name;
    setStatus(me.uid, c.screen ? "Compartiendo pantalla" : "Tú");
    setStatus(c.peer, c.rsharing ? "Compartiendo pantalla" : baseStatus(c));
    setRing(c.peer, !c.t0 && c.role === "caller");
    setMuted(me.uid, c.muted);
    $("#cp-share").disabled = !c.t0;
    panel.hidden = false; dlg.classList.add("incall");
    paintMute(); paintShare(); refreshDevices(); syncPill();
  }

  /* ---------- Silencio, micrófono y salida ---------- */
  function paintMute(){
    const m = !!(call && call.muted);
    ["#cp-mute", "#cl-mute"].forEach(s => { const b = $(s); b.classList.toggle("on", m); b.innerHTML = m ? MICOFF : MIC; b.setAttribute("aria-pressed", m); b.title = m ? "Activar micrófono" : "Silenciar micrófono"; });
  }
  /* Estado que se comparte con el otro por el canal de datos */
  const sendMute = () => { if(call && call.ch && call.ch.readyState === "open") call.ch.send(JSON.stringify({muted: call.muted, sharing: !!call.screen})); };
  function toggleMute(){
    if(!call) return;
    call.muted = !call.muted; call.track.enabled = !call.muted;
    setMuted(call.me, call.muted); if(call.muted) setTalk(call.me, false);
    paintMute(); sendMute();
  }
  async function refreshDevices(){
    if(!call) return;
    let ds; try{ ds = await navigator.mediaDevices.enumerateDevices(); }catch(e){ return; }
    const fill = (sel, kind, cur, name) => {
      sel.innerHTML = ds.filter(d => d.kind === kind).map((d, i) => `<option value="${h(d.deviceId)}"${d.deviceId === cur ? " selected" : ""}>${h(d.label || name + " " + (i + 1))}</option>`).join("");
    };
    fill($("#cp-mic"), "audioinput", call.track.getSettings().deviceId, "Micrófono");
    const w = $("#cp-spk-w"); w.hidden = typeof audio.setSinkId !== "function";
    if(!w.hidden) fill($("#cp-spk"), "audiooutput", audio.sinkId, "Salida");
  }
  navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener("devicechange", refreshDevices);

  const micConstraints = id => ({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true, ...(id ? {deviceId:{ideal:id}} : {})}});
  async function getMic(){
    let id = ""; try{ id = localStorage.getItem("deytek-mic") || ""; }catch(e){}
    return navigator.mediaDevices.getUserMedia(micConstraints(id));
  }
  async function switchMic(id){
    const c = call; if(!c) return;
    const s = await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:id}, echoCancellation:true, noiseSuppression:true, autoGainControl:true}});
    if(call !== c){ s.getTracks().forEach(t => t.stop()); return; }
    const nt = s.getAudioTracks()[0]; nt.enabled = !c.muted;
    const sender = c.pc.getSenders().find(x => x.track && x.track.kind === "audio");
    if(sender) await sender.replaceTrack(nt);
    c.stream.getTracks().forEach(t => t.stop()); c.stream = s; c.track = nt;
    try{ localStorage.setItem("deytek-mic", id); }catch(e){}
    startMon();
  }

  /* ---------- Quién está hablando (solo en PC: en celular puede interferir con el audio) ---------- */
  function stopMon(){
    const c = call; if(!c) return;
    clr(c.mon); c.mon = null;
    if(c.actx){ try{ c.actx.close(); }catch(e){} c.actx = null; }
  }
  function startMon(){
    const c = call; if(!c) return;
    stopMon();
    if(MOBILE) return;
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    const actx = c.actx = new AC();
    const mk = s => { const an = actx.createAnalyser(); an.fftSize = 512; actx.createMediaStreamSource(s).connect(an); return {an, buf:new Uint8Array(an.fftSize)}; };
    const lvl = x => { x.an.getByteTimeDomainData(x.buf); let m = 0; for(const v of x.buf) m = Math.max(m, Math.abs(v - 128)); return m; };
    const L = mk(c.stream), R = c.remote ? mk(c.remote) : null;
    c.mon = setInterval(() => {
      setTalk(c.me, !c.muted && lvl(L) > 6);
      if(R) setTalk(c.peer, lvl(R) > 6);
    }, 120);
  }

  /* ---------- Visor grande de pantalla compartida ---------- */
  function openView(kind){
    const c = call; if(!c) return;
    const s = kind === "local" ? c.screen : (c.rsharing ? c.rvideo : null); if(!s) return;
    view.dataset.k = kind;
    const v = $("#cv-v"); v.srcObject = s; v.play().catch(() => {});
    $("#cv-t").textContent = kind === "local" ? "Tu pantalla" : "Pantalla de " + (c.name || "");
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
  $("#cp-fs").onclick = () => openView("remote");
  $("#cp-rvid").onclick = () => openView("remote");
  $("#cp-lvid").onclick = () => openView("local");

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

  /* Limita lo que realmente se envía: tamaño, FPS y bitrate */
  async function tune(c, t, o){
    const st = t.getSettings(), sw = st.width || o.w || 1920, sh = st.height || o.h || 1080;
    const scale = o.w ? Math.max(1, sw / o.w, sh / o.h) : 1;
    const outW = sw / scale, outH = sh / scale;
    const bps = Math.min(MAX_BPS, Math.max(300000, Math.round(outW * outH * o.fps * (o.hint === "detail" ? 0.1 : 0.07))));
    try{
      const p = c.vtx.sender.getParameters();
      if(!p.encodings || !p.encodings.length) p.encodings = [{}];
      Object.assign(p.encodings[0], {maxFramerate:o.fps, maxBitrate:bps, scaleResolutionDownBy:Math.round(scale * 100) / 100});
      p.degradationPreference = o.hint === "detail" ? "maintain-resolution" : "maintain-framerate";
      await c.vtx.sender.setParameters(p);
    }catch(e){ console.warn("setParameters", e); }
  }
  const refreshScreens = () => { $("#cp-screens").hidden = $("#cp-lv").hidden && $("#cp-rv").hidden; };
  function paintShare(){
    const on = !!(call && call.screen), b = $("#cp-share");
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    b.title = on ? "Dejar de compartir pantalla" : "Compartir pantalla";
    $("#sh-cw").hidden = $("#sh-res").value !== "custom";
    if(call) setStatus(call.me, on ? "Compartiendo pantalla" : "Tú");
  }
  async function startShare(){
    const c = call; if(!c || c.screen || !c.vtx || !c.t0) return;
    const o = shareOpts();
    let s;
    try{ s = await navigator.mediaDevices.getDisplayMedia({video:vConstraints(o), audio:false}); }
    catch(e){ if(e && e.name !== "NotAllowedError") note("No se pudo compartir la pantalla."); return; }
    if(call !== c){ s.getTracks().forEach(t => t.stop()); return; }
    const t = s.getVideoTracks()[0];
    t.contentHint = o.hint;
    try{ await t.applyConstraints(vConstraints(o)); }catch(e){}
    try{ await c.vtx.sender.replaceTrack(t); }
    catch(e){ s.getTracks().forEach(x => x.stop()); note("No se pudo compartir la pantalla."); return; }
    c.screen = s; t.onended = () => stopShare();
    await tune(c, t, o);
    const v = $("#cp-lvid"); v.srcObject = s; v.play().catch(() => {});
    $("#cp-lv").hidden = false; refreshScreens(); paintShare(); sendMute();
  }
  async function stopShare(){
    const c = call; if(!c || !c.screen) return;
    const s = c.screen; c.screen = null;
    s.getTracks().forEach(t => { t.onended = null; t.stop(); });
    try{ await c.vtx.sender.replaceTrack(null); }catch(e){}
    if(view.dataset.k === "local") closeView();
    $("#cp-lvid").srcObject = null; $("#cp-lv").hidden = true;
    refreshScreens(); paintShare(); sendMute();
  }
  /* Cambiar resolución / FPS / prioridad mientras ya compartes */
  async function applyShare(){
    const c = call; if(!c || !c.screen) return;
    const o = shareOpts(), t = c.screen.getVideoTracks()[0]; if(!t) return;
    t.contentHint = o.hint;
    try{ await t.applyConstraints(vConstraints(o)); }catch(e){}
    await tune(c, t, o);
  }
  function setRemoteSharing(on){
    const c = call; if(!c) return;
    c.rsharing = !!on;
    const show = c.rsharing && !!c.rvideo, v = $("#cp-rvid");
    v.srcObject = show ? c.rvideo : null; if(show) v.play().catch(() => {});
    if(!show && view.dataset.k === "remote") closeView();
    $("#cp-rv").hidden = !show; $("#cp-rl").textContent = "Pantalla de " + (c.name || "");
    setStatus(c.peer, c.rsharing ? "Compartiendo pantalla" : baseStatus(c));
    refreshScreens();
  }
  function clearShare(c){
    if(c.screen){ c.screen.getTracks().forEach(t => { t.onended = null; t.stop(); }); c.screen = null; }
    closeView();
    $("#cp-lvid").srcObject = null; $("#cp-rvid").srcObject = null;
    $("#cp-lv").hidden = true; $("#cp-rv").hidden = true; $("#cp-screens").hidden = true;
  }

  /* ---------- Conexión (WebRTC) ---------- */
  function bindChannel(ch){
    call.ch = ch;
    ch.onopen = sendMute;
    ch.onmessage = e => {
      try{
        const m = JSON.parse(e.data); if(!call) return;
        if("muted" in m){ setMuted(call.peer, m.muted); if(m.muted) setTalk(call.peer, false); }
        if("sharing" in m && !!m.sharing !== !!call.rsharing) setRemoteSharing(m.sharing);
      }catch(_){}
    };
  }
  function flush(c){ c.pend.splice(0).forEach(x => c.pc.addIceCandidate(x).catch(() => {})); }
  const tickTime = () => {
    if(!call || !call.t0) return;
    const s = Math.floor((Date.now() - call.t0) / 1000), t = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    $("#cp-time").textContent = t;
    $("#cl-t").textContent = "En llamada · " + (call.name || "") + " · " + t;
  };
  function onConnected(){
    const c = call; if(!c || c.t0) return;
    c.t0 = Date.now(); clr(c.ringT);
    if(!c.rsharing) setStatus(c.peer, "Conectado");
    setRing(c.peer, false); sendMute();
    $("#cp-share").disabled = false;
    c.timers.push(setInterval(tickTime, 1000)); tickTime();
  }

  async function openSession(peerUid, role, id, cid){
    const me = window.deytekUser;
    const stream = await getMic();
    const c = call = {id, cid, peer:peerUid, role, me:me.uid, stream, track:stream.getAudioTracks()[0], muted:false,
      pc:new RTCPeerConnection(ICE), unsubs:[], timers:[], pend:[], t0:0, ending:false, gotAns:false, sawDoc:false,
      vtx:null, screen:null, rvideo:null, rsharing:false};
    const pc = c.pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    /* El que llama reserva un canal de video de ida y vuelta: compartir pantalla no necesita renegociar */
    if(role === "caller") c.vtx = pc.addTransceiver("video", {direction:"sendrecv"});
    pc.ontrack = e => {
      if(e.track.kind === "video"){
        c.rvideo = new MediaStream([e.track]);
        e.track.onunmute = () => { if(call === c && !c.rsharing) setRemoteSharing(true); };   // respaldo si el aviso no llegó
        setRemoteSharing(c.rsharing); return;
      }
      c.remote = e.streams[0];
      audio.removeAttribute("src"); audio.srcObject = c.remote; playRemote(); startMon();
    };
    pc.onicecandidate = e => {
      if(e.candidate) db.collection("calls").doc(id).collection("cand").add({uid:me.uid, cid, c:JSON.stringify(e.candidate)}).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if(s === "connected") onConnected();
      else if(s === "failed") end("Se perdió la conexión. Puede faltar un servidor TURN.");
      else if(s === "disconnected") setTimeout(() => { if(call === c && pc.connectionState === "disconnected") end("Se perdió la conexión."); }, 8000);
    };
    c.unsubs.push(db.collection("calls").doc(id).collection("cand").where("cid", "==", cid).onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if(ch.type !== "added") return;
        const d = ch.doc.data(); if(d.uid === me.uid) return;
        let cand; try{ cand = JSON.parse(d.c); }catch(e){ return; }
        if(pc.remoteDescription) pc.addIceCandidate(cand).catch(() => {}); else c.pend.push(cand);
      });
    }, () => {}));
    refreshBtn(); showPanel();
    return c;
  }
  function watchDoc(){
    const c = call, ref = db.collection("calls").doc(c.id);
    c.unsubs.push(ref.onSnapshot(async snap => {
      if(call !== c) return;
      if(!snap.exists){ if(c.sawDoc) end(c.gotAns ? "Llamada finalizada" : "Llamada rechazada", false); return; }
      c.sawDoc = true;
      const d = snap.data();
      if(c.role === "caller" && d.answer && !c.gotAns){
        c.gotAns = true; clr(c.ringT);
        try{ await c.pc.setRemoteDescription(d.answer); flush(c); setStatus(c.peer, "Conectando…"); }catch(e){ console.error(e); end("No se pudo conectar."); }
      }
    }, () => {}));
  }

  const micError = err => err && err.name === "NotAllowedError" ? "Permite el micrófono en el navegador para llamar."
    : err && (err.name === "NotFoundError" || err.name === "OverconstrainedError") ? "No se encontró ningún micrófono." : "No se pudo iniciar la llamada.";

  async function startCall(peerUid){
    unlockAudio();                                   // dentro del toque del usuario
    const me = window.deytekUser; if(!me || !peerUid || call || incoming) return;
    const id = pairId(me.uid, peerUid), cid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36), ref = db.collection("calls").doc(id);
    try{
      const c = await openSession(peerUid, "caller", id, cid);
      bindChannel(c.pc.createDataChannel("state"));
      const offer = await c.pc.createOffer();
      await c.pc.setLocalDescription(offer);
      await ref.delete().catch(() => {});            // limpia una llamada vieja si quedó
      await ref.set({from:me.uid, to:peerUid, cid, status:"ringing", offer:{type:offer.type, sdp:offer.sdp}, createdAt:TS()});
      watchDoc();
      c.ringT = setTimeout(() => { if(call === c && !c.gotAns) end("No contestó."); }, RING_MS);
    }catch(err){
      console.error(err);
      if(call) end("", true);
      note(err && err.code === "permission-denied" ? "No se pudo llamar. Revisa las reglas de Firestore (calls)." : micError(err));
    }
  }

  /* ---------- Llamada entrante ---------- */
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
  async function showIncoming(id, d){
    incoming = {id, from:d.from, cid:d.cid, offer:d.offer};
    const u = await info(d.from);
    if(!incoming || incoming.id !== id) return;
    $("#ci-img").src = u.photo || letter(u.name); $("#ci-name").textContent = u.name || "Jugador";
    inDlg.showModal(); ring(true);
    inTimer = setTimeout(() => { if(closeIncoming()) note("Llamada perdida."); }, RING_MS);
  }
  function decline(){
    const inc = closeIncoming();
    if(inc) db.collection("calls").doc(inc.id).delete().catch(() => {});
  }
  async function accept(){
    unlockAudio();                                   // dentro del toque del usuario
    const inc = closeIncoming(); if(!inc) return;
    try{
      const c = await openSession(inc.from, "callee", inc.id, inc.cid);
      c.gotAns = true;
      c.pc.ondatachannel = e => bindChannel(e.channel);
      await c.pc.setRemoteDescription(inc.offer); flush(c);
      /* El canal de video que reservó el otro también debe poder enviar */
      const vt = c.pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === "video");
      if(vt){ vt.direction = "sendrecv"; c.vtx = vt; }
      const ans = await c.pc.createAnswer();
      await c.pc.setLocalDescription(ans);
      await db.collection("calls").doc(inc.id).update({answer:{type:ans.type, sdp:ans.sdp}, status:"active"});
      watchDoc();
      if(!dlg.open) dlg.showModal();                  // abre Amigos y el chat de quien llama
      const b = document.querySelector(`[data-chat="${CSS.escape(inc.from)}"]`); if(b) b.click();
      syncPill();
    }catch(err){
      console.error(err);
      if(call) end("", true); else db.collection("calls").doc(inc.id).delete().catch(() => {});
      note(micError(err));
    }
  }
  $("#ci-yes").onclick = accept;
  $("#ci-no").onclick = decline;
  inDlg.addEventListener("close", () => { if(incoming) decline(); });   // Esc

  /* ---------- Colgar y limpiar ---------- */
  function end(msg, notify = true){
    const c = call; if(!c || c.ending) return;
    c.ending = true;
    stopMon(); clearShare(c);
    c.unsubs.forEach(f => { try{ f(); }catch(e){} });
    c.timers.forEach(clr); clr(c.ringT);
    try{ c.ch && c.ch.close(); }catch(e){}
    try{ c.pc.close(); }catch(e){}
    c.stream.getTracks().forEach(t => t.stop());
    audio.srcObject = null; $("#cp-unmute").hidden = true;
    const ref = db.collection("calls").doc(c.id);
    if(notify) ref.delete().catch(() => {});
    ref.collection("cand").where("uid", "==", c.me).get().then(s => s.forEach(d => d.ref.delete())).catch(() => {});
    call = null; panel.hidden = true; dlg.classList.remove("incall");
    $("#cp-users").innerHTML = ""; $("#cp-time").textContent = "00:00";
    $("#cp-share").disabled = true; paintShare();
    syncPill(); refreshBtn();
    if(msg) note(msg);
  }

  /* ---------- Eventos de la interfaz ---------- */
  $("#cp-mute").onclick = $("#cl-mute").onclick = toggleMute;
  $("#cp-end").onclick = $("#cl-end").onclick = () => end("");
  $("#cp-mic").onchange = e => switchMic(e.target.value).catch(() => note("No se pudo cambiar el micrófono."));
  $("#cp-spk").onchange = e => { if(audio.setSinkId) audio.setSinkId(e.target.value).catch(() => {}); };
  $("#cp-share").onclick = () => {
    if(!call) return;
    if(!CAN_SHARE){ note(ANDROID ? "Los navegadores de Android no permiten compartir pantalla. Sí puedes ver la del otro." : "Tu navegador no permite compartir pantalla."); return; }
    call.screen ? stopShare() : startShare();
  };
  $("#cp-sharecfg").addEventListener("change", () => {
    paintShare();
    const o = shareOpts();
    try{ localStorage.setItem(SH_KEY, JSON.stringify({res:$("#sh-res").value, w:$("#sh-w").value, h:$("#sh-h").value, fps:o.fps, hint:o.hint})); }catch(e){}
    applyShare();
  });
  loadShareCfg();
  new MutationObserver(syncPill).observe(dlg, {attributes:true, attributeFilter:["open"]});
  addEventListener("pagehide", () => { if(call) db.collection("calls").doc(call.id).delete().catch(() => {}); });

  /* ---------- Escuchar llamadas entrantes ---------- */
  document.addEventListener("deytek:auth", () => {
    const u = window.deytekUser;
    if(unsubIn){ unsubIn(); unsubIn = null; }
    if(call && (!u || u.uid !== call.me)) end("");
    if(incoming) closeIncoming();
    if(!u) return;
    unsubIn = db.collection("calls").where("to", "==", u.uid).onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        const d = ch.doc.data({serverTimestamps:"estimate"});
        if(ch.type === "removed"){ if(incoming && incoming.id === ch.doc.id) closeIncoming(); return; }
        if(ch.type !== "added" || d.status !== "ringing") return;
        const t = d.createdAt ? d.createdAt.toMillis() : Date.now();
        if(Date.now() - t > STALE_MS) return;
        if(call || incoming){ ch.doc.ref.delete().catch(() => {}); return; }   // ocupado
        showIncoming(ch.doc.id, d);
      });
    }, err => console.error(err));
  });
})();