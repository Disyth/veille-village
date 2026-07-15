const ADMIN_PASSWORD = 'veillée';

const TEMPLATES = {
  objet: ['Une torche enchantée (éclaire le chemin)','Un fagot de bois sacré (+2 flammes)','Une outre d\'eau de source','Une braise magique (relance une épreuve)','Un sac de graines mystérieuses'],
  role:  ['L\'Ancien du Village (peut donner un indice)','Le Forgeron (double la valeur du prochain bois)','La Sorcière des Bois (peut voler un objet)','Le Barde (booste le moral +1)','L\'Éclaireur (voit la prochaine épreuve)'],
  info:  ['Le deuxième sentier mène à la forêt cachée.','La fontaine se tarira au 3e round.','L\'Ancien cache un trésor sous le grand chêne.','Le loup rôde côté Est cette nuit.'],
  secret:['Tu es en réalité l\'esprit du feu. Ne le dis à personne.','Tu sais que la carte du trésor est fausse.','Tu peux sacrifier ton objet pour sauver un autre joueur.'],
};

// ── STATE ──────────────────────────────────────────────────────────────────
let viewers     = {};   // { key: {pseudo,joined} }
let assignments = [];    // [ {id,viewer,type,content,qty} ]
let activeGame  = null;  // { id,title,rules,craftRoles,reward } — épreuve en cours
let library     = {};    // { id: {id,title,rules,craftRoles,reward} } — bibliothèque
let fire        = { points:0, grand:50, legendaire:120 };  // feu global permanent
let diamant     = null;  // partie de Diamant en cours (null si aucune)
let ferme       = null;  // partie de Ferme en cours (null si aucune)
let selectedViewer   = null;
let currentViewerPseudo = null;
let craftRolesDraft  = [];
let craftSectionOpen = false;

// ── FIREBASE SYNC LAYER ─────────────────────────────────────────────────────
let ONLINE = false;   // true once Firebase is configured & listeners attached

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

  onValue(ref(db, 'assignments'), (snap) => {
    const obj = snap.val() || {};
    assignments = Object.values(obj);
    renderViewerList();
    updateStats();
    if (selectedViewer) renderPanel();
    if (currentViewerPseudo) renderViewerInfo(currentViewerPseudo);
  });

  onValue(ref(db, 'activeGame'), (snap) => {
    activeGame = snap.val() || null;
    updateGameUI();
    updateViewerGameCard();
    if (currentViewerPseudo) renderViewerInfo(currentViewerPseudo);
  });

  onValue(ref(db, 'library'), (snap) => {
    library = snap.val() || {};
    renderLibrary();
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
  });

  onValue(ref(db, 'ferme'), (snap) => {
    ferme = snap.val() ? fNormalize(snap.val()) : null;
    renderFermeAdmin();
    if (currentViewerPseudo) renderFermeViewer(currentViewerPseudo);
  });
}

// Write helpers — write to Firebase if online, else mutate local mirror + re-render
function fbSetViewer(pseudo){
  if (ONLINE){
    const { db, ref, set, serverTimestamp } = window.FB;
    set(ref(db, 'viewers/' + fbKey(pseudo)), { pseudo, joined: serverTimestamp() });
  } else {
    if(!viewers[pseudo]) viewers[pseudo] = { pseudo, joined: Date.now() };
    renderViewerList(); updateStats();
  }
}

function fbPushAssignment(a){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    set(ref(db, 'assignments/' + a.id), a);
  } else {
    assignments.push(a);
    localAfterAssignmentChange();
  }
}

function fbUpdateAssignment(a){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    set(ref(db, 'assignments/' + a.id), a);
  } else {
    localAfterAssignmentChange();
  }
}

function fbRemoveAssignment(id){
  if (ONLINE){
    const { db, ref, remove } = window.FB;
    remove(ref(db, 'assignments/' + id));
  } else {
    assignments = assignments.filter(a=>a.id!==id);
    localAfterAssignmentChange();
  }
}

function fbSetGame(game){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    set(ref(db, 'activeGame'), game);
  } else {
    activeGame = game;
    updateGameUI(); updateViewerGameCard();
    if(currentViewerPseudo) renderViewerInfo(currentViewerPseudo);
  }
}

function fbSaveEpreuve(ep){
  if (ONLINE){
    const { db, ref, set } = window.FB;
    set(ref(db, 'library/' + ep.id), ep);
  } else {
    library[ep.id] = ep;
    renderLibrary();
  }
}

function fbDeleteEpreuve(id){
  if (ONLINE){
    const { db, ref, remove } = window.FB;
    remove(ref(db, 'library/' + id));
  } else {
    delete library[id];
    renderLibrary();
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

function localAfterAssignmentChange(){
  renderViewerList(); updateStats();
  if(selectedViewer) renderPanel();
  if(currentViewerPseudo) renderViewerInfo(currentViewerPseudo);
}

// Firebase keys can't contain . # $ [ ] / — sanitize pseudo
function fbKey(s){ return String(s).replace(/[.#$\[\]/]/g,'_'); }

// ── UTILS ─────────────────────────────────────────────────────────────────
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return String(s).replace(/'/g,"\\'"); }
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }
function showPage(name){ document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); document.getElementById('page-'+name).classList.add('active'); document.getElementById('btn-viewer').classList.toggle('active',name==='viewer'); document.getElementById('btn-admin').classList.toggle('active',name==='admin'||name==='admin-gate'); }
