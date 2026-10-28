// ══════════════════════════════════════════════════════════════════════════
//  Cœur de la vue joueur (connexion, feu) + connexion meneur + liste villageois.
//  L'ancien système d'épreuves / attributions / artisanat a été retiré :
//  les rôles et l'inventaire sont désormais gérés dans les modules de jeu.
// ══════════════════════════════════════════════════════════════════════════

// ── VIEWER ──────────────────────────────────────────────────────────────────
function viewerConnect(){
  const pseudo = document.getElementById('viewer-pseudo').value.trim();
  if(!pseudo){ toast('Entre ton pseudo !'); return; }
  // Firebase interdit . # $ / [ ] dans les clés : les jeux rangent les joueurs par pseudo,
  // un pseudo contenant l'un de ces caractères ferait échouer « Rejoindre la partie ».
  // (L'apostrophe, elle, ne pose plus problème : escAttr la neutralise dans les boutons.)
  if(/[.#$\/\[\]]/.test(pseudo)){ toast('Pseudo sans . # $ / [ ] s\'il te plaît'); return; }
  // Un pseudo déjà pris par un joueur connecté via Twitch lui est réservé
  const low = pseudo.toLowerCase();
  if(Object.values(viewers||{}).some(v => v && v.tw && String(v.pseudo).toLowerCase()===low)){
    toast('Ce pseudo est réservé : connecte-toi avec Twitch.'); return;
  }
  viewerStart(pseudo, false);
}

// Connexion effective (saisie libre ou compte Twitch). tw = true : pseudo imposé par Twitch.
function viewerStart(pseudo, tw){
  currentViewerPseudo = pseudo;
  fbSetViewer(pseudo, tw);
  document.getElementById('viewer-hero').style.display = 'none';
  document.getElementById('viewer-topframe').style.display = 'block';
  document.getElementById('topbar-pseudo').textContent = pseudo;
  renderDiamantViewer(pseudo);
  renderFermeViewer(pseudo);
  renderGalerapagosViewer(pseudo);
  renderAvelViewer(pseudo);
  renderViewerIdle();
}

function viewerDisconnect(){
  // Compte Twitch : on se déconnecte vraiment (sinon le rechargement reconnecterait le joueur)
  if(window.FB && window.FB.twitch && window.FB.signOutTwitch){ window.FB.twitch = null; window.FB.signOutTwitch().catch(()=>{}); }
  currentViewerPseudo = null;
  document.getElementById('viewer-hero').style.display = '';
  document.getElementById('viewer-topframe').style.display = 'none';
  document.getElementById('viewer-pseudo').value = '';
  ['viewer-ferme','viewer-diamant','viewer-galerapagos','viewer-avel','viewer-idle'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  renderViewerIdle();
}

// ── CONNEXION VIA TWITCH ────────────────────────────────────────────────────
// Le compte Twitch est connu dès que Firebase a validé le jeton (évènement « fb-auth »).
// Pseudo imposé = nom Twitch. Pas sur /admin ni /stream (ces vues ne jouent pas).
function twitchAutoConnect(){
  try{
    const err = sessionStorage.getItem('twErr');
    if(err){ sessionStorage.removeItem('twErr'); toast(err); }
  }catch(e){}
  const tw = window.FB && window.FB.twitch;
  if(!tw || !tw.name) return;
  if((typeof isAdminUrl==='function' && isAdminUrl()) || (typeof isStreamUrl==='function' && isStreamUrl())) return;
  if(currentViewerPseudo === tw.name) return;
  viewerStart(tw.name, true);
}
window.addEventListener('fb-auth', twitchAutoConnect);
// Cas où fb-auth est déjà passé avant le chargement de ce script
if(window.FB && window.FB.user) twitchAutoConnect();

// Affiche « aucun jeu en cours » quand un joueur est connecté et qu'aucune partie n'est lancée
function renderViewerIdle(){
  const el = document.getElementById('viewer-idle');
  if(!el) return;
  el.style.display = (currentViewerPseudo && !gameActive()) ? 'block' : 'none';
}

// ── CONNEXION MENEUR ─────────────────────────────────────────────────────────
async function adminLogin(){
  // Mode hors-ligne (démo locale, pas de Firebase) : accès direct
  if(!window.FB || !window.FB.ready || !window.FB.signInMeneur){
    showPage('admin'); renderViewerList(); updateStats(); return;
  }
  // Déjà connecté (session persistante) : ouvre directement
  const u = window.FB.currentUser && window.FB.currentUser();
  // Un compte Twitch n'est PAS anonyme mais n'est pas le meneur : seul l'e-mail / mot de passe ouvre l'admin
  if(u && !u.isAnonymous && !String(u.uid).startsWith('twitch:')){ showPage('admin'); renderViewerList(); updateStats(); return; }
  // Sinon : e-mail + mot de passe, vérifiés par Firebase (côté serveur — rien en clair dans le code)
  const emailEl = document.getElementById('admin-email-input');
  const passEl  = document.getElementById('admin-pass-input');
  const email = emailEl ? emailEl.value.trim() : '';
  const pass  = passEl  ? passEl.value : '';
  if(!email || !pass){ toast('Entre ton e-mail et ton mot de passe.'); return; }
  try {
    await window.FB.signInMeneur(email, pass);
    if(passEl) passEl.value = '';
    showPage('admin'); renderViewerList(); updateStats();
  } catch(e){
    console.warn('Connexion meneur :', e && e.code);
    toast('E-mail ou mot de passe incorrect.');
  }
}

// ── VILLAGEOIS (liste de la base : 5 max, recherche sur toute la liste, suppression) ──
function renderViewerList(){
  const el = document.getElementById('viewer-list-el');
  if(!el) return;
  const q = (document.getElementById('search-viewers')?.value||'').trim().toLowerCase();
  const all = Object.values(viewers)
    .map(v => (v && v.pseudo) ? v.pseudo : v)
    .filter(n => typeof n === 'string');
  const matched = all.filter(n => n.toLowerCase().includes(q));
  if(!matched.length){
    el.innerHTML = '<div class="empty-state">' + (q ? 'Aucun pseudo ne correspond' : 'Aucun villageois connecté') + '</div>';
    return;
  }
  const shown = matched.slice(0,5);
  el.innerHTML = shown.map(name => `
    <div class="vill-row">
      <span class="vill-dot"></span>
      <span class="vill-name">${escHtml(name)}</span>
      <button class="vill-del" onclick="deleteViewer('${escAttr(name)}')" title="Supprimer ce pseudo" aria-label="Supprimer ${escHtml(name)}">✕</button>
    </div>`).join('')
    + (matched.length > 5
        ? `<div class="vill-more">+ ${matched.length - 5} autre(s) — affine la recherche pour les afficher</div>`
        : '');
}

function deleteViewer(name){
  if(!confirm('Supprimer le pseudo « ' + name + ' » ? Cette action est définitive.')) return;
  fbDeleteViewer(name);
  toast('Villageois supprimé');
}

// ── FEU (global, permanent, basé sur des points) ──────────────────────────────
function fireTier(points){
  if(points >= (fire.legendaire||120)) return 'legendaire';
  if(points >= (fire.grand||50)) return 'grand';
  return 'petit';
}

function renderFireMeter(){
  const el = document.getElementById('viewer-fire-meter');
  if(!el) return;
  const points = fire.points||0;
  const tier = fireTier(points);
  const labels = { petit:'Petit feu', grand:'Grand feu', legendaire:'Feu Légendaire' };
  document.getElementById('fire-visual').textContent = '🔥';
  const lab = document.getElementById('fire-tier-label');
  lab.textContent = labels[tier];
  lab.className = 'fire-tier-label fire-tier-' + tier;
  document.getElementById('fire-count').textContent = points + ' pts';
  const pct = Math.min(100, Math.round(points / (fire.legendaire||120) * 100));
  document.getElementById('fire-progress-bar').style.width = pct + '%';
  document.getElementById('fire-thresholds').innerHTML =
    '<span>0</span><span>' + (fire.grand||50) + '</span><span>' + (fire.legendaire||120) + '</span>';
}

function renderAdminFire(){
  const pts = fire.points||0;
  const tier = fireTier(pts);
  const labels = { petit:'Petit feu', grand:'Grand feu', legendaire:'Feu légendaire' };
  const v=document.getElementById('admin-fire-visual'); if(v) v.textContent='🔥';
  const t=document.getElementById('admin-fire-tier'); if(t){ t.textContent=labels[tier]; t.style.color = (tier==='petit') ? 'var(--fire)' : 'var(--text-title)'; }
  const p=document.getElementById('admin-fire-points'); if(p) p.textContent=pts;
  const bar=document.getElementById('admin-fire-bar'); if(bar) bar.style.width = Math.min(100, Math.round(pts/(fire.legendaire||120)*100)) + '%';
  const g=document.getElementById('fire-threshold-grand');
  const l=document.getElementById('fire-threshold-legendaire');
  if(g && document.activeElement!==g) g.value = fire.grand||50;
  if(l && document.activeElement!==l) l.value = fire.legendaire||120;
}

function adjustFirePoints(delta){
  const newFire = Object.assign({}, fire, { points: Math.max(0, (fire.points||0)+delta) });
  fbSetFire(newFire);
}

function resetFirePoints(){
  if(!confirm('Réinitialiser le feu de camp à 0 point ? (les seuils Grand feu / Légendaire sont conservés)')) return;
  fbSetFire(Object.assign({}, fire, { points:0 }));
}

function saveFireConfig(){
  const grand = Math.max(1, parseInt(document.getElementById('fire-threshold-grand').value)||50);
  const legendaire = Math.max(grand+1, parseInt(document.getElementById('fire-threshold-legendaire').value)||120);
  fbSetFire(Object.assign({}, fire, { grand, legendaire }));
}