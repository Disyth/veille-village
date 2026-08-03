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

// Routing initial : /admin -> écran meneur, sinon vue joueur
showPage(isAdminUrl() ? 'admin-gate' : 'viewer');
// Re-router si le hash change sans rechargement (ex : on tape #admin à la main sur une page déjà ouverte)
window.addEventListener('hashchange', () => showPage(isAdminUrl() ? 'admin-gate' : 'viewer'));

updateStats();
renderFireMeter();
renderAdminFire();
renderDiamantAdmin();
renderFermeAdmin();
renderGameLibrary();
// Cas où fb-ready s'est déclenché avant le chargement de ce script
if (window.FB) initSync();
