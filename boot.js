// ── STATS (la barre a été retirée de la vue ; on garde la fonction, sans effet si absente) ──
function updateStats(){
  const v = document.getElementById('stat-viewers'); if(v) v.textContent = Object.keys(viewers).length;
  const f = document.getElementById('stat-fire');
  if(f){
    const pts = fire.points||0;
    const lbl = { petit:'Petit', grand:'Grand', legendaire:'Légendaire' }[fireTier(pts)];
    f.textContent = lbl + ' (' + pts + ' pts)';
  }
}

// Routing initial : /stream -> vue publique, /admin -> écran meneur, sinon vue joueur
function routePage(){
  if (isStreamUrl()) showPage('stream');
  else showPage(isAdminUrl() ? 'admin-gate' : 'viewer');
}
routePage();
// Re-router si le hash change sans rechargement (ex : on tape #admin ou #stream à la main)
window.addEventListener('hashchange', routePage);


updateStats();
renderFireMeter();
renderAdminFire();
renderDiamantAdmin();
renderFermeAdmin();
renderGalerapagosAdmin();
renderGalerapagosStream();
renderGameLibrary();
// Cas où fb-ready s'est déclenché avant le chargement de ce script
if (window.FB) initSync();