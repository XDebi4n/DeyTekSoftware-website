/* Equipo: muestra nombre y foto de cada ID de la lista `team` (script.js) */
(async () => {
  if(!team.length) return;
  const box = $("#team");
  const ready = !!(window.FIREBASE_CONFIG && window.firebase && firebase.apps.length);
  if(!ready){ box.innerHTML = EMPTY_TEAM; return; }
  const db = firebase.firestore(), found = {};
  try{
    const ids = [...new Set(team.map(m => m.id))];
    for(let i = 0; i < ids.length; i += 10){
      const snap = await db.collection("users").where("friendId", "in", ids.slice(i, i + 10)).get();
      snap.forEach(d => { found[d.data().friendId] = d.data(); });
    }
  }catch(e){ console.error(e); box.innerHTML = '<p class="cnone">No se pudo cargar el equipo.</p>'; return; }
  const cards = team.map((m, i) => {
    const u = found[m.id]; if(!u) return "";
    m.name = u.name || "Miembro";
    const pic = u.photo ? `<img src="${esc(u.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : esc(m.name[0]);
    return `<div class="glass member" id="m-${i}"><div class="avatar">${pic}</div><h3>${esc(m.name)}</h3><p>${esc(m.r)}</p></div>`;
  }).join("");
  box.innerHTML = cards || EMPTY_TEAM;
})();