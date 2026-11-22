/* Copia desde tu sitio web (carpeta public) los archivos que usa la app de escritorio,
   así chat, amigos y llamadas son SIEMPRE el mismo código que tu web.
   Uso:  node scripts/sync.js [ruta/a/public]
   Si no le pasas ruta, busca una carpeta "public" (con social.js) subiendo por las carpetas padre. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DST = path.join(ROOT, "app");

function findPublic(){
  let dir = ROOT;
  for(let i = 0; i < 4; i++){
    dir = path.dirname(dir);
    const p = path.join(dir, "public");
    if(fs.existsSync(path.join(p, "social.js"))) return p;
  }
  return path.join(ROOT, "..", "public");
}
const SRC = path.resolve(process.argv[2] || process.env.DEYTEK_PUBLIC || findPublic());

if(!fs.existsSync(SRC)){
  console.error(`[sync] No encuentro la carpeta del sitio: ${SRC}\n       Pasa la ruta:  node scripts/sync.js "C:\\ruta\\a\\public"`);
  process.exit(1);
}

const FILES = ["auth.js", "social.js", "call.js", "styles.css", "mobile.css", "firebase-config.js"];
const IMGS = ["favicon.png", "deytek.png", "deyteknoti.png", "gallery.png", "bloqueado.png", "logo512.png"];

fs.mkdirSync(path.join(DST, "img"), { recursive: true });

for(const f of FILES){
  const from = path.join(SRC, f);
  if(!fs.existsSync(from)){ console.warn(`[sync] Falta ${f}`); continue; }
  let txt = fs.readFileSync(from, "utf8");
  if(f === "call.js"){
    /* El timbre pasa a ser la sirena de desktop.js (si existe), sin tocar tu archivo original */
    const marker = "function ring(on){";
    if(txt.includes(marker)) txt = txt.replace(marker, marker + " if(window.deytekRing){ window.deytekRing(on); return; }");
    else console.warn("[sync] No encontré ring() en call.js; sonará el pitido normal.");
  }
  fs.writeFileSync(path.join(DST, f), txt);
}
for(const f of IMGS){
  const from = path.join(SRC, "img", f);
  if(fs.existsSync(from)) fs.copyFileSync(from, path.join(DST, "img", f));
  else console.warn(`[sync] Falta img/${f}`);
}
console.log(`[sync] Listo desde ${SRC}`);