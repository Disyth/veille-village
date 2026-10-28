// L'accès meneur est vérifié par Firebase (e-mail + mot de passe) — aucun secret dans le code.

// ── STATE ──────────────────────────────────────────────────────────────────
let viewers   = {};    // { key: {pseudo,joined} }
let fire      = { points:0, grand:50, legendaire:120 };  // feu global permanent
let diamant   = null;  // partie de Diamant en cours (null si aucune)
let ferme     = null;  // partie de Ferme en cours (null si aucune)
let galerapagos = null;  // partie de Galerapagos en cours (null si aucune)
let avel      = null;  // partie des Chroniques d'Avel en cours (null si aucune)
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

  onValue(ref(db, 'galerapagos'), (snap) => {
    galerapagos = snap.val() ? gNormalize(snap.val()) : null;
    renderGalerapagosAdmin();
    if (currentViewerPseudo) renderGalerapagosViewer(currentViewerPseudo);
    renderGalerapagosStream();
    renderViewerIdle();
  });

  // Décalage entre l'horloge de cet appareil et celle du serveur (minuteurs communs à tous)
  onValue(ref(db, '.info/serverTimeOffset'), (snap) => { window.FB_OFFSET = snap.val() || 0; });

  onValue(ref(db, 'stats'), (snap) => {
    lbStats = snap.val() || {};
    renderLeaderboard();
  });

  onValue(ref(db, 'avel'), (snap) => {
    avel = snap.val() ? avNormalize(snap.val()) : null;
    renderAvelAdmin();
    if (currentViewerPseudo) renderAvelViewer(currentViewerPseudo);
    renderViewerIdle();
  });
}

// Write helpers — écrit dans Firebase si en ligne, sinon miroir local + re-render
// tw = true : joueur connecté via Twitch (son pseudo est alors réservé, cf. viewerConnect)
function fbSetViewer(pseudo, tw){
  if (ONLINE){
    const { db, ref, set, serverTimestamp } = window.FB;
    const uid = window.FB.user && window.FB.user.uid;   // uid Twitch : sert au classement global
    set(ref(db, 'viewers/' + fbKey(pseudo)), tw ? { pseudo, tw:true, uid, joined: serverTimestamp() } : { pseudo, joined: serverTimestamp() });
  } else {
    if(!viewers[pseudo]) viewers[pseudo] = tw ? { pseudo, tw:true, joined: Date.now() } : { pseudo, joined: Date.now() };
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

function fbSetGalerapagos(g){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    set(ref(db, 'galerapagos'), g);
  } else {
    galerapagos = g ? gNormalize(g) : null;
    renderGalerapagosAdmin();
    if(currentViewerPseudo) renderGalerapagosViewer(currentViewerPseudo);
    renderGalerapagosStream();
  }
}

function fbSetAvel(a){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    // Écriture refusée (souvent : règle « avel » absente dans Firebase) → on le dit au lieu d'échouer en silence
    set(ref(db, 'avel'), a).catch((e) => {
      console.error('Écriture Chroniques d\'Avel refusée :', e);
      toast('Firebase refuse l\'écriture : ajoute la règle « avel » dans la base.');
    });
  } else {
    avel = a ? avNormalize(a) : null;
    renderAvelAdmin();
    if(currentViewerPseudo) renderAvelViewer(currentViewerPseudo);
    renderViewerIdle();
  }
}

// Transaction sur le nœud « avel » : si deux joueurs agissent dans la même seconde, Firebase
// rejoue automatiquement la modification perdue (indispensable au tour libre).
// update(cur) reçoit l'état actuel et renvoie le nouvel état, ou undefined pour annuler.
function fbTxAvel(update){
  if (ONLINE && window.FB.runTransaction){
    const { db, ref, runTransaction } = window.FB;
    return runTransaction(ref(db, 'avel'), update).catch((e) => {
      console.error('Écriture Chroniques d\'Avel refusée :', e);
      toast('Firebase refuse l\'écriture : ajoute la règle « avel » dans la base.');
      return { committed:false };
    });
  }
  const r = update(avel ? JSON.parse(JSON.stringify(avel)) : null);
  if (r !== undefined){
    avel = r ? avNormalize(r) : null;
    renderAvelAdmin();
    if(currentViewerPseudo) renderAvelViewer(currentViewerPseudo);
    renderViewerIdle();
  }
  return Promise.resolve({ committed: r !== undefined });
}

// Firebase keys can't contain . # $ [ ] / — sanitize pseudo
function fbKey(s){ return String(s).replace(/[.#$\[\]/]/g,'_'); }

// ── UTILS ─────────────────────────────────────────────────────────────────
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }

// Onglets génériques (composant design system, réutilisable par tous les jeux).
// Boutons : <button class="tab-btn" data-tab-group="G" data-tab-target="T" onclick="uiTab('G','T')">
// Panneaux : <div class="tab-panel" data-tab-group="G" data-tab-panel="T">
// Active le bouton + le panneau dont la cible == target, dans le groupe G.
function uiTab(group, target){
  document.querySelectorAll('[data-tab-group="'+group+'"]').forEach(el=>{
    const name = el.classList.contains('tab-btn') ? el.getAttribute('data-tab-target') : el.getAttribute('data-tab-panel');
    el.classList.toggle('is-active', name===target);
  });
}

// L'admin est accessible par une URL dédiée : /admin (Netlify), ou #admin / ?admin en secours (ouverture locale)
function isAdminUrl(){
  const p = location.pathname.toLowerCase().replace(/\/+$/,'');
  if (p.endsWith('/admin') || p.endsWith('/admin.html')) return true;
  if (location.hash.toLowerCase() === '#admin') return true;
  return /(?:^|[?&])admin(?:=|&|$)/.test(location.search.toLowerCase());
}

// La vue stream (publique, lecture seule) est accessible par : /stream (Netlify), ou #stream / ?stream
function isStreamUrl(){
  const p = location.pathname.toLowerCase().replace(/\/+$/,'');
  if (p.endsWith('/stream') || p.endsWith('/stream.html')) return true;
  if (location.hash.toLowerCase() === '#stream') return true;
  return /(?:^|[?&])stream(?:=|&|$)/.test(location.search.toLowerCase());
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
  galerapagos: { nom:'Galerapagos — L\'île du Village',
    desc:'Survie pour 3 à 12 naufragés : construire un radeau et quitter l\'île avant l\'ouragan. Météo, pêche, eau, bois (gare aux serpents !), et votes de pénurie quand les vivres manquent.' },
  avel: { nom:'Chroniques d\'Avel',
    desc:'Aventure coopérative pour 1 à 12 joueurs : explorer les terres du château, affronter les monstres et se préparer à la Lune Noire.' },
};

function gameActive(){
  if (typeof diamant !== 'undefined' && diamant && diamant.active) return 'diamant';
  if (typeof ferme   !== 'undefined' && ferme   && ferme.active)   return 'ferme';
  if (typeof galerapagos !== 'undefined' && galerapagos && galerapagos.active) return 'galerapagos';
  if (typeof avel !== 'undefined' && avel && avel.active) return 'avel';
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
  const btn  = document.getElementById('game-launch-btn');
  const key  = sel ? sel.value : '';
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
  else if (key === 'galerapagos') startGalerapagos();
  else if (key === 'avel') startAvel();
}