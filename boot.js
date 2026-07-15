// ── STATS ─────────────────────────────────────────────────────────────────
function updateStats(){
  document.getElementById('stat-viewers').textContent  = Object.keys(viewers).length;
  document.getElementById('stat-assigns').textContent  = assignments.length;
  const pts = fire.points||0;
  const tier = fireTier(pts);
  const lbl  = { petit:'Petit', grand:'Grand 🔥', legendaire:'Légendaire ✨' }[tier];
  document.getElementById('stat-fire').textContent = lbl + ' ('+pts+' pts)';
}

updateStats();
renderFireMeter();
renderAdminFire();
renderLibrary();
renderDiamantAdmin();
renderFermeAdmin();
// Handle case where fb-ready fired before this script parsed
if (window.FB) initSync();
