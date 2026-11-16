(() => {
  const $ = s => document.querySelector(s);
  const cfg = window.FIREBASE_CONFIG, ready = !!(cfg && window.firebase);
  let auth, db, user = null, profile = {}, signup = false, newPhoto = "", seq = 0;
  if(ready){ firebase.initializeApp(cfg); auth = firebase.auth(); db = firebase.firestore(); }

  const ERR = {
    need:"Falta conectar Firebase. Sigue los pasos del README y pega tu configuración en firebase-config.js.",
    noname:"Escribe un nombre.", noemail:"Escribe tu correo arriba.",
    "auth/invalid-credential":"Correo o contraseña incorrectos.", "auth/user-not-found":"Correo o contraseña incorrectos.", "auth/wrong-password":"Correo o contraseña incorrectos.",
    "auth/email-already-in-use":"Ese correo ya tiene una cuenta.", "auth/weak-password":"La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-email":"Ese correo no es válido.", "auth/too-many-requests":"Demasiados intentos. Espera un momento.",
    "auth/popup-closed-by-user":"", "auth/cancelled-popup-request":"", "auth/popup-blocked":"El navegador bloqueó la ventana de Google.",
    "auth/network-request-failed":"Sin conexión. Revisa tu internet.", "auth/operation-not-allowed":"Ese método no está activado en Firebase.",
    "auth/unauthorized-domain":"Este dominio no está autorizado en Firebase.", "permission-denied":"Faltan las reglas de Firestore (ver README)."
  };
  const acct = $("#acct"), A = $("#auth"), P = $("#profile"), astat = $("#astatus"), pstat = $("#pstatus");
  const avatar = n => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".3" cy=".25"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#8e8e93"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="66" font-size="48" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#000">${((n||"?")[0]).toUpperCase().replace(/[<>&"']/g,"?")}</text></svg>`);
  const nameOf = u => profile.name || u.displayName || (u.email || "").split("@")[0] || "Jugador";
  const photoOf = u => profile.photo || u.photoURL || avatar(nameOf(u));
  const need = () => { if(!ready) throw {code:"need"}; };

  function render(){
    acct.classList.toggle("has", !!user); acct.textContent = "";
    if(user){ const i = new Image(); i.alt = "Tu perfil"; i.src = photoOf(user); acct.append(i); acct.setAttribute("aria-label","Abrir tu perfil"); }
    else { acct.textContent = "Entrar"; acct.removeAttribute("aria-label"); }
  }
  function setMode(s){
    signup = s; astat.textContent = "";
    $("#at").textContent = s ? "Crea tu cuenta" : "Entra a Deytek";
    $("#aname").hidden = !s; $("#aname").required = s;
    $("#asubmit").textContent = s ? "Crear cuenta" : "Iniciar sesión";
    $("#stxt").textContent = s ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
    $("#swap").textContent = s ? "Iniciar sesión" : "Crear cuenta";
    $("#apass").autocomplete = s ? "new-password" : "current-password";
  }
  async function run(btn, out, fn){
    btn.disabled = true; out.textContent = "";
    try{ await fn(); }catch(e){ out.textContent = ERR[e.code] ?? "No se pudo completar. Inténtalo de nuevo."; }
    btn.disabled = false;
  }
  async function load(u){
    const n = ++seq; let d = {};
    try{ d = (await db.collection("users").doc(u.uid).get()).data() || {}; }catch(e){}
    if(n === seq){ profile = d; render(); }
  }
  function resize(file){
    return new Promise((ok, no) => {
      const i = new Image(), url = URL.createObjectURL(file);
      i.onload = () => { const s = Math.min(i.width, i.height), c = document.createElement("canvas"); c.width = c.height = 256;
        c.getContext("2d").drawImage(i, (i.width-s)/2, (i.height-s)/2, s, s, 0, 0, 256, 256); URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", .82)); };
      i.onerror = no; i.src = url;
    });
  }
  function openProfile(){
    newPhoto = ""; $("#pimg").src = photoOf(user); $("#pname").value = nameOf(user);
    $("#pmail").textContent = user.email || ""; pstat.textContent = ""; P.showModal();
  }

  acct.onclick = () => user ? openProfile() : (setMode(false), A.showModal());
  $("#swap").onclick = () => setMode(!signup);
  $("#aclose").onclick = () => A.close();
  $("#pclose").onclick = () => P.close();
  $("#google").onclick = e => run(e.currentTarget, astat, async () => { need(); await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); });
  $("#reset").onclick = e => run(e.currentTarget, astat, async () => {
    need(); const em = $("#aemail").value.trim(); if(!em) throw {code:"noemail"};
    await auth.sendPasswordResetEmail(em); astat.textContent = "Te enviamos un correo para restablecerla.";
  });
  $("#authform").onsubmit = e => {
    e.preventDefault(); const f = e.target;
    run($("#asubmit"), astat, async () => {
      need(); const em = f.email.value.trim(), pw = f.pass.value;
      if(signup){
        const nm = f.name.value.trim().slice(0,40), c = await auth.createUserWithEmailAndPassword(em, pw);
        await c.user.updateProfile({displayName:nm});
        await db.collection("users").doc(c.user.uid).set({name:nm, photo:""}, {merge:true});
        await load(c.user);
      } else await auth.signInWithEmailAndPassword(em, pw);
      f.reset();
    });
  };
  $("#pfile").onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    if(!f.type.startsWith("image/")){ pstat.textContent = "Elige un archivo de imagen."; return; }
    try{ newPhoto = await resize(f); $("#pimg").src = newPhoto; pstat.textContent = ""; }
    catch(err){ pstat.textContent = "No se pudo leer esa imagen."; }
    e.target.value = "";
  };
  $("#psave").onclick = e => run(e.currentTarget, pstat, async () => {
    const nm = $("#pname").value.trim().slice(0,40); if(!nm) throw {code:"noname"};
    await user.updateProfile({displayName:nm});
    const photo = newPhoto || profile.photo || "";
    await db.collection("users").doc(user.uid).set({name:nm, photo}, {merge:true});
    profile = {name:nm, photo}; newPhoto = ""; render(); pstat.textContent = "Cambios guardados.";
  });
  $("#pout").onclick = async () => { if(ready) await auth.signOut(); P.close(); };

  window.openAuth = () => { if(!A.open){ setMode(false); A.showModal(); } };
  if(ready) auth.onAuthStateChanged(async u => {
    user = u; window.deytekUser = u; document.dispatchEvent(new Event("deytek:auth"));
    if(u){ if(A.open) A.close(); render(); await load(u); } else { profile = {}; render(); }
  });
})();
