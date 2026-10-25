// ══════════════════════════════════════════════════════════════════════════
//  CHRONIQUES D'AVEL — jeu coopératif d'exploration (inspiré de Chronicles of Avel)
//  LOT 1 + 2 : lobby, héros (partagés au-delà de 6 joueurs), tour par tour à
//  2 actions, carte hexagonale (exploration, raccourcis), apparition des
//  monstres, piste lunaire, repos, don immédiat, pièces du village.
//  À VENIR : actions de lieu (lot 3), combat (lot 4), sac à dos (lot 5),
//  Lune Noire / la Bête (lot 6), finitions + vue stream (lot 7).
//  Nœud Firebase : « avel » (doit être autorisé dans les règles de la base).
// ══════════════════════════════════════════════════════════════════════════

// ── LEVIERS D'ÉQUILIBRAGE (ajustables) ──
const AV_MAX_PLAYERS = 12;
const AV_MAX_HEROES  = 6;     // au-delà, 2 joueurs se partagent un héros (1 action chacun)
const AV_PV_MAX      = 5;     // points de vie d'un héros
const AV_REST_HEAL   = 2;     // PV rendus par l'action Repos
const AV_START_COINS = 1;     // pièces d'or au départ
const AV_COIN_GAIN   = 2;     // pièces gagnées au village / dans les terres sauvages
const AV_ACTIONS     = 2;     // actions par héros et par tour

// Piste lunaire : on avance d'une case à chaque fin de tour, puis on applique le symbole.
//   lair = apparition des monstres · heart = +1 PV pour tous · seal / trap = fermeture
//   (sceaux / pièges, utile aux lots 3 et 6) · moon = la Lune Noire se lève · none = rien
const AV_MOON_TRACK = ['start','lair','heart','lair','none','lair','heart','lair','seal','lair','trap','moon'];
// Case de départ selon le nombre de héros (plus de héros = plus d'actions par tour = moins de tours)
function avMoonStart(nHeroes){ return nHeroes<=2 ? 0 : (nHeroes<=4 ? 1 : 2); }

// ── HÉROS (couleurs = tokens --hero-1..6 de styles.css) ──
const AV_HEROES = [
  { nom:'Aldric',     ini:'A' },
  { nom:'Ysolde',     ini:'Y' },
  { nom:'Gaspard',    ini:'G' },
  { nom:'Mélusine',   ini:'M' },
  { nom:'Théobald',   ini:'T' },
  { nom:'Brunehilde', ini:'B' },
];
const AV_SLOTS = [ ['arme','Arme'], ['bouclier','Bouclier'], ['casque','Casque'] ];

// ── TUILES ──
// lair : repaire de monstres (petit / grand) · act : action de lieu (coins = gagner des pièces, soon = lot 3)
const AV_TILES = {
  chateau:  { nom:'Château',             ico:'🏰' },
  marche:   { nom:'Marché',              ico:'🛒', act:'soon' },
  village:  { nom:'Village abandonné',   ico:'🏚️', act:'coins' },
  lisiere:  { nom:'Lisière',             ico:'🌳', lair:'petit' },
  sauvage:  { nom:'Terres sauvages',     ico:'🌾', lair:'petit', act:'coins' },
  cercle:   { nom:'Cercle de pierres',   ico:'🗿', act:'soon' },
  carriere: { nom:'Carrière',            ico:'⛏️', act:'soon' },
  camp:     { nom:'Camp des elfes',      ico:'🏹', act:'soon' },
  lac:      { nom:'Lac aux souhaits',    ico:'🏞️', act:'soon' },
  atelier:  { nom:'Atelier d\'alchimie', ico:'⚗️', act:'soon' },
  foret:    { nom:'Forêt sombre',        ico:'🌲', lair:'petit' },
  marais:   { nom:'Marais',              ico:'🌿', lair:'petit' },
  grotte:   { nom:'Grotte',              ico:'🕳️', lair:'petit' },
  collines: { nom:'Collines',            ico:'⛰️', lair:'petit' },
  ruines:   { nom:'Ruines maudites',     ico:'🏛️', lair:'grand' },
  antre:    { nom:'Antre',               ico:'🦴', lair:'grand' },
  gouffre:  { nom:'Gouffre',             ico:'🌋', lair:'grand' },
  cratere:  { nom:'Cratère',             ico:'🌑' },
  plaine:   { nom:'Plaine',              ico:'🌼' },
};
// Tuiles de départ révélées (anneau 1) + sac des 15 tuiles face cachée
const AV_START_TILES = { '0,-1':'marche', '1,0':'village', '-1,1':'lisiere' };
const AV_HIDDEN_BAG  = ['cercle','carriere','camp','lac','atelier','sauvage','foret','marais','grotte','collines','ruines','antre','gouffre','cratere','plaine'];
const AV_SHORTCUTS   = 3;     // nombre de tuiles reliées par un raccourci (🌀)
const AV_SHORTCUT_ICO = '🌀';

// ── MONSTRES (dés, familles et récompenses : lot 4) ──
const AV_MONSTERS = {
  gobelin:   { nom:'Gobelin chapardeur',   ico:'👺', res:2, taille:'petit' },
  loup:      { nom:'Loup affamé',          ico:'🐺', res:2, taille:'petit' },
  chauve:    { nom:'Chauve-souris géante', ico:'🦇', res:1, taille:'petit' },
  araignee:  { nom:'Araignée des bois',    ico:'🕷️', res:2, taille:'petit' },
  rat:       { nom:'Rat des égouts',       ico:'🐀', res:1, taille:'petit' },
  squelette: { nom:'Squelette',            ico:'💀', res:3, taille:'petit' },
  serpent:   { nom:'Serpent des marais',   ico:'🐍', res:2, taille:'petit' },
  follet:    { nom:'Feu follet',           ico:'👻', res:1, taille:'petit' },
  troll:     { nom:'Troll des collines',   ico:'👹', res:5, taille:'grand' },
  ours:      { nom:'Ours-garou',           ico:'🐻', res:4, taille:'grand' },
  wyverne:   { nom:'Wyverne',              ico:'🐉', res:6, taille:'grand' },
  liche:     { nom:'Liche',                ico:'☠️', res:5, taille:'grand' },
  minotaure: { nom:'Minotaure',            ico:'🐂', res:5, taille:'grand' },
  basilic:   { nom:'Basilic',              ico:'🦎', res:4, taille:'grand' },
};
const AV_MONSTER_COPIES = 2;  // exemplaires de chaque monstre dans sa pile

// Directions des voisins (hexagones « pointe sur le côté », coordonnées axiales q,r)
const AV_DIRS = [ [0,-1,'nord'], [1,-1,'nord-est'], [1,0,'sud-est'], [0,1,'sud'], [-1,1,'sud-ouest'], [-1,0,'nord-ouest'] ];

// ═══════════════════════════════════════════════════════════════════════════
//  OUTILS
// ═══════════════════════════════════════════════════════════════════════════
function avClone(o){ return JSON.parse(JSON.stringify(o)); }
function avShuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function avKey(q,r){ return q+','+r; }
function avQR(key){ const p=String(key).split(','); return [parseInt(p[0],10), parseInt(p[1],10)]; }
function avRing(q,r){ return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q-r)); }
function avNoEmoji(s){ return (typeof fNoEmoji==='function') ? fNoEmoji(s) : s; }
function avTileDef(t){ return AV_TILES[t && t.k] || { nom:'?', ico:'?' }; }
function avHeroDef(i){ return AV_HEROES[i] || { nom:'Héros '+(i+1), ini:String(i+1) }; }

// Écrit dans le DOM seulement si le contenu change (anti-clignotement, même principe que dSet)
function avSet(id, html){
  const el=document.getElementById(id); if(!el) return null;
  if(el.__avHtml !== html){ el.innerHTML = html; el.__avHtml = html; }
  return el;
}

// ── Journal : bandeau + historique. epic=true → animation de mise en avant ──
const AV_HISTORY_MAX = 150;
function avLog(st, msg, epic){
  st.seq = (st.seq||0) + 1;
  st.lastEvent = msg;
  st.history = Array.isArray(st.history) ? st.history : [];
  st.history.push({ n:st.seq, msg, turn:st.round||0, epic:!!epic });
  if(st.history.length > AV_HISTORY_MAX) st.history = st.history.slice(-AV_HISTORY_MAX);
}

// Firebase supprime les tableaux / objets vides et les null : on reconstruit à chaque lecture
function avArr(v){ return Array.isArray(v) ? v : (v ? Object.values(v) : []); }
function avNormalize(st){
  if(!st) return st;
  st.players = (st.players && typeof st.players==='object') ? st.players : {};
  st.heroes  = avArr(st.heroes);
  st.tiles   = (st.tiles && typeof st.tiles==='object') ? st.tiles : {};
  st.history = avArr(st.history);
  st.deck    = (st.deck && typeof st.deck==='object') ? st.deck : {};
  st.deck.petit = avArr(st.deck.petit);
  st.deck.grand = avArr(st.deck.grand);
  ['round','moon','cur','act','seq'].forEach(k=>{ if(typeof st[k]!=='number') st[k]=0; });
  if(st.round<1) st.round=1;
  st.heroes.forEach((h,i)=>{
    h.id = i;
    h.players = avArr(h.players);
    if(typeof h.pv!=='number')    h.pv=AV_PV_MAX;
    if(typeof h.coins!=='number') h.coins=0;
    if(!h.pos) h.pos='0,0';
    h.eq = (h.eq && typeof h.eq==='object') ? h.eq : {};
    AV_SLOTS.forEach(([s])=>{ if(!(s in h.eq)) h.eq[s]=null; });
  });
  Object.keys(st.tiles).forEach(key=>{
    const t=st.tiles[key];
    t.monsters = avArr(t.monsters);
    if(typeof t.rev!=='boolean') t.rev=false;
    if(typeof t.sc!=='boolean')  t.sc=false;
  });
  return st;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CARTE
// ═══════════════════════════════════════════════════════════════════════════
// 19 emplacements : le château au centre + 2 anneaux d'hexagones
function avPositions(){
  const out=[];
  for(let q=-2;q<=2;q++) for(let r=-2;r<=2;r++){ if(avRing(q,r)<=2) out.push(avKey(q,r)); }
  return out;
}
function avBuildMap(){
  const tiles={};
  tiles['0,0'] = { k:'chateau', rev:true, sc:false, monsters:[] };
  Object.keys(AV_START_TILES).forEach(key=>{ tiles[key]={ k:AV_START_TILES[key], rev:true, sc:false, monsters:[] }; });
  const free = avPositions().filter(key=>!tiles[key]);
  const bag  = avShuffle(AV_HIDDEN_BAG);
  free.forEach((key,i)=>{ tiles[key]={ k:bag[i], rev:false, sc:false, monsters:[] }; });
  // Le cratère (d'où sortira la Bête) va toujours sur l'anneau extérieur
  const crat = Object.keys(tiles).find(key=>tiles[key].k==='cratere');
  if(crat && avRing(...avQR(crat))<2){
    const swap = avShuffle(Object.keys(tiles).filter(key=>avRing(...avQR(key))===2 && !tiles[key].rev))[0];
    const tmp=tiles[swap].k; tiles[swap].k='cratere'; tiles[crat].k=tmp;
  }
  // Raccourcis : quelques tuiles (hors château et cratère) reliées entre elles
  avShuffle(Object.keys(tiles).filter(key=>key!=='0,0' && tiles[key].k!=='cratere'))
    .slice(0, AV_SHORTCUTS).forEach(key=>{ tiles[key].sc=true; });
  return tiles;
}
function avBuildDecks(){
  const deck={ petit:[], grand:[] };
  Object.keys(AV_MONSTERS).forEach(k=>{
    for(let i=0;i<AV_MONSTER_COPIES;i++) deck[AV_MONSTERS[k].taille].push(k);
  });
  deck.petit=avShuffle(deck.petit); deck.grand=avShuffle(deck.grand);
  return deck;
}
// Voisins existants d'une tuile (avec la direction, pour nommer les tuiles cachées)
function avNeighbors(st, key){
  const [q,r]=avQR(key);
  return AV_DIRS.map(([dq,dr,dir])=>({ key:avKey(q+dq,r+dr), dir })).filter(n=>st.tiles[n.key]);
}
// Destinations de raccourci : autres tuiles 🌀 déjà révélées (le départ doit être révélé et 🌀)
function avShortcutTargets(st, key){
  const t=st.tiles[key];
  if(!t || !t.sc || !t.rev) return [];
  const adj=avNeighbors(st,key).map(n=>n.key);
  return Object.keys(st.tiles).filter(k2=>k2!==key && st.tiles[k2].sc && st.tiles[k2].rev && !adj.includes(k2));
}
let __avMonId=0;
// Fait apparaître un monstre sur une tuile-repaire révélée, vide et non scellée
function avSpawn(st, key){
  const t=st.tiles[key]; if(!t) return null;
  const def=avTileDef(t);
  if(!def.lair || !t.rev || t.seal || t.monsters.length) return null;
  const pile=st.deck[def.lair];
  if(!pile.length){   // pile vide : on remélange une nouvelle pile complète de cette taille
    Object.keys(AV_MONSTERS).filter(k=>AV_MONSTERS[k].taille===def.lair)
      .forEach(k=>{ for(let i=0;i<AV_MONSTER_COPIES;i++) pile.push(k); });
    st.deck[def.lair]=avShuffle(pile);
  }
  const k=st.deck[def.lair].shift();
  t.monsters.push({ id:'m'+Date.now()+'_'+(__avMonId++), k, dmg:0 });
  return AV_MONSTERS[k];
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOURS
// ═══════════════════════════════════════════════════════════════════════════
function avHeroOf(st, pseudo){ const p=st.players[pseudo]; return (p && typeof p.hero==='number') ? st.heroes[p.hero] : null; }
function avHeroesAt(st, key){ return st.heroes.filter(h=>h.pos===key); }
// Joueur qui doit jouer l'action en cours. Héros partagé : 1 action chacun, l'ordre alterne à chaque tour.
function avActor(st){
  const h=st.heroes[st.cur]; if(!h || !h.players.length) return null;
  return h.players.length===1 ? h.players[0] : h.players[(st.act + st.round) % h.players.length];
}
function avCanAct(st, pseudo){ return !!st && st.active && st.phase==='play' && avActor(st)===pseudo; }

// Action consommée → action suivante, héros suivant, ou fin de tour
function avAfterAction(st){
  st.act++;
  if(st.act >= AV_ACTIONS){
    st.act=0; st.cur++;
    if(st.cur >= st.heroes.length) avEndRound(st);
  }
}
function avEndRound(st){
  st.cur=0; st.act=0;
  st.moon = Math.min(st.moon+1, AV_MOON_TRACK.length-1);
  const sym=AV_MOON_TRACK[st.moon];
  if(sym==='lair'){
    const spawned=[];
    Object.keys(st.tiles).forEach(key=>{ const m=avSpawn(st,key); if(m) spawned.push(m.ico+' '+m.nom+' ('+avTileDef(st.tiles[key]).nom+')'); });
    avLog(st, spawned.length ? '🌙 Fin du tour '+st.round+' — des monstres surgissent des repaires : '+spawned.join(', ')+'.' : '🌙 Fin du tour '+st.round+' — les repaires restent calmes.');
  } else if(sym==='heart'){
    st.heroes.forEach(h=>{ h.pv=Math.min(AV_PV_MAX, h.pv+1); });
    avLog(st, '🌙 Fin du tour '+st.round+' — la lune bienveillante soigne chaque héros de 1 PV.');
  } else if(sym==='seal'){
    avLog(st, '🌙 Fin du tour '+st.round+' — le druide quitte le cercle de pierres : plus de sceaux possibles.');
  } else if(sym==='trap'){
    avLog(st, '🌙 Fin du tour '+st.round+' — les elfes quittent leur camp : plus de pièges possibles.');
  } else if(sym==='moon'){
    st.phase='blackMoon';
    avLog(st, '🌑 La Lune Noire se lève ! Un éclat s\'écrase sur Avel…', true);
    return;
  } else {
    avLog(st, '🌙 Fin du tour '+st.round+'.');
  }
  st.round++;
}
// Nombre de fins de tour restantes avant la Lune Noire
function avMoonLeft(st){ return Math.max(0, AV_MOON_TRACK.indexOf('moon') - st.moon); }
const AV_SYM_LABEL = { lair:'👹 Apparition', heart:'❤️ Soin', seal:'🗿 Fin des sceaux', trap:'🏹 Fin des pièges', moon:'🌑 Lune Noire', none:'Rien', start:'—' };

// Récupère l'état, vérifie que c'est bien le tour de ce joueur, renvoie une copie à modifier
function avBegin(pseudo){
  if(!avCanAct(avel, pseudo)){ toast('Ce n\'est pas ton tour.'); return null; }
  return avNormalize(avClone(avel));
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIONS DES JOUEURS
// ═══════════════════════════════════════════════════════════════════════════
function avelMove(pseudo, dest){
  const st=avBegin(pseudo); if(!st) return;
  const h=avHeroOf(st,pseudo), t=st.tiles[dest];
  if(!h || !t) return;
  const adj=avNeighbors(st,h.pos).map(n=>n.key), sc=avShortcutTargets(st,h.pos);
  if(!adj.includes(dest) && !sc.includes(dest)){ toast('Cette zone n\'est pas accessible d\'ici.'); return; }
  const hn=avHeroDef(h.id).nom, viaSc=sc.includes(dest);
  let msg, bigSpawn=false;
  if(!t.rev){
    t.rev=true;
    const def=avTileDef(t);
    msg='🧭 '+pseudo+' ('+hn+') explore et découvre : '+def.ico+' '+def.nom+(t.sc?' '+AV_SHORTCUT_ICO:'')+'.';
    const m=avSpawn(st,dest);
    if(m){ msg+=' Un monstre en sort : '+m.ico+' '+m.nom+' !'; bigSpawn = m.taille==='grand'; }
  } else {
    msg='🚶 '+pseudo+' ('+hn+') '+(viaSc?'emprunte un raccourci '+AV_SHORTCUT_ICO+' vers ':'se rend à : ')+avTileDef(t).ico+' '+avTileDef(t).nom+'.';
  }
  h.pos=dest;
  avLog(st, msg, bigSpawn);   // un grand monstre qui surgit = mise en avant
  avAfterAction(st);
  fbSetAvel(st);
}
function avelRest(pseudo){
  const st=avBegin(pseudo); if(!st) return;
  const h=avHeroOf(st,pseudo); if(!h) return;
  if(h.pv>=AV_PV_MAX){ toast('Tes PV sont déjà au maximum.'); return; }
  h.pv=Math.min(AV_PV_MAX, h.pv+AV_REST_HEAL);
  avLog(st, '❤️ '+pseudo+' ('+avHeroDef(h.id).nom+') se repose. Les PV passent à '+h.pv+'/'+AV_PV_MAX+'.');
  avAfterAction(st);
  fbSetAvel(st);
}
function avelTileAction(pseudo){
  const st=avBegin(pseudo); if(!st) return;
  const h=avHeroOf(st,pseudo); if(!h) return;
  const t=st.tiles[h.pos], def=avTileDef(t);
  if(def.act!=='coins'){ toast('Cette action de lieu arrive bientôt.'); return; }
  if(t.monsters.length){ toast('Un monstre rôde ici : impossible d\'aider les habitants.'); return; }
  h.coins+=AV_COIN_GAIN;
  avLog(st, '🪙 '+pseudo+' ('+avHeroDef(h.id).nom+') aide les habitants ('+def.nom+') : +'+AV_COIN_GAIN+' pièces d\'or.');
  avAfterAction(st);
  fbSetAvel(st);
}
// Don immédiat (gratuit, pas une action) à un héros sur la même tuile, sans monstre présent
function avelGive(pseudo, toHeroId, item){
  const st=avBegin(pseudo); if(!st) return;   // uniquement pendant son tour
  const h=avHeroOf(st,pseudo), to=st.heroes[toHeroId];
  if(!h || !to || to.id===h.id) return;
  if(to.pos!==h.pos){ toast('Ce héros n\'est plus sur ta tuile.'); return; }
  if(st.tiles[h.pos].monsters.length){ toast('Impossible de faire un don avec un monstre sur la tuile.'); return; }
  const from=avHeroDef(h.id).nom, dest=avHeroDef(to.id).nom;
  if(item==='coin'){
    if(h.coins<1){ toast('Tu n\'as plus de pièce.'); return; }
    h.coins--; to.coins++;
    avLog(st, '🤝 '+pseudo+' ('+from+') donne 1 pièce d\'or à '+dest+'.');
  } else if(h.eq[item]){
    if(to.eq[item]){ toast(dest+' a déjà un objet à cet emplacement.'); return; }
    to.eq[item]=h.eq[item]; h.eq[item]=null;
    avLog(st, '🤝 '+pseudo+' ('+from+') donne son équipement ('+item+') à '+dest+'.');
  } else { toast('Choisis quoi donner.'); return; }
  fbSetAvel(st);
}
// Lit les menus déroulants au clic (le choix lui-même ne déclenche rien)
function avelMoveFromUi(pseudo){
  const sel=document.getElementById('av-move-sel');
  if(!sel || !sel.value){ toast('Choisis une zone.'); return; }
  avelMove(pseudo, sel.value);
}
function avelGiveFromUi(pseudo, toHeroId){
  const sel=document.getElementById('av-give-'+toHeroId);
  if(!sel || !sel.value){ toast('Choisis quoi donner.'); return; }
  avelGive(pseudo, toHeroId, sel.value);
}

// ═══════════════════════════════════════════════════════════════════════════
//  MENEUR : lobby, lancement, secours, clôture
// ═══════════════════════════════════════════════════════════════════════════
function startAvel(){
  fbSetAvel({ active:true, phase:'lobby', players:{}, heroes:[], tiles:{}, round:1, moon:0, cur:0, act:0, seq:0, history:[],
    lastEvent:'Les portes du château sont ouvertes : les héros peuvent rejoindre la partie.' });
  toast('Lobby des Chroniques d\'Avel ouvert !');
}
function avelJoin(pseudo){
  if(!avel || avel.phase!=='lobby') return;
  const st=avNormalize(avClone(avel));
  if(!st.players[pseudo] && Object.keys(st.players).length>=AV_MAX_PLAYERS){ toast(AV_MAX_PLAYERS+' joueurs maximum.'); return; }
  if(!st.players[pseudo]) st.players[pseudo]={ pseudo, at:Date.now(), hero:null };
  st.lastEvent=Object.keys(st.players).length+' héros prêt(s) à partir.';
  fbSetAvel(st);
}
function avelLeave(pseudo){
  if(!avel || avel.phase!=='lobby') return;
  const st=avNormalize(avClone(avel));
  delete st.players[pseudo];
  st.lastEvent=Object.keys(st.players).length+' héros prêt(s) à partir.';
  fbSetAvel(st);
}
function avelLaunch(){
  if(!avel || avel.phase!=='lobby') return;
  const st=avNormalize(avClone(avel));
  const order=Object.values(st.players).sort((a,b)=>(a.at||0)-(b.at||0)).map(p=>p.pseudo);
  if(!order.length){ toast('Il faut au moins 1 joueur.'); return; }
  const nH=Math.min(order.length, AV_MAX_HEROES);
  st.heroes=[];
  for(let i=0;i<nH;i++) st.heroes.push({ id:i, pv:AV_PV_MAX, coins:AV_START_COINS, pos:'0,0', eq:{ arme:null, bouclier:null, casque:null }, players:[] });
  order.forEach((ps,i)=>{ st.heroes[i%nH].players.push(ps); st.players[ps].hero=i%nH; });   // 7e joueur → héros 1, etc.
  st.tiles=avBuildMap(); st.deck=avBuildDecks();
  st.round=1; st.moon=avMoonStart(nH); st.cur=0; st.act=0; st.phase='play'; st.history=[]; st.seq=0; st.startedAt=Date.now();
  const sp=[];
  Object.keys(st.tiles).forEach(key=>{ const m=avSpawn(st,key); if(m) sp.push(m.ico+' '+m.nom); });
  avLog(st, '🏰 La partie commence avec '+nH+' héros ! La Lune Noire se lèvera dans '+avMoonLeft(st)+' tours.'+(sp.length?' Déjà aux portes : '+sp.join(', ')+'.':''), true);
  fbSetAvel(st);
  toast('Partie lancée avec '+order.length+' joueur(s) et '+nH+' héros !');
}
// Secours meneur : joueur absent → on passe son action, ou on le fait se reposer
function avelSkip(){
  if(!avel || avel.phase!=='play') return;
  const st=avNormalize(avClone(avel));
  const who=avActor(st);
  avLog(st, '⏭️ Le meneur passe l\'action de '+who+' ('+avHeroDef(st.cur).nom+').');
  avAfterAction(st);
  fbSetAvel(st);
}
function avelForceRest(){
  if(!avel || avel.phase!=='play') return;
  const st=avNormalize(avClone(avel));
  const h=st.heroes[st.cur], who=avActor(st);
  h.pv=Math.min(AV_PV_MAX, h.pv+AV_REST_HEAL);
  avLog(st, '❤️ '+who+' ('+avHeroDef(h.id).nom+') se repose (meneur). Les PV passent à '+h.pv+'/'+AV_PV_MAX+'.');
  avAfterAction(st);
  fbSetAvel(st);
}
function avelCancel(){
  if(!confirm('Clôturer la partie des Chroniques d\'Avel ?')) return;
  fbSetAvel(null);
  toast('Partie des Chroniques d\'Avel clôturée.');
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU : CARTE (SVG)
// ═══════════════════════════════════════════════════════════════════════════
const AV_HEX = 50;   // rayon d'un hexagone (unités SVG)
function avPix(key){ const [q,r]=avQR(key); return [AV_HEX*1.5*q, AV_HEX*Math.sqrt(3)*(r+q/2)]; }
function avHexPoints(cx,cy,s){
  const p=[]; for(let i=0;i<6;i++){ const a=Math.PI/180*60*i; p.push((cx+s*Math.cos(a)).toFixed(1)+','+(cy+s*Math.sin(a)).toFixed(1)); }
  return p.join(' ');
}
// keys : tuiles à dessiner · here : tuile du joueur · names : afficher le nom des tuiles (carte complète)
function avMapSvg(st, keys, here, names){
  const s=AV_HEX;
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  keys.forEach(k=>{ const [x,y]=avPix(k); minX=Math.min(minX,x-s); maxX=Math.max(maxX,x+s); minY=Math.min(minY,y-s*.87); maxY=Math.max(maxY,y+s*.87); });
  const pad=6, vb=(minX-pad)+' '+(minY-pad)+' '+(maxX-minX+2*pad)+' '+(maxY-minY+2*pad);
  let g='';
  keys.forEach(k=>{
    const t=st.tiles[k], [cx,cy]=avPix(k), def=avTileDef(t);
    const cls='av-hex'+(t.rev?' is-rev':' is-hidden')+(k===here?' is-here':'')+(t.k==='chateau'?' is-castle':'');
    g+='<g class="'+cls+'"><title>'+escHtml(t.rev?def.nom:'Tuile inconnue')+'</title>';
    g+='<polygon points="'+avHexPoints(cx,cy,s-2)+'"/>';
    if(!t.rev){
      g+='<text class="av-hex-q" x="'+cx+'" y="'+(cy+8)+'">?</text>';
    } else {
      g+='<text class="av-hex-ico" x="'+cx+'" y="'+(cy-s*.28)+'">'+def.ico+'</text>';
      if(names) g+='<text class="av-hex-name" x="'+cx+'" y="'+(cy-s*.02)+'">'+escHtml(def.nom)+'</text>';
      if(t.sc) g+='<text class="av-hex-sc" x="'+(cx+s*.5)+'" y="'+(cy-s*.42)+'">'+AV_SHORTCUT_ICO+'</text>';
      if(t.monsters.length){
        const my=cy+s*.56, d=s*.15;
        g+='<polygon class="av-mon" points="'+cx+','+(my-d)+' '+(cx+d)+','+my+' '+cx+','+(my+d)+' '+(cx-d)+','+my+'"/>';
        if(t.monsters.length>1) g+='<text class="av-mon-n" x="'+cx+'" y="'+(my+4)+'">'+t.monsters.length+'</text>';
      }
    }
    const hs=avHeroesAt(st,k);
    if(hs.length){
      const gap=s*.3, y=cy+s*.2, x0=cx-gap*(hs.length-1)/2;
      hs.forEach((h,i)=>{
        const x=x0+gap*i;
        g+='<circle class="av-hero-dot" cx="'+x+'" cy="'+y+'" r="'+(s*.13)+'" style="fill:var(--hero-'+(h.id+1)+')"/>'+
           '<text class="av-hero-ini" x="'+x+'" y="'+(y+4)+'">'+avHeroDef(h.id).ini+'</text>';
      });
    }
    g+='</g>';
  });
  return '<svg class="av-map-svg'+(names?' is-full':'')+'" viewBox="'+vb+'" role="img" aria-label="Carte d\'Avel">'+g+'</svg>';
}
function avLegendHtml(){
  return '<div class="av-legend">'+
    '<span class="av-legend-item"><span class="av-legend-dot"></span>Héros</span>'+
    '<span class="av-legend-item"><span class="av-legend-mon"></span>Monstre</span>'+
    '<span class="av-legend-item"><span class="av-legend-sc">'+AV_SHORTCUT_ICO+'</span>Raccourci</span>'+
    '<span class="av-legend-item"><span class="av-legend-q">?</span>Inconnu</span>'+
  '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU : PASTILLES, JOUEURS, DERNIÈRE ACTION
// ═══════════════════════════════════════════════════════════════════════════
function avStatusPills(st){
  const left=avMoonLeft(st), next=AV_MOON_TRACK[Math.min(st.moon+1, AV_MOON_TRACK.length-1)];
  const moon = st.phase==='blackMoon' ? 'Lune Noire <strong>levée</strong>' : ('Lune Noire dans <strong>'+left+' tour'+(left>1?'s':'')+'</strong>');
  return '<div class="dpill">Tour <strong>'+st.round+'</strong></div>'+
         '<div class="dpill">'+moon+'</div>'+
         (st.phase==='play' ? '<div class="dpill">Fin du tour <strong>'+(AV_SYM_LABEL[next]||'—')+'</strong></div>' : '');
}
function avHeroDot(id){ return '<span class="av-dot" style="background:var(--hero-'+(id+1)+')">'+avHeroDef(id).ini+'</span>'; }
// Liste des joueurs. Clic sur un joueur d'un AUTRE héros → modale de détail.
function avPlayersHtml(st, mePseudo){
  const me=avHeroOf(st,mePseudo), actor=avActor(st);
  const rows=[];
  st.heroes.forEach(h=>{
    h.players.forEach(ps=>{
      const isMe=ps===mePseudo, mine=me && me.id===h.id;
      const click=(!mine) ? ' av-clickable" role="button" tabindex="0" onclick="avelShowHero('+h.id+')" onkeydown="if(event.key===\'Enter\')avelShowHero('+h.id+')' : '';
      let status='';
      if(st.phase==='play' && ps===actor) status='<span class="player-status">à son tour</span>';
      rows.push('<div class="player-row'+(isMe?' is-current':'')+click+'">'+
        '<span class="player-name">'+escHtml(ps)+'</span>'+
        '<span class="player-infos">'+avHeroDot(h.id)+'<span class="player-info">❤️ '+h.pv+'/'+AV_PV_MAX+'</span></span>'+
        status+'</div>');
    });
  });
  return rows.join('');
}

// Dernière action (« toaster » de la carte Joueurs) : file d'attente côté navigateur.
// Chaque message reste affiché un minimum de temps, même si un joueur enchaîne ses actions.
const AV_TOAST_MS = 2600, AV_TOAST_EPIC_MS = 4200;
let avToastSeen=null, avToastQueue=[], avToastBusy=false, avToastGame=null;
function avFeedToast(st){
  const hist=st.history||[];
  const gameId = st.startedAt || 'lobby';
  if(avToastGame!==gameId){ avToastGame=gameId; avToastSeen=null; avToastQueue=[]; }
  const last=hist[hist.length-1];
  if(avToastSeen===null){   // premier affichage : on montre le dernier message, sans animation
    avToastSeen = last ? last.n : 0;
    avShowToast(last ? last : { msg:st.lastEvent||'' }, false);
    return;
  }
  hist.filter(e=>e.n>avToastSeen).forEach(e=>avToastQueue.push(e));
  if(last) avToastSeen=Math.max(avToastSeen, last.n);
  avPumpToast();
}
function avShowToast(e, animate){
  const el=document.getElementById('av-toast'); if(!el) return;
  el.className='av-toast'+(e.epic?' is-epic':'')+(animate?' is-enter':'')+(e.msg?'':' is-empty');
  el.textContent=e.msg||'';
  if(animate){ void el.offsetWidth; }
}
function avPumpToast(){
  if(avToastBusy || !avToastQueue.length) return;
  const e=avToastQueue.shift();
  avToastBusy=true;
  avShowToast(e, true);
  setTimeout(()=>{ avToastBusy=false; avPumpToast(); }, e.epic?AV_TOAST_EPIC_MS:AV_TOAST_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU : VUE JOUEUR
// ═══════════════════════════════════════════════════════════════════════════
function avBtn(cls, label, onclick, disabled, title){
  return '<button class="'+cls+'"'+(disabled?' disabled':' onclick="'+onclick+'"')+(title?' title="'+escHtml(title)+'"':'')+'>'+label+'</button>';
}
// Garde les choix des menus déroulants quand la zone est redessinée
function avKeepSelects(id, fn){
  const el=document.getElementById(id), keep={};
  if(el) el.querySelectorAll('select[id]').forEach(s=>{ keep[s.id]=s.value; });
  fn();
  Object.keys(keep).forEach(sid=>{
    const s=document.getElementById(sid);
    if(s && keep[sid] && [...s.options].some(o=>o.value===keep[sid])) s.value=keep[sid];
  });
}
function avActionsHtml(st, pseudo){
  const h=avHeroOf(st,pseudo), esc=escAttr(pseudo), my=avCanAct(st,pseudo);
  const t=st.tiles[h.pos], def=avTileDef(t);
  let z='';

  // Déplacement : voisins (cachés → « Inconnu (direction) ») + raccourcis
  const opts=avNeighbors(st,h.pos).map(n=>{
    const nt=st.tiles[n.key];
    return '<option value="'+n.key+'">'+escHtml(nt.rev ? avTileDef(nt).nom+' ('+n.dir+')' : 'Inconnu ('+n.dir+')')+'</option>';
  }).concat(avShortcutTargets(st,h.pos).map(k=>'<option value="'+k+'">'+AV_SHORTCUT_ICO+' '+escHtml(avTileDef(st.tiles[k]).nom)+' (raccourci)</option>'));
  z+='<div class="section-title">Déplacement</div>'+
     '<div class="action-row"><span class="action-row-label"><select class="dd" id="av-move-sel"><option value="">Choisir une zone</option>'+opts.join('')+'</select></span>'+
     avBtn('btn-secondary','Se déplacer','avelMoveFromUi(\''+esc+'\')',!my)+'</div>';

  // Sur ma tuile : autres héros (don immédiat), monstres, lieu
  z+='<div class="section-title">Sur ma tuile</div>';
  const others=avHeroesAt(st,h.pos).filter(o=>o.id!==h.id), monsterHere=t.monsters.length>0;
  others.forEach(o=>{
    const gopts=(h.coins>0?['<option value="coin">Pièce d\'or ('+h.coins+')</option>']:[])
      .concat(AV_SLOTS.filter(([s])=>h.eq[s]).map(([s,l])=>'<option value="'+s+'">'+l+'</option>'));
    const can=my && !monsterHere && gopts.length>0;
    z+='<div class="action-row"><span class="action-row-label">'+avHeroDot(o.id)+' '+escHtml(avHeroDef(o.id).nom)+' <span class="action-row-sub">('+escHtml(o.players.join(', '))+')</span></span>'+
       '<span class="action-row-ctrl"><select class="dd" id="av-give-'+o.id+'"'+(can?'':' disabled')+'>'+(gopts.length?gopts.join(''):'<option value="">Rien à donner</option>')+'</select>'+
       avBtn('btn-secondary','Donner','avelGiveFromUi(\''+esc+'\','+o.id+')',!can, monsterHere?'Impossible avec un monstre sur la tuile':(!my?'Seulement pendant ton tour':''))+'</span></div>';
  });
  t.monsters.forEach(m=>{
    const md=AV_MONSTERS[m.k]||{nom:'?',ico:'?',res:0};
    z+='<div class="action-row"><span class="action-row-label">'+md.ico+' '+escHtml(md.nom)+' <span class="action-row-sub">résistance '+(md.res-(m.dmg||0))+'/'+md.res+'</span></span>'+
       avBtn('btn-secondary','Combattre','',true,'Le combat arrive au prochain lot')+'</div>';
  });
  const coinsOk = def.act==='coins' && !monsterHere;
  let hint;
  if(def.act==='coins') hint = monsterHere ? 'Un monstre rôde : impossible d\'aider les habitants.' : 'Aider les habitants : +'+AV_COIN_GAIN+' pièces d\'or.';
  else hint = def.act==='soon' ? 'Bientôt disponible.' : 'Aucune action ici.';
  z+='<div class="action-row"><span class="action-row-label">Lieu : '+def.ico+' '+escHtml(def.nom)+(t.sc?' '+AV_SHORTCUT_ICO:'')+
     ' <span class="action-row-sub">'+hint+'</span></span>'+
     avBtn('btn-secondary','Action de lieu','avelTileAction(\''+esc+'\')', !(my && coinsOk))+'</div>';
  return z;
}
function avInventoryHtml(h){
  return '<div class="section-title">Mon inventaire</div>'+
    '<div class="stat-row"><span>Pièces d\'or</span><strong>'+h.coins+'</strong></div>'+
    AV_SLOTS.map(([s,l])=>'<div class="stat-row"><span>'+l+'</span><strong>'+(h.eq[s]?escHtml(h.eq[s]):'Vide')+'</strong></div>').join('');
}

function renderAvelViewer(pseudo){
  const wrap=document.getElementById('viewer-avel'); if(!wrap) return;
  if(!avel || !avel.active){ wrap.style.display='none'; avToastSeen=null; return; }
  wrap.style.display='block';
  const idle=document.getElementById('viewer-idle'); if(idle) idle.style.display='none';
  const st=avel, esc=escAttr(pseudo), lobby=document.getElementById('av-lobby'), board=document.getElementById('av-board');

  if(st.phase==='lobby'){
    avSet('av-status',''); avSet('av-instruction',''); avSet('av-players','');
    board.style.display='none'; lobby.style.display='block';
    const me=st.players[pseudo], n=Object.keys(st.players).length;
    avSet('av-lobby', me
      ? '<div class="diamant-voted">✓ Tu fais partie de l\'expédition ('+n+' joueur'+(n>1?'s':'')+'). En attente du lancement par le meneur…</div><button class="btn-secondary u-full" onclick="avelLeave(\''+esc+'\')">Quitter le lobby</button>'
      : '<div class="diamant-voted">🏰 La reine appelle des héros ! Rejoins l\'expédition avant le lancement.</div><button class="btn-primary-continue u-full" onclick="avelJoin(\''+esc+'\')">Rejoindre</button>');
    avShowToast({ msg:st.lastEvent||'' }, false);
    return;
  }

  avSet('av-status', avStatusPills(st));
  avSet('av-players', avPlayersHtml(st, pseudo));
  avFeedToast(st);
  const h=avHeroOf(st,pseudo);
  if(!h){
    board.style.display='none'; lobby.style.display='block';
    avSet('av-instruction','');
    avSet('av-lobby','<div class="diamant-voted">👀 Une partie est en cours. Tu joueras à la prochaine ! Clique sur un joueur pour suivre son héros.</div>'+
      '<button class="btn-secondary u-full" onclick="avelShowMap()">Voir toute la carte</button>');
    avRefreshModal();
    return;
  }
  lobby.style.display='none'; board.style.display='block';

  // Consigne
  let ins;
  if(st.phase==='blackMoon') ins='🌑 La Lune Noire s\'est levée. La suite de l\'aventure arrive bientôt…';
  else {
    const actor=avActor(st), cur=st.heroes[st.cur], k=st.act+1;
    if(actor===pseudo){
      const mate=h.players.filter(p=>p!==pseudo);
      ins='⏳ <strong>C\'est ton tour</strong> — action '+k+'/'+AV_ACTIONS+(mate.length&&h.players.length>1?' <span class="t-warm-sm">(avec '+escHtml(mate.join(', '))+')</span>':'');
    } else if(cur && cur.id===h.id){
      ins='⏳ Ton héros joue : <strong>'+escHtml(actor)+'</strong> fait l\'action '+k+'/'+AV_ACTIONS+'.';
    } else {
      ins='En attente de <strong>'+escHtml(actor||'?')+'</strong> ('+escHtml(avHeroDef(st.cur).nom)+') — action '+k+'/'+AV_ACTIONS+'.';
    }
  }
  avSet('av-instruction', ins);

  // Aperçu de carte : ma tuile + voisins
  const keys=[h.pos].concat(avNeighbors(st,h.pos).map(n=>n.key));
  avSet('av-map', avMapSvg(st, keys, h.pos, false)+avLegendHtml());

  const my=avCanAct(st,pseudo);
  avSet('av-cta',
    avBtn('btn-primary-continue','Repos (+'+AV_REST_HEAL+' PV)','avelRest(\''+esc+'\')', !my || h.pv>=AV_PV_MAX, h.pv>=AV_PV_MAX?'PV déjà au maximum':'')+
    '<button class="btn-secondary" onclick="avelShowMap()">Voir toute la carte</button>');
  avKeepSelects('av-actions', ()=>avSet('av-actions', avActionsHtml(st, pseudo)));
  avSet('av-inventory', avInventoryHtml(h));
  avRefreshModal();
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU : VUE MENEUR (sans emoji)
// ═══════════════════════════════════════════════════════════════════════════
function renderAvelAdmin(){
  const panel=document.getElementById('avel-panel'); if(!panel) return;
  if(!avel || !avel.active){ panel.style.display='none'; renderGameLibrary(); return; }
  panel.style.display='block';
  const st=avel, nP=Object.keys(st.players).length;
  let status, players, ctrl;
  if(st.phase==='lobby'){
    status='<div class="dpill">Lobby ouvert</div><div class="dpill">Joueurs <strong>'+nP+'</strong></div>';
    players=Object.values(st.players).sort((a,b)=>(a.at||0)-(b.at||0)).map(p=>'<div class="player-row"><span class="player-name">'+escHtml(p.pseudo)+'</span></div>').join('');
    const nH=Math.min(nP,AV_MAX_HEROES);
    ctrl='<div class="diamant-voted">'+nP+' joueur(s) → '+nH+' héros'+(nP>AV_MAX_HEROES?' (certains héros seront partagés à 2)':'')+'. Maximum '+AV_MAX_PLAYERS+' joueurs.</div>'+
      '<button class="btn-primary" onclick="avelLaunch()"'+(nP?'':' disabled')+'>Lancer la partie'+(nP?' ('+nP+')':'')+'</button>'+
      '<button class="btn-primary-danger u-mt-sm" onclick="avelCancel()">Fermer le lobby</button>';
  } else {
    status=avStatusPills(st);
    players=st.heroes.map(h=>{
      const t=st.tiles[h.pos], cur=st.phase==='play' && st.cur===h.id;
      return '<div class="player-row'+(cur?' is-current':'')+'">'+
        '<span class="player-name">'+escHtml(avHeroDef(h.id).nom)+' — '+escHtml(h.players.join(', '))+'</span>'+
        '<span class="player-infos"><span class="player-info">PV '+h.pv+'/'+AV_PV_MAX+'</span><span class="player-info">Or '+h.coins+'</span><span class="player-info">'+escHtml(avTileDef(t).nom)+'</span></span>'+
        (cur?'<span class="player-status">à son tour</span>':'')+'</div>';
    }).join('');
    if(st.phase==='play'){
      ctrl='<div class="diamant-voted">Au tour de <strong>'+escHtml(avActor(st)||'?')+'</strong> ('+escHtml(avHeroDef(st.cur).nom)+') — action '+(st.act+1)+'/'+AV_ACTIONS+'. En cas d\'absence :</div>'+
        '<div class="diamant-vote-btns"><button class="btn-secondary" onclick="avelForceRest()">Le faire se reposer</button><button class="btn-secondary" onclick="avelSkip()">Passer son action</button></div>'+
        '<button class="btn-primary-danger u-mt-sm" onclick="avelCancel()">Abandonner la partie</button>';
    } else {
      ctrl='<div class="diamant-voted">La Lune Noire s\'est levée : fin du contenu disponible pour l\'instant (la Bête arrive au lot 6).</div>'+
        '<button class="btn-primary-danger" onclick="avelCancel()">Clôturer la partie</button>';
    }
  }
  avSet('aa-status', avNoEmoji(status));
  avSet('aa-event', avNoEmoji(escHtml(st.lastEvent||'')));
  avSet('aa-players', avNoEmoji(players));
  avSet('aa-controls', avNoEmoji(ctrl));
  renderGameLibrary();
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODALES (une seule boîte, contenu rafraîchi en direct)
// ═══════════════════════════════════════════════════════════════════════════
let avModal=null;   // { type:'rules'|'history'|'map'|'hero', id }
function avOpenModal(type, id){ avModal={ type, id }; avRefreshModal(); const m=document.getElementById('avel-modal'); if(m) m.style.display='flex'; }
function avelHideModal(){ avModal=null; const m=document.getElementById('avel-modal'); if(m) m.style.display='none'; }
function avelShowRules(){ avOpenModal('rules'); }
function avelShowHistory(){ avOpenModal('history'); }
function avelShowMap(){ avOpenModal('map'); }
function avelShowHero(id){ avOpenModal('hero', id); }
function avRefreshModal(){
  if(!avModal) return;
  if(avModal.type!=='rules' && (!avel || avel.phase==='lobby')){ avelHideModal(); return; }
  let h='';
  if(avModal.type==='rules') h=avRulesHtml();
  else if(avModal.type==='history') h=avHistoryHtml(avel);
  else if(avModal.type==='map'){
    const me=avHeroOf(avel, currentViewerPseudo);
    h='<h2 class="rules-title">Carte d\'Avel</h2><div class="av-map is-full">'+avMapSvg(avel, Object.keys(avel.tiles), me?me.pos:null, true)+avLegendHtml()+'</div>'+
      '<div class="av-map-heroes">'+avel.heroes.map(x=>'<span class="av-map-hero">'+avHeroDot(x.id)+' '+escHtml(avHeroDef(x.id).nom)+' <span class="action-row-sub">'+escHtml(x.players.join(', '))+'</span></span>').join('')+'</div>';
  }
  else if(avModal.type==='hero') h=avHeroDetailHtml(avel, avModal.id);
  avSet('avel-modal-content', h);
}
function avHeroDetailHtml(st, id){
  const x=st.heroes[id]; if(!x) return '';
  const t=st.tiles[x.pos], def=avTileDef(t);
  return '<h2 class="rules-title">'+avHeroDot(x.id)+' '+escHtml(avHeroDef(x.id).nom)+'</h2>'+
    '<div class="stat-row"><span>Joué par</span><strong>'+escHtml(x.players.join(', '))+'</strong></div>'+
    '<div class="stat-row"><span>Points de vie</span><strong>❤️ '+x.pv+'/'+AV_PV_MAX+'</strong></div>'+
    '<div class="stat-row"><span>Position</span><strong>'+def.ico+' '+escHtml(def.nom)+'</strong></div>'+
    '<div class="stat-row"><span>Pièces d\'or</span><strong>'+x.coins+'</strong></div>'+
    AV_SLOTS.map(([s,l])=>'<div class="stat-row"><span>'+l+'</span><strong>'+(x.eq[s]?escHtml(x.eq[s]):'Vide')+'</strong></div>').join('');
}
function avHistoryHtml(st){
  const hist=st.history||[];
  let h='<h2 class="rules-title">📋 Historique des actions</h2>';
  if(!hist.length) return h+'<p>Aucune action pour l\'instant.</p>';
  return h+'<div class="hist-list">'+hist.slice().reverse().map(a=>
    '<div class="hist-row"><span class="hist-msg">'+escHtml(a.msg||'')+'</span><span class="hist-turn">T'+(a.turn||'?')+'</span></div>').join('')+'</div>';
}
function avRulesHtml(){
  return '<h2 class="rules-title">Chroniques d\'Avel — Comment jouer</h2>'+
  '<div class="rules-section"><h3>🎯 Le but</h3><ul>'+
    '<li>Jeu <strong>coopératif</strong> : tous les héros gagnent ou perdent ensemble.</li>'+
    '<li>Explorez les terres autour du château, équipez-vous et préparez-vous : quand la <strong>Lune Noire</strong> se lèvera, la Bête marchera sur le château avec tous les monstres.</li>'+
    '<li>Si un seul monstre entre dans le château, la partie est perdue.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🧙 Les héros</h3><ul>'+
    '<li>Jusqu\'à '+AV_MAX_HEROES+' héros. Au-delà de '+AV_MAX_HEROES+' joueurs, deux joueurs se partagent un héros : chacun joue <strong>1 des 2 actions</strong>, et l\'ordre alterne à chaque tour.</li>'+
    '<li>Chaque héros a '+AV_PV_MAX+' PV et commence au château avec '+AV_START_COINS+' pièce d\'or.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🔄 Un tour</h3><ul>'+
    '<li>Les héros jouent chacun leur tour, dans l\'ordre de la liste.</li>'+
    '<li>À ton tour : <strong>'+AV_ACTIONS+' actions</strong> au choix, tu peux refaire la même :</li>'+
    '<li>🚶 <strong>Se déplacer</strong> vers une tuile voisine. Une tuile cachée se révèle à ton arrivée ; si c\'est un repaire, un monstre en sort.</li>'+
    '<li>'+AV_SHORTCUT_ICO+' <strong>Raccourci</strong> : depuis une tuile '+AV_SHORTCUT_ICO+' révélée, tu peux aller directement sur une autre tuile '+AV_SHORTCUT_ICO+' révélée.</li>'+
    '<li>❤️ <strong>Repos</strong> : +'+AV_REST_HEAL+' PV (maximum '+AV_PV_MAX+').</li>'+
    '<li>🏠 <strong>Action de lieu</strong> : au village abandonné et dans les terres sauvages, aide les habitants pour +'+AV_COIN_GAIN+' pièces (impossible si un monstre est là). Les autres lieux arrivent bientôt.</li>'+
    '<li>⚔️ <strong>Combat</strong> : arrive bientôt.</li>'+
    '<li>🤝 <strong>Don</strong> : gratuit (ce n\'est pas une action). Pendant ton tour, donne une pièce ou un équipement à un héros sur ta tuile, s\'il n\'y a pas de monstre.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🌙 La piste lunaire</h3><p>À la fin de chaque tour, la lune avance d\'une case :</p><ul>'+
    '<li>👹 <strong>Apparition</strong> : un monstre surgit sur chaque repaire révélé et vide.</li>'+
    '<li>❤️ <strong>Soin</strong> : chaque héros récupère 1 PV.</li>'+
    '<li>🗿 / 🏹 <strong>Fermetures</strong> : certains lieux ne proposent plus leur service.</li>'+
    '<li>🌑 <strong>Lune Noire</strong> : la Bête apparaît. La pastille « Lune Noire dans N tours » vous dit combien de tours il reste.</li>'+
  '</ul><p class="rules-note">Combat, équipement, sac à dos et la Bête arrivent dans les prochaines versions.</p></div>';
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') avelHideModal(); });
}