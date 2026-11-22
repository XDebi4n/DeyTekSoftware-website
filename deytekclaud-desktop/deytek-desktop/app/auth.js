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
    "auth/unauthorized-domain":"Este dominio no está autorizado en Firebase.", "auth/operation-not-supported-in-this-environment":"Abre el sitio desde http://localhost (Live Server), no como archivo.", "auth/web-storage-unsupported":"Tu navegador bloquea el almacenamiento o las cookies de este sitio.", "permission-denied":"Faltan las reglas de Firestore (ver README)."
  };
  const acct = $("#acct"), A = $("#auth"), P = $("#profile"), astat = $("#astatus"), pstat = $("#pstatus");
  const avatar = n => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".3" cy=".25"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#8e8e93"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="66" font-size="48" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#000">${((n||"?")[0]).toUpperCase().replace(/[<>&"']/g,"?")}</text></svg>`);
  const nameOf = u => profile.name || u.displayName || (u.email || "").split("@")[0] || "Jugador";
  const photoOf = u => profile.photo || u.photoURL || avatar(nameOf(u));
  const need = () => { if(!ready) throw {code:"need"}; };

  /* Genera un ID único tipo DTK-48291 verificando que no exista */
  async function generateUniqueFriendId(){
    for(let i = 0; i < 8; i++){
      const num = Math.floor(10000 + Math.random() * 90000);
      const code = `DTK-${num}`;
      const snap = await db.collection("users").where("friendId", "==", code).limit(1).get();
      if(snap.empty) return code;
    }
    return `DTK-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  }

  function render(){
    window.deytekProfile = profile;
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
    try{ await fn(); }catch(e){ if(!(e.code in ERR)) console.error(e);
      out.textContent = ERR[e.code] ?? ("No se pudo completar. Inténtalo de nuevo." + (e.code ? " (" + e.code + ")" : "")); }
    btn.disabled = false;
  }
  async function load(u){
    const n = ++seq; let d = {};
    try{
      const ref = db.collection("users").doc(u.uid);
      d = (await ref.get()).data() || {};
      const friendId = d.friendId || await generateUniqueFriendId();
      const syncData = {
        name: d.name || u.displayName || (u.email || "").split("@")[0] || "Jugador",
        photo: d.photo || u.photoURL || "",
        friendId,
        email: firebase.firestore.FieldValue.delete()
      };
      await ref.set(syncData, {merge:true});
      d = {...d, name: syncData.name, photo: syncData.photo, friendId};
    }catch(e){}
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
    $("#pfriend-id").textContent = profile.friendId || "---";
    $("#pmail").textContent = user.email || ""; pstat.textContent = ""; P.showModal();
  }

  $("#pcopy-id").onclick = async () => {
    const id = profile.friendId; if(!id) return;
    try{
      await navigator.clipboard.writeText(id);
      pstat.textContent = `ID ${id} copiado al portapapeles.`;
    }catch(e){
      pstat.textContent = `Tu ID es: ${id}`;
    }
  };

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
        const friendId = await generateUniqueFriendId();
        await c.user.updateProfile({displayName:nm});
        await db.collection("users").doc(c.user.uid).set({name:nm, photo:"", friendId}, {merge:true});
        await load(c.user);
      } else await auth.signInWithEmailAndPassword(em, pw);
      f.reset();
    });
  };

  /* Manejo de archivos de perfil con soporte completo para GIFs animados */
  $("#pfile").onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    if(!f.type.startsWith("image/")){ pstat.textContent = "Elige un archivo de imagen."; return; }
    try{
      if(f.type === "image/gif"){
        const reader = new FileReader();
        reader.onload = ev => {
          newPhoto = ev.target.result;
          $("#pimg").src = newPhoto;
          pstat.textContent = "";
        };
        reader.readAsDataURL(f);
      } else {
        newPhoto = await resize(f);
        $("#pimg").src = newPhoto;
        pstat.textContent = "";
      }
    }
    catch(err){ pstat.textContent = "No se pudo leer esa imagen."; }
    e.target.value = "";
  };

  $("#psave").onclick = e => run(e.currentTarget, pstat, async () => {
    const nm = $("#pname").value.trim().slice(0,40); if(!nm) throw {code:"noname"};
    await user.updateProfile({displayName:nm});
    const photo = newPhoto || profile.photo || "";
    await db.collection("users").doc(user.uid).set({name:nm, photo}, {merge:true});
    profile = {...profile, name:nm, photo}; newPhoto = ""; render(); pstat.textContent = "Cambios guardados.";
  });
  $("#pout").onclick = async () => { if(ready) await auth.signOut(); P.close(); };

  window.openAuth = () => { if(!A.open){ setMode(false); A.showModal(); } };
  if(ready) auth.onAuthStateChanged(async u => {
    user = u; window.deytekUser = u;
    if(u){ if(A.open) A.close(); render(); await load(u); } else { profile = {}; render(); }
    document.dispatchEvent(new Event("deytek:auth"));
  });
})();