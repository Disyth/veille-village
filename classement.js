// ══════════════════════════════════════════════════════════════════════════
//  CLASSEMENT GLOBAL — affiché sur l'accueil joueur quand aucun jeu n'est lancé.
//  Un onglet par jeu : parties jouées, temps de jeu, record du village, top 5.
//
//  Nœud Firebase : « stats » (doit être autorisé dans les règles de la base).
//    stats/<jeu> = { parties, ms, best:{ fire, label, n, at }, players:{ <uid>:{ name, parties, ms, score } } }
//  Écrit UNE fois par partie, à la clôture au feu (lbRecord), par transaction.
//  Seuls les joueurs connectés via Twitch sont classés (uid « twitch:<id> », pseudo fiable).
// ══════════════════════════════════════════════════════════════════════════

let lbStats = {};          // copie locale du nœud « stats »
let lbTab   = 'diamant';   // onglet affiché (conservé entre deux rafraîchissements)

// Réglages par jeu.
//  scoreMode : 'max' = on garde le meilleur résultat (Diamant), 'sum' = on cumule (victoires, évasions…)
const LB_GAMES = [
  { id:'diamant',     nom:'Diamant',           who:'explorateur', label:'Meilleur butin',   unit:(n)=>n+' 💎',                       scoreMode:'max' },
  { id:'ferme',       nom:'La Ferme',          who:'fermier',     label:'Victoires',        unit:(n)=>n+' victoire'+(n>1?'s':''),     scoreMode:'sum' },
  { id:'galerapagos', nom:'Galerapagos',       who:'naufragé',    label:'Évasions',         unit:(n)=>n+' évasion'+(n>1?'s':''),      scoreMode:'sum' },
  { id:'avel',        nom:'Chroniques d\'Avel', who:'héros',       label:'Monstres vaincus', unit:(n)=>n+' monstre'+(n>1?'s':''),      scoreMode:'sum' },
];
const LB_TOP = 5;

function lbNow(){ return Date.now() + (window.FB_OFFSET || 0); }

// Retrouve l'uid Twitch d'un pseudo grâce à la liste des villageois (marqués tw + uid à la connexion)
function lbTwitchUid(pseudo){
  const v = Object.values(viewers || {}).find(x => x && x.tw && x.uid && x.pseudo === pseudo);
  return v ? v.uid : null;
}

// ── ENREGISTREMENT D'UNE PARTIE (appelé par chaque jeu à sa clôture au feu) ──
//  game     : 'diamant' | 'ferme' | 'galerapagos' | 'avel'
//  fire     : points apportés au feu par cette partie
//  label    : résumé du résultat (« 187 💎 », « Victoire », « 11 rescapés »…)
//  pseudos  : participants
//  scores   : { pseudo: nombre } — score individuel de cette partie
//  startedAt: horodatage du lancement (pour le temps de jeu)
function lbRecord(game, { fire, label, pseudos, scores, startedAt }){
  const def = LB_GAMES.find(g => g.id === game); if(!def) return;
  const now = lbNow();
  const ms  = (startedAt && now > startedAt) ? Math.min(now - startedAt, 12*3600*1000) : 0;   // plafond 12 h (partie oubliée)
  const ranked = (pseudos || []).map(p => ({ pseudo:p, uid:lbTwitchUid(p) })).filter(x => x.uid);
  const seed = lbSeedBest(game);
  const update = (cur) => {
    const s = cur && typeof cur === 'object' ? cur : {};
    s.parties = (s.parties || 0) + 1;
    s.ms      = (s.ms || 0) + ms;
    const best = s.best || seed;
    if(!best || (fire || 0) > (best.fire || 0)) s.best = { fire:fire||0, label:String(label||''), n:(pseudos||[]).length, at:now };
    else if(!s.best) s.best = best;
    s.players = s.players && typeof s.players === 'object' ? s.players : {};
    ranked.forEach(({ pseudo, uid }) => {
      const p = s.players[uid] || { parties:0, ms:0, score:0 };
      const sc = Number((scores || {})[pseudo]) || 0;
      p.name    = pseudo;
      p.parties = (p.parties || 0) + 1;
      p.ms      = (p.ms || 0) + ms;
      p.score   = def.scoreMode === 'max' ? Math.max(p.score || 0, sc) : (p.score || 0) + sc;
      s.players[uid] = p;
    });
    return s;
  };
  if(ONLINE && window.FB.runTransaction){
    const { db, ref, runTransaction } = window.FB;
    runTransaction(ref(db, 'stats/' + game), update).catch((e) => {
      console.error('Écriture du classement refusée :', e);
      toast('Classement non enregistré : ajoute la règle « stats » dans la base.');
    });
  } else {
    lbStats[game] = update(lbStats[game] ? JSON.parse(JSON.stringify(lbStats[game])) : null);
    renderLeaderboard();
  }
}

// Diamant avait déjà un record de groupe (fire.diamantRecords) : on le reprend tant qu'aucun nouveau ne l'a battu
function lbSeedBest(game){
  if(game !== 'diamant') return null;
  const t = fire && fire.diamantRecords && fire.diamantRecords.bestGroup && fire.diamantRecords.bestGroup.total;
  return t ? { fire:Math.round(t/10), label:t+' 💎', n:0, at:0 } : null;
}

// ── AFFICHAGE ──
function lbDuration(ms){
  const min = Math.round((ms || 0) / 60000);
  if(min < 60) return min + ' min';
  const h = Math.floor(min / 60), m = min % 60;
  return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '');
}
function lbDate(at){
  if(!at) return '';
  const d = new Date(at);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}
function lbPlural(n, w){ return n + ' ' + w + (n > 1 ? 's' : ''); }

function lbRow(rank, p, def, isMe){
  return '<div class="player-row' + (isMe ? ' is-current' : '') + (rank === 1 ? ' is-top' : '') + '">' +
    '<span class="lb-rank">' + escHtml(String(rank)) + '</span>' +
    '<span class="player-name">' + escHtml(p.name || '?') + '</span>' +
    '<span class="player-infos"><span class="player-info">' + lbPlural(p.parties || 0, 'partie') + '</span>' +
    '<span class="player-info lb-time">' + lbDuration(p.ms) + '</span></span>' +
    '<span class="player-status">' + escHtml(def.unit(p.score || 0)) + '</span></div>';
}

function lbPanel(def){
  const s = lbStats[def.id] || {};
  const best = s.best || lbSeedBest(def.id);
  if(!s.parties && !best) return '<div class="empty-state">Aucune partie enregistrée pour l\'instant.</div>';

  let h = '<div class="container-pills">' +
    '<span class="dpill">🎲 <strong>' + (s.parties || 0) + '</strong> partie' + ((s.parties || 0) > 1 ? 's' : '') + '</span>' +
    '<span class="dpill">⏱️ <strong>' + lbDuration(s.ms) + '</strong> de jeu</span></div>';

  if(best){
    const who = best.n ? lbPlural(best.n, def.who) + (best.at ? ' · ' + lbDate(best.at) : '') : '';
    h += '<div class="section-title">Record du village</div>' +
      '<div class="player-row is-top lb-record">' +
      '<span class="player-name">+' + (best.fire || 0) + ' 🔥</span>' +
      (who ? '<span class="player-infos"><span class="player-info">' + escHtml(who) + '</span></span>' : '') +
      '<span class="player-status">' + escHtml(best.label || '') + '</span></div>';
  }

  const meUid = window.FB && window.FB.twitch && window.FB.user ? window.FB.user.uid : null;
  const all = Object.entries(s.players || {})
    .map(([uid, p]) => Object.assign({ uid }, p))
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (a.parties || 0) - (b.parties || 0) || String(a.name).localeCompare(String(b.name)));
  if(all.length){
    h += '<div class="section-title lb-gap">Meilleurs villageois · ' + escHtml(def.label) + '</div><div class="lb-list">';
    all.slice(0, LB_TOP).forEach((p, i) => { h += lbRow(i + 1, p, def, p.uid === meUid); });
    h += '</div>';
    const myIdx = meUid ? all.findIndex(p => p.uid === meUid) : -1;
    if(myIdx >= LB_TOP) h += '<div class="lb-me-sep">· · ·  ta place  · · ·</div>' + lbRow((myIdx + 1) + 'ᵉ', all[myIdx], def, true);
  }
  return h;
}

function renderLeaderboard(){
  const el = document.getElementById('viewer-leaderboard');
  if(!el) return;
  const show = !!(currentViewerPseudo && !gameActive());
  el.style.display = show ? 'block' : 'none';
  if(!show) return;
  if(!LB_GAMES.some(g => g.id === lbTab)) lbTab = LB_GAMES[0].id;
  let h = '<div class="container-head"><span class="container-title">🏆 Classement de la veillée</span></div>' +
    '<div class="tabs">' + LB_GAMES.map(g =>
      '<button class="tab-btn' + (g.id === lbTab ? ' is-active' : '') + '" data-tab-group="lb" data-tab-target="' + g.id + '" onclick="lbSelect(\'' + g.id + '\')">' + escHtml(g.nom) + '</button>'
    ).join('') + '</div>';
  LB_GAMES.forEach(g => {
    h += '<div class="tab-panel' + (g.id === lbTab ? ' is-active' : '') + '" data-tab-group="lb" data-tab-panel="' + g.id + '">' + lbPanel(g) + '</div>';
  });
  h += '<div class="lb-note">Classement réservé aux villageois connectés via Twitch · cumul de toutes les veillées</div>';
  if(el._h !== h){ el.innerHTML = h; el._h = h; }   // anti-flicker : n'écrit que si le contenu change
}

function lbSelect(id){ lbTab = id; uiTab('lb', id); }
