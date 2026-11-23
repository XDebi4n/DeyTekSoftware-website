/* Botón "Descargar" de la portada: lee el enlace de descarga desde descarga.json
   (así cambias el enlace o la versión sin tocar el HTML). */
(async () => {
  const b = document.querySelector("#dl-desktop");
  if(!b) return;
  try{
    const r = await fetch("descarga.json", { cache: "no-store" });
    if(!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const url = String(j.url || "").trim();
    if(!/^https?:\/\//i.test(url)) throw new Error("falta una url válida en descarga.json");
    b.href = url;
    if(j.texto) b.textContent = String(j.texto).slice(0, 40);
    if(j.version) b.title = "Versión " + String(j.version).slice(0, 20);
  }catch(e){
    console.warn("[descarga]", e.message);
    b.removeAttribute("href");
    b.setAttribute("aria-disabled", "true");
    b.textContent = "Próximamente";
  }
})();
