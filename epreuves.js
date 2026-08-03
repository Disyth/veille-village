// ══════════════════════════════════════════════════════════════════════════
//  Cœur de la vue joueur (connexion, feu) + connexion meneur + liste villageois.
//  L'ancien système d'épreuves / attributions / artisanat a été retiré :
//  les rôles et l'inventaire sont désormais gérés dans les modules de jeu.
// ══════════════════════════════════════════════════════════════════════════

// ── VIEWER ──────────────────────────────────────────────────────────────────
function viewerConnect(){
  const pseudo = document.getElementById('viewer-pseudo').value.trim();
  if(!pseudo){ toast('Entre ton pseudo !'); return; }
  currentViewerPseudo = pseudo;
  fbSetViewer(pseudo);
  document.getElementById('viewer-hero').style.display = 'none';
  document.getElementById('viewer-topframe').style.display = 'block';
  document.getElementById('topbar-pseudo').textContent = pseudo;
  renderDiamantViewer(pseudo);
  renderFermeViewer(pseudo);
  renderViewerIdle();
}

function viewerDisconnect(){
  currentViewerPseudo = null;
  document.getElementById('viewer-hero').style.display = '';
  document.getElementById('viewer-topframe').style.display = 'none';
  document.getElementById('viewer-pseudo').value = '';
  ['viewer-ferme','viewer-diamant','viewer-idle'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  renderViewerIdle();
}

// Affiche « aucun jeu en cours » quand un joueur est connecté et qu'aucune partie n'est lancée
function renderViewerIdle(){
  const el = document.getElementById('viewer-idle');
  if(!el) return;
  el.style.display = (currentViewerPseudo && !gameActive()) ? 'block' : 'none';
}

// ── CONNEXION MENEUR ─────────────────────────────────────────────────────────
async function adminLogin(){
  // Mode hors-ligne (démo locale, pas de Firebase) : accès direct
  if(!window.FB || !window.FB.ready || !window.FB.signInWithGoogle){
    showPage('admin'); renderViewerList(); updateStats(); return;
  }
  let user = window.FB.currentUser && window.FB.currentUser();
  // Déjà connecté en Google ? on saute le popup. Sinon on le lance.
  if(!user || user.isAnonymous){
    try { await window.FB.signInWithGoogle(); }
    catch(e){ console.warn('Popup Google (souvent COOP/cookies — sans gravité si la connexion a réussi) :', e && e.code); }
    user = window.FB.currentUser && window.FB.currentUser();
  }
  // Le popup peut échouer alors que la connexion a réussi : on se fie à l'utilisateur réellement connecté
  if(!user || user.isAnonymous){
    toast('Connexion Google échouée. Réessaie, ou vérifie les domaines autorisés (Firebase → Authentication → Settings).');
    return;
  }
  if(MENEUR_UID && user.uid !== MENEUR_UID){
    toast('Ce compte Google n\'est pas autorisé comme meneur.');
    return;
  }
  if(!MENEUR_UID){
    console.log('Ton identifiant meneur (MENEUR_UID) à copier dans core.js :', user.uid);
    toast('1re connexion — ton identifiant meneur est dans la console (F12).');
  }
  showPage('admin'); renderViewerList(); updateStats();
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

function saveFireConfig(){
  const grand = Math.max(1, parseInt(document.getElementById('fire-threshold-grand').value)||50);
  const legendaire = Math.max(grand+1, parseInt(document.getElementById('fire-threshold-legendaire').value)||120);
  fbSetFire(Object.assign({}, fire, { grand, legendaire }));
}
