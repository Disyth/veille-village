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
const AV_COIN_GAIN   = 2;     // pièces gagnées à Nidhiver / à la Clairière de la Source
const AV_ACTIONS     = 2;     // actions par héros et par tour
const AV_ROUND_SECS  = 180;   // durée par défaut d'un tour (le meneur peut la changer)
const AV_ROUND_CHOICES = [60, 120, 180, 300];
const AV_PICK_SECS   = 15;    // temps pour choisir 1 objet parmi 3
const AV_PICK_COUNT  = 3;
const AV_STALL_SIZE  = 4;     // objets exposés sur l'étal du marché

// Sac à dos : capacité et volume de chaque chose (les objets PORTÉS ne prennent pas de place)
const AV_BAG_CAP = 8;   // 8 places : assez pour payer le 3ᵉ piège (7 pièces)
const AV_VOL = { coin:1, equip:2, elixir:1 };

// Prix des lieux
const AV_PRICE = { buy:3, sell:2, upgrade:3, seal:3, wall:3, lake:1, lakeCoins:4 };
const AV_TRAP_COSTS = [3, 5, 7, 8];   // 3 pièges (4 à partir de 5 héros) — jamais plus que la capacité du sac
// Effet des pièges sur la Bête : dés lancés quand elle entre sur la tuile + blessures fixes en plus
// (chaque ⚔️ ou ✨ obtenu = 1 blessure)
const AV_TRAPS = [
  { dice:['vert','vert'],                      bonus:0 },
  { dice:['orange','orange'],                  bonus:1 },
  { dice:['orange','orange','orange'],         bonus:2 },
  { dice:['orange','orange','orange'],         bonus:3 },
];

// ── LA BÊTE ET LA FIN DE PARTIE (lot 6) ──
// Résistance de la Bête : 14 (1-2 héros), 17 (3), 20 (4), puis +3 par héros
function avBeastRes(nHeroes){ return nHeroes<=2 ? 14 : 17 + 3*(nHeroes-3); }
// Difficulté (choisie au lobby) : monstres en plus qui surgissent à la Lune Noire,
// sur des tuiles SANS repaire (comme le jeton cratère du jeu)
const AV_DIFFS = {
  facile:    { nom:'Facile',    petit:n=>Math.ceil(n/2), grand:n=>0 },
  normal:    { nom:'Normal',    petit:n=>n,              grand:n=>1 },
  difficile: { nom:'Difficile', petit:n=>n+1,            grand:n=>2 },
};
const AV_DIFF_DEFAULT = 'facile';
// Points pour le feu commun
const AV_FIRE_WIN      = 50;   // victoire
const AV_FIRE_PER_KILL = 10;   // par monstre vaincu (Bête comprise), victoire ou défaite
// Sceaux, murailles et pièges disponibles : 3 (4 à partir de 5 héros)
function avLimit(nHeroes){ return nHeroes>=5 ? 4 : 3; }

// Piste lunaire : on avance d'une case à chaque fin de tour, puis on applique le symbole.
//   lair = apparition des monstres · heart = +1 PV pour tous · seal / trap = fermeture du
//   cercle de pierres / du camp des elfes · moon = la Lune Noire se lève · none = rien
const AV_MOON_TRACK = ['start','lair','heart','none','lair','heart','none','lair','seal','none','trap','moon'];   // 3 cases « Apparition »
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
  { nom:'Ysolde',     ini:'Y', f:true },
  { nom:'Gaspard',    ini:'G' },
  { nom:'Mélusine',   ini:'M', f:true },
  { nom:'Théobald',   ini:'T' },
  { nom:'Brunehilde', ini:'B', f:true },
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
  chateau:  { nom:'Le Village',          ico:'🏘️' },
  marche:   { nom:'Marché',              ico:'🛒', act:'marche' },
  village:  { nom:'Nidhiver',            ico:'🏚️', act:'coins' },
  lisiere:  { nom:'Lisière',             ico:'🌳', lair:'petit' },
  sauvage:  { nom:'Clairière de la Source', ico:'🌾', lair:'petit', act:'coins' },
  cercle:   { nom:'Cercle de pierres',   ico:'🗿', act:'cercle' },
  carriere: { nom:'Carrière',            ico:'⛏️', act:'carriere' },
  camp:     { nom:'Camp des elfes',      ico:'🏹', act:'camp' },
  lac:      { nom:'Lac aux souhaits',    ico:'🏞️', act:'lac' },
  atelier:  { nom:'Atelier de Babayaga', ico:'⚗️', act:'atelier' },
  foret:    { nom:'Les Bois Perdus',     ico:'🌲', lair:'petit' },
  marais:   { nom:'Marais',              ico:'🌿', lair:'petit', lairs:2 },   // 2 repaires (comme la tuile violette de départ)
  grotte:   { nom:'Nid-Profond',         ico:'🕳️' },
  collines: { nom:'Station Céleste',     ico:'🔭' },
  ruines:   { nom:'Ruines maudites',     ico:'🏛️', lair:'grand' },
  antre:    { nom:'Caverne du crâne',    ico:'🦴', lair:'grand' },
  gouffre:  { nom:'Asphodel',            ico:'🥀', lair:'grand' },
  cratere:  { nom:'Cratère',             ico:'🌑' },
  plaine:   { nom:'Plaine',              ico:'🌼' },
};
// Le lieu à défendre (ex-« château ») : formes utilisées dans les textes
const AV_HOME = { nom:'le Village', au:'au Village', du:'du Village', dans:'dans le Village' };

// ── MISE EN PLACE (d'après le livret) ──
// Le Village est posé en BAS du plateau (au-dessus de la piste lunaire) ; les terres s'étendent vers le haut.
// Coordonnées axiales q,r d'hexagones « pointe sur le côté » : r-1 = case du dessus.
const AV_LAYOUT = [
  '0,0',                                  // le Village
  '-1,0', '0,-1', '1,-1',                 // tuiles de départ, autour du Village
  '-2,0', '-2,-1', '-2,-2',               // colonne de gauche
  '-1,-1', '-1,-2', '-1,-3',
  '0,-2', '0,-3', '0,-4',
  '1,-2', '1,-3', '1,-4',
  '2,-2', '2,-3', '2,-4',                 // colonne de droite
];
// 3 tuiles de départ face visible : Lisière (gauche), Marché (au-dessus), Marais à 2 repaires (droite)
// → 3 petits monstres au départ, comme dans le jeu
const AV_START_TILES = { '-1,0':'lisiere', '0,-1':'marche', '1,-1':'marais' };
const AV_CRATER_POS  = '0,-4';            // le Cratère est visible dès le début, tout en haut, loin du Village
const AV_HIDDEN_BAG  = ['cercle','carriere','camp','lac','atelier','village','sauvage','foret','grotte','collines','ruines','antre','gouffre','plaine'];
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
  // La Bête : sa résistance dépend du nombre de héros (stockée sur le monstre). Elle appartient
  // aux 3 familles : tous les objets « contre une famille » marchent contre elle.
  bete:      { nom:'La Bête',              ico:'👿', res:14, taille:'bete', fam:'all' },
};
const AV_MONSTER_COPIES = 2;

// ── COMBAT ──
// dice : dés lancés par le monstre · loot : récompense { coins, item, upg }
// malus (grands monstres) : vert = 1 dé vert en moins · couleur = 1 dé orange, bleu et jaune en moins ·
// arme / bouclier / casque = effets de cet emplacement bloqués · elixir = élixirs interdits
const AV_MON_COMBAT = {
  chauve:    { dice:['violet'],                         loot:{ coins:2 } },
  rat:       { dice:['violet','violet'],                loot:{ coins:2 } },
  follet:    { dice:['noir'],                           loot:{ item:1 } },
  gobelin:   { dice:['violet','noir'],                  loot:{ coins:3 } },
  loup:      { dice:['noir','violet'],                  loot:{ item:1 } },
  araignee:  { dice:['violet','violet'],                loot:{ coins:3 } },
  serpent:   { dice:['noir'],                           loot:{ upg:1 } },
  squelette: { dice:['violet','noir'],                  loot:{ item:1 } },
  ours:      { dice:['noir','noir'],                    loot:{ item:1, coins:2 }, malus:'vert' },
  basilic:   { dice:['noir','violet','violet'],         loot:{ upg:1, coins:2 },  malus:'bouclier' },
  troll:     { dice:['noir','noir','violet'],           loot:{ item:1, coins:2 }, malus:'arme' },
  liche:     { dice:['noir','noir','violet'],           loot:{ upg:1, coins:2 },  malus:'elixir' },
  minotaure: { dice:['noir','noir','noir'],             loot:{ item:1, coins:2 }, malus:'casque' },
  wyverne:   { dice:['noir','noir','noir','violet'],    loot:{ item:1, coins:4 }, malus:'couleur' },
  bete:      { dice:['noir','noir','violet','violet','violet'], loot:{} },
};
const AV_MALUS_LABEL = { vert:'1 dé vert en moins', couleur:'1 dé orange, bleu et jaune en moins', arme:'tes effets d\'arme sont bloqués', bouclier:'tes effets de bouclier sont bloqués', casque:'tes effets de casque sont bloqués', elixir:'élixirs interdits' };
const AV_CLASHES = 3;                 // affrontements maximum par combat
const AV_HERO_DICE = 2;               // dés verts de base
const AV_COMBAT_ELIXIRS = { elixForce:'orange', elixGarde:'bleu', elixArcane:'jaune' };
// Effets des objets en combat (lus par le moteur). dice : dés en plus à chaque affrontement ·
// att / def : +1 ⚔️ / +1 🛡️ une fois par combat (contre une famille, ou '*' = toutes) ·
// reroll : relance de dés vides, une fois par combat · monReroll : fait relancer une attaque du monstre ·
// heal : PV rendus après une victoire
const AV_FX = {
  epee:     { base:{ dice:{orange:1} },                       up:{ dice:{orange:2} } },
  hache:    { base:{ att:'bete' },                            up:{ dice:{orange:1}, att:'bete' } },
  masse:    { base:{ att:'maudit' },                          up:{ dice:{orange:1}, att:'maudit' } },
  lance:    { base:{ att:'brute' },                           up:{ dice:{orange:1}, att:'brute' } },
  baton:    { base:{ dice:{jaune:1} },                        up:{ dice:{jaune:2} } },
  dague:    { base:{ reroll:{ n:1, colors:['vert'] } },       up:{ reroll:{ n:2, colors:null } } },
  rondache: { base:{ dice:{bleu:1} },                         up:{ dice:{bleu:2} } },
  pavois:   { base:{ def:'brute' },                           up:{ dice:{bleu:1}, def:'brute' } },
  runique:  { base:{ def:'maudit' },                          up:{ dice:{bleu:1}, def:'maudit' } },
  ecu:      { base:{ def:'bete' },                            up:{ dice:{bleu:1}, def:'bete' } },
  targe:    { base:{ monReroll:['violet'] },                  up:{ monReroll:['noir','violet'] } },
  heaume:   { base:{ reroll:{ n:1, colors:['vert'] } },       up:{ dice:{vert:1} } },
  capuche:  { base:{ dice:{jaune:1} },                        up:{ dice:{jaune:1}, reroll:{ n:1, colors:['jaune'] } } },
  cornes:   { base:{ att:'*' },                               up:{ dice:{orange:1} } },
  couronne: { base:{ heal:1 },                                up:{ heal:2 } },
};

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
  if(!AV_DIFFS[st.diff]) st.diff=AV_DIFF_DEFAULT;
  if(typeof st.dark!=='boolean') st.dark=false;
  if(st.phase==='blackMoon'){ st.phase='play'; }   // partie lancée avant le lot 6 : la suite continue
  ['kills','darkRound','beastMax','points'].forEach(k=>{ if(typeof st[k]!=='number') st[k]=0; });
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
    if(typeof h.ko!=='boolean') h.ko=false;
    if(typeof h.discard!=='number') h.discard=0;
    if(typeof h.kills!=='number') h.kills=0;
    if(h.fight){
      const f=h.fight;
      f.rounds=avArr(f.rounds).map(r=>{ r.hd=avArr(r.hd); r.md=avArr(r.md); r.text=avArr(r.text); r.notes=avArr(r.notes); return r; });
      f.used=(f.used && typeof f.used==='object') ? f.used : {};
      if(f.pend){ f.pend.hd=avArr(f.pend.hd); f.pend.md=avArr(f.pend.md); f.pend.notes=avArr(f.pend.notes); } else f.pend=null;
      f.rr=(f.rr && typeof f.rr==='object') ? f.rr : {};
      if(typeof f.clash!=='number') f.clash=f.rounds.length;
      if(!f.over) f.over=null;
    } else h.fight=null;
  });
  Object.keys(st.tiles).forEach(key=>{
    const t=st.tiles[key];
    t.monsters = avArr(t.monsters);
    if(typeof t.rev!=='boolean')  t.rev=false;
    if(typeof t.sc!=='boolean')   t.sc=false;
    if(typeof t.seal!=='boolean') t.seal=false;
  });
  // Partie lancée avec une version précédente du jeu : on crée ce qui manque
  if(st.heroes.length){
    if(!st.limit){
      st.limit=avLimit(st.heroes.length);
      st.seals=st.limit-Object.values(st.tiles).filter(t=>t.seal).length;
    }
    if(!st.poolInit){   // pioche d'objets : tout le catalogue, moins les objets déjà détenus
      const pool=avBuildPool();
      st.heroes.forEach(h=>avAllItems(h).forEach(it=>{ const i=pool.indexOf(it.k); if(i>=0) pool.splice(i,1); }));
      st.pool=pool; st.poolInit=true;
    }
    if(!Array.isArray(st.stall)) st.stall = st.stall ? Object.values(st.stall) : avDraw(st, AV_STALL_SIZE);
  }
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
function avPositions(){ return AV_LAYOUT.slice(); }
function avBuildMap(){
  const tiles={};
  const mk=k=>({ k, rev:false, sc:false, seal:false, monsters:[] });
  tiles['0,0']=Object.assign(mk('chateau'),{ rev:true });
  Object.keys(AV_START_TILES).forEach(key=>{ tiles[key]=Object.assign(mk(AV_START_TILES[key]),{ rev:true }); });
  tiles[AV_CRATER_POS]=Object.assign(mk('cratere'),{ rev:true });
  const free=avPositions().filter(key=>!tiles[key]);
  const bag=avShuffle(AV_HIDDEN_BAG);
  free.forEach((key,i)=>{ tiles[key]=mk(bag[i]); });
  avShuffle(Object.keys(tiles).filter(key=>key!=='0,0' && tiles[key].k!=='cratere'))
    .slice(0, AV_SHORTCUTS).forEach(key=>{ tiles[key].sc=true; });
  return tiles;
}
function avBuildDecks(){
  const deck={ petit:[], grand:[] };
  Object.keys(AV_MONSTERS).forEach(k=>{ const tz=AV_MONSTERS[k].taille; if(!deck[tz]) return; for(let i=0;i<AV_MONSTER_COPIES;i++) deck[tz].push(k); });
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
// Un repaire révélé, vide et non scellé se remplit : 1 monstre par repaire (2 pour le Marais).
// Renvoie la liste des monstres apparus.
function avSpawn(st, key){
  const t=st.tiles[key]; if(!t) return [];
  const def=avTileDef(t);
  if(!def.lair || !t.rev || t.seal || t.monsters.length) return [];
  const out=[];
  for(let i=0;i<(def.lairs||1);i++){
    if(!st.deck[def.lair].length){
      const pile=[];
      Object.keys(AV_MONSTERS).filter(k=>AV_MONSTERS[k].taille===def.lair).forEach(k=>{ for(let j=0;j<AV_MONSTER_COPIES;j++) pile.push(k); });
      st.deck[def.lair]=avShuffle(pile);
    }
    const k=st.deck[def.lair].shift();
    t.monsters.push({ id:avNewId('m'), k, dmg:0 });
    out.push(AV_MONSTERS[k]);
  }
  return out;
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
// delayMs : le minuteur ne démarre qu'après ce délai (ex. animation des dés d'un combat)
function avStartPick(st, h, count, delayMs){
  const opts=avDraw(st, AV_PICK_COUNT);
  if(!opts.length){ avLog(st, '🎁 La pioche d\'objets est vide.'); h.pick=null; return; }
  h.pick={ opts, until:avNow()+(delayMs||0)+AV_PICK_SECS*1000, left:count||1 };
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
  if(h.ko) return 'ko';
  if(h.pick) return 'pick';
  if(h.upg>0) return 'upg';
  if(h.discard>0) return 'discard';
  if(avFighting(h)) return 'fight';
  if(avOverflow(h)) return 'bag';
  return null;
}
function avFighting(h){ return !!(h && h.fight && !h.fight.over); }
function avCanAct(st, pseudo){
  return !!st && st.active && st.phase==='play' && avActsLeft(st,pseudo)>0 && !avBlocker(avHeroOf(st,pseudo));
}
function avAllDone(st){
  if(st.heroes.some(avFighting)) return false;   // on ne termine pas le tour pendant un combat
  return Object.keys(st.players).filter(ps=>avHeroOf(st,ps)).every(ps=>avActsLeft(st,ps)===0);
}

// Une action jouée : on la décompte, et le tour se termine si tout le monde a joué
function avSpend(st, pseudo){
  st.players[pseudo].acts++;
  if(avAllDone(st)) avEndRound(st);
}
function avEndRound(st){
  Object.values(st.players).forEach(p=>{ p.acts=0; p.mkt=0; });
  st.heroes.forEach(h=>{
    if(avFighting(h)){ h.fight.over='timeout'; h.fight.pend=null; avUnlockMonster(st, h.fight); }
    if(h.ko){
      h.ko=false; h.pv=AV_PV_MAX; h.pos='0,0';
      avLog(st, '🌅 '+avHeroDef(h.id).nom+' se réveille '+AV_HOME.au+', PV au maximum.');
    }
  });
  const R=st.round;
  if(st.dark){
    avMarch(st);
    if(st.phase!=='play') return;   // un monstre est entré dans le Village (ou la Bête est tombée dans un piège fatal)
    st.round++;
    st.deadline=avNow()+st.roundSecs*1000;
    return;
  }
  st.moon=Math.min(st.moon+1, AV_MOON_TRACK.length-1);
  const sym=AV_MOON_TRACK[st.moon];
  if(sym==='lair'){
    const spawned=[]; let big=false;
    Object.keys(st.tiles).forEach(key=>{ avSpawn(st,key).forEach(m=>{ spawned.push(m.ico+' '+m.nom+' ('+avTileDef(st.tiles[key]).nom+')'); if(m.taille==='grand') big=true; }); });
    avLog(st, spawned.length ? '🌙 Fin du tour '+R+' — des monstres surgissent des repaires : '+spawned.join(', ')+'.' : '🌙 Fin du tour '+R+' — les repaires restent calmes.', big);
  } else if(sym==='heart'){
    st.heroes.forEach(h=>{ h.pv=Math.min(AV_PV_MAX, h.pv+1); });
    avLog(st, '🌙 Fin du tour '+R+' — la lune bienveillante soigne chaque héros de 1 PV.');
  } else if(sym==='seal'){
    avLog(st, '🌙 Fin du tour '+R+' — le druide quitte le cercle de pierres : plus de sceaux possibles.');
  } else if(sym==='trap'){
    avLog(st, '🌙 Fin du tour '+R+' — les elfes quittent leur camp : plus de pièges possibles.');
  } else if(sym==='moon'){
    avRaiseBlackMoon(st);
  } else {
    avLog(st, '🌙 Fin du tour '+R+'.');
  }
  st.round++;
  st.deadline=avNow()+st.roundSecs*1000;
}
function avMoonLeft(st){ return Math.max(0, AV_MOON_TRACK.indexOf('moon') - st.moon); }

// ── La Lune Noire se lève ──
function avDrawMonster(st, size){
  if(!st.deck[size] || !st.deck[size].length){
    const pile=[];
    Object.keys(AV_MONSTERS).filter(k=>AV_MONSTERS[k].taille===size).forEach(k=>{ for(let j=0;j<AV_MONSTER_COPIES;j++) pile.push(k); });
    st.deck[size]=avShuffle(pile);
  }
  return st.deck[size].shift();
}
function avCraterKey(st){ return Object.keys(st.tiles).find(k=>st.tiles[k].k==='cratere') || AV_CRATER_POS; }
function avRaiseBlackMoon(st){
  st.dark=true; st.darkRound=st.round+1; st.darkAt=avNow();
  // 1. Toutes les terres se révèlent, et les repaires vides se remplissent
  let n=0;
  Object.keys(st.tiles).forEach(k=>{ st.tiles[k].rev=true; });
  Object.keys(st.tiles).forEach(k=>{ n+=avSpawn(st,k).length; });
  // 2. Monstres du cratère (difficulté), sur des tuiles sans repaire
  const dif=AV_DIFFS[st.diff]||AV_DIFFS[AV_DIFF_DEFAULT], nH=st.heroes.length;
  // (jamais sur une tuile collée au Village : les héros ont au moins un tour pour réagir)
  const dist=avDistances(st);
  const spots=avShuffle(Object.keys(st.tiles).filter(k=>{ const t=st.tiles[k]; return dist[k]>=2 && t.k!=='cratere' && !avTileDef(t).lair; }));
  let i=0;
  [['petit',dif.petit(nH)],['grand',dif.grand(nH)]].forEach(([size,cnt])=>{
    for(let c=0;c<cnt && spots.length;c++){
      const key=spots[(i++)%spots.length];
      st.tiles[key].monsters.push({ id:avNewId('m'), k:avDrawMonster(st,size), dmg:0 });
      n++;
    }
  });
  // 3. La Bête sort du Cratère
  const res=avBeastRes(nH);
  st.tiles[avCraterKey(st)].monsters.push({ id:avNewId('m'), k:'bete', dmg:0, res });
  st.beastMax=res;
  avLog(st, '🌑 LA LUNE NOIRE SE LÈVE ! Toutes les terres se révèlent, '+avPlural(n,'monstre')+' surgissent, et 👿 la Bête ('+res+' PV) sort du '+AV_TILES.cratere.nom+'. Tous marchent sur '+AV_HOME.nom+' !', true);
}
// Distance (en tuiles) de chaque tuile au Village
function avDistances(st){
  const d={ '0,0':0 }, q=['0,0'];
  while(q.length){ const k=q.shift(); avNeighbors(st,k).forEach(n=>{ if(d[n.key]===undefined){ d[n.key]=d[k]+1; q.push(n.key); } }); }
  return d;
}
// Où se trouve la Bête (null si vaincue)
function avBeast(st){
  for(const k of Object.keys(st.tiles)){ const m=st.tiles[k].monsters.find(x=>x.k==='bete'); if(m) return { key:k, m }; }
  return null;
}
function avMonstersLeft(st){ return Object.values(st.tiles).reduce((s,t)=>s+t.monsters.length,0); }
// Victoire : après la Lune Noire, plus aucun monstre (Bête comprise)
function avCheckWin(st){
  if(st.dark && st.phase==='play' && !avMonstersLeft(st)){
    st.phase='end'; st.result='win'; st.points=avPoints(st); st.endAt=avNow();
    avLog(st, '🏆 VICTOIRE ! Tous les monstres sont vaincus : '+AV_HOME.nom+' est sauvé !', true);
  }
}
function avPoints(st){ return (st.result==='win' ? AV_FIRE_WIN : 0) + AV_FIRE_PER_KILL*(st.kills||0); }
// Fin de tour après la Lune Noire : chaque monstre avance d'une tuile vers le Village par le plus
// court chemin (petits, puis grands, puis la Bête). Murailles, pièges, et défaite si l'un d'eux entre.
function avMarch(st){
  const dist=avDistances(st), rank={ petit:0, grand:1, bete:2 };
  const list=[];
  Object.keys(st.tiles).forEach(k=>st.tiles[k].monsters.forEach(m=>list.push({ k, m })));
  list.sort((a,b)=>(rank[(AV_MONSTERS[a.m.k]||{}).taille]||0)-(rank[(AV_MONSTERS[b.m.k]||{}).taille]||0) || dist[a.k]-dist[b.k]);
  const moved=[];
  for(const { k, m } of list){
    const md=AV_MONSTERS[m.k]||{nom:'?',ico:'?'};
    delete m.fighter;
    // tuile suivante : le voisin le plus proche du Village (en cas d'égalité, le premier dans l'ordre des directions)
    const next=avNeighbors(st,k).map(n=>n.key).filter(n=>dist[n]===dist[k]-1)[0];
    if(!next) continue;
    if(next==='0,0'){
      if(st.walls>0){
        if(m.k==='bete'){ avLog(st, '🧱 '+md.ico+' La Bête pulvérise toutes les murailles '+AV_HOME.du+' ('+st.walls+') !', true); st.walls=0; }
        else { st.walls--; avLog(st, '🧱 '+md.ico+' '+md.nom+' brise une muraille '+AV_HOME.du+' ('+st.walls+' restante'+(st.walls>1?'s':'')+').'); }
        continue;   // il reste devant la porte et réessaiera au prochain tour
      }
      st.phase='end'; st.result='lose'; st.breach=md.nom; st.points=avPoints(st); st.endAt=avNow();
      avLog(st, '💀 DÉFAITE… '+md.ico+' '+md.nom+' entre dans '+AV_HOME.nom+'.', true);
      return;
    }
    st.tiles[k].monsters=st.tiles[k].monsters.filter(x=>x.id!==m.id);
    st.tiles[next].monsters.push(m);
    moved.push(md.ico);
    // Piège : seule la Bête le déclenche
    const ti=st.traps.findIndex(x=>x.tile===next);
    if(m.k==='bete' && ti>=0){
      const tr=AV_TRAPS[st.traps[ti].type]||AV_TRAPS[0];
      const faces=tr.dice.map(c=>avRoll(c)), dmg=faces.filter(f=>f==='att'||f==='sort').length+tr.bonus;
      m.dmg=Math.min(avMonRes(m), m.dmg+dmg);
      st.traps.splice(ti,1);
      avLog(st, '⛓️ La Bête tombe dans le piège elfique ('+avTileDef(st.tiles[next]).nom+') : '+faces.map(f=>AV_FACE_ICO[f]).join(' ')+(tr.bonus?' +'+tr.bonus:'')+' → '+avPlural(dmg,'blessure')+' ! Il lui reste '+(avMonRes(m)-m.dmg)+' PV.', dmg>=3);
      if(m.dmg>=avMonRes(m)){
        st.tiles[next].monsters=st.tiles[next].monsters.filter(x=>x.id!==m.id);
        st.kills=(st.kills||0)+1;
        avLog(st, '⛓️ Le piège achève la Bête !', true);
        avCheckWin(st);
        if(st.phase!=='play') return;
      }
    }
  }
  avLog(st, '👣 Fin du tour '+st.round+' — les monstres avancent vers '+AV_HOME.nom+(moved.length?' '+moved.join(''):'')+'.');
}

function avClosed(st, sym){ return st.moon >= AV_MOON_TRACK.indexOf(sym); }   // cercle (seal) / camp (trap) fermés
function avWallsClosed(st){ return !!st.dark && st.round > (st.darkRound||0); }    // carrière fermée le tour après l'arrivée de la Bête
const AV_SYM_LABEL = { march:'👣 Les monstres avancent', lair:'👹 Apparition', heart:'❤️ Soin', seal:'🗿 Fin des sceaux', trap:'🏹 Fin des pièges', moon:'🌑 Lune Noire', none:'Rien', start:'—' };

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
    if(b==='ko')   return 'Ton héros est évanoui jusqu\'au prochain tour.';
    if(b==='discard') return 'Défausse d\'abord un objet.';
    if(b==='fight') return 'Termine d\'abord ton combat.';
    const t=st.tiles[h.pos];
    const e=fn(st, h, t, avTileDef(t)); if(e) return e;
    st.players[pseudo].mkt=0;   // une autre action clôt les transactions du marché en cours
    avSpend(st, pseudo);
  });
}
// Marché : une action donne droit à 2 transactions (acheter ou vendre). La 1ʳᵉ consomme l'action,
// la 2ᵉ est gratuite tant que le joueur ne fait rien d'autre et que le tour continue.
const AV_MARKET_TX = 2;
function avMarketFree(st, pseudo){ const p=st.players[pseudo]; return p ? (p.mkt||0) : 0; }
function avCanMarket(st, pseudo){
  const h=avHeroOf(st,pseudo); if(!st || st.phase!=='play' || !h) return false;
  const b=avBlocker(h); if(b && b!=='bag') return false;
  return avMarketFree(st,pseudo)>0 || avActsLeft(st,pseudo)>0;
}
function avMarketTx(pseudo, fn){
  return avTx(st=>{
    if(st.phase!=='play') return 'La partie n\'est pas en cours.';
    const h=avHeroOf(st,pseudo); if(!h) return 'Tu ne joues pas dans cette partie.';
    const free=avMarketFree(st,pseudo)>0;
    if(!free && avActsLeft(st,pseudo)<=0) return 'Tu as déjà joué tes actions ce tour-ci.';
    const b=avBlocker(h);
    if(b && b!=='bag') return 'Termine d\'abord ce qui est en attente (objet, combat…).';
    const t=st.tiles[h.pos], def=avTileDef(t);
    if(def.act!=='marche') return 'Tu n\'es pas au marché.';
    const e=fn(st, h, t, def); if(e) return e;
    const p=st.players[pseudo];
    if(free) p.mkt--;
    else { p.mkt=AV_MARKET_TX-1; avSpend(st, pseudo); }
  });
}
// Squelette d'une action gratuite (gestion du sac, choix d'objet…)
function avFree(pseudo, fn){
  return avTx(st=>{
    if(st.phase!=='play') return 'La partie n\'est pas en cours.';
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
      const ms=avSpawn(st,dest);
      if(ms.length){ msg+=(ms.length>1?' Des monstres en sortent : ':' Un monstre en sort : ')+ms.map(m=>m.ico+' '+m.nom).join(' et ')+' !'; big=ms.some(m=>m.taille==='grand'); }
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
// Nidhiver / Clairière de la Source
function avelCoins(pseudo){
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='coins') return 'Pas d\'habitants à aider ici.';
    if(t.monsters.length) return 'Un monstre rôde ici : impossible d\'aider les habitants.';
    h.coins+=AV_COIN_GAIN;
    avLog(st, '🪙 '+avWho(pseudo,h)+' aide les habitants ('+def.nom+') : +'+AV_COIN_GAIN+' pièces d\'or.');
  });
}
// Marché : un étal de 4 objets ; acheter ou vendre = 1 transaction (2 transactions par action).
// L'objet acheté est aussitôt remplacé par un nouveau.
function avelBuy(pseudo, idx){
  return avMarketTx(pseudo, (st,h,t,def)=>{
    const k=st.stall[idx]; if(!k) return 'Cet objet n\'est plus sur l\'étal.';
    if(h.coins<AV_PRICE.buy) return 'Pas assez de pièces : il en faut '+AV_PRICE.buy+'.';
    h.coins-=AV_PRICE.buy;
    const it=avNewItem(k);
    avGain(h, it);
    const next=avDraw(st,1)[0];
    if(next) st.stall[idx]=next; else st.stall.splice(idx,1);
    avLog(st, '🛒 '+avWho(pseudo,h)+' achète '+avItemLabel(it)+' (−'+AV_PRICE.buy+' 🪙).'+(next?' Le marchand expose '+AV_ITEMS[next].ico+' '+AV_ITEMS[next].nom+'.':''));
  });
}
function avelSell(pseudo, id){
  return avMarketTx(pseudo, (st,h,t,def)=>{
    const it=avTakeItem(h,id); if(!it) return 'Objet introuvable.';
    st.pool.push(it.k); h.coins+=AV_PRICE.sell;
    avLog(st, '🛒 '+avWho(pseudo,h)+' vend '+avItemLabel(it)+' (+'+AV_PRICE.sell+' 🪙).');
  });
}
function avelSellFromUi(pseudo){ const v=avSel('av-sell-sel'); if(!v){ toast('Choisis un objet à vendre.'); return; } avelSell(pseudo, v); }
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
// Carrière : 3 pièces → 1 muraille devant le Village
function avelWall(pseudo){
  return avAction(pseudo, (st,h,t,def)=>{
    if(def.act!=='carriere') return 'Tu n\'es pas à la carrière.';
    if(avWallsClosed(st)) return 'Les maçons se sont réfugiés '+AV_HOME.dans+' : plus de murailles possibles.';
    if(st.walls>=st.limit) return 'Toutes les murailles sont déjà construites.';
    if(h.coins<AV_PRICE.wall) return 'Il faut '+AV_PRICE.wall+' pièces.';
    h.coins-=AV_PRICE.wall; st.walls++;
    avLog(st, '🧱 '+avWho(pseudo,h)+' fait bâtir une muraille '+AV_HOME.au+' ('+st.walls+'/'+st.limit+').');
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
    if(!tt || !tt.rev || key==='0,0' || st.traps.some(x=>x.tile===key)) return 'Choisis une tuile révélée sans piège (hors '+AV_HOME.nom+').';
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
    h.dice={ faces, rolls, out, round:st.round };
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
    if(avFighting(h)) return 'Impossible de changer d\'équipement pendant un combat.';
    const i=h.bag.findIndex(it=>it.id===id); if(i<0) return 'Objet introuvable.';
    const it=h.bag[i], slot=avItemDef(it).slot; if(slot==='elixir') return 'Un élixir ne se porte pas.';
    h.bag.splice(i,1);
    if(h.eq[slot]) h.bag.push(h.eq[slot]);   // l'ancien objet retourne dans le sac
    h.eq[slot]=it;
  });
}
function avelUnequip(pseudo, slot){
  return avFree(pseudo, (st,h)=>{
    if(avFighting(h)) return 'Impossible de changer d\'équipement pendant un combat.';
    if(!h.eq[slot]) return 'silent'; h.bag.push(h.eq[slot]); h.eq[slot]=null;
  });
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

// ═══════════════════════════════════════════════════════════════════════════
//  COMBAT (lot 4) — jusqu'à 3 affrontements. Lancer le combat coûte 1 action ;
//  « Combattre à nouveau » et « Arrêter le combat » sont compris dans cette action.
// ═══════════════════════════════════════════════════════════════════════════
function avPlural(n, w){ return n+' '+w+(n>1?'s':''); }
function avMonRes(m){ return (m && m.res) || ((AV_MONSTERS[m && m.k]||{}).res) || 1; }
function avFightMonster(st, f){ const t=st.tiles[f.tile]; return t ? t.monsters.find(x=>x.id===f.mid) : null; }
function avUnlockMonster(st, f){ const m=avFightMonster(st,f); if(m) delete m.fighter; }
function avMonCombat(k){ return AV_MON_COMBAT[k] || { dice:['violet'], loot:{ coins:1 } }; }
// Effets actifs des objets portés (les emplacements bloqués par le monstre sont ignorés)
function avFxList(h, malus){
  const out=[];
  AV_SLOTS.forEach(([s])=>{
    const it=h.eq[s]; if(!it || malus===s) return;
    const fx=AV_FX[it.k]; if(!fx) return;
    out.push({ it, slot:s, fx:(it.up ? fx.up : fx.base) });
  });
  return out;
}
// Dés lancés par le héros à chaque affrontement
function avHeroDicePool(h, malus, elixir){
  const pool={ vert:AV_HERO_DICE, orange:0, bleu:0, jaune:0 };
  avFxList(h, malus).forEach(e=>{ if(e.fx.dice) Object.keys(e.fx.dice).forEach(c=>{ pool[c]+=e.fx.dice[c]; }); });
  if(elixir && AV_COMBAT_ELIXIRS[elixir]) pool[AV_COMBAT_ELIXIRS[elixir]]++;
  if(malus==='vert') pool.vert=Math.max(0, pool.vert-1);
  if(malus==='couleur') ['orange','bleu','jaune'].forEach(c=>{ if(pool[c]) pool[c]--; });
  return pool;
}
const AV_ORDINAL = ['premier','deuxième','troisième','quatrième'];
// Durée de l'animation d'un affrontement (mêmes réglages que avAnimateFight) + ouverture de la modale
function avClashAnimMs(r){
  if(!r) return 0;
  const texts=avArr(r.text).concat(avArr(r.notes).length ? [avArr(r.notes).join(' · ')] : []);
  const typed=texts.reduce((s,t)=>s+String(t).length*14+120, 0);
  return avArr(r.hd).length*170 + 250 + avArr(r.md).length*170 + 650 + 200 + typed + 800;
}

// Un affrontement : lancers, effets, résolution, conséquences
// Relances encore disponibles dans ce combat (une fois par combat et par objet), au choix du joueur.
// side : 'hero' (relancer un de ses dés) ou 'monster' (faire relancer un dé du monstre, Targe)
function avRerollsFor(st, h, f){
  const m=avFightMonster(st,f); if(!m || !f.pend) return [];
  const malus=avMonCombat(m.k).malus;
  return avFxList(h, malus).filter(e=>(e.fx.reroll || e.fx.monReroll) && !f.used['r_'+e.slot]).map(e=>{
    const n=e.fx.reroll ? e.fx.reroll.n : 1;
    const left=(f.rr && typeof f.rr[e.slot]==='number') ? f.rr[e.slot] : n;
    const colors=e.fx.reroll ? e.fx.reroll.colors : e.fx.monReroll;
    const side=e.fx.reroll ? 'hero' : 'monster';
    const dice=side==='hero' ? f.pend.hd : f.pend.md;
    return { slot:e.slot, it:e.it, n, left, colors, side, any:dice.some(d=>!colors || colors.includes(d.c)) };
  }).filter(r=>r.left>0 && r.any);
}
// Un affrontement : on lance les dés. S'il reste une relance possible, le joueur choisit
// (bouton « Relancer ») avant la résolution ; sinon on résout tout de suite.
function avClash(st, h, f, pseudo){
  const m=avFightMonster(st,f); if(!m) return;
  const mc=avMonCombat(m.k), malus=mc.malus;
  const pool=avHeroDicePool(h, malus, f.elixir);
  const hd=[]; ['vert','orange','bleu','jaune'].forEach(c=>{ for(let i=0;i<pool[c];i++) hd.push({ c, f:avRoll(c) }); });
  const mdice=mc.dice.map(c=>({ c, f:avRoll(c) }));
  const notes=[];
  if(f.elixir && f.clash===0) notes.push(avItemDef({k:f.elixir}).nom+' : +1 dé '+AV_COMBAT_ELIXIRS[f.elixir]+' à chaque affrontement');
  f.pend={ hd, md:mdice, notes }; f.rr={};
  if(!avRerollsFor(st,h,f).length) avResolveClash(st, h, f, pseudo);
}
function avResolveClash(st, h, f, pseudo){
  const p=f.pend; if(!p) return;
  const m=avFightMonster(st,f); if(!m){ f.pend=null; return; }
  const md=AV_MONSTERS[m.k], mc=avMonCombat(m.k), malus=mc.malus, fx=avFxList(h, malus);
  const hd=p.hd, mdice=p.md, notes=p.notes;
  f.pend=null; f.rr=null;
  let att=hd.filter(d=>d.f==='att').length, def=hd.filter(d=>d.f==='def').length;
  const spells=hd.filter(d=>d.f==='sort').length;
  const mAtt=mdice.filter(d=>d.f==='att').length, mDef=mdice.filter(d=>d.f==='def').length;
  // Bonus +1 ⚔️ / +1 🛡️ une fois par combat
  fx.forEach(e=>{
    const ka='a_'+e.slot, kd='d_'+e.slot;
    if(e.fx.att && !f.used[ka] && (e.fx.att==='*' || e.fx.att===md.fam || md.fam==='all')){ att++; f.used[ka]=1; notes.push(avItemDef(e.it).nom+' : +1 ⚔️'); }
    if(e.fx.def && !f.used[kd] && (e.fx.def===md.fam || md.fam==='all') && mAtt>def){ def++; f.used[kd]=1; notes.push(avItemDef(e.it).nom+' : +1 🛡️'); }
  });
  // Sorts ✨ : en attaque s'ils permettent d'achever le monstre, sinon d'abord en défense
  const RES=avMonRes(m), left=RES-m.dmg;
  let sa=0, sd=0;
  if(spells){
    const needKill=Math.max(0, left+mDef-att);
    if(needKill>0 && needKill<=spells){ sa=needKill; sd=spells-sa; }
    else if(needKill===0){ sd=spells; }
    else { sd=Math.min(spells, Math.max(0, mAtt-def)); sa=spells-sd; }
    notes.push('✨ '+(sa?sa+' en attaque':'')+(sa&&sd?', ':'')+(sd?sd+' en défense':''));
  }
  att+=sa; def+=sd;
  const blocked=Math.min(mDef, att), wounds=att-blocked, saved=Math.min(def, mAtt), hurt=mAtt-saved;
  m.dmg=Math.min(RES, m.dmg+wounds);
  h.pv=Math.max(0, h.pv-hurt);
  const R=RES-m.dmg;
  // Textes de résolution
  let t1;
  if(att===0) t1='Vous ne portez aucun coup.';
  else if(mDef===0) t1='Le monstre n\'a obtenu aucune face de défense. Vous portez '+avPlural(att,'coup')+'.';
  else if(wounds===0) t1='Vous portez '+avPlural(att,'coup')+', mais le monstre les bloque tous.';
  else t1='Vous portez '+avPlural(att,'coup')+', mais le monstre bloque '+(blocked===1?'l\'une de vos attaques':blocked+' de vos attaques')+'.';
  if(wounds>0) t1+=' Le monstre subit '+avPlural(wounds,'blessure')+(R<=0 ? '. Ses points de vie tombent à 0 !' : ' (il lui reste '+R+' PV).');
  let t2;
  if(mAtt===0) t2='Le monstre ne parvient pas à vous toucher.';
  else if(hurt===0) t2='Le monstre donne '+avPlural(mAtt,'coup')+'. Heureusement, votre défense absorbe totalement l\'impact. Vous ne perdez aucun PV.';
  else if(def===0) t2='Comme vous n\'avez fait aucun bouclier sur ce tour, vous ne pouvez rien bloquer. Vous perdez '+hurt+' PV.';
  else t2='Le monstre donne '+avPlural(mAtt,'coup')+' ; vous en bloquez '+saved+'. Vous perdez '+hurt+' PV.';
  f.rounds.push({ hd, md:mdice, text:['Attaque du héros : '+t1, 'Attaque du monstre : '+t2], notes });
  f.clash++;
  // Conséquences
  const dead=m.dmg>=RES, ko=h.pv<=0, who=avWho(pseudo,h);
  if(dead){
    const loot=mc.loot||{}, got=[];
    st.tiles[f.tile].monsters=st.tiles[f.tile].monsters.filter(x=>x.id!==m.id);
    if(loot.coins){ h.coins+=loot.coins; got.push('+'+loot.coins+' 🪙'); }
    if(loot.item){ avStartPick(st, h, loot.item, avClashAnimMs(f.rounds[f.rounds.length-1])); got.push('un objet'); }
    if(loot.upg){ if(avUpgradable(h).length){ h.upg+=loot.upg; got.push('une amélioration'); } else got.push('une amélioration (aucun objet à améliorer)'); }
    const heal=fx.reduce((s,e)=>s+(e.fx.heal||0),0);
    if(heal && !ko){ h.pv=Math.min(AV_PV_MAX, h.pv+heal); got.push('+'+heal+' PV'); }
    f.loot=got;
    f.over='win';
    st.kills=(st.kills||0)+1; h.kills=(h.kills||0)+1;
    if(m.k==='bete') avLog(st, '⚔️ '+who+' porte le coup fatal : '+md.ico+' LA BÊTE EST TERRASSÉE !', true);
    else avLog(st, '🏆 '+who+' terrasse '+md.ico+' '+md.nom+' !'+(got.length?' Récompense : '+got.join(', ')+'.':''), md.taille==='grand');
    avCheckWin(st);
  }
  if(ko){
    const lost=h.coins;
    h.coins=0; h.ko=true;
    h.discard=avAllItems(h).length ? 1 : 0;
    h.players.forEach(ps=>{ if(st.players[ps]) st.players[ps].acts=avAllowance(st,ps); });   // actions du tour perdues
    f.ko=true; f.lost=lost;
    if(!dead){ f.over='lose'; avUnlockMonster(st,f); }
    avLog(st, '💫 '+avHeroDef(h.id).nom+' est '+(avHeroDef(h.id).f?'évanouie':'évanoui')+' face à '+md.nom+' et perd '+avPlural(lost,'pièce')+' d\'or.', true);
  }
  if(!f.over && f.clash>=AV_CLASHES){
    f.over='max'; avUnlockMonster(st,f);
    avLog(st, '⚔️ '+who+' et '+md.nom+' se séparent après '+AV_CLASHES+' affrontements (il lui reste '+R+' PV).');
  }
}
// Un combat vient de se terminer : le tour peut se finir si tout le monde a joué
function avAfterFight(st){ if(st.phase==='play' && avAllDone(st)) avEndRound(st); }

function avelFight(pseudo, mid, elixirId){
  return avAction(pseudo, (st,h,t)=>{
    const m=t.monsters.find(x=>x.id===mid); if(!m) return 'Ce monstre n\'est plus là.';
    if(typeof m.fighter==='number' && m.fighter!==h.id) return 'Un autre héros combat déjà ce monstre.';
    const mc=avMonCombat(m.k);
    let elixir=null;
    if(elixirId){
      if(mc.malus==='elixir') return 'Ce monstre empêche de boire un élixir.';
      const f=avFindItem(h, elixirId); if(!f || !AV_COMBAT_ELIXIRS[f.it.k]) return 'Élixir introuvable.';
      avTakeItem(h, elixirId); st.pool.push(f.it.k); elixir=f.it.k;
    }
    m.fighter=h.id;
    h.fight={ id:avNewId('f'), mid, k:m.k, tile:h.pos, by:pseudo, clash:0, elixir, used:{}, rounds:[], over:null };
    const md=AV_MONSTERS[m.k];
    avLog(st, '⚔️ '+avWho(pseudo,h)+' affronte '+md.ico+' '+md.nom+(elixir?' (avec '+avItemDef({k:elixir}).nom+')':'')+'.');
    avClash(st, h, h.fight, pseudo);
  });   // avSpend termine le tour si tout le monde a joué (jamais pendant un combat en cours)
}
function avelReroll(pseudo, slot, side, idx){
  return avTx(st=>{
    const h=avHeroOf(st,pseudo); if(!h || !avFighting(h) || !h.fight.pend) return 'silent';
    const f=h.fight;
    if(f.by!==pseudo) return 'C\'est '+f.by+' qui mène ce combat.';
    const r=avRerollsFor(st,h,f).find(x=>x.slot===slot);
    if(!r || r.side!==side) return 'Cette relance n\'est plus disponible.';
    const d=(side==='hero' ? f.pend.hd : f.pend.md)[idx];
    if(!d || (r.colors && !r.colors.includes(d.c))) return 'Ce dé ne peut pas être relancé avec cet objet.';
    const before=d.f;
    d.f=avRoll(d.c); d.r=(d.r||0)+1;
    f.rr[slot]=r.left-1;
    if(f.rr[slot]<=0) f.used['r_'+slot]=1;
    f.pend.notes.push(avItemDef(r.it).nom+' : '+(side==='hero'?'relance':'fait relancer au monstre')+' un dé '+d.c+' ('+AV_FACE_ICO[before]+' → '+AV_FACE_ICO[d.f]+')');
    if(!avRerollsFor(st,h,f).length){ avResolveClash(st,h,f,pseudo); if(f.over) avAfterFight(st); }
  });
}
function avelResolve(pseudo){
  return avTx(st=>{
    const h=avHeroOf(st,pseudo); if(!h || !avFighting(h) || !h.fight.pend) return 'silent';
    if(h.fight.by!==pseudo) return 'C\'est '+h.fight.by+' qui mène ce combat.';
    avResolveClash(st,h,h.fight,pseudo);
    if(h.fight.over) avAfterFight(st);
  });
}
function avelFightAgain(pseudo){
  return avTx(st=>{
    const h=avHeroOf(st,pseudo); if(!h || !avFighting(h)) return 'silent';
    if(h.fight.by!==pseudo) return 'C\'est '+h.fight.by+' qui mène ce combat.';
    if(h.fight.clash>=AV_CLASHES || h.fight.pend) return 'silent';
    avClash(st, h, h.fight, pseudo);
    if(h.fight.over) avAfterFight(st);
  });
}
function avelFightStop(pseudo){
  return avTx(st=>{
    const h=avHeroOf(st,pseudo); if(!h || !h.fight) return 'silent';
    if(h.fight.pend && !h.fight.over) return 'Résous d\'abord cet affrontement.';
    if(avFighting(h)){
      const m=avFightMonster(st,h.fight), md=AV_MONSTERS[h.fight.k]||{nom:'?'};
      h.fight.over='stop'; avUnlockMonster(st,h.fight);
      avLog(st, '🏃 '+avWho(pseudo,h)+' bat en retraite face à '+md.nom+(m?' (il lui reste '+(avMonRes(m)-m.dmg)+' PV)':'')+'.');
      avAfterFight(st);
    }
    h.fight=null;   // ferme le module
  });
}
// Défausse obligatoire après une défaite
function avelDiscard(pseudo, id){
  return avFree(pseudo, (st,h)=>{
    if(!(h.discard>0)) return 'silent';
    const it=avTakeItem(h,id); if(!it) return 'Objet introuvable.';
    st.pool.push(it.k); h.discard=avAllItems(h).length ? h.discard-1 : 0;
    avLog(st, '🗑️ '+avWho(pseudo,h)+' perd '+avItemLabel(it)+' dans sa chute.');
  });
}
function avelFightFromUi(pseudo, mid){
  const v=avSel('av-elx-'+mid);
  avelFight(pseudo, mid, v||null);
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
  if(act==='atelier'){ const v=avSel('av-at-sel'); if(!v){ toast('Choisis un objet.'); return; } p=avelUpgrade(pseudo, v); }
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
  fbSetAvel({ active:true, phase:'lobby', players:{}, heroes:[], tiles:{}, round:1, moon:0, seq:0, history:[], roundSecs:AV_ROUND_SECS, diff:AV_DIFF_DEFAULT,
    lastEvent:'Les portes '+AV_HOME.du+' sont ouvertes : les héros peuvent rejoindre la partie.' });
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
function avelSetDiff(v){ if(!AV_DIFFS[v]) return; avTx(st=>{ if(st.phase!=='lobby') return 'silent'; st.diff=v; }); }
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
    st.pool=avBuildPool(); st.poolInit=true; st.stall=null;
    st.heroes=[];
    for(let i=0;i<nH;i++){
      const h={ id:i, pv:AV_PV_MAX, coins:AV_START_COINS, pos:'0,0', eq:{ arme:null, bouclier:null, casque:null }, bag:[], upg:0, pick:null, dice:null, players:[] };
      avGain(h, avNewItem(st.pool.shift()));   // 1 équipement tiré au hasard au départ
      st.heroes.push(h);
    }
    order.forEach((ps,i)=>{ st.heroes[i%nH].players.push(ps); st.players[ps].hero=i%nH; st.players[ps].acts=0; });
    st.tiles=avBuildMap(); st.deck=avBuildDecks();
    st.stall=avDraw(st, AV_STALL_SIZE);   // étal du marché (après les objets de départ)
    st.limit=avLimit(nH); st.seals=st.limit; st.walls=0; st.traps=[];
    st.dark=false; st.darkRound=0; st.kills=0; st.beastMax=avBeastRes(nH); st.result=null; st.points=0; st.breach=null;
    st.round=1; st.moon=avMoonStart(nH); st.phase='play'; st.history=[]; st.seq=0; st.startedAt=avNow();
    st.deadline=avNow()+st.roundSecs*1000;
    const sp=[];
    Object.keys(st.tiles).forEach(key=>{ avSpawn(st,key).forEach(m=>sp.push(m.ico+' '+m.nom)); });
    avLog(st, '🏰 La partie commence avec '+nH+' héros ! La Lune Noire se lèvera dans '+avMoonLeft(st)+' tours.'+(sp.length?' Déjà aux portes : '+sp.join(', ')+'.':''), true);
  }).then(r=>{ if(r && r.committed) toast('Partie des Chroniques d\'Avel lancée !'); });
}
function avelEndRoundNow(){
  avTx(st=>{ if(st.phase!=='play') return 'silent'; avLog(st, '⏱️ Le meneur termine le tour.'); avEndRound(st); });
}
function avelEndToFire(){
  if(!avel || avel.phase!=='end') return;
  const pts=avel.points||0;
  if(!confirm('Ajouter '+pts+' points au feu de camp et clôturer la partie ?')) return;
  fbSetFire(Object.assign({}, fire, { points:(fire.points||0)+pts }));
  fbSetAvel(null);
  toast('🔥 +'+pts+' points au feu ! Partie clôturée.');
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
      const beastHere=t.monsters.some(m=>m.k==='bete'), nm=t.monsters.length-(beastHere?1:0);
      if(nm){
        const my=cy+s*.56, d=s*.15, mx=cx-(beastHere?s*.24:0);
        g+='<polygon class="av-mon" points="'+mx+','+(my-d)+' '+(mx+d)+','+my+' '+mx+','+(my+d)+' '+(mx-d)+','+my+'"/>';
        if(nm>1) g+='<text class="av-mon-n" x="'+mx+'" y="'+(my+4)+'">'+nm+'</text>';
      }
      if(beastHere) g+='<text class="av-beast" x="'+(cx+(nm?s*.24:0))+'" y="'+(cy+s*.7)+'">'+AV_MONSTERS.bete.ico+'</text>';
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
    it('<span class="av-legend-sc">'+AV_MONSTERS.bete.ico+'</span>','La Bête')+
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
  const left=avMoonLeft(st), next=st.dark ? 'march' : AV_MOON_TRACK[Math.min(st.moon+1, AV_MOON_TRACK.length-1)];
  const moon = st.dark ? 'Lune Noire <strong>levée</strong>' : ('Lune Noire dans <strong>'+left+' tour'+(left>1?'s':'')+'</strong>');
  return '<div class="dpill">Tour <strong>'+st.round+'</strong></div>'+
         '<div class="dpill">'+moon+'</div>'+
         '<div class="dpill">Difficulté <strong>'+(AV_DIFFS[st.diff]||AV_DIFFS[AV_DIFF_DEFAULT]).nom+'</strong></div>'+
         (st.phase==='play' ? '<button class="dpill dpill-btn" onclick="avelShowMoon()" title="Voir les prochaines fins de tour">Fin du tour <strong>'+(AV_SYM_LABEL[next]||'—')+'</strong> ▾</button>'+
                              '<div class="dpill av-timer-pill">⏱ <strong>'+avTimerSpan(st.deadline)+'</strong></div>' : '');
}
// Piste lunaire : ce qui arrivera aux prochaines fins de tour (pour s'organiser)
function avMoonTrackHtml(st){
  let z='<h2 class="rules-title">🌙 Piste lunaire</h2>';
  if(st.dark){
    // Après la Lune Noire : chaque fin de tour, la marche. On liste les monstres les plus proches du Village.
    const dist=avDistances(st), list=[], rank={ petit:0, grand:1, bete:2 };
    Object.keys(st.tiles).forEach(k=>st.tiles[k].monsters.forEach(m=>list.push({ k, m, d:dist[k] })));
    // On rejoue la marche dans son ordre réel (petits, grands, Bête) pour savoir qui brise une muraille et qui entre
    list.sort((a,b)=>(rank[(AV_MONSTERS[a.m.k]||{}).taille]||0)-(rank[(AV_MONSTERS[b.m.k]||{}).taille]||0) || a.d-b.d);
    let walls=st.walls, breached=false;
    list.forEach(x=>{
      if(x.d>1) return;
      if(breached){ x.out='entrerait aussi '+AV_HOME.dans; return; }
      if(walls>0){ if(x.m.k==='bete'){ x.out='détruit toutes les murailles'; walls=0; } else { x.out='brise une muraille'; walls--; } }
      else { x.out='⚠️ entre '+AV_HOME.dans+' : défaite !'; breached=true; }
    });
    list.sort((a,b)=>a.d-b.d);
    z+='<p class="av-end-p">La Lune Noire est levée : à <strong>chaque fin de tour</strong>, tous les monstres avancent d\'une tuile vers '+AV_HOME.nom+'.</p>'+
      '<div class="stat-row"><span>'+AV_ICO.wall+' Murailles</span><strong>'+st.walls+'</strong></div>'+
      '<div class="section-title u-mt-md">À la prochaine fin de tour</div>'+
      (list.length ? list.slice(0,8).map(x=>{
        const md=AV_MONSTERS[x.m.k]||{nom:'?',ico:'?'};
        const what = x.d<=1 ? x.out : 'avance (encore '+avPlural(x.d-1,'tuile')+' après)';
        return '<div class="stat-row"><span>'+md.ico+' '+escHtml(md.nom)+' <span class="action-row-sub">'+escHtml(avTileDef(st.tiles[x.k]).nom)+'</span></span><strong>'+escHtml(what)+'</strong></div>';
      }).join('') : '<p class="av-end-p">Plus aucun monstre en marche.</p>')+
      (list.length>8 ? '<div class="action-row-sub">… et '+(list.length-8)+' autre(s), plus loin.</div>' : '');
    return z;
  }
  const lairs=Object.keys(st.tiles).filter(k=>{ const t=st.tiles[k]; return t.rev && avTileDef(t).lair && !t.seal && !t.monsters.length; });
  const spots=lairs.reduce((n,k)=>n+(avTileDef(st.tiles[k]).lairs||1),0);
  const fx={
    lair:'Un monstre surgit sur chaque repaire découvert, vide et non scellé (aujourd\'hui : '+avPlural(spots,'monstre')+(lairs.length?' — '+lairs.map(k=>avTileDef(st.tiles[k]).nom).join(', '):'')+').',
    heart:'Chaque héros récupère 1 PV.',
    seal:'Le '+AV_TILES.cercle.nom+' ferme : plus de sceaux.',
    trap:'Le '+AV_TILES.camp.nom+' ferme : plus de pièges.',
    moon:'La Lune Noire se lève : les terres se révèlent, les repaires se remplissent et la Bête sort du '+AV_TILES.cratere.nom+'.',
    none:'Rien ne se passe.',
  };
  z+='<p class="av-end-p">À chaque fin de tour, la lune avance d\'une case. Voici les prochaines :</p>';
  for(let i=st.moon+1, n=1; i<AV_MOON_TRACK.length; i++, n++){
    const sym=AV_MOON_TRACK[i];
    z+='<div class="moon-row'+(n===1?' is-next':'')+(sym==='moon'?' is-moon':'')+'">'+
      '<span class="moon-when">'+(n===1?'Fin de ce tour':'Fin du tour '+(st.round+n-1))+'</span>'+
      '<span class="moon-sym">'+(AV_SYM_LABEL[sym]||sym)+'</span>'+
      '<span class="moon-fx">'+escHtml(fx[sym]||'')+'</span></div>';
  }
  return z;
}
// Jauge de la Bête (sous les pastilles, une fois la Lune Noire levée)
function avBossHtml(st){
  if(!st.dark) return '';
  const b=avBeast(st), left=avMonstersLeft(st);
  if(!b) return '<div class="boss-bar is-down"><div class="boss-head"><span class="boss-name">'+AV_MONSTERS.bete.ico+' La Bête est vaincue</span><span class="boss-info">'+avPlural(left,'monstre')+' encore en marche</span></div></div>';
  const res=avMonRes(b.m), pv=res-b.m.dmg, d=avDistances(st)[b.key];
  return '<div class="boss-bar"><div class="boss-head">'+
      '<span class="boss-name">'+AV_MONSTERS.bete.ico+' La Bête</span>'+
      '<span class="boss-info">'+escHtml(avTileDef(st.tiles[b.key]).nom)+' · à '+avPlural(d,'tuile')+' '+AV_HOME.du+' · '+avPlural(left,'monstre')+' en marche · '+AV_ICO.wall+' '+st.walls+'</span>'+
      '<span class="boss-pv">❤️ '+pv+'/'+res+'</span></div>'+
    '<div class="boss-track"><div class="boss-fill" style="width:'+Math.round(pv/res*100)+'%"></div></div></div>';
}
function avBlackMoonHtml(st){
  const b=avBeast(st), dif=AV_DIFFS[st.diff]||AV_DIFFS[AV_DIFF_DEFAULT];
  return '<div class="av-announce">'+
    '<div class="av-announce-moon">🌑</div>'+
    '<h2 class="rules-title">La Lune Noire se lève !</h2>'+
    '<p class="av-end-p">Un éclat de la Lune Noire s\'écrase sur le '+escHtml(AV_TILES.cratere.nom)+'. Toutes les terres se révèlent et les monstres surgissent : ils marchent sur '+AV_HOME.nom+' avec la Bête.</p>'+
    '<div class="stat-row"><span>'+AV_MONSTERS.bete.ico+' La Bête</span><strong>❤️ '+(b?avMonRes(b.m)-b.m.dmg:0)+' PV · lance 5 dés</strong></div>'+
    '<div class="stat-row"><span>Monstres en marche</span><strong>'+avMonstersLeft(st)+'</strong></div>'+
    '<div class="stat-row"><span>Difficulté</span><strong>'+dif.nom+'</strong></div>'+
    '<div class="stat-row"><span>'+AV_ICO.wall+' Murailles · '+AV_ICO.trap+' Pièges</span><strong>'+st.walls+' · '+st.traps.length+'</strong></div>'+
    '<p class="av-end-p u-mt-sm">À chaque fin de tour, tous les monstres avancent d\'une tuile vers '+AV_HOME.nom+'. Si un seul y entre, tout est perdu. Les murailles se construisent encore ce tour-ci seulement.</p>'+
    '<div class="u-mt-md">'+avBtn('btn-primary','Aux armes !','avelHideModal()',false)+'</div></div>';
}
function avEndHtml(st, compact){
  const win=st.result==='win';
  let z='<div class="av-end-card'+(win?' is-win':' is-lose')+'">'+
    '<h2 class="rules-title">'+(win?'🏆 Victoire !':'💀 Défaite')+'</h2>'+
    '<div class="av-end-sub">'+(win ? 'Tous les monstres sont vaincus : '+AV_HOME.nom+' est sauvé !' : escHtml(st.breach||'Un monstre')+' est entré dans '+AV_HOME.nom+'…')+'</div>'+
    '<div class="stat-row"><span>Tours joués</span><strong>'+st.round+'</strong></div>'+
    '<div class="stat-row"><span>Monstres vaincus</span><strong>'+(st.kills||0)+'</strong></div>'+
    '<div class="stat-row"><span>🔥 Points pour le feu</span><strong>'+(st.points||0)+'</strong></div>'+
    '<div class="action-row-sub">'+(win?AV_FIRE_WIN+' pour la victoire + ':'')+AV_FIRE_PER_KILL+' par monstre vaincu. Le meneur les ajoute au feu.</div>';
  if(!compact){
    z+='<div class="section-title u-mt-md">Tableau des héros</div>'+
      st.heroes.slice().sort((a,b)=>(b.kills||0)-(a.kills||0)).map(h=>
        '<div class="stat-row"><span>'+avHeroDot(h.id)+' '+escHtml(avHeroDef(h.id).nom)+' <span class="action-row-sub">'+escHtml(h.players.join(', '))+'</span></span><strong>'+avPlural(h.kills||0,'monstre')+'</strong></div>').join('');
  }
  return z+'</div>';
}
// Annonces plein écran, une fois par écran et seulement « à chaud »
let avAnnounced={};
function avMaybeAnnounce(st){
  const id=st.startedAt||0;
  if(st.phase==='end' && !avAnnounced['end'+id]){
    avAnnounced['end'+id]=true;
    if(avNow()-(st.endAt||0) < 10*60000) avOpenModal('gameEnd');
    return;
  }
  if(st.dark && st.phase==='play' && !avAnnounced['bm'+id]){
    avAnnounced['bm'+id]=true;
    if(avNow()-(st.darkAt||0) < 2*60000 && !(avModal && avModal.type==='fightEnd')) avOpenModal('blackmoon');
  }
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
      if(h.ko){ status='<span class="player-status">évanoui'+(avHeroDef(h.id).f?'e':'')+'</span>'; out=true; }
      else if(avFighting(h)) status='<span class="player-status">en combat</span>';
      else if(st.phase==='play'){
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
  // Récompense de combat : elle se choisit dans la modale Victoire (pas de doublon ici),
  // y compris pendant l'animation des dés qui précède son ouverture
  const winning = h.fight && h.fight.over==='win' && (!avFightEndShown[h.fight.id] || (avModal && avModal.type==='fightEnd'));
  if(winning && (h.pick || h.upg>0)) return '';
  if(h.pick){
    const cards=avPickCards(h, pseudo);
    return '<div class="av-alert"><div class="av-alert-title">🎁 Choisis ton objet'+((h.pick.left||1)>1?' ('+h.pick.left+' à choisir)':'')+' — '+avTimerSpan(h.pick.until)+'</div>'+
      avGearHtml(h)+'<div class="pick-grid">'+cards+'</div><div class="action-row-sub">Sans choix à la fin du temps, un objet est pris au hasard.</div></div>';
  }
  if(h.upg>0){
    const opts=avUpgradable(h).map(it=>avOpt(it.id, avItemDef(it).nom));
    return '<div class="av-alert"><div class="av-alert-title">✨ Choisis l\'objet à améliorer</div>'+
      '<div class="action-row"><span class="action-row-label"><select class="dd" id="av-upg-sel">'+opts.join('')+'</select></span>'+
      avBtn('btn-secondary','Améliorer','avelUpgChoiceFromUi(\''+esc+'\')',false)+'</div></div>';
  }
  if(h.discard>0){
    return '<div class="av-alert is-danger"><div class="av-alert-title">🗑️ Défausse 1 objet (défaite)</div>'+avDiscardRows(h, pseudo)+'</div>';
  }
  if(h.ko){
    return '<div class="av-alert is-danger"><div class="av-alert-title">💫 '+escHtml(avHeroDef(h.id).nom)+' est '+(avHeroDef(h.id).f?'évanouie':'évanoui')+'</div>'+
      '<div class="action-row-sub">Réveil '+AV_HOME.au+' au début du prochain tour, avec tous ses PV.</div></div>';
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
    const md=AV_MONSTERS[m.k]||{nom:'?',ico:'?',res:0,fam:''}, fam=AV_FAMS[md.fam], mc=avMonCombat(m.k);
    const busy=typeof m.fighter==='number' && m.fighter!==h.id;
    const elix=mc.malus==='elixir' ? [] : h.bag.filter(it=>AV_COMBAT_ELIXIRS[it.k]);
    const sub=[(md.fam==='all'?'les 3 familles · 5 dés':(fam?fam.ico+' '+fam.nom:'')), (mc.malus?'⚠️ '+AV_MALUS_LABEL[mc.malus]:''), (busy?'en combat avec '+avHeroDef(m.fighter).nom:'')].filter(Boolean).join(' · ');
    z+='<div class="action-row"><span class="action-row-label">'+md.ico+' '+escHtml(md.nom)+' <span class="av-mon-pv">❤️ '+(avMonRes(m)-(m.dmg||0))+'/'+avMonRes(m)+'</span>'+
       (sub?' <span class="action-row-sub">'+escHtml(sub)+'</span>':'')+'</span>'+
       '<span class="action-row-ctrl">'+
       (elix.length ? '<select class="dd" id="av-elx-'+m.id+'"><option value="">Sans élixir</option>'+elix.map(it=>avOpt(it.id, avItemDef(it).nom)).join('')+'</select>' : '')+
       avBtn('btn-secondary','Combattre','avelFightFromUi(\''+esc+'\',\''+m.id+'\')', !my || busy, busy?'Un autre héros combat déjà ce monstre':'')+'</span></div>';
  });
  const pa=avPlaceAction(st, def, monsterHere);
  const sub = t.k==='chateau' ? 'Murailles : '+st.walls+'/'+st.limit : (pa.info||'');
  z+='<div class="action-row"><span class="action-row-label">Lieu : '+def.ico+' '+escHtml(def.nom)+(t.sc?' '+AV_ICO.shortcut:'')+
     (sub?' <span class="action-row-sub">'+escHtml(sub)+'</span>':'')+'</span>'+
     (pa.label ? avBtn('btn-secondary', escHtml(pa.label), 'avelTileAction(\''+esc+'\')', pa.open ? false : !(my && pa.ok), pa.why||'') : '')+'</div>';
  return z;
}
// Libellé du bouton d'action de lieu (l'action précise) + petite info à gauche
function avPlaceAction(st, def, monsterHere){
  switch(def.act){
    case 'coins':    return monsterHere ? { label:'Aider les habitants', ok:false, why:'Un monstre rôde ici', info:'Un monstre rôde ici' }
                                        : { label:'Aider les habitants (+'+AV_COIN_GAIN+' 🪙)', ok:true };
    case 'marche':   return { label:'Voir l\'étal', ok:true, open:true, info:'Achat '+AV_PRICE.buy+' 🪙 · vente +'+AV_PRICE.sell+' 🪙' };
    case 'atelier':  return { label:'Améliorer un objet ('+AV_PRICE.upgrade+' 🪙)', ok:true };
    case 'cercle':   return avClosed(st,'seal') ? { label:'Le druide est parti', ok:false }
                          : { label:'Sceller un repaire ('+AV_PRICE.seal+' 🪙)', ok:st.seals>0, info:st.seals+' sceau(x) restant(s)' };
    case 'carriere': return avWallsClosed(st) ? { label:'Les maçons sont partis', ok:false, info:'Murailles : '+st.walls+'/'+st.limit }
                          : { label:'Bâtir une muraille ('+AV_PRICE.wall+' 🪙)', ok:st.walls<st.limit, info:'Murailles : '+st.walls+'/'+st.limit };
    case 'camp':     return avClosed(st,'trap') ? { label:'Les elfes sont partis', ok:false }
                          : { label:'Poser un piège', ok:st.traps.length<st.limit, info:'Pièges : '+st.traps.length+'/'+st.limit };
    case 'lac':      return { label:'Lancer les dés ('+AV_PRICE.lake+' 🪙)', ok:true };
    default:         return { label:'', ok:false, info:'Aucune action ici' };
  }
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
    avSet('av-status',''); avSet('av-instruction',''); avSet('av-boss','');
    const lp=Object.values(st.players).sort((a,b)=>(a.at||0)-(b.at||0));
    avSet('av-players', lp.length ? lp.map(p=>'<div class="player-row'+(p.pseudo===pseudo?' is-current':'')+'"><span class="player-name">'+escHtml(p.pseudo)+'</span><span class="player-infos"></span><span class="player-status">prêt</span></div>').join('')
                                   : '<div class="t-warm-sm">Personne n\'a encore rejoint l\'expédition.</div>');
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
    avSet('av-fight','');
    board.style.display='none'; lobby.style.display='block';
    avSet('av-instruction','');
    avSet('av-boss', avBossHtml(st));
    avSet('av-lobby', (st.phase==='end' ? avEndHtml(st, true) : '<div class="diamant-voted">👀 Une partie est en cours. Tu joueras à la prochaine ! Clique sur un joueur pour suivre son héros.</div>')+
      '<button class="btn-secondary u-full" onclick="avelShowMap()">Voir toute la carte</button>');
    avRefreshModal();
    avMaybeAnnounce(st);
    return;
  }
  lobby.style.display='none'; board.style.display='block';

  let ins;
  if(st.phase==='end') ins='';
  else {
    const left=avActsLeft(st,pseudo), mates=h.players.filter(p=>p!==pseudo);
    const waiting=Object.keys(st.players).filter(ps=>avHeroOf(st,ps) && avActsLeft(st,ps)>0).length;
    if(left>0) ins='⏳ <strong>Tour libre</strong> — il te reste '+left+' action'+(left>1?'s':'')+(mates.length?' <span class="t-warm-sm">('+escHtml(mates.join(', '))+' a la sienne)</span>':'');
    else ins='✓ Tu as joué tes actions. En attente de '+waiting+' joueur'+(waiting>1?'s':'')+'…';
  }
  avSet('av-instruction', ins);
  avSet('av-boss', avBossHtml(st));
  avKeepSelects('av-alert', ()=>avSet('av-alert', st.phase==='end' ? avEndHtml(st, true) : avAlertHtml(st,h,pseudo)));
  avRenderFight(st, h, pseudo);

  const keys=[h.pos].concat(avNeighbors(st,h.pos).map(n=>n.key));
  avSet('av-map', avMapSvg(st, keys, h.pos, false)+avLegendHtml());

  const my=avCanAct(st,pseudo);
  avSet('av-cta',
    avBtn('btn-primary-continue','Repos (+'+AV_REST_HEAL+' PV)','avelRest(\''+esc+'\')', !my || h.pv>=AV_PV_MAX, h.pv>=AV_PV_MAX?'PV déjà au maximum':'')+
    '<button class="btn-secondary" onclick="avelShowMap()">Voir toute la carte</button>');
  avKeepSelects('av-actions', ()=>avSet('av-actions', avActionsHtml(st, pseudo)));
  avSet('av-inventory', avInventoryHtml(h, pseudo));
  avRefreshModal();
  avMaybeAnnounce(st);
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU : COMBAT (module en haut du jeu + modales Victoire / Défaite)
// ═══════════════════════════════════════════════════════════════════════════
// Icônes exportées de Figma (images/avel/) : épées = attaque du héros, bouclier = défense du héros,
// griffes = attaque du monstre, épée brisée = parade du monstre
const AV_DIE_IMG = {
  hero:    { att:'images/avel/image%203.png',     def:'images/avel/image%205.png' },
  monster: { att:'images/avel/Mask%20group.png',  def:'images/avel/image%208.png' },
};
const AV_FACE_LABEL = { att:'Attaque', def:'Défense', sort:'Sort', vide:'Face vide' };
const AV_SPELL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/><circle cx="19" cy="4.5" r="1.6"/><circle cx="5" cy="18.5" r="1.3"/></svg>';
function avFaceInner(side, face){
  if(face==='sort') return AV_SPELL_SVG;
  const src=AV_DIE_IMG[side][face];
  return src ? '<img src="'+src+'" alt="">' : '';
}
function avDieHtml(side, d, i, onclick){
  return '<span class="av-die die-'+d.c+' face-'+d.f+(d.r?' is-reroll':'')+(onclick?' is-pickable':'')+'" data-side="'+side+'" data-c="'+d.c+'" data-i="'+i+'" data-rr="'+(d.r||0)+'"'+
    (onclick?' role="button" tabindex="0" onclick="'+onclick+'"':'')+
    ' title="'+AV_FACE_LABEL[d.f]+(d.r?' (relancé)':'')+(onclick?' — cliquer pour relancer':'')+'" aria-label="'+AV_FACE_LABEL[d.f]+'">'+avFaceInner(side, d.f)+'</span>';
}
// Relance choisie localement (quel objet sert à relancer) : { fid, slot }
let avRerollSel=null;
function avelPickReroll(slot){ avRerollSel = (avRerollSel && avRerollSel.slot===slot) ? null : { fid:(avel && avHeroOf(avel,currentViewerPseudo)||{}).fight ? avHeroOf(avel,currentViewerPseudo).fight.id : null, slot }; if(avel && currentViewerPseudo) renderAvelViewer(currentViewerPseudo); }
function avFightHtml(st, h, pseudo){
  const f=h.fight; if(!f) return '';
  const md=AV_MONSTERS[f.k]||{nom:'?',ico:'?',res:0};
  const pend=(f.pend && !f.over) ? f.pend : null;
  const r = pend ? { hd:pend.hd, md:pend.md } : f.rounds[f.rounds.length-1]; if(!r) return '';
  const m=avFightMonster(st,f), esc=escAttr(pseudo), mine=f.by===pseudo;
  const hn=avHeroDef(h.id).nom, idx = pend ? f.clash+1 : f.clash;
  // Relances : l'objet choisi rend cliquables les dés qu'il peut relancer
  const rerolls = pend ? avRerollsFor(st,h,f) : [];
  const sel = (mine && avRerollSel && avRerollSel.fid===f.id) ? rerolls.find(x=>x.slot===avRerollSel.slot) : null;
  const dieClick=(side,d,i)=>(sel && sel.side===side && (!sel.colors || sel.colors.includes(d.c))) ? 'avelReroll(\''+esc+'\',\''+sel.slot+'\',\''+side+'\','+i+')' : '';
  let middle, cta='';
  if(pend){
    middle='<div class="av-fight-res"><div class="av-fight-res-title">Relances, '+AV_ORDINAL[idx-1]+' affrontement</div>'+
      (mine
        ? '<p class="av-end-p">Tu peux relancer des dés avec ton équipement (une fois par combat). Choisis l\'objet, puis clique sur le dé à relancer.</p>'+
          '<div class="reroll-list">'+rerolls.map(x=>{
            const what = x.side==='hero' ? (x.colors ? x.colors.map(c=>'dé '+c).join(' ou ') : 'n\'importe quel dé') : (x.colors.map(c=>'dé '+c).join(' ou ')+' du monstre');
            return '<button class="btn-secondary'+(sel&&sel.slot===x.slot?' is-active':'')+'" onclick="avelPickReroll(\''+x.slot+'\')">'+avItemDef(x.it).ico+' '+escHtml(avItemDef(x.it).nom)+' : relancer '+escHtml(what)+(x.n>1?' ('+x.left+'/'+x.n+')':'')+'</button>';
          }).join('')+'</div>'+
          (sel ? '<div class="action-row-sub u-mt-sm">Clique sur un dé en surbrillance.</div>' : '')+
          (pend.notes.length ? '<p class="av-fight-notes">'+escHtml(pend.notes.join(' · '))+'</p>' : '')
        : '<p class="av-end-p">'+escHtml(f.by)+' choisit ses relances…</p>')+
      '</div>';
    if(mine) cta=avBtn('btn-primary','Résoudre l\'affrontement','avelResolve(\''+esc+'\')',false);
  } else {
    middle='<div class="av-fight-res">'+
      '<div class="av-fight-res-title">Résolution, '+AV_ORDINAL[f.clash-1]+' affrontement</div>'+
      r.text.map(t=>'<p class="av-type">'+escHtml(t)+'</p>').join('')+
      (r.notes.length ? '<p class="av-fight-notes av-type">'+escHtml(r.notes.join(' · '))+'</p>' : '')+
    '</div>';
    if(!f.over){
      cta=(mine && f.clash<AV_CLASHES ? avBtn('btn-secondary','Combattre à nouveau ('+f.clash+'/'+AV_CLASHES+')','avelFightAgain(\''+esc+'\')',false) : '')+
          avBtn('btn-secondary','Arrêter le combat','avelFightStop(\''+esc+'\')',false);
      if(!mine) cta='<span class="action-row-sub">'+escHtml(f.by)+' mène ce combat.</span>'+cta;
    } else {
      cta=avBtn('btn-secondary','Fermer','avelFightStop(\''+esc+'\')',false);
    }
  }
  const pv = m ? ' <span class="action-row-sub">❤️ '+(avMonRes(m)-m.dmg)+'/'+avMonRes(m)+'</span>' : '';
  return '<div class="av-fight" id="av-fight-box">'+
    '<div class="av-fight-title">'+escHtml(hn)+' vs '+escHtml(md.nom)+pv+'</div>'+
    '<div class="av-fight-rolls">'+
      '<div class="av-roll"><div class="av-roll-title">Mon lancer</div><div class="av-dice">'+r.hd.map((d,i)=>avDieHtml('hero',d,i,dieClick('hero',d,i))).join('')+'</div></div>'+
      '<div class="av-roll"><div class="av-roll-title">Lancer : '+escHtml(md.nom)+'</div><div class="av-dice">'+r.md.map((d,i)=>avDieHtml('monster',d,i,dieClick('monster',d,i))).join('')+'</div></div>'+
    '</div>'+middle+
    '<div class="av-fight-cta">'+cta+'</div>'+
  '</div>';
}

// Animation : dés du joueur puis du monstre (faces qui défilent), puis texte écrit lettre à lettre.
// Chaque partie n'est jouée qu'une fois par écran (les dés au lancer, le texte à la résolution).
const AV_DIE_STEP=170, AV_DIE_ROLL=650, AV_TYPE_MS=14;
let avFightSeen={}, avFightTimers=[], avDieRR={};
function avAnimateFight(el, opts, onDone){
  avFightTimers.forEach(clearTimeout); avFightTimers=[];
  const reduce = typeof matchMedia!=='undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce || (!opts.dice && !opts.text)){ if(onDone) onDone(); return; }
  el.classList.add('is-rolling');
  if(!opts.dice) el.classList.add('no-dice-anim');
  const later=(fn,ms)=>avFightTimers.push(setTimeout(fn,ms));
  let tEnd=0;
  if(opts.dice){
    const dice=[...el.querySelectorAll('.av-die')];
    const nh=dice.filter(d=>d.getAttribute('data-side')==='hero').length;
    dice.forEach((d,idx)=>{
      const side=d.getAttribute('data-side'), c=d.getAttribute('data-c'), final=d.innerHTML;
      const start = side==='hero' ? idx*AV_DIE_STEP : nh*AV_DIE_STEP + 250 + (idx-nh)*AV_DIE_STEP;
      d.style.animationDelay=start+'ms';
      const faces=AV_DICE[c]||['vide'];
      for(let t=0;t<AV_DIE_ROLL;t+=90) later(()=>{ d.innerHTML=avFaceInner(side, faces[Math.floor(Math.random()*faces.length)]); }, start+t);
      later(()=>{ d.innerHTML=final; d.classList.add('is-landed'); }, start+AV_DIE_ROLL);
      tEnd=Math.max(tEnd, start+AV_DIE_ROLL);
    });
  }
  let t=tEnd+(opts.dice?200:0);
  if(opts.text){
    const ps=[...el.querySelectorAll('.av-type')];
    ps.forEach(p=>{ p.setAttribute('data-full', p.textContent); p.textContent=''; });
    ps.forEach(p=>{
      const full=p.getAttribute('data-full');
      for(let i=1;i<=full.length;i++){ const n=i; later(()=>{ p.textContent=full.slice(0,n); }, t+n*AV_TYPE_MS); }
      t+=full.length*AV_TYPE_MS+120;
    });
  }
  later(()=>{ el.classList.remove('is-rolling','no-dice-anim'); if(onDone) onDone(); }, t);
}
function avRenderFight(st, h, pseudo){
  const el=document.getElementById('av-fight'); if(!el) return;
  const html=avFightHtml(st, h, pseudo);
  const changed=el.__avHtml!==html;
  avSet('av-fight', html);
  const f=h.fight;
  if(!changed || !f) return;
  const box=document.getElementById('av-fight-box'); if(!box) return;
  const idx = (f.pend && !f.over) ? f.clash+1 : f.clash;
  const dk=f.id+'_'+idx, tk=dk+'_t';
  const doDice=!avFightSeen[dk], doText=!(f.pend && !f.over) && !avFightSeen[tk];
  avFightSeen[dk]=true; if(!(f.pend && !f.over)) avFightSeen[tk]=true;
  // Dé tout juste relancé : petite rotation sur ce dé seulement
  box.querySelectorAll('.av-die').forEach(d=>{
    const k=dk+'_'+d.getAttribute('data-side')+'_'+d.getAttribute('data-i'), rr=parseInt(d.getAttribute('data-rr'),10)||0;
    if(!doDice && rr>(avDieRR[k]||0)) d.classList.add('just-rerolled');
    avDieRR[k]=rr;
  });
  const openEnd=()=>{ if(f.over==='win' || f.ko) avMaybeOpenFightEnd(f.id); };
  if(doDice && f.clash===0 && typeof box.scrollIntoView==='function') box.scrollIntoView({ behavior:'smooth', block:'nearest' });
  avAnimateFight(box, { dice:doDice, text:doText }, openEnd);
}
let avFightEndShown={};
function avMaybeOpenFightEnd(fid){
  if(avFightEndShown[fid]) return;
  avFightEndShown[fid]=true;
  avOpenModal('fightEnd', fid);
}
// Contenu de la modale Victoire / Défaite
function avFightEndHtml(st, pseudo){
  const h=avHeroOf(st,pseudo); if(!h) return '';
  const f=(h.fight && avModal && h.fight.id===avModal.id) ? h.fight : null;
  const esc=escAttr(pseudo), md=f ? (AV_MONSTERS[f.k]||{nom:'le monstre'}) : null;
  let z='';
  if(f && f.over==='win'){
    z+='<h2 class="rules-title">🎉 Victoire</h2>';
    z+='<div class="av-end-sub">'+escHtml(md.nom)+' est vaincu. Récompense : '+escHtml((f.loot||[]).join(', ')||'aucune')+'.</div>';
  }
  if(h.pick){
    z+='<div class="av-end-sub">Héros, choisissez votre récompense :</div>'+
       '<div class="action-row-sub u-mt-sm">Temps restant : '+avTimerSpan(h.pick.until)+'</div>'+
       '<div class="section-title u-mt-sm">Ton équipement</div>'+avGearHtml(h)+
       '<div class="pick-grid u-mt-sm">'+avPickCards(h, pseudo)+'</div>';
  } else if(h.upg>0){
    const opts=avUpgradable(h).map(it=>avOpt(it.id, avItemDef(it).nom));
    z+='<div class="av-end-sub">Choisissez l\'objet à améliorer :</div>'+
       '<div class="action-row"><span class="action-row-label"><select class="dd" id="av-upg-sel">'+opts.join('')+'</select></span>'+
       avBtn('btn-secondary','Améliorer','avelUpgChoiceFromUi(\''+esc+'\')',false)+'</div>';
  }
  if(h.ko || (f && f.ko)){
    const hd=avHeroDef(h.id);
    z+='<h2 class="rules-title'+(z?' u-mt-md':'')+'">💀 Défaite</h2>'+
      '<div class="av-end-sub">'+(md?'Le monstre vous a défait…':'Votre héros est à terre…')+'</div>'+
      '<p class="av-end-p">'+escHtml(hd.nom)+' est '+(hd.f?'évanouie':'évanoui')+' sur le sol.<br>Vous perdez toutes les pièces d\'or de votre sac à dos'+(f&&f.lost?' ('+f.lost+')':'')+'.'+
        (h.discard>0?'<br>Vous devez choisir et défausser 1 équipement.':'')+'</p>'+
      '<p class="av-end-p">Au début du prochain tour, votre héros se réveille : vous récupérez la totalité de vos PV, et vous êtes '+(hd.f?'téléportée':'téléporté')+' directement '+AV_HOME.au+'.</p>';
    if(h.discard>0) z+='<div class="av-end-sub">Défausser 1 objet</div>'+avDiscardRows(h, pseudo);
  }
  if(!h.pick && !(h.upg>0) && !(h.discard>0)) z+='<div class="u-mt-md">'+avBtn('btn-primary','Continuer','avelHideModal()',false)+'</div>';
  return z || '<p>Combat terminé.</p>';
}
// Ce que le héros porte et transporte (affiché au moment de choisir un objet)
function avGearHtml(h){
  const vol=avBagVol(h);
  return '<div class="gear-summary">'+
    AV_SLOTS.map(([s,l])=>'<span class="gear-item"><span class="gear-slot">'+l+'</span> '+(h.eq[s]?escHtml(avItemLabel(h.eq[s])):'<em>vide</em>')+'</span>').join('')+
    '<span class="gear-item"><span class="gear-slot">Sac '+vol+'/'+AV_BAG_CAP+'</span> '+(h.bag.length?escHtml(h.bag.map(it=>avItemDef(it).nom).join(', ')):'<em>aucun objet</em>')+(h.coins?' · '+h.coins+' 🪙':'')+'</span>'+
  '</div>';
}
// Où irait l'objet si on le prend
function avPickDest(h, d){
  const v=d.slot==='elixir'?AV_VOL.elixir:AV_VOL.equip, full=avBagVol(h)+v>AV_BAG_CAP;
  const owned=avAllItems(h).some(it=>AV_ITEMS[it.k]===d);
  let dest;
  if(d.slot!=='elixir' && !h.eq[d.slot]) dest='→ porté directement ('+avSlotLabel(d.slot).toLowerCase()+' libre)';
  else dest='→ dans le sac'+(d.slot!=='elixir'?' (tu portes déjà '+avItemDef(h.eq[d.slot]).nom+')':'')+(full?' ⚠️ sac plein':'');
  return (owned?'<span class="pick-card-warn">Tu as déjà cet objet</span>':'')+'<span class="pick-card-dest">'+escHtml(dest)+'</span>';
}
function avPickCards(h, pseudo){
  const esc=escAttr(pseudo);
  return h.pick.opts.map((k,i)=>{
    const d=AV_ITEMS[k]||{nom:'?',ico:'?',slot:'',base:''};
    const v=d.slot==='elixir'?AV_VOL.elixir:AV_VOL.equip;
    return '<button class="pick-card" onclick="avelPick(\''+esc+'\','+i+')">'+
      '<span class="pick-card-ico">'+d.ico+'</span><span class="pick-card-name">'+escHtml(d.nom)+'</span>'+
      '<span class="pick-card-slot">'+escHtml(avSlotLabel(d.slot))+' · '+v+' place'+(v>1?'s':'')+'</span>'+
      '<span class="pick-card-fx">'+escHtml(d.base)+'</span>'+avPickDest(h,d)+'</button>';
  }).join('');
}
function avDiscardRows(h, pseudo){
  const esc=escAttr(pseudo);
  const rows=AV_SLOTS.filter(([s])=>h.eq[s]).map(([s,l])=>[l,h.eq[s]]).concat(h.bag.map(it=>['Sac à dos',it]));
  return '<div class="discard-list">'+rows.map(([l,it])=>
    '<button class="discard-row" onclick="avelDiscard(\''+esc+'\',\''+it.id+'\')"><span>'+escHtml(l)+'</span><strong>'+escHtml(avItemLabel(it))+'</strong></button>').join('')+'</div>';
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
      '<div class="dd-row u-mt-sm"><span class="dd-label">Difficulté</span><select class="dd" onchange="avelSetDiff(this.value)">'+Object.keys(AV_DIFFS).map(k=>'<option value="'+k+'"'+(k===st.diff?' selected':'')+'>'+AV_DIFFS[k].nom+'</option>').join('')+'</select></div>'+
      '<button class="btn-primary u-mt-sm" onclick="avelLaunch()"'+(nP?'':' disabled')+'>Lancer la partie'+(nP?' ('+nP+')':'')+'</button>'+
      '<button class="btn-primary-danger u-mt-sm" onclick="avelCancel()">Fermer le lobby</button>';
  } else {
    status=avStatusPills(st)+'<div class="dpill">Sceaux <strong>'+st.seals+'</strong></div><div class="dpill">Murailles <strong>'+st.walls+'/'+st.limit+'</strong></div><div class="dpill">Pièges <strong>'+st.traps.length+'/'+st.limit+'</strong></div>';
    players=st.heroes.map(h=>{
      const t=st.tiles[h.pos];
      const acts=h.players.map(ps=>escHtml(ps)+' ('+avActsLeft(st,ps)+')').join(', ');
      return '<div class="player-row">'+
        '<span class="player-name">'+escHtml(avHeroDef(h.id).nom)+' — '+acts+'</span>'+
        '<span class="player-infos">'+(h.ko?'<span class="player-info">KO</span>':'')+(avFighting(h)?'<span class="player-info">Combat</span>':'')+'<span class="player-info">PV '+h.pv+'/'+AV_PV_MAX+'</span><span class="player-info">Or '+h.coins+'</span><span class="player-info">Sac '+avBagVol(h)+'/'+AV_BAG_CAP+'</span><span class="player-info">'+escHtml(avTileDef(t).nom)+'</span></span></div>';
    }).join('');
    if(st.phase==='play'){
      ctrl='<div class="diamant-voted">Tour libre : entre parenthèses, les actions restantes de chaque joueur. Le tour se termine quand tout le monde a joué ou à la fin du minuteur.</div>'+
        '<div class="dd-row"><span class="dd-label">Durée d\'un tour (dès le tour suivant)</span>'+secsSel+'</div>'+
        '<button class="btn-primary u-mt-sm" onclick="avelEndRoundNow()">Terminer le tour maintenant</button>'+
        '<button class="btn-primary-danger u-mt-sm" onclick="avelCancel()">Abandonner la partie</button>';
    } else {
      ctrl='<div class="diamant-voted">'+(st.result==='win'?'Victoire':'Défaite')+' : '+(st.kills||0)+' monstre(s) vaincu(s), '+(st.points||0)+' points pour le feu.</div>'+
        '<button class="btn-primary" onclick="avelEndToFire()">Ajouter '+(st.points||0)+' points au feu et clôturer</button>'+
        '<button class="btn-primary-danger u-mt-sm" onclick="avelCancel()">Clôturer sans ajouter</button>';
    }
  }
  if(st.phase!=='lobby') status+=avBossHtml(st);
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
function avelHideModal(){
  const was=avModal; avModal=null;
  const m=document.getElementById('avel-modal'); if(m) m.style.display='none';
  if(was && was.type==='fightEnd' && avel && currentViewerPseudo) renderAvelViewer(currentViewerPseudo);   // réaffiche le choix en attente dans le bandeau
}
function avelShowRules(){ avOpenModal('rules'); }
function avelShowHistory(){ avOpenModal('history'); }
// Zoom de la carte complète : 100 % = toute la carte ; sur mobile on démarre zoomé et on fait défiler
let avMapZoom=1;
function avDefaultMapZoom(){ return (typeof window!=='undefined' && window.innerWidth<700) ? 1.8 : 1; }
function avCenterMap(){
  const sc=document.getElementById('av-map-scroll'); if(!sc) return;
  const here=sc.querySelector('.av-hex.is-here polygon') || sc.querySelector('.av-hex.is-castle polygon'); if(!here) return;
  const a=here.getBoundingClientRect(), b=sc.getBoundingClientRect();
  sc.scrollLeft += (a.left+a.width/2) - (b.left+b.width/2);
  sc.scrollTop  += (a.top+a.height/2) - (b.top+b.height/2);
}
function avelMapZoom(dir){
  avMapZoom = dir===0 ? 1 : Math.min(3, Math.max(1, Math.round((avMapZoom + dir*0.4)*10)/10));
  avRefreshModal();
  if(typeof requestAnimationFrame!=='undefined') requestAnimationFrame(avCenterMap);
}
function avelShowMap(){ avMapZoom=avDefaultMapZoom(); avOpenModal('map'); if(typeof requestAnimationFrame!=='undefined') requestAnimationFrame(avCenterMap); }
function avelShowMoon(){ avOpenModal('moon'); }
function avelShowHero(id){ avOpenModal('hero', id); }
function avRefreshModal(){
  if(!avModal) return;
  if(avModal.type!=='rules' && (!avel || avel.phase==='lobby')){ avelHideModal(); return; }
  let h='';
  if(avModal.type==='rules') h=avRulesHtml();
  else if(avModal.type==='history') h=avHistoryHtml(avel);
  else if(avModal.type==='map'){
    const me=avHeroOf(avel, currentViewerPseudo);
    h='<h2 class="rules-title">Carte d\'Avel</h2>'+
      '<div class="map-zoom"><button class="btn-secondary" onclick="avelMapZoom(-1)" aria-label="Dézoomer">−</button><span class="map-zoom-val">'+Math.round(avMapZoom*100)+' %</span><button class="btn-secondary" onclick="avelMapZoom(1)" aria-label="Zoomer">+</button><button class="btn-secondary" onclick="avelMapZoom(0)">Ajuster</button></div>'+
      '<div class="av-map is-full"><div class="map-scroll" id="av-map-scroll"><div class="map-canvas" style="width:'+Math.round(avMapZoom*100)+'%">'+avMapSvg(avel, Object.keys(avel.tiles), me?me.pos:null, true)+'</div></div>'+avLegendHtml()+'</div>'+
      '<div class="av-map-heroes">'+avel.heroes.map(x=>'<span class="av-map-hero">'+avHeroDot(x.id)+' '+escHtml(avHeroDef(x.id).nom)+' <span class="action-row-sub">'+escHtml(x.players.join(', '))+'</span></span>').join('')+'</div>'+
      '<div class="action-row-sub u-mt-sm">'+AV_ICO.wall+' Murailles '+avel.walls+'/'+avel.limit+' · '+AV_ICO.seal+' Sceaux restants '+avel.seals+' · '+AV_ICO.trap+' Pièges '+avel.traps.length+'/'+avel.limit+'</div>';
  }
  else if(avModal.type==='hero') h=avHeroDetailHtml(avel, avModal.id);
  else if(avModal.type==='lieu') h=avPlaceHtml(avel, currentViewerPseudo);
  else if(avModal.type==='fightEnd') h=avFightEndHtml(avel, currentViewerPseudo);
  else if(avModal.type==='blackmoon') h=avBlackMoonHtml(avel);
  else if(avModal.type==='moon') h=avMoonTrackHtml(avel);
  else if(avModal.type==='gameEnd') h=avEndHtml(avel, false)+'<div class="u-mt-md">'+avBtn('btn-primary','Fermer','avelHideModal()',false)+'</div>';
  // La carte complète garde sa position de défilement quand elle se redessine
  const sc=document.getElementById('av-map-scroll'), pos=sc ? [sc.scrollLeft, sc.scrollTop] : null;
  avKeepSelects('avel-modal-content', ()=>avSet('avel-modal-content', h));
  const sc2=document.getElementById('av-map-scroll');
  if(sc2 && pos){ sc2.scrollLeft=pos[0]; sc2.scrollTop=pos[1]; }
}
// Contenu de la modale « Action de lieu »
function avPlaceHtml(st, pseudo){
  const h=avHeroOf(st,pseudo); if(!h) return '';
  const t=st.tiles[h.pos], def=avTileDef(t), esc=escAttr(pseudo);
  let my=avCanAct(st,pseudo), body='', canGo=my, label='Valider';
  const row=(lbl, ctrl)=>'<div class="action-row"><span class="action-row-label">'+lbl+'</span><span class="action-row-ctrl">'+ctrl+'</span></div>';
  const coins='<div class="stat-row"><span>Tes pièces d\'or</span><strong>🪙 '+h.coins+'</strong></div>';
  if(def.act==='marche'){
    const rich=h.coins>=AV_PRICE.buy, free=avMarketFree(st,pseudo), canTx=avCanMarket(st,pseudo);
    my=canTx;
    const cards=st.stall.map((k,i)=>{
      const d=AV_ITEMS[k]||{nom:'?',ico:'?',slot:'',base:''}, v=d.slot==='elixir'?AV_VOL.elixir:AV_VOL.equip;
      return '<div class="stall-card">'+
        '<span class="pick-card-ico">'+d.ico+'</span><span class="pick-card-name">'+escHtml(d.nom)+'</span>'+
        '<span class="pick-card-slot">'+escHtml(avSlotLabel(d.slot))+' · '+v+' place'+(v>1?'s':'')+'</span>'+
        '<span class="pick-card-fx">'+escHtml(d.base)+'</span>'+
        avBtn('btn-secondary', 'Acheter · '+AV_PRICE.buy+' 🪙', 'avelBuy(\''+esc+'\','+i+')', !(my && rich), !rich?'Pas assez de pièces':'')+'</div>';
    }).join('');
    const items=avAllItems(h);
    body=coins+'<div class="section-title u-mt-sm">L\'étal</div>'+
      (cards ? '<div class="stall-grid">'+cards+'</div>' : '<div class="diamant-voted">L\'étal est vide : le marchand n\'a plus rien à vendre.</div>')+
      '<div class="action-row-sub">1 action = '+AV_MARKET_TX+' transactions (acheter ou vendre). Le marchand remplace aussitôt l\'objet vendu.</div>'+
      (free>0 ? '<div class="av-alert u-mt-sm"><div class="av-alert-title">🛒 Encore '+free+' transaction gratuite dans cette action</div><div class="action-row-sub">Elle se perd si tu fais autre chose ou si le tour se termine.</div></div>' : '')+
      '<div class="section-title u-mt-md">Vendre</div>'+
      (items.length
        ? '<div class="action-row"><span class="action-row-label"><select class="dd" id="av-sell-sel">'+items.map(it=>avOpt(it.id, avItemDef(it).nom)).join('')+'</select></span>'+
          avBtn('btn-secondary','Vendre (+'+AV_PRICE.sell+' 🪙)','avelSellFromUi(\''+esc+'\')',!my)+'</div>'
        : '<div class="action-row-sub">Tu n\'as rien à vendre.</div>');
    label=null;
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
                      : '<div class="diamant-voted">Aucun repaire à sceller pour l\'instant : il faut un repaire déjà découvert et sans monstre dessus (tue d\'abord le monstre, ou explore pour en trouver un vide).</div>')+
        '<div class="action-row-sub">Un repaire scellé ne fait plus jamais apparaître de monstre.</div>';
      canGo=my && lairs.length>0 && st.seals>0;
    }
    label='Sceller';
  } else if(def.act==='carriere'){
    body=coins+'<div class="stat-row"><span>Murailles '+AV_HOME.au+'</span><strong>'+AV_ICO.wall+' '+st.walls+'/'+st.limit+'</strong></div>'+
      '<div class="action-row-sub">Chaque muraille arrêtera un monstre devant '+AV_HOME.nom+' (la Bête les détruit toutes d\'un coup).</div>';
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
        '<div class="action-row-sub">Les pièges blesseront la Bête quand elle passera dessus : elle suit toujours le plus court chemin vers '+AV_HOME.nom+'.</div>';
      canGo=my && types.length>0 && tiles.length>0;
    }
    label='Poser le piège';
  } else if(def.act==='lac'){
    const D=f=>avDieHtml('hero',{c:'vert',f},0);
    let last='';
    if(h.dice && h.dice.round===st.round && Array.isArray(h.dice.rolls)){
      last='<div class="lake-result"><div class="av-roll-title">Ton lancer</div>'+
        h.dice.rolls.map((r,i)=>'<div class="lake-roll">'+(i?'<span class="action-row-sub">Relance :</span>':'')+'<span class="av-dice">'+avArr(r).map(D).join('')+'</span></div>').join('')+
        '<div class="av-end-sub u-mt-sm">Résultat : '+escHtml(h.dice.out)+'</div></div>';
    }
    body=coins+'<p class="av-end-p">Jette '+AV_PRICE.lake+' pièce dans le lac et lance 2 dés verts. Les esprits de l\'eau te récompensent selon la combinaison :</p>'+
      '<div class="lake-table">'+
        '<div class="lake-row"><span class="av-dice">'+D('att')+D('att')+'</span><span>'+AV_PRICE.lakeCoins+' pièces d\'or</span></div>'+
        '<div class="lake-row"><span class="av-dice">'+D('att')+D('def')+'</span><span>1 objet (3 au choix)</span></div>'+
        '<div class="lake-row"><span class="av-dice">'+D('def')+D('def')+'</span><span>1 amélioration d\'objet</span></div>'+
      '</div>'+
      '<div class="action-row-sub">'+'✨ compte comme une épée. Avec une face vide, les dés sont relancés une fois automatiquement ; si la combinaison ne donne toujours rien, ta pièce est perdue.</div>'+last;
    canGo=my && h.coins>=AV_PRICE.lake; label='Lancer les dés ('+AV_PRICE.lake+' 🪙)';
  }
  const warn = !my ? '<div class="action-row-sub u-mt-sm">'+(avActsLeft(st,pseudo)>0?'Termine d\'abord ce qui est en attente (objet, sac…).':'Tu as déjà joué tes actions ce tour-ci.')+'</div>' : '';
  return '<h2 class="rules-title">'+def.ico+' '+escHtml(def.nom)+'</h2>'+body+
    (label ? '<div class="u-mt-md">'+avBtn('btn-primary', label+' — 1 action', 'avelPlaceFromUi(\''+esc+'\')', !canGo)+'</div>' : '')+warn;
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
    '<li>Explorez les terres autour '+AV_HOME.du+', équipez-vous et préparez-vous : quand la <strong>Lune Noire</strong> se lèvera, la Bête marchera sur '+AV_HOME.nom+' avec tous les monstres.</li>'+
    '<li>Si un seul monstre entre '+AV_HOME.dans+', la partie est perdue.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🧙 Les héros</h3><ul>'+
    '<li>Jusqu\'à '+AV_MAX_HEROES+' héros. Au-delà de '+AV_MAX_HEROES+' joueurs, deux joueurs se partagent un héros : chacun a <strong>1 des 2 actions</strong>.</li>'+
    '<li>Le plateau part '+AV_HOME.du+', en bas ; trois lieux l\'entourent dès le départ (Lisière, Marché, Marais) et le reste des terres est à découvrir. Le '+AV_TILES.cratere.nom+' '+AV_TILES.cratere.ico+', tout en haut, est visible dès le début : c\'est de là que sortira la Bête.</li>'+
    '<li>Chaque héros a '+AV_PV_MAX+' PV et commence '+AV_HOME.au+' avec '+AV_START_COINS+' pièce d\'or et 1 équipement tiré au hasard.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🔄 Un tour (tour libre)</h3><ul>'+
    '<li>Chaque héros a <strong>'+AV_ACTIONS+' actions</strong> par tour, à jouer <strong>quand il veut</strong> avant la fin du minuteur ⏱. Les actions non jouées sont perdues.</li>'+
    '<li>Le tour se termine dès que tout le monde a joué, ou à la fin du minuteur.</li>'+
    '<li>🚶 <strong>Se déplacer</strong> vers une tuile voisine. Une tuile cachée se révèle à ton arrivée ; si c\'est un repaire, un monstre en sort.</li>'+
    '<li>'+AV_ICO.shortcut+' <strong>Raccourci</strong> : depuis une tuile '+AV_ICO.shortcut+' révélée, va directement sur une autre tuile '+AV_ICO.shortcut+' révélée.</li>'+
    '<li>❤️ <strong>Repos</strong> : +'+AV_REST_HEAL+' PV (maximum '+AV_PV_MAX+').</li>'+
    '<li>🏠 <strong>Action de lieu</strong> : voir ci-dessous.</li>'+
    '<li>⚔️ <strong>Combattre</strong> un monstre de ta tuile : voir « Le combat ».</li>'+
    '<li>🤝 <strong>Don</strong> : gratuit, tant qu\'il te reste des actions ce tour. Donne une pièce ou un objet à un héros sur ta tuile, s\'il n\'y a pas de monstre.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🏠 Les lieux (1 action)</h3><ul>'+
    '<li>🛒 <strong>Marché</strong> : '+AV_STALL_SIZE+' objets sur l\'étal. Acheter un objet ('+AV_PRICE.buy+' 🪙) ou en vendre un (+'+AV_PRICE.sell+' 🪙) : jusqu\'à '+AV_MARKET_TX+' transactions pour 1 action. Le marchand remplace aussitôt l\'objet acheté.</li>'+
    '<li>'+AV_TILES.atelier.ico+' <strong>'+AV_TILES.atelier.nom+'</strong> : '+AV_PRICE.upgrade+' 🪙 pour passer un objet sur sa face améliorée ✦.</li>'+
    '<li>🗿 <strong>Cercle de pierres</strong> : '+AV_PRICE.seal+' 🪙 pour sceller '+AV_ICO.seal+' un repaire révélé et vide. Ferme à « Fin des sceaux ».</li>'+
    '<li>⛏️ <strong>Carrière</strong> : '+AV_PRICE.wall+' 🪙 pour une muraille '+AV_ICO.wall+' '+AV_HOME.au+'.</li>'+
    '<li>🏹 <strong>Camp des elfes</strong> : un piège '+AV_ICO.trap+' contre la Bête ('+AV_TRAP_COSTS.slice(0,3).join(' / ')+' 🪙, un de chaque, un par tuile). Ferme à « Fin des pièges ».</li>'+
    '<li>🏞️ <strong>Lac aux souhaits</strong> : '+AV_PRICE.lake+' 🪙, 2 dés verts. ⚔️⚔️ = '+AV_PRICE.lakeCoins+' 🪙 · ⚔️🛡️ = un objet · 🛡️🛡️ = une amélioration. ✨ compte comme ⚔️. Sinon une relance.</li>'+
    '<li>'+AV_TILES.village.ico+' <strong>'+AV_TILES.village.nom+'</strong> et '+AV_TILES.sauvage.ico+' <strong>'+AV_TILES.sauvage.nom+'</strong> : +'+AV_COIN_GAIN+' 🪙, s\'il n\'y a pas de monstre.</li>'+
    '<li>À partir de 5 héros : 4 sceaux, 4 murailles et 4 pièges (le 4ᵉ coûte '+AV_TRAP_COSTS[3]+' 🪙).</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>⚔️ Le combat</h3><ul>'+
    '<li>Lancer un combat coûte <strong>1 action</strong>. Un combat dure jusqu\'à <strong>'+AV_CLASHES+' affrontements</strong> ; après chacun, tu choisis de continuer ou d\'arrêter.</li>'+
    '<li>À chaque affrontement, tu lances '+AV_HERO_DICE+' dés verts + les dés de ton équipement (et de ton élixir, à boire avant le combat). Le monstre lance ses propres dés.</li>'+
    '<li>Chaque ⚔️ non bloqué par une 🛡️ adverse inflige 1 blessure. ✨ compte comme ⚔️ ou 🛡️, au mieux pour toi.</li>'+
    '<li>Le héros et le monstre frappent <strong>en même temps</strong> : tu peux vaincre le monstre et t\'évanouir dans le même affrontement (tu gagnes alors la récompense avant de t\'évanouir).</li>'+
    '<li>Les blessures du monstre restent si tu arrêtes : un autre héros peut l\'achever.</li>'+
    '<li>Monstre vaincu : tu gagnes sa récompense (pièces, un objet à choisir parmi 3, ou une amélioration).</li>'+
    '<li>Les <strong>grands monstres</strong> ont un malus : moins de dés, ou un emplacement d\'équipement bloqué, ou pas d\'élixir.</li>'+
    '<li>À 0 PV, ton héros s\'évanouit : il perd toutes ses pièces et 1 objet de ton choix, et ses actions du tour. Il se réveille '+AV_HOME.au+' au début du tour suivant, PV au maximum.</li>'+
    '<li>Un seul héros à la fois peut combattre un même monstre.</li>'+
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
  '<div class="rules-section"><h3>🌑 La Lune Noire et la Bête</h3><ul>'+
    '<li>Quand la lune atteint la Lune Noire : toutes les terres se révèlent, les repaires se remplissent, et des monstres en plus surgissent selon la difficulté ('+Object.values(AV_DIFFS).map(d=>d.nom).join(' / ')+').</li>'+
    '<li>'+AV_MONSTERS.bete.ico+' <strong>La Bête</strong> sort du '+AV_TILES.cratere.nom+' : '+avBeastRes(2)+' PV (1-2 héros), '+avBeastRes(3)+' (3), '+avBeastRes(4)+' (4), +3 par héros en plus. Elle lance 5 dés (2 noirs, 3 violets) et appartient aux 3 familles. Ses blessures restent d\'un combat à l\'autre.</li>'+
    '<li>À chaque fin de tour, <strong>tous les monstres avancent d\'une tuile</strong> vers '+AV_HOME.nom+' par le plus court chemin : les petits, puis les grands, puis la Bête.</li>'+
    '<li>'+AV_ICO.wall+' Une muraille arrête un monstre (elle est détruite et il réessaie au tour suivant). La Bête détruit toutes les murailles d\'un coup. On peut encore en bâtir pendant le tour où la Bête apparaît.</li>'+
    '<li>'+AV_ICO.trap+' Un piège blesse la Bête quand elle entre sur sa tuile (les autres monstres l\'ignorent).</li>'+
    '<li>🏆 <strong>Victoire</strong> : tous les monstres et la Bête sont vaincus. 💀 <strong>Défaite</strong> : un seul monstre entre '+AV_HOME.dans+'.</li>'+
    '<li>🔥 Feu de camp : '+AV_FIRE_WIN+' points pour la victoire + '+AV_FIRE_PER_KILL+' par monstre vaincu (en cas de défaite, seulement les monstres vaincus).</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🌙 La piste lunaire</h3><p>À la fin de chaque tour, la lune avance d\'une case :</p><ul>'+
    '<li>👹 <strong>Apparition</strong> : un monstre surgit sur chaque repaire révélé, vide et non scellé.</li>'+
    '<li>❤️ <strong>Soin</strong> : chaque héros récupère 1 PV.</li>'+
    '<li>🗿 / 🏹 <strong>Fermetures</strong> : le cercle de pierres puis le camp des elfes ferment.</li>'+
    '<li>🌑 <strong>Lune Noire</strong> : la Bête apparaît.</li>'+
  '</ul></div>';
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') avelHideModal(); });
}