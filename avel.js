// ══════════════════════════════════════════════════════════════════════════
//  CHRONIQUES D'AVEL — jeu coopératif d'exploration (inspiré de Chronicles of Avel)
//  LOTS 1-3 : lobby, héros (partagés au-delà de 6 joueurs), TOUR LIBRE avec
//  minuteur (chacun joue ses actions quand il veut), carte hexagonale,
//  piste lunaire, équipement + sac à dos à volume, tirage « 3 objets, on en
//  garde 1 », et les lieux (marché, atelier, cercle, carrière, camp, lac, village).
//  À VENIR : combat (lot 4), Lune Noire / la Bête (lot 6), finitions + stream (lot 7).
//  Nœud Firebase : « avel » (doit être autorisé dans les règles de la base).
//  Toutes les modifications passent par fbTxAvel (transaction) : deux joueurs
//  qui cliquent en même temps ne s'écrasent pas.
// ══════════════════════════════════════════════════════════════════════════

// ── LEVIERS D'ÉQUILIBRAGE (ajustables) ──
const AV_MAX_PLAYERS = 12;
const AV_MAX_HEROES  = 6;     // au-delà, 2 joueurs se partagent un héros (1 action chacun)
const AV_PV_MAX      = 5;     // points de vie d'un héros
const AV_REST_HEAL   = 2;     // PV rendus par l'action Repos
const AV_START_COINS = 1;     // pièces d'or au départ
const AV_COIN_GAIN   = 2;     // pièces gagnées au village / dans les terres sauvages
const AV_ACTIONS     = 2;     // actions par héros et par tour
const AV_ROUND_SECS  = 180;   // durée par défaut d'un tour (le meneur peut la changer)
const AV_ROUND_CHOICES = [60, 120, 180, 300];
const AV_PICK_SECS   = 10;    // temps pour choisir 1 objet parmi 3
const AV_PICK_COUNT  = 3;

// Sac à dos : capacité et volume de chaque chose (les objets PORTÉS ne prennent pas de place)
const AV_BAG_CAP = 6;
const AV_VOL = { coin:1, equip:2, elixir:1 };

// Prix des lieux
const AV_PRICE = { buy:3, sell:2, upgrade:3, seal:3, wall:3, lake:1, lakeCoins:4 };
const AV_TRAP_COSTS = [3, 5, 7, 9];   // 3 pièges (4 à partir de 5 héros)
// Sceaux, murailles et pièges disponibles : 3 (4 à partir de 5 héros)
function avLimit(nHeroes){ return nHeroes>=5 ? 4 : 3; }

// Piste lunaire : on avance d'une case à chaque fin de tour, puis on applique le symbole.
//   lair = apparition des monstres · heart = +1 PV pour tous · seal / trap = fermeture du
//   cercle de pierres / du camp des elfes · moon = la Lune Noire se lève · none = rien
const AV_MOON_TRACK = ['start','lair','heart','lair','none','lair','heart','lair','seal','lair','trap','moon'];
function avMoonStart(nHeroes){ return nHeroes<=2 ? 0 : (nHeroes<=4 ? 1 : 2); }

// ── DÉS (6 faces) : att = attaque · def = défense · sort (= attaque au lac, au choix en combat) · vide ──
const AV_DICE = {
  vert:   ['att','att','def','def','sort','vide'],
  orange: ['att','att','att','def','vide','vide'],
  bleu:   ['def','def','def','att','vide','vide'],
  jaune:  ['sort','sort','sort','att','def','vide'],
  violet: ['att','att','def','vide','vide','vide'],
  noir:   ['att','att','att','def','def','vide'],
};
const AV_FACE_ICO = { att:'⚔️', def:'🛡️', sort:'✨', vide:'∅' };
function avRoll(color){ const f=AV_DICE[color]; return f[Math.floor(Math.random()*f.length)]; }

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

// ── FAMILLES DE MONSTRES (certains objets sont plus efficaces contre une famille) ──
const AV_FAMS = {
  bete:   { nom:'Bêtes',   ico:'🐾' },
  maudit: { nom:'Maudits', ico:'💀' },
  brute:  { nom:'Brutes',  ico:'👹' },
};

// ── ÉQUIPEMENT (effets appliqués au combat, lot 4) ──
// slot : arme / bouclier / casque / elixir · base / up : effet de base / amélioré
const AV_ITEMS = {
  epee:     { nom:'Épée rouillée',        slot:'arme',     ico:'🗡️', base:'+1 dé orange', up:'+2 dés orange' },
  hache:    { nom:'Hache du bûcheron',    slot:'arme',     ico:'🪓', base:'+1 ⚔️ contre 🐾 (1× par combat)', up:'+1 dé orange, et +1 ⚔️ contre 🐾' },
  masse:    { nom:'Masse bénie',          slot:'arme',     ico:'🔨', base:'+1 ⚔️ contre 💀 (1× par combat)', up:'+1 dé orange, et +1 ⚔️ contre 💀' },
  lance:    { nom:'Lance de chasse',      slot:'arme',     ico:'🔱', base:'+1 ⚔️ contre 👹 (1× par combat)', up:'+1 dé orange, et +1 ⚔️ contre 👹' },
  baton:    { nom:'Bâton de sorcier',     slot:'arme',     ico:'🔮', base:'+1 dé jaune', up:'+2 dés jaunes' },
  dague:    { nom:'Dague',                slot:'arme',     ico:'🔪', base:'Relancer 1 dé vert (1× par combat)', up:'Relancer 2 dés au choix (1× par combat)' },
  rondache: { nom:'Rondache',             slot:'bouclier', ico:'🛡️', base:'+1 dé bleu', up:'+2 dés bleus' },
  pavois:   { nom:'Pavois',               slot:'bouclier', ico:'🛡️', base:'+1 🛡️ contre 👹 (1× par combat)', up:'+1 dé bleu, et +1 🛡️ contre 👹' },
  runique:  { nom:'Bouclier runique',     slot:'bouclier', ico:'🛡️', base:'+1 🛡️ contre 💀 (1× par combat)', up:'+1 dé bleu, et +1 🛡️ contre 💀' },
  ecu:      { nom:'Écu de cuir',          slot:'bouclier', ico:'🛡️', base:'+1 🛡️ contre 🐾 (1× par combat)', up:'+1 dé bleu, et +1 🛡️ contre 🐾' },
  targe:    { nom:'Targe',                slot:'bouclier', ico:'🛡️', base:'Faire relancer 1 dé violet au monstre (1× par combat)', up:'Faire relancer 1 dé noir au monstre (1× par combat)' },
  heaume:   { nom:'Heaume',               slot:'casque',   ico:'⛑️', base:'Relancer 1 dé vert (1× par combat)', up:'+1 dé vert' },
  capuche:  { nom:'Capuche de mage',      slot:'casque',   ico:'🎩', base:'+1 dé jaune', up:'+1 dé jaune, et relancer 1 dé jaune' },
  cornes:   { nom:'Casque à cornes',      slot:'casque',   ico:'🐏', base:'+1 ⚔️ (1× par combat)', up:'+1 dé orange' },
  couronne: { nom:'Couronne de feuilles', slot:'casque',   ico:'🍃', base:'+1 PV après chaque combat gagné', up:'+2 PV après chaque combat gagné' },
  elixForce:  { nom:'Élixir de force',    slot:'elixir',   ico:'🧪', base:'+1 dé orange à chaque affrontement d\'un combat' },
  elixGarde:  { nom:'Élixir de garde',    slot:'elixir',   ico:'🧪', base:'+1 dé bleu à chaque affrontement d\'un combat' },
  elixArcane: { nom:'Élixir des arcanes', slot:'elixir',   ico:'🧪', base:'+1 dé jaune à chaque affrontement d\'un combat' },
  soin:       { nom:'Potion de soin',     slot:'elixir',   ico:'🍶', base:'Soigne tous les PV (hors combat)' },
};
const AV_COPIES = { equip:2, elixir:3 };   // exemplaires de chaque objet dans la pioche (42 au total)

// ── TUILES ──
// lair : repaire de monstres (petit / grand) · act : action de lieu
const AV_TILES = {
  chateau:  { nom:'Château',             ico:'🏰' },
  marche:   { nom:'Marché',              ico:'🛒', act:'marche' },
  village:  { nom:'Village abandonné',   ico:'🏚️', act:'coins' },
  lisiere:  { nom:'Lisière',             ico:'🌳', lair:'petit' },
  sauvage:  { nom:'Terres sauvages',     ico:'🌾', lair:'petit', act:'coins' },
  cercle:   { nom:'Cercle de pierres',   ico:'🗿', act:'cercle' },
  carriere: { nom:'Carrière',            ico:'⛏️', act:'carriere' },
  camp:     { nom:'Camp des elfes',      ico:'🏹', act:'camp' },
  lac:      { nom:'Lac aux souhaits',    ico:'🏞️', act:'lac' },
  atelier:  { nom:'Atelier d\'alchimie', ico:'⚗️', act:'atelier' },
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
const AV_START_TILES = { '0,-1':'marche', '1,0':'village', '-1,1':'lisiere' };
const AV_HIDDEN_BAG  = ['cercle','carriere','camp','lac','atelier','sauvage','foret','marais','grotte','collines','ruines','antre','gouffre','cratere','plaine'];
const AV_SHORTCUTS   = 3;
const AV_ICO = { shortcut:'🌀', seal:'🔒', trap:'⛓️', wall:'🧱' };

// ── MONSTRES (dés et récompenses : lot 4) ──
const AV_MONSTERS = {
  gobelin:   { nom:'Gobelin chapardeur',   ico:'👺', res:2, taille:'petit', fam:'brute' },
  loup:      { nom:'Loup affamé',          ico:'🐺', res:2, taille:'petit', fam:'bete' },
  chauve:    { nom:'Chauve-souris géante', ico:'🦇', res:1, taille:'petit', fam:'bete' },
  araignee:  { nom:'Araignée des bois',    ico:'🕷️', res:2, taille:'petit', fam:'maudit' },
  rat:       { nom:'Rat des égouts',       ico:'🐀', res:1, taille:'petit', fam:'bete' },
  squelette: { nom:'Squelette',            ico:'💀', res:3, taille:'petit', fam:'maudit' },
  serpent:   { nom:'Serpent des marais',   ico:'🐍', res:2, taille:'petit', fam:'bete' },
  follet:    { nom:'Feu follet',           ico:'👻', res:1, taille:'petit', fam:'maudit' },
  troll:     { nom:'Troll des collines',   ico:'👹', res:5, taille:'grand', fam:'brute' },
  ours:      { nom:'Ours-garou',           ico:'🐻', res:4, taille:'grand', fam:'bete' },
  wyverne:   { nom:'Wyverne',              ico:'🐉', res:6, taille:'grand', fam:'brute' },
  liche:     { nom:'Liche',                ico:'☠️', res:5, taille:'grand', fam:'maudit' },
  minotaure: { nom:'Minotaure',            ico:'🐂', res:5, taille:'grand', fam:'brute' },
  basilic:   { nom:'Basilic',              ico:'🦎', res:4, taille:'grand', fam:'bete' },
};
const AV_MONSTER_COPIES = 2;

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
function avItemDef(it){ return AV_ITEMS[it && it.k] || { nom:'?', slot:'elixir', ico:'?', base:'' }; }
function avIsElixir(it){ return avItemDef(it).slot==='elixir'; }
// Heure commune à tous les écrans (heure du serveur Firebase si connue)
function avNow(){ return Date.now() + ((typeof window!=='undefined' && window.FB_OFFSET) ? window.FB_OFFSET : 0); }

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
  st.pool    = avArr(st.pool);
  st.deck    = (st.deck && typeof st.deck==='object') ? st.deck : {};
  st.deck.petit = avArr(st.deck.petit);
  st.deck.grand = avArr(st.deck.grand);
  st.traps   = avArr(st.traps).filter(t=>t && typeof t.type==='number');   // pièges posés { type, tile }
  ['round','moon','seq','deadline','walls','seals','limit'].forEach(k=>{ if(typeof st[k]!=='number') st[k]=0; });
  if(typeof st.roundSecs!=='number') st.roundSecs=AV_ROUND_SECS;
  if(st.round<1) st.round=1;
  Object.values(st.players).forEach(p=>{ if(typeof p.acts!=='number') p.acts=0; if(typeof p.hero!=='number') p.hero=null; });
  st.heroes.forEach((h,i)=>{
    h.id = i;
    h.players = avArr(h.players);
    if(typeof h.pv!=='number')    h.pv=AV_PV_MAX;
    if(typeof h.coins!=='number') h.coins=0;
    if(typeof h.upg!=='number')   h.upg=0;
    if(!h.pos) h.pos='0,0';
    h.eq  = (h.eq && typeof h.eq==='object') ? h.eq : {};
    AV_SLOTS.forEach(([s])=>{ if(!h.eq[s]) h.eq[s]=null; });
    h.bag = avArr(h.bag);
    if(h.pick){ h.pick.opts=avArr(h.pick.opts); if(!h.pick.opts.length) h.pick=null; }
    else h.pick=null;
    if(!h.dice) h.dice=null;
  });
  Object.keys(st.tiles).forEach(key=>{
    const t=st.tiles[key];
    t.monsters = avArr(t.monsters);
    if(typeof t.rev!=='boolean')  t.rev=false;
    if(typeof t.sc!=='boolean')   t.sc=false;
    if(typeof t.seal!=='boolean') t.seal=false;
  });
  return st;
}

// Modifie l'état par transaction. fn(st) modifie st ; renvoie un message d'erreur pour annuler
// ('silent' = annuler sans message).
function avTx(fn){
  let err=null;
  return fbTxAvel(cur=>{
    if(cur===null) return null;   // 1er passage sans cache local : Firebase relance avec la vraie valeur
    const st=avNormalize(cur);
    err=null;
    const e=fn(st);
    if(e){ err=e; return; }
    return st;
  }).then(res=>{ if(res && !res.committed && err && err!=='silent') toast(err); return res; });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CARTE
// ═══════════════════════════════════════════════════════════════════════════
function avPositions(){
  const out=[];
  for(let q=-2;q<=2;q++) for(let r=-2;r<=2;r++){ if(avRing(q,r)<=2) out.push(avKey(q,r)); }
  return out;
}
function avBuildMap(){
  const tiles={};
  const mk=k=>({ k, rev:false, sc:false, seal:false, monsters:[] });
  tiles['0,0']=Object.assign(mk('chateau'),{ rev:true });
  Object.keys(AV_START_TILES).forEach(key=>{ tiles[key]=Object.assign(mk(AV_START_TILES[key]),{ rev:true }); });
  const free=avPositions().filter(key=>!tiles[key]);
  const bag=avShuffle(AV_HIDDEN_BAG);
  free.forEach((key,i)=>{ tiles[key]=mk(bag[i]); });
  const crat=Object.keys(tiles).find(key=>tiles[key].k==='cratere');   // cratère toujours sur l'anneau extérieur
  if(crat && avRing(...avQR(crat))<2){
    const swap=avShuffle(Object.keys(tiles).filter(key=>avRing(...avQR(key))===2 && !tiles[key].rev))[0];
    const tmp=tiles[swap].k; tiles[swap].k='cratere'; tiles[crat].k=tmp;
  }
  avShuffle(Object.keys(tiles).filter(key=>key!=='0,0' && tiles[key].k!=='cratere'))
    .slice(0, AV_SHORTCUTS).forEach(key=>{ tiles[key].sc=true; });
  return tiles;
}
function avBuildDecks(){
  const deck={ petit:[], grand:[] };
  Object.keys(AV_MONSTERS).forEach(k=>{ for(let i=0;i<AV_MONSTER_COPIES;i++) deck[AV_MONSTERS[k].taille].push(k); });
  deck.petit=avShuffle(deck.petit); deck.grand=avShuffle(deck.grand);
  return deck;
}
function avBuildPool(){
  const pool=[];
  Object.keys(AV_ITEMS).forEach(k=>{ const n=AV_ITEMS[k].slot==='elixir'?AV_COPIES.elixir:AV_COPIES.equip; for(let i=0;i<n;i++) pool.push(k); });
  return avShuffle(pool);
}
function avNeighbors(st, key){
  const [q,r]=avQR(key);
  return AV_DIRS.map(([dq,dr,dir])=>({ key:avKey(q+dq,r+dr), dir })).filter(n=>st.tiles[n.key]);
}
function avShortcutTargets(st, key){
  const t=st.tiles[key];
  if(!t || !t.sc || !t.rev) return [];
  const adj=avNeighbors(st,key).map(n=>n.key);
  return Object.keys(st.tiles).filter(k2=>k2!==key && st.tiles[k2].sc && st.tiles[k2].rev && !adj.includes(k2));
}
let __avId=0;
function avNewId(p){ return p+Date.now().toString(36)+'_'+(__avId++)+Math.floor(Math.random()*1e4); }
function avSpawn(st, key){
  const t=st.tiles[key]; if(!t) return null;
  const def=avTileDef(t);
  if(!def.lair || !t.rev || t.seal || t.monsters.length) return null;
  if(!st.deck[def.lair].length){
    const pile=[];
    Object.keys(AV_MONSTERS).filter(k=>AV_MONSTERS[k].taille===def.lair).forEach(k=>{ for(let i=0;i<AV_MONSTER_COPIES;i++) pile.push(k); });
    st.deck[def.lair]=avShuffle(pile);
  }
  const k=st.deck[def.lair].shift();
  t.monsters.push({ id:avNewId('m'), k, dmg:0 });
  return AV_MONSTERS[k];
}

// ═══════════════════════════════════════════════════════════════════════════
//  OBJETS & SAC À DOS
// ═══════════════════════════════════════════════════════════════════════════
function avItemVol(it){ return avIsElixir(it) ? AV_VOL.elixir : AV_VOL.equip; }
function avBagVol(h){ return h.coins*AV_VOL.coin + h.bag.reduce((s,it)=>s+avItemVol(it),0); }
function avOverflow(h){ return avBagVol(h) > AV_BAG_CAP; }
function avAllItems(h){ return AV_SLOTS.map(([s])=>h.eq[s]).filter(Boolean).concat(h.bag); }
function avFindItem(h, id){
  for(const [s] of AV_SLOTS){ if(h.eq[s] && h.eq[s].id===id) return { it:h.eq[s], where:'eq', slot:s }; }
  const i=h.bag.findIndex(it=>it.id===id);
  return i>=0 ? { it:h.bag[i], where:'bag', idx:i } : null;
}
function avTakeItem(h, id){
  const f=avFindItem(h,id); if(!f) return null;
  if(f.where==='eq') h.eq[f.slot]=null; else h.bag.splice(f.idx,1);
  return f.it;
}
// Un objet reçu : porté si son emplacement est libre, sinon dans le sac (débordement possible)
function avGain(h, it){
  const slot=avItemDef(it).slot;
  if(slot!=='elixir' && !h.eq[slot]) h.eq[slot]=it; else h.bag.push(it);
}
function avNewItem(k){ return { id:avNewId('o'), k, up:false }; }
function avDraw(st, n){ st.pool=avShuffle(st.pool); return st.pool.splice(0, Math.min(n, st.pool.length)); }
function avUpgradable(h){ return avAllItems(h).filter(it=>!avIsElixir(it) && !it.up); }
function avItemLabel(it){ const d=avItemDef(it); return d.ico+' '+d.nom+(it.up?' ✦':''); }
function avItemEffect(it){ const d=avItemDef(it); return (it.up && d.up) ? d.up : d.base; }
// Lance un tirage « 3 objets, on en garde 1 » (count = nombre de tirages à la suite)
function avStartPick(st, h, count){
  const opts=avDraw(st, AV_PICK_COUNT);
  if(!opts.length){ avLog(st, '🎁 La pioche d\'objets est vide.'); h.pick=null; return; }
  h.pick={ opts, until:avNow()+AV_PICK_SECS*1000, left:count||1 };
}
function avResolvePick(st, h, idx, auto){
  const p=h.pick; if(!p) return;
  const i=(typeof idx==='number' && p.opts[idx]) ? idx : Math.floor(Math.random()*p.opts.length);
  const it=avNewItem(p.opts[i]);
  p.opts.forEach((k,j)=>{ if(j!==i) st.pool.push(k); });   // les autres retournent dans la pioche
  avGain(h, it);
  avLog(st, '🎁 '+avHeroDef(h.id).nom+(auto?' (au hasard, temps écoulé)':'')+' obtient : '+avItemLabel(it)+'.');
  const left=(p.left||1)-1;
  h.pick=null;
  if(left>0) avStartPick(st, h, left);
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOURS (tour libre : chacun joue ses actions quand il veut, avant la fin du minuteur)
// ═══════════════════════════════════════════════════════════════════════════
function avHeroOf(st, pseudo){ const p=st && st.players[pseudo]; return (p && typeof p.hero==='number') ? st.heroes[p.hero] : null; }
function avHeroesAt(st, key){ return st.heroes.filter(h=>h.pos===key); }
// Héros seul : 2 actions · héros partagé à 2 : 1 action chacun
function avAllowance(st, pseudo){ const h=avHeroOf(st,pseudo); return h ? Math.max(1, Math.floor(AV_ACTIONS/h.players.length)) : 0; }
function avActsLeft(st, pseudo){ const p=st.players[pseudo]; return p ? Math.max(0, avAllowance(st,pseudo)-p.acts) : 0; }
// Ce qui empêche un héros d'agir (objet à choisir, amélioration à placer, sac qui déborde)
function avBlocker(h){
  if(!h) return 'no';
  if(h.pick) return 'pick';
  if(h.upg>0) return 'upg';
  if(avOverflow(h)) return 'bag';
  return null;
}
function avCanAct(st, pseudo){
  return !!st && st.active && st.phase==='play' && avActsLeft(st,pseudo)>0 && !avBlocker(avHeroOf(st,pseudo));
}
function avAllDone(st){ return Object.keys(st.players).filter(ps=>avHeroOf(st,ps)).every(ps=>avActsLeft(st,ps)===0); }

// Une action jouée : on la décompte, et le tour se termine si tout le monde a joué
function avSpend(st, pseudo){
  st.players[pseudo].acts++;
  if(avAllDone(st)) avEndRound(st);
}
function avEndRound(st){
  Object.values(st.players).forEach(p=>{ p.acts=0; });
  st.moon=Math.min(st.moon+1, AV_MOON_TRACK.length-1);
  const sym=AV_MOON_TRACK[st.moon], R=st.round;
  if(sym==='lair'){
    const spawned=[]; let big=false;
    Object.keys(st.tiles).forEach(key=>{ const m=avSpawn(st,key); if(m){ spawned.push(m.ico+' '+m.nom+' ('+avTileDef(st.tiles[key]).nom+')'); if(m.taille==='grand') big=true; } });
    avLog(st, spawned.length ? '🌙 Fin du tour '+R+' — des monstres surgissent des repaires : '+spawned.join(', ')+'.' : '🌙 Fin du tour '+R+' — les repaires restent calmes.', big);
  } else if(sym==='heart'){
    st.heroes.forEach(h=>{ h.pv=Math.min(AV_PV_MAX, h.pv+1); });
    avLog(st, '🌙 Fin du tour '+R+' — la lune bienveillante soigne chaque héros de 1 PV.');
  } else if(sym==='seal'){
    avLog(st, '🌙 Fin du tour '+R+' — le druide quitte le cercle de pierres : plus de sceaux possibles.');
  } else if(sym==='trap'){
    avLog(st, '🌙 Fin du tour '+R+' — les elfes quittent leur camp : plus de pièges possibles.');
  } else if(sym==='moon'){
    st.phase='blackMoon';
    avLog(st, '🌑 La Lune Noire se lève ! Un éclat s\'écrase sur Avel…', true);
    return;
  } else {
    avLog(st, '🌙 Fin du tour '+R+'.');
  }
  st.round++;
  st.deadline=avNow()+st.roundSecs*1000;
}
function avMoonLeft(st){ return Math.max(0, AV_MOON_TRACK.indexOf('moon') - st.moon); }
function avClosed(st, sym){ return st.moon >= AV_MOON_TRACK.indexOf(sym); }   // cercle (seal) / camp (trap) fermés
const AV_SYM_LABEL = { lair:'👹 Apparition', heart:'❤️ Soin', seal:'🗿 Fin des sceaux', trap:'🏹 Fin des pièges', moon:'🌑 Lune Noire', none:'Rien', start:'—' };

// Squelette d'une action qui coûte 1 action : vérifie, applique fn, décompte.
// fn(st, h, t, def) renvoie un message d'erreur pour annuler.
function avAction(pseudo, fn){
  return avTx(st=>{
    if(st.phase!=='play') return 'La partie n\'est pas en cours.';
    const h=avHeroOf(st,pseudo); if(!h) return 'Tu ne joues pas dans cette partie.';
    if(avActsLeft(st,pseudo)<=0) return 'Tu as déjà joué tes actions ce tour-ci.';
    const b=avBlocker(h);
    if(b==='pick') return 'Choisis d\'abord ton objet.';
    if(b==='upg')  return 'Choisis d\'abord l\'objet à améliorer.';
    if(b==='bag')  return 'Ton sac déborde : jette quelque chose d\'abord.';
    const t=st.tiles[h.pos];
    const e=fn(st, h, t, avTileDef(t)); if(e) return e;
    avSpend(st, pseudo);
  });
}
// Squelette d'une action gratuite (gestion du sac, choix d'objet…)
function avFree(pseudo, fn){
  return avTx(st=>{
    if(st.phase!=='play' && st.phase!=='blackMoon') return 'La partie n\'est pas en cours.';
    const h=avHeroOf(st,pseudo); if(!h) return 'Tu ne joues pas dans cette partie.';
    return fn(st, h);
  });
}
function avWho(pseudo, h){ return pseudo+' ('+avHeroDef(h.id).nom+')'; }

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIONS DES JOUEURS (1 action chacune)
// ═══════════════════════════════════════════════════════════════════════════
function avelMove(pseudo, dest){
  return avAction(pseudo, (st,h)=>{
    const t=st.tiles[dest]; if(!t) return 'Zone inconnue.';
    const adj=avNeighbors(st,h.pos).map(n=>n.key), sc=avShortcutTargets(st,h.pos);
    if(!adj.includes(dest) && !sc.includes(dest)) return 'Cette zone n\'est pas accessible d\'ici.';
    const def=avTileDef(t);
    let msg, big=false;
    if(!t.rev){
      t.rev=true;
      msg='🧭 '+avWho(pseudo,h)+' explore et découvre : '+def.ico+' '+def.nom+(t.sc?' '+AV_ICO.shortcut:'')+'.';
      const m=avSpawn(st,dest);
      if(m){ msg+=' Un monstre en sort : '+m.ico+' '+m.nom+' !'; big=m.taille==='grand'; }
    } else {
      msg='🚶 '+avWho(pseudo,h)+' '+(sc.includes(dest)?'emprunte un raccourci '+AV_ICO.shortcut+' vers ':'se rend à : ')+def.ico+' '+def.nom+'.';
    }
    h.pos=dest;
    avLog(st, msg, big);
  });
}
function avelRest(pseudo){
  return avAction(pseudo, (st,h)=>{
    if(h.pv>=AV_PV_MAX) return 'Tes PV sont déjà au maximum.';
    h.pv=Math.min(AV_PV_MAX, h.pv+AV_REST_HEAL);
    avLog(st, '❤️ '+avWho(pseudo,h)+' se repose. Les PV passent à '+h.pv+'/'+AV_PV_MAX+'.');
  });
}
// Village abandonné / Terres sauvages
function avelCoins(pseudo){
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='coins') return 'Pas d\'habitants à aider ici.';
    if(t.monsters.length) return 'Un monstre rôde ici : impossible d\'aider les habitants.';
    h.coins+=AV_COIN_GAIN;
    avLog(st, '🪙 '+avWho(pseudo,h)+' aide les habitants ('+def.nom+') : +'+AV_COIN_GAIN+' pièces d\'or.');
  });
}
// Marché : 1 ou 2 transactions (ops = 'buy' ou 'sell:ID'), ventes d'abord
function avelMarket(pseudo, ops){
  ops=(ops||[]).filter(Boolean);
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='marche') return 'Tu n\'es pas au marché.';
    if(!ops.length || ops.length>2) return 'Choisis 1 ou 2 transactions.';
    const sells=ops.filter(o=>o.indexOf('sell:')===0).map(o=>o.slice(5)), buys=ops.filter(o=>o==='buy').length;
    if(new Set(sells).size!==sells.length) return 'Tu ne peux pas vendre deux fois le même objet.';
    const sold=[];
    for(const id of sells){
      const it=avTakeItem(h,id); if(!it) return 'Objet introuvable.';
      st.pool.push(it.k); h.coins+=AV_PRICE.sell; sold.push(avItemLabel(it));
    }
    if(h.coins < buys*AV_PRICE.buy) return 'Pas assez de pièces : il en faut '+(buys*AV_PRICE.buy)+'.';
    h.coins-=buys*AV_PRICE.buy;
    const parts=[];
    if(sold.length) parts.push('vend '+sold.join(' et ')+' (+'+(sold.length*AV_PRICE.sell)+' 🪙)');
    if(buys) parts.push('achète '+(buys>1?buys+' objets':'un objet')+' (−'+(buys*AV_PRICE.buy)+' 🪙)');
    avLog(st, '🛒 '+avWho(pseudo,h)+' '+parts.join(', puis ')+'.');
    if(buys) avStartPick(st, h, buys);
  });
}
// Atelier d'alchimie : 3 pièces → 1 objet sur sa face améliorée
function avelUpgrade(pseudo, id){
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='atelier') return 'Tu n\'es pas à l\'atelier.';
    if(h.coins<AV_PRICE.upgrade) return 'Il faut '+AV_PRICE.upgrade+' pièces.';
    const f=avFindItem(h,id); if(!f || avIsElixir(f.it) || f.it.up) return 'Cet objet ne peut pas être amélioré.';
    h.coins-=AV_PRICE.upgrade; f.it.up=true;
    avLog(st, '⚗️ '+avWho(pseudo,h)+' fait améliorer '+avItemLabel(f.it)+' : '+avItemEffect(f.it)+'.');
  });
}
// Cercle de pierres : 3 pièces → sceau sur un repaire révélé et vide
function avelSeal(pseudo, key){
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='cercle') return 'Tu n\'es pas au cercle de pierres.';
    if(avClosed(st,'seal')) return 'Le druide est parti : plus de sceaux possibles.';
    if(st.seals<=0) return 'Plus aucun sceau disponible.';
    if(h.coins<AV_PRICE.seal) return 'Il faut '+AV_PRICE.seal+' pièces.';
    const tt=st.tiles[key];
    if(!tt || !tt.rev || !avTileDef(tt).lair || tt.seal || tt.monsters.length) return 'Choisis un repaire révélé, vide et non scellé.';
    h.coins-=AV_PRICE.seal; st.seals--; tt.seal=true;
    avLog(st, '🔒 '+avWho(pseudo,h)+' scelle le repaire : '+avTileDef(tt).ico+' '+avTileDef(tt).nom+'. Plus aucun monstre n\'en sortira.');
  });
}
// Carrière : 3 pièces → 1 muraille devant le château
function avelWall(pseudo){
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='carriere') return 'Tu n\'es pas à la carrière.';
    if(st.walls>=st.limit) return 'Toutes les murailles sont déjà construites.';
    if(h.coins<AV_PRICE.wall) return 'Il faut '+AV_PRICE.wall+' pièces.';
    h.coins-=AV_PRICE.wall; st.walls++;
    avLog(st, '🧱 '+avWho(pseudo,h)+' fait bâtir une muraille au château ('+st.walls+'/'+st.limit+').');
  });
}
// Camp des elfes : piège n° type (coût croissant) sur une tuile révélée (1 piège par tuile)
function avelTrap(pseudo, type, key){
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='camp') return 'Tu n\'es pas au camp des elfes.';
    if(avClosed(st,'trap')) return 'Les elfes sont partis : plus de pièges possibles.';
    if(!(type>=0 && type<st.limit) || st.traps.some(x=>x.type===type)) return 'Ce piège n\'est pas disponible.';
    const cost=AV_TRAP_COSTS[type];
    if(h.coins<cost) return 'Il faut '+cost+' pièces.';
    const tt=st.tiles[key];
    if(!tt || !tt.rev || key==='0,0' || st.traps.some(x=>x.tile===key)) return 'Choisis une tuile révélée sans piège (hors château).';
    h.coins-=cost; st.traps.push({ type, tile:key });
    avLog(st, '⛓️ '+avWho(pseudo,h)+' pose un piège elfique ('+cost+' 🪙) : '+avTileDef(tt).ico+' '+avTileDef(tt).nom+'.');
  });
}
// Lac aux souhaits : 1 pièce, 2 dés verts (✨ = attaque), une relance automatique si rien
function avLakeResult(f){
  const a=f.filter(x=>x==='att'||x==='sort').length, d=f.filter(x=>x==='def').length;
  if(a===2) return 'coins'; if(a===1 && d===1) return 'item'; if(d===2) return 'upg'; return null;
}
function avelLake(pseudo){
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='lac') return 'Tu n\'es pas au lac aux souhaits.';
    if(h.coins<AV_PRICE.lake) return 'Il faut '+AV_PRICE.lake+' pièce.';
    h.coins-=AV_PRICE.lake;
    const rolls=[[avRoll('vert'),avRoll('vert')]];
    let res=avLakeResult(rolls[0]);
    if(!res){ rolls.push([avRoll('vert'),avRoll('vert')]); res=avLakeResult(rolls[1]); }
    const faces=rolls.map(r=>r.map(x=>AV_FACE_ICO[x]).join(' ')).join(' → relance : ');
    let out;
    if(res==='coins'){ h.coins+=AV_PRICE.lakeCoins; out='+'+AV_PRICE.lakeCoins+' pièces d\'or !'; }
    else if(res==='item'){ avStartPick(st,h,1); out='un objet !'; }
    else if(res==='upg'){
      if(avUpgradable(h).length){ h.upg++; out='une amélioration !'; }
      else out='une amélioration… mais aucun objet à améliorer.';
    } else out='rien cette fois.';
    h.dice={ faces, out, round:st.round };
    avLog(st, '🏞️ '+avWho(pseudo,h)+' jette une pièce dans le lac : '+faces+' — '+out);
  });
}
// Don (gratuit, pas une action) : s'il te reste des actions ce tour, à un héros sur ta
// tuile, sans monstre présent. item = 'coin' ou l'id d'un objet.
function avelGive(pseudo, toHeroId, item){
  return avTx(st=>{
    if(st.phase!=='play') return 'La partie n\'est pas en cours.';
    const h=avHeroOf(st,pseudo), to=st.heroes[toHeroId];
    if(!h || !to || to.id===h.id) return 'Destinataire invalide.';
    if(avActsLeft(st,pseudo)<=0) return 'Tu as déjà joué tes actions ce tour-ci.';
    if(to.pos!==h.pos) return 'Ce héros n\'est plus sur ta tuile.';
    if(st.tiles[h.pos].monsters.length) return 'Impossible de faire un don avec un monstre sur la tuile.';
    const dest=avHeroDef(to.id).nom;
    if(item==='coin'){
      if(h.coins<1) return 'Tu n\'as plus de pièce.';
      h.coins--; to.coins++;
      avLog(st, '🤝 '+avWho(pseudo,h)+' donne 1 pièce d\'or à '+dest+'.');
    } else {
      const it=avTakeItem(h,item); if(!it) return 'Choisis quoi donner.';
      avGain(to,it);
      avLog(st, '🤝 '+avWho(pseudo,h)+' donne '+avItemLabel(it)+' à '+dest+'.');
    }
  });
}

// ── Gestion du sac et choix (gratuits, à tout moment) ──
function avelPick(pseudo, idx){
  return avFree(pseudo, (st,h)=>{ if(!h.pick) return 'silent'; avResolvePick(st,h,idx,false); });
}
function avelUpgradeChoice(pseudo, id){
  return avFree(pseudo, (st,h)=>{
    if(!(h.upg>0)) return 'silent';
    const f=avFindItem(h,id); if(!f || avIsElixir(f.it) || f.it.up) return 'Cet objet ne peut pas être amélioré.';
    f.it.up=true; h.upg--;
    if(!avUpgradable(h).length) h.upg=0;
    avLog(st, '✨ '+avWho(pseudo,h)+' améliore '+avItemLabel(f.it)+' : '+avItemEffect(f.it)+'.');
  });
}
function avelEquip(pseudo, id){
  return avFree(pseudo, (st,h)=>{
    const i=h.bag.findIndex(it=>it.id===id); if(i<0) return 'Objet introuvable.';
    const it=h.bag[i], slot=avItemDef(it).slot; if(slot==='elixir') return 'Un élixir ne se porte pas.';
    h.bag.splice(i,1);
    if(h.eq[slot]) h.bag.push(h.eq[slot]);   // l'ancien objet retourne dans le sac
    h.eq[slot]=it;
  });
}
function avelUnequip(pseudo, slot){
  return avFree(pseudo, (st,h)=>{ if(!h.eq[slot]) return 'silent'; h.bag.push(h.eq[slot]); h.eq[slot]=null; });
}
function avelDrop(pseudo, id){
  return avFree(pseudo, (st,h)=>{
    if(id==='coin'){ if(h.coins<1) return 'silent'; h.coins--; avLog(st, '🎒 '+avWho(pseudo,h)+' abandonne 1 pièce d\'or.'); return; }
    const it=avTakeItem(h,id); if(!it) return 'silent';
    st.pool.push(it.k);
    avLog(st, '🎒 '+avWho(pseudo,h)+' abandonne '+avItemLabel(it)+'.');
  });
}
function avelDrink(pseudo, id){
  return avFree(pseudo, (st,h)=>{
    const f=avFindItem(h,id); if(!f || f.it.k!=='soin') return 'Seule la potion de soin se boit hors combat.';
    if(h.pv>=AV_PV_MAX) return 'Tes PV sont déjà au maximum.';
    avTakeItem(h,id); st.pool.push('soin'); h.pv=AV_PV_MAX;
    avLog(st, '🍶 '+avWho(pseudo,h)+' boit une potion de soin : PV au maximum.');
  });
}

// Lecture des menus déroulants au clic (le choix lui-même ne déclenche rien)
function avSel(id){ const s=document.getElementById(id); return s ? s.value : ''; }
function avelMoveFromUi(pseudo){ const v=avSel('av-move-sel'); if(!v){ toast('Choisis une zone.'); return; } avelMove(pseudo, v); }
function avelGiveFromUi(pseudo, toHeroId){ const v=avSel('av-give-'+toHeroId); if(!v){ toast('Choisis quoi donner.'); return; } avelGive(pseudo, toHeroId, v); }
function avelUpgChoiceFromUi(pseudo){ const v=avSel('av-upg-sel'); if(!v){ toast('Choisis un objet.'); return; } avelUpgradeChoice(pseudo, v); }
// Valider dans la modale du lieu : on ferme la modale (sauf au lac, pour voir les dés)
function avelPlaceFromUi(pseudo){
  const me=avHeroOf(avel,pseudo); if(!me) return;
  const act=avTileDef(avel.tiles[me.pos]).act;
  let p=null;
  if(act==='marche'){
    const ops=[avSel('av-mk-1'), avSel('av-mk-2')].filter(Boolean);
    if(!ops.length){ toast('Choisis au moins une transaction.'); return; }
    p=avelMarket(pseudo, ops);
  } else if(act==='atelier'){ const v=avSel('av-at-sel'); if(!v){ toast('Choisis un objet.'); return; } p=avelUpgrade(pseudo, v); }
  else if(act==='cercle'){ const v=avSel('av-ce-sel'); if(!v){ toast('Choisis un repaire.'); return; } p=avelSeal(pseudo, v); }
  else if(act==='carriere'){ p=avelWall(pseudo); }
  else if(act==='camp'){
    const ty=avSel('av-ca-type'), ti=avSel('av-ca-tile');
    if(ty===''||!ti){ toast('Choisis un piège et une tuile.'); return; }
    p=avelTrap(pseudo, parseInt(ty,10), ti);
  } else if(act==='lac'){ avelLake(pseudo); return; }
  if(p) p.then(res=>{ if(res && res.committed) avelHideModal(); });
}
function avelTileAction(pseudo){
  const me=avHeroOf(avel,pseudo); if(!me) return;
  const act=avTileDef(avel.tiles[me.pos]).act;
  if(act==='coins') avelCoins(pseudo);
  else if(act) avOpenModal('lieu');
}

// ═══════════════════════════════════════════════════════════════════════════
//  MENEUR : lobby, lancement, secours, clôture
// ═══════════════════════════════════════════════════════════════════════════
function startAvel(){
  fbSetAvel({ active:true, phase:'lobby', players:{}, heroes:[], tiles:{}, round:1, moon:0, seq:0, history:[], roundSecs:AV_ROUND_SECS,
    lastEvent:'Les portes du château sont ouvertes : les héros peuvent rejoindre la partie.' });
  toast('Lobby des Chroniques d\'Avel ouvert !');
}
function avelJoin(pseudo){
  avTx(st=>{
    if(st.phase!=='lobby') return 'La partie a déjà commencé.';
    if(!st.players[pseudo] && Object.keys(st.players).length>=AV_MAX_PLAYERS) return AV_MAX_PLAYERS+' joueurs maximum.';
    if(!st.players[pseudo]) st.players[pseudo]={ pseudo, at:avNow(), hero:null, acts:0 };
    st.lastEvent=Object.keys(st.players).length+' héros prêt(s) à partir.';
  });
}
function avelLeave(pseudo){
  avTx(st=>{
    if(st.phase!=='lobby') return 'silent';
    delete st.players[pseudo];
    st.lastEvent=Object.keys(st.players).length+' héros prêt(s) à partir.';
  });
}
function avelSetRoundSecs(v){
  const secs=parseInt(v,10); if(!secs) return;
  avTx(st=>{ st.roundSecs=secs; });
}
function avelLaunch(){
  avTx(st=>{
    if(st.phase!=='lobby') return 'silent';
    const order=Object.values(st.players).sort((a,b)=>(a.at||0)-(b.at||0)).map(p=>p.pseudo);
    if(!order.length) return 'Il faut au moins 1 joueur.';
    const nH=Math.min(order.length, AV_MAX_HEROES);
    st.pool=avBuildPool();
    st.heroes=[];
    for(let i=0;i<nH;i++){
      const h={ id:i, pv:AV_PV_MAX, coins:AV_START_COINS, pos:'0,0', eq:{ arme:null, bouclier:null, casque:null }, bag:[], upg:0, pick:null, dice:null, players:[] };
      avGain(h, avNewItem(st.pool.shift()));   // 1 équipement tiré au hasard au départ
      st.heroes.push(h);
    }
    order.forEach((ps,i)=>{ st.heroes[i%nH].players.push(ps); st.players[ps].hero=i%nH; st.players[ps].acts=0; });
    st.tiles=avBuildMap(); st.deck=avBuildDecks();
    st.limit=avLimit(nH); st.seals=st.limit; st.walls=0; st.traps=[];
    st.round=1; st.moon=avMoonStart(nH); st.phase='play'; st.history=[]; st.seq=0; st.startedAt=avNow();
    st.deadline=avNow()+st.roundSecs*1000;
    const sp=[];
    Object.keys(st.tiles).forEach(key=>{ const m=avSpawn(st,key); if(m) sp.push(m.ico+' '+m.nom); });
    avLog(st, '🏰 La partie commence avec '+nH+' héros ! La Lune Noire se lèvera dans '+avMoonLeft(st)+' tours.'+(sp.length?' Déjà aux portes : '+sp.join(', ')+'.':''), true);
  }).then(r=>{ if(r && r.committed) toast('Partie des Chroniques d\'Avel lancée !'); });
}
function avelEndRoundNow(){
  avTx(st=>{ if(st.phase!=='play') return 'silent'; avLog(st, '⏱️ Le meneur termine le tour.'); avEndRound(st); });
}
function avelCancel(){
  if(!confirm('Clôturer la partie des Chroniques d\'Avel ?')) return;
  fbSetAvel(null);
  toast('Partie des Chroniques d\'Avel clôturée.');
}

// ── Horloge (chaque seconde) : affiche le temps restant, termine le tour au bout du minuteur,
//    et tire un objet au hasard si quelqu'un n'a pas choisi à temps ──
let avTickFired={};
function avFmt(ms){ const s=Math.max(0, Math.ceil(ms/1000)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function avTick(){
  if(typeof document==='undefined' || !document.querySelectorAll) return;
  document.querySelectorAll('[data-av-until]').forEach(el=>{
    const left=parseInt(el.getAttribute('data-av-until'),10)-avNow();
    el.textContent=avFmt(left);
    el.classList.toggle('is-urgent', left<=15000);
  });
  if(!avel || !avel.active || avel.phase!=='play') return;
  // Seuls les écrans « actifs » (meneur ou joueur connecté) déclenchent les fins automatiques
  if(!currentViewerPseudo && !(document.getElementById('page-admin')||{}).classList?.contains('active')) return;
  const st=avel, now=avNow();
  if(st.deadline && now>st.deadline+800){
    const key='r'+st.startedAt+'_'+st.round;
    if(!avTickFired[key]){
      avTickFired[key]=true;
      const R=st.round;
      avTx(s=>{ if(s.phase!=='play' || s.round!==R || avNow()<s.deadline) return 'silent'; avLog(s, '⏱️ Le temps est écoulé !'); avEndRound(s); });
    }
  }
  st.heroes.forEach(h=>{
    if(h.pick && now>h.pick.until+800){
      const key='p'+h.id+'_'+h.pick.until;
      if(!avTickFired[key]){
        avTickFired[key]=true;
        const until=h.pick.until, id=h.id;
        avTx(s=>{ const x=s.heroes[id]; if(!x || !x.pick || x.pick.until!==until) return 'silent'; avResolvePick(s,x,null,true); });
      }
    }
  });
}
if (typeof setInterval!=='undefined' && typeof document!=='undefined') setInterval(avTick, 1000);

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU : CARTE (SVG)
// ═══════════════════════════════════════════════════════════════════════════
const AV_HEX = 50;
function avPix(key){ const [q,r]=avQR(key); return [AV_HEX*1.5*q, AV_HEX*Math.sqrt(3)*(r+q/2)]; }
function avHexPoints(cx,cy,s){
  const p=[]; for(let i=0;i<6;i++){ const a=Math.PI/180*60*i; p.push((cx+s*Math.cos(a)).toFixed(1)+','+(cy+s*Math.sin(a)).toFixed(1)); }
  return p.join(' ');
}
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
      if(t.sc)   g+='<text class="av-hex-badge" x="'+(cx+s*.5)+'" y="'+(cy-s*.42)+'">'+AV_ICO.shortcut+'</text>';
      if(t.seal) g+='<text class="av-hex-badge" x="'+(cx-s*.5)+'" y="'+(cy-s*.42)+'">'+AV_ICO.seal+'</text>';
      if(st.traps.some(x=>x.tile===k)) g+='<text class="av-hex-badge" x="'+(cx-s*.5)+'" y="'+(cy+s*.62)+'">'+AV_ICO.trap+'</text>';
      if(t.k==='chateau' && st.walls) g+='<text class="av-hex-badge" x="'+(cx+s*.48)+'" y="'+(cy+s*.62)+'">'+AV_ICO.wall+st.walls+'</text>';
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
  const it=(ico,lbl)=>'<span class="av-legend-item">'+ico+lbl+'</span>';
  return '<div class="av-legend">'+
    it('<span class="av-legend-dot"></span>','Héros')+
    it('<span class="av-legend-mon"></span>','Monstre')+
    it('<span class="av-legend-sc">'+AV_ICO.shortcut+'</span>','Raccourci')+
    it('<span class="av-legend-sc">'+AV_ICO.seal+'</span>','Sceau')+
    it('<span class="av-legend-sc">'+AV_ICO.trap+'</span>','Piège')+
    it('<span class="av-legend-q">?</span>','Inconnu')+
  '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU : PASTILLES, JOUEURS, DERNIÈRE ACTION
// ═══════════════════════════════════════════════════════════════════════════
function avTimerSpan(until){ return '<span class="av-timer" data-av-until="'+until+'">'+avFmt(until-avNow())+'</span>'; }
function avStatusPills(st){
  const left=avMoonLeft(st), next=AV_MOON_TRACK[Math.min(st.moon+1, AV_MOON_TRACK.length-1)];
  const moon = st.phase==='blackMoon' ? 'Lune Noire <strong>levée</strong>' : ('Lune Noire dans <strong>'+left+' tour'+(left>1?'s':'')+'</strong>');
  return '<div class="dpill">Tour <strong>'+st.round+'</strong></div>'+
         '<div class="dpill">'+moon+'</div>'+
         (st.phase==='play' ? '<div class="dpill">Fin du tour <strong>'+(AV_SYM_LABEL[next]||'—')+'</strong></div>'+
                              '<div class="dpill av-timer-pill">⏱ <strong>'+avTimerSpan(st.deadline)+'</strong></div>' : '');
}
function avHeroDot(id){ return '<span class="av-dot" style="background:var(--hero-'+(id+1)+')">'+avHeroDef(id).ini+'</span>'; }
function avPlayersHtml(st, mePseudo){
  const me=avHeroOf(st,mePseudo);
  const rows=[];
  st.heroes.forEach(h=>{
    h.players.forEach(ps=>{
      const isMe=ps===mePseudo, mine=me && me.id===h.id;
      const click=(!mine) ? ' av-clickable" role="button" tabindex="0" onclick="avelShowHero('+h.id+')" onkeydown="if(event.key===\'Enter\')avelShowHero('+h.id+')' : '';
      let status='', out=false;
      if(st.phase==='play'){
        const left=avActsLeft(st,ps);
        if(left>0) status='<span class="player-status">'+left+' action'+(left>1?'s':'')+'</span>';
        else { status='<span class="player-status">a joué</span>'; out=true; }
      }
      rows.push('<div class="player-row'+(isMe?' is-current':'')+(out?' is-out':'')+click+'">'+
        '<span class="player-name">'+escHtml(ps)+'</span>'+
        '<span class="player-infos">'+avHeroDot(h.id)+'<span class="player-info">❤️ '+h.pv+'/'+AV_PV_MAX+'</span></span>'+
        status+'</div>');
    });
  });
  return rows.join('');
}

// Dernière action (« toaster » de la carte Joueurs) : file d'attente côté navigateur
const AV_TOAST_MS = 2600, AV_TOAST_EPIC_MS = 4200;
let avToastSeen=null, avToastQueue=[], avToastBusy=false, avToastGame=null;
function avFeedToast(st){
  const hist=st.history||[];
  const gameId=st.startedAt || 'lobby';
  if(avToastGame!==gameId){ avToastGame=gameId; avToastSeen=null; avToastQueue=[]; }
  const last=hist[hist.length-1];
  if(avToastSeen===null){
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
}
function avPumpToast(){
  if(avToastBusy || !avToastQueue.length) return;
  // En tour libre, les actions peuvent s'enchaîner vite : on garde les 4 dernières en attente,
  // en conservant toujours les exploits
  if(avToastQueue.length>4){
    const epic=avToastQueue.filter(e=>e.epic), rest=avToastQueue.filter(e=>!e.epic);
    avToastQueue=epic.concat(rest.slice(-Math.max(1, 4-epic.length))).sort((a,b)=>a.n-b.n);
  }
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
function avKeepSelects(id, fn){
  const el=document.getElementById(id), keep={};
  if(el) el.querySelectorAll('select[id]').forEach(s=>{ keep[s.id]=s.value; });
  fn();
  Object.keys(keep).forEach(sid=>{
    const s=document.getElementById(sid);
    if(s && keep[sid] && [...s.options].some(o=>o.value===keep[sid])) s.value=keep[sid];
  });
}
function avOpt(v, label){ return '<option value="'+escHtml(v)+'">'+escHtml(label)+'</option>'; }
function avSlotLabel(slot){ return slot==='elixir' ? 'Élixir' : ((AV_SLOTS.find(([s])=>s===slot)||['',''])[1]); }

// Bandeau bloquant au-dessus de la carte : objet à choisir, amélioration à placer, sac qui déborde
function avAlertHtml(st, h, pseudo){
  const esc=escAttr(pseudo);
  if(h.pick){
    const cards=h.pick.opts.map((k,i)=>{
      const d=AV_ITEMS[k]||{nom:'?',ico:'?',slot:'',base:''};
      const v=d.slot==='elixir'?AV_VOL.elixir:AV_VOL.equip;
      return '<button class="pick-card" onclick="avelPick(\''+esc+'\','+i+')">'+
        '<span class="pick-card-ico">'+d.ico+'</span><span class="pick-card-name">'+escHtml(d.nom)+'</span>'+
        '<span class="pick-card-slot">'+escHtml(avSlotLabel(d.slot))+' · '+v+' place'+(v>1?'s':'')+'</span>'+
        '<span class="pick-card-fx">'+escHtml(d.base)+'</span></button>';
    }).join('');
    return '<div class="av-alert"><div class="av-alert-title">🎁 Choisis ton objet'+((h.pick.left||1)>1?' ('+h.pick.left+' à choisir)':'')+' — '+avTimerSpan(h.pick.until)+'</div>'+
      '<div class="pick-grid">'+cards+'</div><div class="action-row-sub">Sans choix à la fin du temps, un objet est pris au hasard.</div></div>';
  }
  if(h.upg>0){
    const opts=avUpgradable(h).map(it=>avOpt(it.id, avItemDef(it).nom));
    return '<div class="av-alert"><div class="av-alert-title">✨ Choisis l\'objet à améliorer</div>'+
      '<div class="action-row"><span class="action-row-label"><select class="dd" id="av-upg-sel">'+opts.join('')+'</select></span>'+
      avBtn('btn-secondary','Améliorer','avelUpgChoiceFromUi(\''+esc+'\')',false)+'</div></div>';
  }
  if(avOverflow(h)){
    return '<div class="av-alert is-danger"><div class="av-alert-title">🎒 Ton sac déborde ('+avBagVol(h)+'/'+AV_BAG_CAP+' places)</div>'+
      '<div class="action-row-sub">Jette des pièces ou des objets dans « Sac à dos » pour continuer à jouer.</div></div>';
  }
  return '';
}

function avActionsHtml(st, pseudo){
  const h=avHeroOf(st,pseudo), esc=escAttr(pseudo), my=avCanAct(st,pseudo);
  const t=st.tiles[h.pos], def=avTileDef(t);
  let z='';

  const opts=avNeighbors(st,h.pos).map(n=>{
    const nt=st.tiles[n.key];
    return avOpt(n.key, nt.rev ? avTileDef(nt).nom+' ('+n.dir+')' : 'Inconnu ('+n.dir+')');
  }).concat(avShortcutTargets(st,h.pos).map(k=>avOpt(k, AV_ICO.shortcut+' '+avTileDef(st.tiles[k]).nom+' (raccourci)')));
  z+='<div class="section-title">Déplacement</div>'+
     '<div class="action-row"><span class="action-row-label"><select class="dd" id="av-move-sel"><option value="">Choisir une zone</option>'+opts.join('')+'</select></span>'+
     avBtn('btn-secondary','Se déplacer','avelMoveFromUi(\''+esc+'\')',!my)+'</div>';

  z+='<div class="section-title">Sur ma tuile</div>';
  const others=avHeroesAt(st,h.pos).filter(o=>o.id!==h.id), monsterHere=t.monsters.length>0, giveOk=avActsLeft(st,pseudo)>0;
  others.forEach(o=>{
    const gopts=(h.coins>0?[avOpt('coin','Pièce d\'or ('+h.coins+')')]:[]).concat(avAllItems(h).map(it=>avOpt(it.id, avItemDef(it).nom)));
    const can=giveOk && !monsterHere && gopts.length>0;
    z+='<div class="action-row"><span class="action-row-label">'+avHeroDot(o.id)+' '+escHtml(avHeroDef(o.id).nom)+' <span class="action-row-sub">('+escHtml(o.players.join(', '))+')</span></span>'+
       '<span class="action-row-ctrl"><select class="dd" id="av-give-'+o.id+'"'+(can?'':' disabled')+'>'+(gopts.length?gopts.join(''):'<option value="">Rien à donner</option>')+'</select>'+
       avBtn('btn-secondary','Donner','avelGiveFromUi(\''+esc+'\','+o.id+')',!can, monsterHere?'Impossible avec un monstre sur la tuile':(!giveOk?'Seulement s\'il te reste des actions ce tour':''))+'</span></div>';
  });
  t.monsters.forEach(m=>{
    const md=AV_MONSTERS[m.k]||{nom:'?',ico:'?',res:0,fam:''}, fam=AV_FAMS[md.fam];
    z+='<div class="action-row"><span class="action-row-label">'+md.ico+' '+escHtml(md.nom)+' <span class="action-row-sub">'+(fam?fam.ico+' '+fam.nom+' · ':'')+'résistance '+(md.res-(m.dmg||0))+'/'+md.res+'</span></span>'+
       avBtn('btn-secondary','Combattre','',true,'Le combat arrive au prochain lot')+'</div>';
  });
  let hint, can=my;
  if(def.act==='coins'){ hint = monsterHere ? 'Un monstre rôde : impossible d\'aider les habitants.' : 'Aider les habitants : +'+AV_COIN_GAIN+' pièces d\'or.'; can = my && !monsterHere; }
  else if(def.act) hint=avPlaceHint(st, def.act);
  else { hint='Aucune action ici.'; can=false; }
  if(t.k==='chateau') hint='Murailles : '+st.walls+'/'+st.limit+'. '+hint;
  z+='<div class="action-row"><span class="action-row-label">Lieu : '+def.ico+' '+escHtml(def.nom)+(t.sc?' '+AV_ICO.shortcut:'')+
     ' <span class="action-row-sub">'+escHtml(hint)+'</span></span>'+
     avBtn('btn-secondary','Action de lieu','avelTileAction(\''+esc+'\')', !can)+'</div>';
  return z;
}
function avPlaceHint(st, act){
  return ({
    marche:'Acheter un objet ('+AV_PRICE.buy+' 🪙) ou en vendre un (+'+AV_PRICE.sell+' 🪙), 2 transactions max.',
    atelier:'Améliorer un objet ('+AV_PRICE.upgrade+' 🪙).',
    cercle: avClosed(st,'seal') ? 'Le druide est parti.' : 'Sceller un repaire ('+AV_PRICE.seal+' 🪙) · '+st.seals+' sceau(x) restant(s).',
    carriere:'Bâtir une muraille ('+AV_PRICE.wall+' 🪙) · '+st.walls+'/'+st.limit+'.',
    camp: avClosed(st,'trap') ? 'Les elfes sont partis.' : 'Poser un piège pour la Bête.',
    lac:'Jeter '+AV_PRICE.lake+' pièce et lancer 2 dés verts.',
  })[act]||'';
}
function avInventoryHtml(h, pseudo){
  const esc=escAttr(pseudo);
  let z='<div class="section-title">Mon équipement</div>';
  AV_SLOTS.forEach(([s,l])=>{
    const it=h.eq[s];
    z+= it
      ? '<div class="action-row"><span class="action-row-label">'+l+' : '+escHtml(avItemLabel(it))+' <span class="action-row-sub">'+escHtml(avItemEffect(it))+'</span></span>'+
        avBtn('btn-secondary','Ranger','avelUnequip(\''+esc+'\',\''+s+'\')',false,'Mettre dans le sac')+'</div>'
      : '<div class="stat-row"><span>'+l+'</span><strong>Vide</strong></div>';
  });
  const vol=avBagVol(h);
  z+='<div class="section-title">Sac à dos · '+vol+'/'+AV_BAG_CAP+' places</div>';
  z+='<div class="bag-meter'+(vol>AV_BAG_CAP?' is-over':'')+'" aria-hidden="true">'+Array.from({length:Math.max(AV_BAG_CAP,vol)},(_,i)=>'<span class="bag-cell'+(i<vol?' is-full':'')+(i>=AV_BAG_CAP?' is-extra':'')+'"></span>').join('')+'</div>';
  z+='<div class="action-row"><span class="action-row-label">🪙 Pièces d\'or × '+h.coins+' <span class="action-row-sub">'+(h.coins*AV_VOL.coin)+' place'+(h.coins>1?'s':'')+'</span></span>'+
     avBtn('btn-secondary','Jeter 1','avelDrop(\''+esc+'\',\'coin\')',h.coins<1)+'</div>';
  h.bag.forEach(it=>{
    const d=avItemDef(it), v=avItemVol(it);
    let btns='';
    if(d.slot!=='elixir') btns+=avBtn('btn-secondary','Équiper','avelEquip(\''+esc+'\',\''+it.id+'\')',false);
    if(it.k==='soin') btns+=avBtn('btn-secondary','Boire','avelDrink(\''+esc+'\',\''+it.id+'\')',h.pv>=AV_PV_MAX, h.pv>=AV_PV_MAX?'PV déjà au maximum':'');
    btns+=avBtn('btn-secondary','Jeter','avelDrop(\''+esc+'\',\''+it.id+'\')',false);
    z+='<div class="action-row"><span class="action-row-label">'+escHtml(avItemLabel(it))+' <span class="action-row-sub">'+escHtml(avItemEffect(it))+' · '+v+' place'+(v>1?'s':'')+'</span></span>'+
       '<span class="action-row-ctrl">'+btns+'</span></div>';
  });
  return z;
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

  let ins;
  if(st.phase==='blackMoon') ins='🌑 La Lune Noire s\'est levée. La suite de l\'aventure arrive bientôt…';
  else {
    const left=avActsLeft(st,pseudo), mates=h.players.filter(p=>p!==pseudo);
    const waiting=Object.keys(st.players).filter(ps=>avHeroOf(st,ps) && avActsLeft(st,ps)>0).length;
    if(left>0) ins='⏳ <strong>Tour libre</strong> — il te reste '+left+' action'+(left>1?'s':'')+(mates.length?' <span class="t-warm-sm">('+escHtml(mates.join(', '))+' a la sienne)</span>':'');
    else ins='✓ Tu as joué tes actions. En attente de '+waiting+' joueur'+(waiting>1?'s':'')+'…';
  }
  avSet('av-instruction', ins);
  avKeepSelects('av-alert', ()=>avSet('av-alert', avAlertHtml(st,h,pseudo)));

  const keys=[h.pos].concat(avNeighbors(st,h.pos).map(n=>n.key));
  avSet('av-map', avMapSvg(st, keys, h.pos, false)+avLegendHtml());

  const my=avCanAct(st,pseudo);
  avSet('av-cta',
    avBtn('btn-primary-continue','Repos (+'+AV_REST_HEAL+' PV)','avelRest(\''+esc+'\')', !my || h.pv>=AV_PV_MAX, h.pv>=AV_PV_MAX?'PV déjà au maximum':'')+
    '<button class="btn-secondary" onclick="avelShowMap()">Voir toute la carte</button>');
  avKeepSelects('av-actions', ()=>avSet('av-actions', avActionsHtml(st, pseudo)));
  avSet('av-inventory', avInventoryHtml(h, pseudo));
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
  const secsSel='<select class="dd" onchange="avelSetRoundSecs(this.value)">'+AV_ROUND_CHOICES.map(s=>'<option value="'+s+'"'+(s===st.roundSecs?' selected':'')+'>'+(s/60)+' min</option>').join('')+'</select>';
  let status, players, ctrl;
  if(st.phase==='lobby'){
    status='<div class="dpill">Lobby ouvert</div><div class="dpill">Joueurs <strong>'+nP+'</strong></div>';
    players=Object.values(st.players).sort((a,b)=>(a.at||0)-(b.at||0)).map(p=>'<div class="player-row"><span class="player-name">'+escHtml(p.pseudo)+'</span></div>').join('');
    const nH=Math.min(nP,AV_MAX_HEROES);
    ctrl='<div class="diamant-voted">'+nP+' joueur(s) : '+nH+' héros'+(nP>AV_MAX_HEROES?' (certains héros seront partagés à 2)':'')+'. Maximum '+AV_MAX_PLAYERS+' joueurs.</div>'+
      '<div class="dd-row u-mt-sm"><span class="dd-label">Durée d\'un tour</span>'+secsSel+'</div>'+
      '<button class="btn-primary u-mt-sm" onclick="avelLaunch()"'+(nP?'':' disabled')+'>Lancer la partie'+(nP?' ('+nP+')':'')+'</button>'+
      '<button class="btn-primary-danger u-mt-sm" onclick="avelCancel()">Fermer le lobby</button>';
  } else {
    status=avStatusPills(st)+'<div class="dpill">Sceaux <strong>'+st.seals+'</strong></div><div class="dpill">Murailles <strong>'+st.walls+'/'+st.limit+'</strong></div><div class="dpill">Pièges <strong>'+st.traps.length+'/'+st.limit+'</strong></div>';
    players=st.heroes.map(h=>{
      const t=st.tiles[h.pos];
      const acts=h.players.map(ps=>escHtml(ps)+' ('+avActsLeft(st,ps)+')').join(', ');
      return '<div class="player-row">'+
        '<span class="player-name">'+escHtml(avHeroDef(h.id).nom)+' — '+acts+'</span>'+
        '<span class="player-infos"><span class="player-info">PV '+h.pv+'/'+AV_PV_MAX+'</span><span class="player-info">Or '+h.coins+'</span><span class="player-info">Sac '+avBagVol(h)+'/'+AV_BAG_CAP+'</span><span class="player-info">'+escHtml(avTileDef(t).nom)+'</span></span></div>';
    }).join('');
    if(st.phase==='play'){
      ctrl='<div class="diamant-voted">Tour libre : entre parenthèses, les actions restantes de chaque joueur. Le tour se termine quand tout le monde a joué ou à la fin du minuteur.</div>'+
        '<div class="dd-row"><span class="dd-label">Durée d\'un tour (dès le tour suivant)</span>'+secsSel+'</div>'+
        '<button class="btn-primary u-mt-sm" onclick="avelEndRoundNow()">Terminer le tour maintenant</button>'+
        '<button class="btn-primary-danger u-mt-sm" onclick="avelCancel()">Abandonner la partie</button>';
    } else {
      ctrl='<div class="diamant-voted">La Lune Noire s\'est levée : fin du contenu disponible pour l\'instant (la Bête arrive au lot 6).</div>'+
        '<button class="btn-primary-danger" onclick="avelCancel()">Clôturer la partie</button>';
    }
  }
  avSet('aa-status', avNoEmoji(status));
  avSet('aa-event', avNoEmoji(escHtml(st.lastEvent||'')));
  avSet('aa-players', avNoEmoji(players));
  avSet('aa-controls', ctrl);
  renderGameLibrary();
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODALES (une seule boîte, contenu rafraîchi en direct)
// ═══════════════════════════════════════════════════════════════════════════
let avModal=null;   // { type:'rules'|'history'|'map'|'hero'|'lieu', id }
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
      '<div class="av-map-heroes">'+avel.heroes.map(x=>'<span class="av-map-hero">'+avHeroDot(x.id)+' '+escHtml(avHeroDef(x.id).nom)+' <span class="action-row-sub">'+escHtml(x.players.join(', '))+'</span></span>').join('')+'</div>'+
      '<div class="action-row-sub u-mt-sm">'+AV_ICO.wall+' Murailles '+avel.walls+'/'+avel.limit+' · '+AV_ICO.seal+' Sceaux restants '+avel.seals+' · '+AV_ICO.trap+' Pièges '+avel.traps.length+'/'+avel.limit+'</div>';
  }
  else if(avModal.type==='hero') h=avHeroDetailHtml(avel, avModal.id);
  else if(avModal.type==='lieu') h=avPlaceHtml(avel, currentViewerPseudo);
  avKeepSelects('avel-modal-content', ()=>avSet('avel-modal-content', h));
}
// Contenu de la modale « Action de lieu »
function avPlaceHtml(st, pseudo){
  const h=avHeroOf(st,pseudo); if(!h) return '';
  const t=st.tiles[h.pos], def=avTileDef(t), esc=escAttr(pseudo), my=avCanAct(st,pseudo);
  let body='', canGo=my, label='Valider';
  const row=(lbl, ctrl)=>'<div class="action-row"><span class="action-row-label">'+lbl+'</span><span class="action-row-ctrl">'+ctrl+'</span></div>';
  const coins='<div class="stat-row"><span>Tes pièces d\'or</span><strong>🪙 '+h.coins+'</strong></div>';
  if(def.act==='marche'){
    const items=avAllItems(h).map(it=>avOpt('sell:'+it.id, 'Vendre '+avItemDef(it).nom+' (+'+AV_PRICE.sell+')'));
    const sel=(id,first)=>'<select class="dd" id="'+id+'">'+first+avOpt('buy','Acheter un objet (−'+AV_PRICE.buy+')')+items.join('')+'</select>';
    body=coins+row('Transaction 1', sel('av-mk-1',''))+row('Transaction 2', sel('av-mk-2','<option value="">Aucune</option>'))+
      '<div class="action-row-sub">Les ventes passent avant les achats. Chaque achat te propose '+AV_PICK_COUNT+' objets : tu en gardes 1.</div>';
  } else if(def.act==='atelier'){
    const ups=avUpgradable(h);
    body=coins+(ups.length ? row('Objet à améliorer ('+AV_PRICE.upgrade+' 🪙)', '<select class="dd" id="av-at-sel">'+ups.map(it=>avOpt(it.id, avItemDef(it).nom)).join('')+'</select>')+
      ups.map(it=>'<div class="action-row-sub">'+escHtml(avItemDef(it).nom)+' amélioré : '+escHtml(AV_ITEMS[it.k].up||'')+'</div>').join('')
      : '<div class="diamant-voted">Aucun objet à améliorer.</div>');
    canGo=my && ups.length>0; label='Améliorer';
  } else if(def.act==='cercle'){
    const lairs=Object.keys(st.tiles).filter(k=>{ const x=st.tiles[k]; return x.rev && avTileDef(x).lair && !x.seal && !x.monsters.length; });
    if(avClosed(st,'seal')){ body='<div class="diamant-voted">Le druide a quitté le cercle : plus de sceaux possibles.</div>'; canGo=false; }
    else {
      body=coins+'<div class="stat-row"><span>Sceaux restants</span><strong>'+AV_ICO.seal+' '+st.seals+'</strong></div>'+
        (lairs.length ? row('Repaire à sceller ('+AV_PRICE.seal+' 🪙)', '<select class="dd" id="av-ce-sel">'+lairs.map(k=>avOpt(k, avTileDef(st.tiles[k]).nom)).join('')+'</select>')
                      : '<div class="diamant-voted">Aucun repaire révélé et vide à sceller.</div>')+
        '<div class="action-row-sub">Un repaire scellé ne fait plus jamais apparaître de monstre.</div>';
      canGo=my && lairs.length>0 && st.seals>0;
    }
    label='Sceller';
  } else if(def.act==='carriere'){
    body=coins+'<div class="stat-row"><span>Murailles au château</span><strong>'+AV_ICO.wall+' '+st.walls+'/'+st.limit+'</strong></div>'+
      '<div class="action-row-sub">Chaque muraille arrêtera un monstre devant le château (la Bête les détruit toutes d\'un coup).</div>';
    canGo=my && st.walls<st.limit; label='Bâtir ('+AV_PRICE.wall+' 🪙)';
  } else if(def.act==='camp'){
    const types=[]; for(let i=0;i<st.limit;i++) if(!st.traps.some(x=>x.type===i)) types.push(i);
    const tiles=Object.keys(st.tiles).filter(k=>k!=='0,0' && st.tiles[k].rev && !st.traps.some(x=>x.tile===k));
    if(avClosed(st,'trap')){ body='<div class="diamant-voted">Les elfes ont quitté leur camp : plus de pièges possibles.</div>'; canGo=false; }
    else {
      body=coins+(types.length
        ? row('Piège', '<select class="dd" id="av-ca-type">'+types.map(i=>avOpt(String(i), 'Piège '+(i+1)+' ('+AV_TRAP_COSTS[i]+' 🪙)')).join('')+'</select>')+
          row('Tuile', '<select class="dd" id="av-ca-tile">'+tiles.map(k=>avOpt(k, avTileDef(st.tiles[k]).nom)).join('')+'</select>')
        : '<div class="diamant-voted">Tous les pièges sont posés.</div>')+
        '<div class="action-row-sub">Les pièges blesseront la Bête quand elle passera dessus : elle suit toujours le plus court chemin vers le château.</div>';
      canGo=my && types.length>0 && tiles.length>0;
    }
    label='Poser le piège';
  } else if(def.act==='lac'){
    const last=(h.dice && h.dice.round===st.round) ? '<div class="diamant-voted">Dernier lancer : '+h.dice.faces+' — '+escHtml(h.dice.out)+'</div>' : '';
    body=coins+'<div class="rules-section"><ul>'+
      '<li>⚔️ ⚔️ : +'+AV_PRICE.lakeCoins+' pièces d\'or</li><li>⚔️ 🛡️ : un objet</li><li>🛡️ 🛡️ : une amélioration</li>'+
      '<li>✨ compte comme ⚔️. Sinon, une relance automatique.</li></ul></div>'+last;
    canGo=my && h.coins>=AV_PRICE.lake; label='Lancer les dés ('+AV_PRICE.lake+' 🪙)';
  }
  const warn = !my ? '<div class="action-row-sub u-mt-sm">'+(avActsLeft(st,pseudo)>0?'Termine d\'abord ce qui est en attente (objet, sac…).':'Tu as déjà joué tes actions ce tour-ci.')+'</div>' : '';
  return '<h2 class="rules-title">'+def.ico+' '+escHtml(def.nom)+'</h2>'+body+
    '<div class="u-mt-md">'+avBtn('btn-primary', label+' — 1 action', 'avelPlaceFromUi(\''+esc+'\')', !canGo)+'</div>'+warn;
}
function avHeroDetailHtml(st, id){
  const x=st.heroes[id]; if(!x) return '';
  const t=st.tiles[x.pos], def=avTileDef(t);
  return '<h2 class="rules-title">'+avHeroDot(x.id)+' '+escHtml(avHeroDef(x.id).nom)+'</h2>'+
    '<div class="stat-row"><span>Joué par</span><strong>'+escHtml(x.players.join(', '))+'</strong></div>'+
    '<div class="stat-row"><span>Points de vie</span><strong>❤️ '+x.pv+'/'+AV_PV_MAX+'</strong></div>'+
    '<div class="stat-row"><span>Position</span><strong>'+def.ico+' '+escHtml(def.nom)+'</strong></div>'+
    '<div class="stat-row"><span>Pièces d\'or</span><strong>'+x.coins+'</strong></div>'+
    AV_SLOTS.map(([s,l])=>'<div class="stat-row"><span>'+l+'</span><strong>'+(x.eq[s]?escHtml(avItemLabel(x.eq[s])):'Vide')+'</strong></div>').join('')+
    '<div class="stat-row"><span>Sac à dos ('+avBagVol(x)+'/'+AV_BAG_CAP+')</span><strong>'+(x.bag.length?escHtml(x.bag.map(it=>avItemDef(it).nom).join(', ')):'—')+'</strong></div>';
}
function avHistoryHtml(st){
  const hist=st.history||[];
  let h='<h2 class="rules-title">📋 Historique des actions</h2>';
  if(!hist.length) return h+'<p>Aucune action pour l\'instant.</p>';
  return h+'<div class="hist-list">'+hist.slice().reverse().map(a=>
    '<div class="hist-row"><span class="hist-msg">'+escHtml(a.msg||'')+'</span><span class="hist-turn">T'+(a.turn||'?')+'</span></div>').join('')+'</div>';
}
function avRulesHtml(){
  const faces=c=>AV_DICE[c].map(f=>AV_FACE_ICO[f]).join(' ');
  const items=slot=>Object.keys(AV_ITEMS).filter(k=>AV_ITEMS[k].slot===slot)
    .map(k=>'<tr><td>'+AV_ITEMS[k].ico+' <strong>'+escHtml(AV_ITEMS[k].nom)+'</strong></td><td>'+escHtml(AV_ITEMS[k].base)+'</td><td>'+escHtml(AV_ITEMS[k].up||'—')+'</td></tr>').join('');
  const table=(slot,title)=>'<h4>'+title+'</h4><table class="rules-table"><thead><tr><th>Objet</th><th>Base</th><th>Amélioré</th></tr></thead><tbody>'+items(slot)+'</tbody></table>';
  return '<h2 class="rules-title">Chroniques d\'Avel — Comment jouer</h2>'+
  '<div class="rules-section"><h3>🎯 Le but</h3><ul>'+
    '<li>Jeu <strong>coopératif</strong> : tous les héros gagnent ou perdent ensemble.</li>'+
    '<li>Explorez les terres autour du château, équipez-vous et préparez-vous : quand la <strong>Lune Noire</strong> se lèvera, la Bête marchera sur le château avec tous les monstres.</li>'+
    '<li>Si un seul monstre entre dans le château, la partie est perdue.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🧙 Les héros</h3><ul>'+
    '<li>Jusqu\'à '+AV_MAX_HEROES+' héros. Au-delà de '+AV_MAX_HEROES+' joueurs, deux joueurs se partagent un héros : chacun a <strong>1 des 2 actions</strong>.</li>'+
    '<li>Chaque héros a '+AV_PV_MAX+' PV et commence au château avec '+AV_START_COINS+' pièce d\'or et 1 équipement tiré au hasard.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🔄 Un tour (tour libre)</h3><ul>'+
    '<li>Chaque héros a <strong>'+AV_ACTIONS+' actions</strong> par tour, à jouer <strong>quand il veut</strong> avant la fin du minuteur ⏱. Les actions non jouées sont perdues.</li>'+
    '<li>Le tour se termine dès que tout le monde a joué, ou à la fin du minuteur.</li>'+
    '<li>🚶 <strong>Se déplacer</strong> vers une tuile voisine. Une tuile cachée se révèle à ton arrivée ; si c\'est un repaire, un monstre en sort.</li>'+
    '<li>'+AV_ICO.shortcut+' <strong>Raccourci</strong> : depuis une tuile '+AV_ICO.shortcut+' révélée, va directement sur une autre tuile '+AV_ICO.shortcut+' révélée.</li>'+
    '<li>❤️ <strong>Repos</strong> : +'+AV_REST_HEAL+' PV (maximum '+AV_PV_MAX+').</li>'+
    '<li>🏠 <strong>Action de lieu</strong> : voir ci-dessous.</li>'+
    '<li>⚔️ <strong>Combat</strong> : arrive bientôt.</li>'+
    '<li>🤝 <strong>Don</strong> : gratuit, tant qu\'il te reste des actions ce tour. Donne une pièce ou un objet à un héros sur ta tuile, s\'il n\'y a pas de monstre.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🏠 Les lieux (1 action)</h3><ul>'+
    '<li>🛒 <strong>Marché</strong> : acheter un objet ('+AV_PRICE.buy+' 🪙, '+AV_PICK_COUNT+' objets proposés, tu en gardes 1 en '+AV_PICK_SECS+' s) ou en vendre un (+'+AV_PRICE.sell+' 🪙). Jusqu\'à 2 transactions.</li>'+
    '<li>⚗️ <strong>Atelier d\'alchimie</strong> : '+AV_PRICE.upgrade+' 🪙 pour passer un objet sur sa face améliorée ✦.</li>'+
    '<li>🗿 <strong>Cercle de pierres</strong> : '+AV_PRICE.seal+' 🪙 pour sceller '+AV_ICO.seal+' un repaire révélé et vide. Ferme à « Fin des sceaux ».</li>'+
    '<li>⛏️ <strong>Carrière</strong> : '+AV_PRICE.wall+' 🪙 pour une muraille '+AV_ICO.wall+' au château.</li>'+
    '<li>🏹 <strong>Camp des elfes</strong> : un piège '+AV_ICO.trap+' contre la Bête ('+AV_TRAP_COSTS.slice(0,3).join(' / ')+' 🪙, un de chaque, un par tuile). Ferme à « Fin des pièges ».</li>'+
    '<li>🏞️ <strong>Lac aux souhaits</strong> : '+AV_PRICE.lake+' 🪙, 2 dés verts. ⚔️⚔️ = '+AV_PRICE.lakeCoins+' 🪙 · ⚔️🛡️ = un objet · 🛡️🛡️ = une amélioration. ✨ compte comme ⚔️. Sinon une relance.</li>'+
    '<li>🏚️ <strong>Village abandonné</strong> et 🌾 <strong>Terres sauvages</strong> : +'+AV_COIN_GAIN+' 🪙, s\'il n\'y a pas de monstre.</li>'+
    '<li>À partir de 5 héros : 4 sceaux, 4 murailles et 4 pièges (le 4ᵉ coûte '+AV_TRAP_COSTS[3]+' 🪙).</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🎒 Équipement et sac à dos</h3><ul>'+
    '<li>3 objets portés : arme, bouclier, casque. Ils ne prennent pas de place.</li>'+
    '<li>Le sac a <strong>'+AV_BAG_CAP+' places</strong> : une pièce = '+AV_VOL.coin+' place, un équipement = '+AV_VOL.equip+' places, un élixir = '+AV_VOL.elixir+' place.</li>'+
    '<li>Si le sac déborde, jette des pièces ou des objets avant de rejouer. Équiper, ranger et jeter sont gratuits.</li>'+
  '</ul>'+table('arme','Armes')+table('bouclier','Boucliers')+table('casque','Casques')+
    '<h4>Élixirs (usage unique)</h4><table class="rules-table"><tbody>'+Object.keys(AV_ITEMS).filter(k=>AV_ITEMS[k].slot==='elixir').map(k=>'<tr><td>'+AV_ITEMS[k].ico+' <strong>'+escHtml(AV_ITEMS[k].nom)+'</strong></td><td>'+escHtml(AV_ITEMS[k].base)+'</td></tr>').join('')+'</tbody></table></div>'+
  '<div class="rules-section"><h3>🎲 Les dés</h3><table class="rules-table"><tbody>'+
    '<tr><td><strong>Vert</strong> (base)</td><td>'+faces('vert')+'</td></tr><tr><td><strong>Orange</strong> (attaque)</td><td>'+faces('orange')+'</td></tr>'+
    '<tr><td><strong>Bleu</strong> (défense)</td><td>'+faces('bleu')+'</td></tr><tr><td><strong>Jaune</strong> (magie)</td><td>'+faces('jaune')+'</td></tr>'+
    '<tr><td><strong>Violet</strong> (monstre faible)</td><td>'+faces('violet')+'</td></tr><tr><td><strong>Noir</strong> (monstre fort)</td><td>'+faces('noir')+'</td></tr>'+
  '</tbody></table><p class="rules-note">Familles de monstres : '+Object.values(AV_FAMS).map(f=>f.ico+' '+f.nom).join(' · ')+'.</p></div>'+
  '<div class="rules-section"><h3>🌙 La piste lunaire</h3><p>À la fin de chaque tour, la lune avance d\'une case :</p><ul>'+
    '<li>👹 <strong>Apparition</strong> : un monstre surgit sur chaque repaire révélé, vide et non scellé.</li>'+
    '<li>❤️ <strong>Soin</strong> : chaque héros récupère 1 PV.</li>'+
    '<li>🗿 / 🏹 <strong>Fermetures</strong> : le cercle de pierres puis le camp des elfes ferment.</li>'+
    '<li>🌑 <strong>Lune Noire</strong> : la Bête apparaît.</li>'+
  '</ul><p class="rules-note">Le combat et la Bête arrivent dans les prochaines versions.</p></div>';
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') avelHideModal(); });
}