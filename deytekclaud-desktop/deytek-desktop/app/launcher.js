/* launcher.js - pantalla principal tipo launcher de juegos (después de iniciar sesión).
   Izquierda: logos de los juegos. Centro: video + fotos + descripción. Abajo: Descargar / Actualizar / Jugar con barra de progreso.
   Arriba: botón "Amigos" que abre y cierra el panel de chat y llamadas. */
(() => {
  const $ = s => document.querySelector(s);
  const G = window.deytekGames;
  const root = $("#launcher"), rail = $("#lrail"), main = $("#lmain");
  const fbtn = $("#friends-btn"), fbadge = $("#fbadge"), sbadge = $("#sbadge"), dlg = $("#social-dlg"), sclose = $("#sclose");
  if(!root || !rail || !main) return;

  const SLIDE_MS = 5000; // cuánto dura cada foto
  let games = [], sel = null, offline = false;
  const prog = {}, errs = {};
  let timers = [], thumbs = [], showFn = null;

  /* Crea elementos sin usar innerHTML (el contenido viene de games.json) */
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for(const [k, v] of Object.entries(props)){
      if(v == null || v === false) continue;
      if(k === "class") el.className = v;
      else if(k === "style") el.style.cssText = v;
      else if(k.startsWith("on")) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    el.append(...kids.flat().filter(k => k != null && k !== false));
    return el;
  };
  const fmt = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + " GB" : n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  const cur = () => games.find(g => g.id === sel);
  /* replaceChildren convierte un `false` en el texto "false": aquí se descartan los valores vacíos */
  const put = (el, ...kids) => el.replaceChildren(...kids.filter(Boolean));

  /* ---------------- Lista de juegos (izquierda) ---------------- */
  function renderRail(){
    rail.replaceChildren(...games.map(g => {
      const logo = h("img", { src: g.logo, alt: "" });
      logo.onerror = () => logo.replaceWith(document.createTextNode((g.name || "?")[0].toUpperCase()));
      return h("button", {
        type: "button", class: "lgame" + (g.id === sel ? " on" : ""), title: g.name, "aria-label": g.name,
        onclick: () => pick(g.id)
      }, logo, (g.updateAvailable || g.installing) && h("i", { class: "ldot" }));
    }));
  }

  function pick(id){
    if(id === sel) return;
    sel = id; renderRail(); renderGame();
  }

  /* ---------------- Video + fotos ---------------- */
  function stopMedia(){ timers.forEach(clearTimeout); timers = []; }

  function startMedia(video, img, list){
    stopMedia();
    let i = 0;
    const next = () => show((i + 1) % list.length);
    function show(n){
      stopMedia(); i = n;
      thumbs.forEach((t, k) => t.classList.toggle("on", k === i));
      const m = list[i];
      if(!m) return;
      if(m.type === "video"){
        img.classList.remove("on"); video.classList.add("on");
        if(video.getAttribute("src") !== m.src) video.src = m.src;
        video.loop = list.length === 1;
        video.onended = next;
        video.onerror = () => { if(list.length > 1) timers.push(setTimeout(next, 800)); };
        video.currentTime = 0;
        video.play().catch(() => {});
      }else{
        video.pause(); video.classList.remove("on");
        img.onerror = () => { if(list.length > 1) next(); };
        img.src = m.src; img.classList.add("on");
        if(list.length > 1) timers.push(setTimeout(next, SLIDE_MS));
      }
    }
    showFn = show;
    show(0);
  }

  /* ---------------- Pantalla del juego ---------------- */
  function renderGame(){
    stopMedia(); thumbs = []; showFn = null;
    const g = cur();
    if(!g){
      main.replaceChildren(h("p", { class: "lempty" }, G ? "Aún no hay juegos disponibles." : "El lanzador de juegos solo funciona en la app de escritorio."));
      return;
    }
    const list = [];
    if(g.video) list.push({ type: "video", src: g.video });
    g.screenshots.forEach(s => list.push({ type: "img", src: s }));
    if(!list.length && g.background) list.push({ type: "img", src: g.background });

    const video = h("video", { class: "lmedia", muted: true, playsinline: true, preload: "auto", poster: g.background || null });
    video.muted = true;
    const img = h("img", { class: "lmedia", alt: "" });

    thumbs = list.length > 1 ? list.map((m, k) => {
      const t = h("button", { type: "button", class: "lthumb", "aria-label": m.type === "video" ? "Ver video" : "Ver foto " + k, onclick: () => showFn && showFn(k) },
        m.type === "video" ? h("span", { class: "lplayico" }, "▶") : h("img", { src: m.src, alt: "" }));
      if(m.type === "video" && g.background) t.style.backgroundImage = `url("${g.background}")`;
      return t;
    }) : [];

    const logo = h("img", { class: "llogo", src: g.logo, alt: "" });
    logo.onerror = () => logo.replaceWith(h("h2", { class: "ltitle" }, g.name));

    const hero = h("div", { class: "lhero" }, video, img, h("div", { class: "lshade" }),
      h("div", { class: "lcontent" },
        logo,
        g.tagline && h("p", { class: "ltag" }, g.tagline),
        g.description && h("p", { class: "ldesc" }, g.description),
        thumbs.length > 0 && h("div", { class: "lthumbs" }, thumbs)));

    main.replaceChildren(hero, h("footer", { class: "lbar", id: "lbar" }));
    if(list.length) startMedia(video, img, list);
    renderBar();
  }

  /* ---------------- Barra inferior: botón + progreso ---------------- */
  function renderBar(){
    const g = cur(), bar = $("#lbar");
    if(!g || !bar) return;
    const p = prog[g.id];

    if(p){
      const known = p.phase === "download" && p.total > 0;
      const pct = known ? Math.min(100, p.got / p.total * 100) : 0;
      const label = p.phase === "extract" ? "Instalando…"
        : known ? `Descargando ${Math.floor(pct)}% · ${fmt(p.got)} de ${fmt(p.total)}${p.speed ? " · " + fmt(p.speed) + "/s" : ""}`
        : "Descargando…";
      put(bar,
        h("button", { type: "button", class: "lbtn", disabled: true }, g.updateAvailable ? "Actualizando" : "Descargando"),
        h("div", { class: "lprog" },
          h("span", { class: "lprogtxt" }, label),
          h("div", { class: "ltrack" }, h("i", { class: known ? "" : "ind", style: known ? `width:${pct}%` : "" }))),
        p.phase === "download" && h("button", { type: "button", class: "llink", onclick: () => G.cancel(g.id) }, "Cancelar"));
      return;
    }

    let label = "Descargar", off = false;
    if(g.running){ label = "En ejecución"; off = true; }
    else if(g.updateAvailable) label = "Actualizar";
    else if(g.installed) label = "Jugar";
    else if(!g.downloadable){ label = "Próximamente"; off = true; }

    const info = g.installed
      ? (g.updateAvailable ? `Versión ${g.installedVersion} → ${g.version}` : `Versión ${g.installedVersion}`)
      : [g.version && "Versión " + g.version, g.size].filter(Boolean).join(" · ");

    put(bar,
      h("button", { type: "button", class: "lbtn", disabled: off, onclick: () => act(g) }, label),
      h("div", { class: "linfo" },
        errs[g.id] ? h("span", { class: "lerr" }, errs[g.id]) : h("span", {}, info),
        offline && h("span", { class: "lwarn" }, "Sin conexión con el servidor de juegos")),
      g.installed && !g.running && h("button", { type: "button", class: "llink", onclick: () => uninstall(g) }, "Desinstalar"));
  }

  async function act(g){
    errs[g.id] = "";
    if(g.installed && !g.updateAvailable){
      const r = await G.play(g.id);
      if(r && r.error){ errs[g.id] = r.error; renderBar(); }
      return;
    }
    prog[g.id] = { phase: "download", got: 0, total: 0, speed: 0 };
    g.installing = true;
    renderBar(); renderRail();
    G.install(g.id);
  }

  async function uninstall(g){
    if(!confirm(`¿Desinstalar ${g.name}?`)) return;
    await G.uninstall(g.id);
    reload();
  }

  /* ---------------- Datos ---------------- */
  async function reload(){
    if(!G) return;
    try{
      const r = await G.list();
      games = r.games; offline = r.offline;
    }catch(e){ return; }
    if(!cur()){ sel = games[0] && games[0].id; renderRail(); renderGame(); return; }
    renderRail(); renderBar();
  }

  async function refresh(){
    if(!G){ renderGame(); return; }
    await reload();
    renderRail(); renderGame();
  }

  if(G){
    G.onProgress(d => { prog[d.id] = d; if(d.id === sel) renderBar(); });
    G.onDone(d => { delete prog[d.id]; errs[d.id] = ""; reload(); });
    G.onError(d => { delete prog[d.id]; errs[d.id] = d.message || ""; reload(); });
    G.onRunning(() => reload());
    setInterval(() => { if(window.deytekUser && !root.hidden) reload(); }, 10 * 60 * 1000); // busca actualizaciones cada 10 min
  }

  /* ---------------- Botón Amigos: abre y cierra el panel ---------------- */
  if(fbtn && dlg){
    fbtn.onclick = () => { dlg.open ? dlg.close() : dlg.show(); };
    if(sclose) sclose.addEventListener("click", () => { if(dlg.open) dlg.close(); }); // la X siempre cierra
    new MutationObserver(() => fbtn.classList.toggle("on", dlg.open)).observe(dlg, { attributes: true, attributeFilter: ["open"] });
  }
  if(sbadge && fbadge){
    const sync = () => {
      const t = sbadge.textContent.trim();
      fbadge.textContent = t; fbadge.hidden = sbadge.hidden || !t || t === "0";
    };
    new MutationObserver(sync).observe(sbadge, { childList: true, characterData: true, subtree: true, attributes: true });
    sync();
  }

  /* ---------------- Sesión ---------------- */
  document.addEventListener("deytek:auth", () => {
    const on = !!window.deytekUser;
    root.hidden = !on;
    if(fbtn) fbtn.hidden = !on;
    if(on) refresh();
    else{ stopMedia(); main.replaceChildren(); rail.replaceChildren(); games = []; sel = null; }
  });
})();