// Code d'accès meneur — change-le pour ce que tu veux. Il protège l'AFFICHAGE de l'admin ;
// la base, elle, reste protégée par l'authentification anonyme + les règles Firebase.
const MENEUR_CODE = 'veillée';

// ── STATE ──────────────────────────────────────────────────────────────────
let viewers   = {};    // { key: {pseudo,joined} }
let fire      = { points:0, grand:50, legendaire:120 };  // feu global permanent
let diamant   = null;  // partie de Diamant en cours (null si aucune)
let ferme     = null;  // partie de Ferme en cours (null si aucune)
let currentViewerPseudo = null;

// ── FIREBASE SYNC LAYER ─────────────────────────────────────────────────────
let ONLINE = false;

function initSync(){
  if (window.FB && window.FB.ready) {
    ONLINE = true;
    document.getElementById('conn-indicator').style.display = 'block';
    document.getElementById('setup-banner').style.display   = 'none';
    attachListeners();
  } else {
    ONLINE = false;
    document.getElementById('setup-banner').style.display   = 'block';
    document.getElementById('conn-indicator').style.display = 'none';
  }
}
window.addEventListener('fb-ready', initSync);

function attachListeners(){
  const { db, ref, onValue } = window.FB;

  onValue(ref(db, 'viewers'), (snap) => {
    viewers = snap.val() || {};
    renderViewerList();
    updateStats();
  });

  onValue(ref(db, 'fire'), (snap) => {
    fire = snap.val() || { points:0, grand:50, legendaire:120 };
    renderFireMeter();
    renderAdminFire();
  });

  onValue(ref(db, 'diamant'), (snap) => {
    diamant = snap.val() ? dNormalize(snap.val()) : null;
    renderDiamantAdmin();
    if (currentViewerPseudo) renderDiamantViewer(currentViewerPseudo);
    renderViewerIdle();
  });

  onValue(ref(db, 'ferme'), (snap) => {
    ferme = snap.val() ? fNormalize(snap.val()) : null;
    renderFermeAdmin();
    if (currentViewerPseudo) renderFermeViewer(currentViewerPseudo);
    renderViewerIdle();
  });
}

// Write helpers — écrit dans Firebase si en ligne, sinon miroir local + re-render
function fbSetViewer(pseudo){
  if (ONLINE){
    const { db, ref, set, serverTimestamp } = window.FB;
    set(ref(db, 'viewers/' + fbKey(pseudo)), { pseudo, joined: serverTimestamp() });
  } else {
    if(!viewers[pseudo]) viewers[pseudo] = { pseudo, joined: Date.now() };
    renderViewerList(); updateStats();
  }
}

function fbDeleteViewer(pseudo){
  if (ONLINE){
    const { db, ref, remove } = window.FB;
    remove(ref(db, 'viewers/' + fbKey(pseudo)));
  } else {
    delete viewers[pseudo]; delete viewers[fbKey(pseudo)];
    renderViewerList(); updateStats();
  }
}

function fbSetFire(f){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    set(ref(db, 'fire'), f);
  } else {
    fire = f;
    renderFireMeter(); renderAdminFire();
  }
}

function fbSetDiamant(d){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    set(ref(db, 'diamant'), d);
  } else {
    diamant = dNormalize(d);
    renderDiamantAdmin();
    if(currentViewerPseudo) renderDiamantViewer(currentViewerPseudo);
  }
}

function fbSetFerme(f){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    set(ref(db, 'ferme'), f);
  } else {
    ferme = f ? fNormalize(f) : null;
    renderFermeAdmin();
    if(currentViewerPseudo) renderFermeViewer(currentViewerPseudo);
  }
}

// Firebase keys can't contain . # $ [ ] / — sanitize pseudo
function fbKey(s){ return String(s).replace(/[.#$\[\]/]/g,'_'); }

// ── UTILS ─────────────────────────────────────────────────────────────────
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }

// L'admin est accessible par une URL dédiée : /admin (Netlify), ou #admin / ?admin en secours (ouverture locale)
function isAdminUrl(){
  const p = location.pathname.toLowerCase().replace(/\/+$/,'');
  if (p.endsWith('/admin') || p.endsWith('/admin.html')) return true;
  if (location.hash.toLowerCase() === '#admin') return true;
  return /(?:^|[?&])admin(?:=|&|$)/.test(location.search.toLowerCase());
}

function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el = document.getElementById('page-'+name);
  if (el) el.classList.add('active');
}

// ── BIBLIOTHÈQUE DE JEUX (sélection + lancement) ───────────────────────────
const F_GAMES = {
  diamant: { nom:'Diamant',
    desc:'Partie coopérative sur 5 manches. Les explorateurs révèlent les cartes de la grotte, votent pour continuer ou rentrer, et sécurisent leur trésor. Le total alimente le feu de camp.' },
  ferme:   { nom:'La Ferme du Village',
    desc:'Partie coopérative en 20 tours. Chaque villageois choisit son métier et son lieu à chaque tour, puis joue ses actions. Objectif : remplir les objectifs de grand-père.' },
};

function gameActive(){
  if (typeof diamant !== 'undefined' && diamant && diamant.active) return 'diamant';
  if (typeof ferme   !== 'undefined' && ferme   && ferme.active)   return 'ferme';
  return null;
}

function renderGameLibrary(){
  const lib    = document.getElementById('game-library');
  const noGame = document.getElementById('no-game-card');
  const active = gameActive();
  if (noGame) noGame.style.display = active ? 'none' : 'block';
  if (lib)    lib.style.display    = active ? 'none' : 'block';
  if (active) return;
  const sel  = document.getElementById('game-select');
  const desc = document.getElementById('game-desc');
  const btn  = document.getElementById('game-launch-btn');
  const key  = sel ? sel.value : '';
  if (desc) desc.textContent = (key && F_GAMES[key]) ? F_GAMES[key].desc : '';
  if (btn){
    btn.disabled = !key;
    btn.textContent = (key && F_GAMES[key]) ? ('Lancer '+F_GAMES[key].nom) : 'Lancer le jeu';
  }
}

function lancerJeu(){
  const sel = document.getElementById('game-select');
  const key = sel ? sel.value : '';
  if (!key){ toast('Choisis un jeu dans la liste'); return; }
  if (gameActive()){ toast('Un jeu est déjà en cours'); return; }
  if (key === 'diamant') startDiamant();
  else if (key === 'ferme') startFerme();
}