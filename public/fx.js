/* Sonidos (sintetizados, sin archivos) y música de fondo con interruptor */
(() => {
  const MUSIC_FILE = ""; // opcional: "audio/musica.mp3" para usar tu propia música
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx, master, music, timer, file, started = false, on = true, ci = 0;
  try{ on = localStorage.getItem("deytek-music") !== "off"; }catch(e){}
  const sw = document.querySelector("#music");
  const paint = () => sw.setAttribute("aria-checked", on);
  paint();

  function init(){
    if(ctx || !AC) return;
    ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = 0; music.connect(master);
  }
  function tone(f1, f2, dur, vol, type, delay){
    if(!ctx) return;
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f1, t);
    if(f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  const click = () => { tone(900, 560, .09, .07, "triangle"); };
  const game = () => { tone(180, 900, .4, .025, "sawtooth"); tone(392, 392, .4, .06); tone(523.25, 523.25, .4, .06, "sine", .09); tone(784, 784, .7, .07, "sine", .18); };

  const chords = [[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66],[164.81,207.65,246.94]];
  function pad(){
    const t = ctx.currentTime, ch = chords[ci++ % 4];
    [ch[0] / 2, ...ch].forEach((f, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createBiquadFilter();
      o.type = "triangle"; o.frequency.value = f; o.detune.value = (k - 1) * 6; l.type = "lowpass"; l.frequency.value = 900;
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.035, t + 2.5); g.gain.linearRampToValueAtTime(.0001, t + 7.5);
      o.connect(l); l.connect(g); g.connect(music); o.start(t); o.stop(t + 7.6);
    });
  }
  function apply(){
    if(!ctx) return; ctx.resume();
    if(MUSIC_FILE){
      file = file || Object.assign(new Audio(MUSIC_FILE), {loop:true, volume:.35});
      on ? file.play().catch(() => {}) : file.pause(); return;
    }
    clearInterval(timer);
    if(on){ pad(); timer = setInterval(pad, 6000); music.gain.setTargetAtTime(1, ctx.currentTime, .8); }
    else music.gain.setTargetAtTime(0, ctx.currentTime, .3);
  }
  function first(){
    if(started) return; started = true; init(); apply();
    removeEventListener("pointerdown", first); removeEventListener("keydown", first);
  }
  addEventListener("pointerdown", first); addEventListener("keydown", first);

  sw.addEventListener("click", () => {
    init(); started = true; on = !on; paint();
    try{ localStorage.setItem("deytek-music", on ? "on" : "off"); }catch(e){}
    apply();
  });
  document.addEventListener("click", e => {
    if(!ctx || e.target.closest("#music")) return;
    ctx.resume();
    if(e.target.closest("button,a,summary")) click();
    else if(e.target.closest(".game,.char-card")) game();
  }, true);
})();
