// ── GALERAPAGOS — L'ÎLE DU VILLAGE — MOTEUR + UI ─────────────────────────────
// V1 : boucle de survie (pêcher / collecter eau / collecter bois), compteurs, votes
//      de pénurie, maladie serpent, radeau, embarquement, ouragan.
// V2-A (cartes) : deck Épave, mains CACHÉES, action « Fouiller l'épave », jeu des cartes
//      ressources (+ poison eau croupie/poisson pourri), anti-venin, redistribution à la mort.
// V2-B (objets : gourde/canne/hache/gourdin/revolver/boule/somnifères/réveil/poupée/panier)
//      et V2-C (troc) = à venir. Les objets sont distribués mais INERTES pour l'instant.

// ── Constantes de jeu ──
const G_WEATHER_VALUES = [0,1,2,3];          // 3 cartes de chaque : ☀️0 ☁️1 🌧️2 ⛈️3
const G_FISH_BAG       = [1,1,1,2,2,3];      // sac pêche : 3×"1", 2×"2", 1×"3"
const G_WOOD_WHITE     = 7;                   // ◀── LEVIER DE RISQUE : boules blanches du sac bois (à côté de l'unique boule noire)
const G_MIN_PLAYERS    = 3;
const G_MAX_PLAYERS    = 12;
const G_FIRE_PER_SURVIVOR = 10;              // ◀── points de feu par naufragé sauvé (ajustable)

// ── Deck Épave (V2) — 54 cartes. cat : water/food/useless/obj (sub = objet précis) ──
const G_EPAVE = [
  // Ressources de base
  { n:7, cat:'water', name:"Bouteille d'eau" },
  { n:7, cat:'food',  name:"Sandwich" },
  // Objets PERMANENTS (posés en jeu)
  { n:3, cat:'obj', sub:'revolver', name:"Revolver" },
  { n:1, cat:'obj', sub:'gourdin',  name:"Gourdin" },
  { n:1, cat:'obj', sub:'canne',    name:"Canne à pêche" },
  { n:1, cat:'obj', sub:'hache',    name:"Hache" },
  { n:1, cat:'obj', sub:'gourde',   name:"Gourde" },
  { n:1, cat:'obj', sub:'boule',    name:"Boule de cristal" },
  // Cartes inutiles
  { n:1, cat:'useless', name:"Ticket de loterie gagnant" },
  { n:1, cat:'useless', name:"Jeu de société" },
  { n:1, cat:'useless', name:"Vieux slip" },
  { n:1, cat:'useless', name:"Clé de voiture de luxe" },
  { n:1, cat:'useless', name:"Brosse à WC" },
  // Objets CONSOMMABLES (défaussés à l'usage)
  { n:6, cat:'obj', sub:'cartouche',     name:"Cartouche" },
  { n:1, cat:'obj', sub:'cafe',          name:"Café" },
  { n:1, cat:'obj', sub:'reveil',        name:"Réveil matin" },
  { n:1, cat:'obj', sub:'conque',        name:"Conque" },
  { n:1, cat:'obj', sub:'pendule',       name:"Pendule" },
  { n:1, cat:'obj', sub:'antivenin',     name:"Anti-venin" },
  { n:1, cat:'obj', sub:'somni',         name:"Somnifère" },
  { n:1, cat:'obj', sub:'eaucroupie',    name:"Eau croupie" },
  { n:1, cat:'obj', sub:'poissonpourri', name:"Poisson pourri" },
  { n:1, cat:'obj', sub:'allumettes',    name:"Allumettes" },
  { n:1, cat:'obj', sub:'longuevue',     name:"Longue-vue" },
  { n:1, cat:'obj', sub:'lampe',         name:"Lampe torche" },
  { n:1, cat:'obj', sub:'barometre',     name:"Baromètre" },
  { n:1, cat:'obj', sub:'moulin',        name:"Moulin à légumes" },
  { n:1, cat:'obj', sub:'poupee',        name:"Poupée vaudou" },
  { n:1, cat:'obj', sub:'noixcoco',      name:"Noix de coco" },
  { n:1, cat:'obj', sub:'sardines',      name:"Sardines" },
  { n:2, cat:'obj', sub:'plaque',        name:"Plaque de tôle" },
  { n:1, cat:'obj', sub:'placeradeau',   name:"Planche de radeau" },
  { n:1, cat:'obj', sub:'panier',        name:"Panier garni" },
  { n:1, cat:'obj', sub:'kitbbq',        name:"Kit BBQ Cannibale" },
];

// ── Utils ──
function gClone(o){ return JSON.parse(JSON.stringify(o)); }
function gShuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function gNoEmoji(s){ return (typeof fNoEmoji==='function') ? fNoEmoji(s) : s; } // vue meneur sans emote (helper partagé de ferme.js)
function gWeatherLabel(v){ return ({0:'☀️ Grand soleil (0 eau)',1:'☁️ Nuageux (+1 eau)',2:'🌧️ Pluie (+2 eau)',3:'⛈️ Orage (+3 eau)'})[v] || '—'; }
function gAlive(st){ return Object.values(st.players).filter(p=>p.alive); }

function gNormalize(st){
  if(!st) return st;
  // Firebase supprime null / false / objets & tableaux vides — on reconstruit pour ne jamais tomber sur undefined
  st.players   = (st.players && typeof st.players==='object') ? st.players : {};
  st.turnOrder = Array.isArray(st.turnOrder) ? st.turnOrder : (st.turnOrder ? Object.values(st.turnOrder) : []);
  st.weather   = (st.weather && typeof st.weather==='object') ? st.weather : { deck:[], current:null, isHurricane:false, hurricaneDrawn:false };
  st.weather.deck = Array.isArray(st.weather.deck) ? st.weather.deck : (st.weather.deck ? Object.values(st.weather.deck) : []);
  st.counters  = (st.counters && typeof st.counters==='object') ? st.counters : { water:0, food:0, raft:0, slots:0 };
  ['water','food','raft','slots'].forEach(k=>{ if(typeof st.counters[k]!=='number') st.counters[k]=0; });
  st.vote      = (st.vote && typeof st.vote==='object') ? st.vote : null;
  st.deck      = Array.isArray(st.deck) ? st.deck : (st.deck ? Object.values(st.deck) : []);
  if(!('forcedFirst' in st)) st.forcedFirst=null;
  if(typeof st.deathsThisTurn!=='number') st.deathsThisTurn=0;
  if(typeof st.turn!=='number')       st.turn=1;
  if(typeof st.firstIdx!=='number')   st.firstIdx=0;
  if(typeof st.currentIdx!=='number') st.currentIdx=0;
  Object.values(st.players).forEach(p=>{
    if(typeof p.alive!=='boolean') p.alive=true;
    if(typeof p.sick!=='boolean')  p.sick=false;
    if(typeof p.acted!=='boolean') p.acted=false;
    if(!('action' in p))     p.action=null;
    if(!('voteTarget' in p)) p.voteTarget=null;
    p.hand    = Array.isArray(p.hand)    ? p.hand    : (p.hand    ? Object.values(p.hand)    : []);
    p.objects = Array.isArray(p.objects) ? p.objects : (p.objects ? Object.values(p.objects) : []);
  });
  // Trocs en attente (Phase C) — on purge ceux devenus invalides
  st.trades = (Array.isArray(st.trades) ? st.trades : (st.trades ? Object.values(st.trades) : []))
    .filter(tr=>{ const p=st.players[tr&&tr.from], t=st.players[tr&&tr.to];
      return p&&p.alive&&t&&t.alive&&(p.hand||[]).some(c=>c.id===tr.offer); });
  return st;
}

// ── Mise en place ──
function gInitCounters(n){ const base=2*(n-G_MIN_PLAYERS); return { water:6+base, food:5+base, raft:0, slots:0 }; }
function gBuildWeatherDeck(){
  let base=[]; G_WEATHER_VALUES.forEach(v=>{ for(let i=0;i<3;i++) base.push(v); }); // 12 cartes
  base = gShuffle(base);
  const removed = base.slice(0,5);                 // 5 cartes mises de côté (sans les regarder)
  const top     = gShuffle(base.slice(5));         // 7 cartes garanties sans ouragan (tours 1-7)
  const bottom  = gShuffle(removed.concat(['H'])); // 5 météo + Ouragan, mélangées, en dessous
  return top.concat(bottom);                       // 13 cartes
}

let __gcard = 0;
function gCardId(){ return 'k'+Date.now()+'_'+(__gcard++); }
function gBuildEpaveDeck(){
  const d=[]; G_EPAVE.forEach(t=>{ for(let i=0;i<t.n;i++){ const card={ id:gCardId(), cat:t.cat, name:t.name }; if(t.sub) card.sub=t.sub; d.push(card); } });
  return gShuffle(d);
}
// 4 cartes par joueur à 3-8 joueurs, 3 cartes à 9-12 joueurs
function gDealHands(st, deck){
  const per = st.turnOrder.length<=8 ? 4 : 3;
  st.turnOrder.forEach(ps=>{ const p=st.players[ps]; p.hand=[]; for(let i=0;i<per && deck.length;i++) p.hand.push(deck.shift()); });
  st.deck = deck;
}
function gHasObj(p, sub){ return (p.objects||[]).some(o=>o.sub===sub); }
function gCardIcon(c){
  if(c.cat==='obj') return ({
    revolver:'🔫', gourdin:'🏏', canne:'🎣', hache:'🪓', gourde:'🍶', boule:'🔮',
    cartouche:'•', cafe:'☕', reveil:'⏰', conque:'🐚', pendule:'⏳', antivenin:'💉',
    somni:'💤', eaucroupie:'🤢', poissonpourri:'🐟', allumettes:'🔥', longuevue:'🔭',
    lampe:'🔦', barometre:'🌡️', moulin:'🥣', poupee:'🪆', noixcoco:'🥥', sardines:'🐟',
    plaque:'🛡️', placeradeau:'🪵', panier:'🧺', kitbbq:'🍖'
  })[c.sub] || '🎁';
  return ({ water:'💧', food:'🍖', useless:'🗑️' })[c.cat] || '🃏';
}

// ── Déroulé d'un tour ──
function gStartTurn(st){
  st.deathsThisTurn=0;                                // morts du tour (Kit BBQ) remis à zéro
  Object.values(st.players).forEach(p=>{ if(p.peek) delete p.peek; if(p.lastResult) delete p.lastResult; if(p.shotAt) delete p.shotAt; p.conque=false; p.bonusActions=0; });   // infos vues, résultat d'action, alerte de tir, chef et actions bonus expirent au tour
  // Réveil matin : un premier joueur a été imposé pour ce tour → il prime sur la rotation
  if(st.forcedFirst && st.players[st.forcedFirst] && st.players[st.forcedFirst].alive){
    st.firstIdx = st.turnOrder.indexOf(st.forcedFirst);
    st.forcedFirst = null;
  } else if(st.turn>1){
    // Rotation du premier joueur (vers la droite parmi les vivants), ignorée au tour 1
    const n=st.turnOrder.length;
    for(let s=1;s<=n;s++){ const i=(st.firstIdx+s)%n; const p=st.players[st.turnOrder[i]]; if(p && p.alive){ st.firstIdx=i; break; } }
  }
  // Tirage météo
  const card = st.weather.deck.length ? st.weather.deck.shift() : 'H';
  if(card==='H'){
    st.weather.current=null; st.weather.isHurricane=true; st.weather.hurricaneDrawn=true;
    st.lastEvent='🌀 L\'OURAGAN approche ! Le radeau DOIT partir à la fin de ce tour, sinon tout le monde périt.';
  } else {
    st.weather.current=card; st.weather.isHurricane=false;
    st.lastEvent='Météo du tour '+st.turn+' : '+gWeatherLabel(card)+'.';
  }
  gBeginActions(st);
}

function gBeginActions(st){
  st.phase='action';
  Object.values(st.players).forEach(p=>{ if(p.alive){ p.acted=false; p.action=null; } p.voteTarget=null; });
  if(!gSeekActor(st)) gRunSurvival(st); // aucun acteur (cas extrême : tous malades) → survie directe
}

// Cherche le prochain joueur à jouer, en partant du premier joueur, dans l'ordre.
// Les malades passent leur tour (perdent leur action) et guérissent aussitôt. Retourne false si plus personne.
function gSeekActor(st){
  const order=st.turnOrder, n=order.length;
  for(let s=0;s<n;s++){
    const i=(st.firstIdx+s)%n; const ps=order[i]; const p=st.players[ps];
    if(p && p.alive && !p.acted){
      if(p.sick){ p.sick=false; p.acted=true; p.action='sick'; st.lastEvent=ps+' se remet de sa morsure et passe son tour.'; continue; }
      st.currentIdx=i; return true;
    }
  }
  return false;
}

function galerapagosAct(pseudo, action, extra){
  if(!galerapagos || galerapagos.phase!=='action') return;
  const st=gNormalize(gClone(galerapagos));
  if(st.turnOrder[st.currentIdx]!==pseudo) return; // pas ton tour
  const p=st.players[pseudo];
  if(!p || !p.alive || p.acted) return;
  const c=st.counters;

  if(action==='fish'){
    const draw=()=>G_FISH_BAG[Math.floor(Math.random()*G_FISH_BAG.length)];
    let val;
    if(gHasObj(p,'canne')) val=Math.max(draw(),draw(),draw());   // Canne : 1 + 2 boules, on garde la meilleure
    else val=draw();
    c.food=Math.min(36,c.food+val);
    p.action='fish'; st.lastEvent=pseudo+' pêche 🐟 +'+val+' nourriture'+(gHasObj(p,'canne')?' (canne 🎣 : meilleure de 3)':'')+'.';
    p.lastResult={ msg:'🎣 Tu as pêché +'+val+' nourriture.', turn:st.turn };
  } else if(action==='water'){
    if((st.weather.current||0)===0) return;          // pas d'eau aujourd'hui : action indisponible
    let w=st.weather.current;
    if(gHasObj(p,'gourde')) w*=2;                     // Gourde : collecte doublée
    c.water=Math.min(36,c.water+w);
    p.action='water'; st.lastEvent=pseudo+' collecte 💧 +'+w+' eau'+(gHasObj(p,'gourde')?' (gourde 🍶)':'')+'.';
    p.lastResult={ msg:'💧 Tu as collecté +'+w+' eau.', turn:st.turn };
  } else if(action==='wood'){
    const k=Math.max(0,Math.min(5, extra|0));
    let gained=gHasObj(p,'hache')?2:1, bit=false;   // Hache : 2 bois sûrs (sinon le 1er est gratuit)
    if(k>0){
      const bag=[]; for(let i=0;i<G_WOOD_WHITE;i++) bag.push('w'); bag.push('b');
      const drawn=gShuffle(bag).slice(0,k);
      if(drawn.includes('b')) bit=true; else gained+=k;
    }
    c.raft+=gained;
    let built=0; while(c.raft>=6){ c.raft-=6; c.slots++; built++; }
    p.action='wood';
    if(bit){ p.sick=true; st.lastEvent=pseudo+' est mordu par un serpent 🐍 ! Malade au prochain tour. Bois rapporté : +'+gained+'.'; p.lastResult={ msg:'🐍 Mordu ! +'+gained+' bois, mais malade au prochain tour.', turn:st.turn }; }
    else { st.lastEvent=pseudo+' rapporte 🪵 +'+gained+' bois.'+(built?(' 🚣 Un morceau de radeau construit ('+c.slots+' place'+(c.slots>1?'s':'')+') !'):''); p.lastResult={ msg:'🪵 Tu as rapporté +'+gained+' bois.'+(built?' 🚣 Radeau agrandi !':''), turn:st.turn }; }
  } else if(action==='search'){
    p.hand = p.hand || [];
    if(st.deck.length){ const drawn=st.deck.shift(); p.hand.push(drawn); p.action='search'; st.lastEvent=pseudo+' fouille l\'épave 🔍 (+1 carte en main).'; p.lastResult={ msg:'🔍 Tu as pioché : '+gCardIcon(drawn)+' '+drawn.name+'.', turn:st.turn }; }
    else { p.action='search'; st.lastEvent=pseudo+' fouille l\'épave… mais la cale est vide.'; p.lastResult={ msg:'🔍 La cale de l\'épave est vide.', turn:st.turn }; }
  } else return;

  if(p.bonusActions>0){                 // Café : action bonus → le joueur rejoue sans passer la main
    p.bonusActions--; p.action=null;
    st.lastEvent+=' ☕ (action bonus)';
    fbSetGalerapagos(st); return;
  }
  p.acted=true;
  if(!gSeekActor(st)) gRunSurvival(st);
  fbSetGalerapagos(st);
}

// Force l'action du joueur courant depuis la vue meneur (joueur absent)
function galerapagosForceAction(action){
  if(!galerapagos || galerapagos.phase!=='action') return;
  galerapagosAct(galerapagos.turnOrder[galerapagos.currentIdx], action, 0);
}

// ── Survie des naufragés ──
function gRunSurvival(st){
  st.phase='survival';
  gResolveResource(st,'water');
}

function gResolveResource(st, res){
  const alive=gAlive(st), N=alive.length, c=st.counters, have=c[res];
  const de = res==='water' ? "d'eau" : 'de nourriture';   // préposition correcte
  if(N===0){ gWipe(st); return; }
  if(have>=N){                                   // assez de rations : chacun consomme 1
    c[res]=have-N;
    st.lastEvent='Ration '+de+' distribuée à '+N+' survivant(s).';
    if(res==='water') gResolveResource(st,'food'); else gAfterSurvival(st);
    return;
  }
  if(have===0){                                  // 0 ration : personne ne peut être servi
    alive.forEach(p=>{ p.alive=false; });
    st.lastEvent='💀 Plus '+de+' du tout ! Tous les survivants périssent.';
    gWipe(st); return;
  }
  // Pénurie : il faut réduire les survivants au nombre de rations → vote
  st.vote={ resource:res, context:'penury', capacity:have, revealed:false, round:1 };
  Object.values(st.players).forEach(p=>{ if(p.alive) p.voteTarget=null; });
  st.phase='vote';
  st.lastEvent='⚠️ Pénurie '+de+' : '+have+' ration(s) pour '+N+' survivant(s). Votez pour désigner qui sera privé.';
}

function gAfterSurvival(st){
  const alive=gAlive(st), N=alive.length, c=st.counters;
  if(N===0){ gWipe(st); return; }
  if(st.weather.hurricaneDrawn){ gTryEmbark(st,true); return; } // ouragan → embarquement forcé ce tour
  // Fin de partie AUTOMATIQUE : dès que tous les survivants ont une place + les vivres du voyage, on embarque et on gagne
  if(c.slots>=N && c.water>=N && c.food>=N){ gTryEmbark(st,false); return; }
  st.phase='turnEnd';
  st.canEmbark=false;
  st.lastEvent='Fin du tour '+st.turn+'. Il manque encore des places sur le radeau ou des vivres pour partir.';
}

function gWipe(st){ st.phase='gameEnd'; st.result='lose'; st.lastEvent='💀 Tous les naufragés ont péri. L\'île a eu raison de vous…'; }

// ── Cartes en main (V2) ──
// Bouteille d'eau / Sandwich → +1 ration au stock commun.
function galerapagosPlayCard(pseudo, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId); if(idx<0) return;
  const card=p.hand[idx], c=st.counters;
  if(card.cat==='water')      c.water=Math.min(36,c.water+1);
  else if(card.cat==='food')  c.food =Math.min(36,c.food +1);
  else return;
  p.hand.splice(idx,1);
  st.lastEvent=pseudo+' joue '+card.name+' (+1 au stock commun).';
  gAfterCardPlay(st);
  fbSetGalerapagos(st);
}

// Après avoir ajouté des rations pendant un vote : peut résorber la pénurie / re-tenter l'embarquement.
function gAfterCardPlay(st){
  if(st.phase==='vote' && st.vote){
    if(st.vote.context==='embark'){ st.vote=null; Object.values(st.players).forEach(q=>{ q.voteTarget=null; }); gTryEmbark(st,true); }
    else gRecheckShortage(st);
  }
}

// Anti-venin → soigne la maladie (morsure de serpent, etc.) d'un naufragé.
function galerapagosCure(pseudo, cardId, target){
  if(!galerapagos) return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='antivenin'); if(idx<0) return;
  const t=st.players[target]; if(!t || !t.alive || !t.sick) return;
  t.sick=false; p.hand.splice(idx,1);
  st.lastEvent=pseudo+' utilise un Anti-venin sur '+target+' 💉 : plus malade.';
  fbSetGalerapagos(st);
}

// Somnifère : vole 1 carte au hasard à jusqu'à 3 naufragés actifs (les malades sont épargnés), puis défausse.
function galerapagosSomniferes(pseudo, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='somni'); if(idx<0) return;
  p.hand.splice(idx,1);
  const cibles=gShuffle(gAlive(st).filter(t=>t.pseudo!==pseudo && !t.sick && (t.hand||[]).length)).slice(0,3);
  cibles.forEach(t=>{ p.hand.push(t.hand.splice(Math.floor(Math.random()*t.hand.length),1)[0]); });
  st.lastEvent=pseudo+' joue le Somnifère 💤 et rafle 1 carte à '+cibles.length+' naufragé(s).';
  fbSetGalerapagos(st);
}

// Réveil matin : désigne qui débutera le prochain tour, puis défausse.
function galerapagosReveil(pseudo, cardId, target){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='reveil'); if(idx<0) return;
  const t=st.players[target]; if(!t || !t.alive) return;
  p.hand.splice(idx,1);
  st.forcedFirst=target;
  st.lastEvent=pseudo+' règle le Réveil matin ⏰ : '+target+' débutera le prochain tour.';
  fbSetGalerapagos(st);
}

// Consommer une Eau croupie / un Poisson pourri : +1 ration mais malade 1 tour (sauf si Allumettes 🔥).
function galerapagosConsumeBad(pseudo, cardId, useAllumettes){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && (c.sub==='eaucroupie'||c.sub==='poissonpourri')); if(idx<0) return;
  const card=p.hand[idx], c=st.counters, isWater=(card.sub==='eaucroupie');
  let safe=false;
  if(useAllumettes){ const ai=(p.hand||[]).findIndex(x=>x.sub==='allumettes'); if(ai>=0){ p.hand.splice(ai,1); safe=true; } }
  if(isWater) c.water=Math.min(36,c.water+1); else c.food=Math.min(36,c.food+1);
  p.hand.splice(p.hand.findIndex(x=>x.id===cardId),1);
  if(!safe){ p.sick=true; st.lastEvent=pseudo+' consomme '+card.name+' (+1) — et tombe MALADE 🤢 (passe le prochain tour).'; }
  else st.lastEvent=pseudo+' consomme '+card.name+' (+1) sans danger grâce aux Allumettes 🔥.';
  gAfterCardPlay(st);
  fbSetGalerapagos(st);
}

// Longue-vue / Lampe torche / Baromètre : révèlent une info au seul joueur (snapshot visible jusqu'à la fin du tour), puis défausse.
function galerapagosPeek(pseudo, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && ['longuevue','lampe','barometre'].includes(c.sub)); if(idx<0) return;
  const sub=p.hand[idx].sub;
  if(sub==='longuevue'){
    const data=gAlive(st).filter(q=>q.pseudo!==pseudo).map(q=>({ who:q.pseudo, cards:(q.hand||[]).map(c=>gCardIcon(c)+' '+c.name) }));
    p.peek={ type:'hands', data, turn:st.turn };
  } else if(sub==='lampe'){
    p.peek={ type:'deck', data:(st.deck||[]).slice(0,3).map(c=>gCardIcon(c)+' '+c.name), turn:st.turn };
  } else {
    p.peek={ type:'weather', data:(st.weather.deck||[]).slice(0,2).map(v=> v==='H'?'🌀 Ouragan':gWeatherLabel(v)), turn:st.turn };
  }
  p.hand.splice(idx,1);
  st.lastEvent=pseudo+' utilise '+({longuevue:'la Longue-vue 🔭',lampe:'la Lampe torche 🔦',barometre:'le Baromètre 🌡️'})[sub]+'.';
  fbSetGalerapagos(st);
}

// Bloc « ce que tu as vu » (info privée d'un objet d'observation), visible jusqu'à la fin du tour.
function gPeekHtml(st, pseudo){
  const me=st.players[pseudo]; if(!me || !me.peek || me.peek.turn!==st.turn) return '';
  const pk=me.peek;
  let body;
  if(pk.type==='hands') body=(pk.data||[]).length ? (pk.data).map(x=>'<div class="dplayer-row"><span class="dplayer-name" style="color:var(--text-title)">'+escHtml(x.who)+' :</span><span class="t-warm-sm">'+((x.cards&&x.cards.length)?x.cards.map(escHtml).join(', '):'main vide')+'</span></div>').join('') : '<div class="t-warm-sm">Personne d\'autre en jeu.</div>';
  else body='<div class="dplayer-row"><span class="dplayer-name" style="color:var(--text-title)">'+(((pk.data||[]).map(escHtml).join('  ·  '))||'—')+'</span></div>';
  const title={hands:'🔭 Mains des autres',deck:'🔦 Dessus de la pioche épave',weather:'🌡️ Prochaines météo'}[pk.type];
  return '<div class="section-title" style="margin-top:.6rem">'+title+'</div><div class="diamant-players">'+body+'</div><div class="t-warm-sm">Visible seulement par toi, jusqu\'à la fin du tour.</div>';
}

// Café : accorde une action bonus pour ce tour (jouable pendant SON tour, avant d'avoir agi).
function galerapagosCafe(pseudo, cardId){
  if(!galerapagos || galerapagos.phase!=='action') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  if(st.turnOrder[st.currentIdx]!==pseudo || p.acted) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='cafe'); if(idx<0) return;
  p.hand.splice(idx,1); p.bonusActions=(p.bonusActions||0)+1;
  st.lastEvent=pseudo+' boit un Café ☕ : 2 actions ce tour.';
  fbSetGalerapagos(st);
}

// Conque : le joueur devient chef ce tour et est immunisé contre les votes (jouable avant OU après un vote).
function galerapagosConque(pseudo, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='conque'); if(idx<0) return;
  p.hand.splice(idx,1); p.conque=true;
  st.lastEvent=pseudo+' souffle dans la Conque 🐚 : chef ce tour, personne ne peut voter contre lui.';
  // Si un vote est révélé et que le meneur allait sacrifier ce joueur, il est désormais protégé (le meneur en désigne un autre).
  fbSetGalerapagos(st);
}

// Pendule : impose une action (pêche/eau/bois/fouille) à un autre naufragé qui n'a pas encore agi.
function galerapagosPendule(from, cardId, target, action){
  if(!galerapagos || galerapagos.phase!=='action') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[from], t=st.players[target];
  if(!p || !p.alive || !t || !t.alive || from===target || t.acted) return;
  if(!['fish','water','wood','search'].includes(action)) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='pendule'); if(idx<0) return;
  const c=st.counters;
  if(action==='fish'){
    const draw=()=>G_FISH_BAG[Math.floor(Math.random()*G_FISH_BAG.length)];
    const val=gHasObj(t,'canne')?Math.max(draw(),draw(),draw()):draw();
    c.food=Math.min(36,c.food+val); t.action='fish';
  } else if(action==='water'){
    const w0=st.weather.current||0; if(w0===0) return;            // pas d'eau à imposer aujourd'hui
    c.water=Math.min(36,c.water+(gHasObj(t,'gourde')?w0*2:w0)); t.action='water';
  } else if(action==='wood'){
    const g=gHasObj(t,'hache')?2:1; c.raft+=g; while(c.raft>=6){ c.raft-=6; c.slots++; } t.action='wood';   // version sûre (pas de risque serpent)
  } else {
    if(st.deck.length){ t.hand=t.hand||[]; t.hand.push(st.deck.shift()); } t.action='search';
  }
  p.hand.splice(idx,1); t.acted=true;
  st.lastEvent=from+' impose « '+({fish:'Pêcher',water:'Eau',wood:'Bois',search:'Fouiller'}[action])+' » à '+target+' avec le Pendule ⏳.';
  if(st.turnOrder[st.currentIdx]===target){ if(!gSeekActor(st)) gRunSurvival(st); }   // si c'était son tour, on avance
  fbSetGalerapagos(st);
}

// Poupée vaudou : ressuscite un naufragé mort (en début de tour). Il revient vivant, main et objets vides.
function galerapagosResurrect(from, cardId, target){
  if(!galerapagos || galerapagos.phase!=='action') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[from]; if(!p || !p.alive) return;
  const t=st.players[target]; if(!t || t.alive || from===target) return;   // la cible doit être MORTE
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='poupee'); if(idx<0) return;
  p.hand.splice(idx,1);
  t.alive=true; t.sick=false; t.acted=false; t.action=null; t.voteTarget=null; t.hand=t.hand||[]; t.objects=t.objects||[]; delete t.deathBy; delete t.shotAt;
  st.lastEvent=from+' brandit la Poupée vaudou 🪆 et RESSUSCITE '+target+' !';
  fbSetGalerapagos(st);
}

// ── Objets (V2) ──
function galerapagosPlayObject(pseudo, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.cat==='obj'); if(idx<0) return;
  const card=p.hand[idx], sub=card.sub, c=st.counters;
  const discard=()=>p.hand.splice(idx,1);
  if(['gourde','canne','hache','boule','revolver','gourdin'].includes(sub)){
    if(gHasObj(p,sub)) return;                          // un seul exemplaire de chaque permanent par joueur
    p.objects=p.objects||[]; p.objects.push(card); discard();
    st.lastEvent=pseudo+' pose '+card.name+' '+gCardIcon(card)+' en jeu.';
  } else if(sub==='noixcoco'){ c.water=Math.min(36,c.water+3); discard(); st.lastEvent=pseudo+' boit une Noix de coco 🥥 (+3 eau).'; gAfterCardPlay(st); }
  else if(sub==='sardines'){  c.food =Math.min(36,c.food +3); discard(); st.lastEvent=pseudo+' mange des Sardines 🐟 (+3 nourriture).'; gAfterCardPlay(st); }
  else if(sub==='moulin'){    if(c.food<2) return; c.food-=2; c.water=Math.min(36,c.water+2); discard(); st.lastEvent=pseudo+' passe 2 nourritures au Moulin à légumes 🥣 (→ +2 eau).'; gAfterCardPlay(st); }
  else if(sub==='placeradeau'){ c.slots+=1; discard(); st.lastEvent=pseudo+' ajoute une Planche de radeau 🪵 (+1 place).'; }
  else if(sub==='kitbbq'){    const bonus=2*(st.deathsThisTurn||0); c.food=Math.min(36,c.food+bonus); discard(); st.lastEvent=pseudo+' allume le Kit BBQ Cannibale 🍖 (+'+bonus+' nourriture pour '+(st.deathsThisTurn||0)+' mort(s) ce tour).'; gAfterCardPlay(st); }
  else if(sub==='panier'){    // en cas de pénurie : personne ne meurt, le compteur concerné est remis à zéro
    if(st.phase!=='vote' || !st.vote || st.vote.context!=='penury') return;
    const res=st.vote.resource; c[res]=0; discard();
    st.lastEvent=pseudo+' déballe le Panier garni 🧺 : personne ne meurt, le stock '+(res==='water'?"d'eau":'de nourriture')+' est vidé.';
    st.vote=null; Object.values(st.players).forEach(q=>{ q.voteTarget=null; });
    if(res==='water') gResolveResource(st,'food'); else gAfterSurvival(st);
  } else return;                                        // cartouche / allumettes / différés : gérés ailleurs
  fbSetGalerapagos(st);
}

// Revolver (en jeu) + Cartouche (en main) → abat un joueur. Une Plaque de tôle chez la cible bloque le tir.
function galerapagosShoot(pseudo, target){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive || !gHasObj(p,'revolver')) return;
  const ci=(p.hand||[]).findIndex(c=>c.sub==='cartouche'); if(ci<0) return;   // pas de munition
  const t=st.players[target]; if(!t || !t.alive || target===pseudo) return;
  p.hand.splice(ci,1);                                   // consomme la cartouche
  const pi=(t.hand||[]).findIndex(c=>c.sub==='plaque');
  if(pi>=0){ t.hand.splice(pi,1); t.shotAt={by:pseudo, blocked:true, turn:st.turn}; st.lastEvent='🔫 '+pseudo+' tire sur '+target+'… 🛡️ bloqué par une Plaque de tôle !'; fbSetGalerapagos(st); return; }
  const loot=((t.objects||[]).length)+((t.hand||[]).length);
  gKill(st, target, pseudo);                             // le tueur récupère les objets posés + la main de la victime
  t.deathBy=pseudo;                                      // pour informer la victime
  st.lastEvent='🔫 '+pseudo+' abat '+target+' d\'un coup de revolver'+(loot?(' et récupère ses '+loot+' carte(s)/objet(s)'):'')+' !';
  if(gAlive(st).length===0){ gWipe(st); fbSetGalerapagos(st); return; }
  if(st.phase==='vote' && st.vote){
    const res=st.vote.resource, ctx=st.vote.context;
    if(ctx==='embark'){ st.vote=null; Object.values(st.players).forEach(q=>{ q.voteTarget=null; }); gTryEmbark(st,true); }
    else if(st.counters[res] >= gAlive(st).length){ const M=gAlive(st).length; st.counters[res]-=M; st.vote=null; Object.values(st.players).forEach(q=>{ q.voteTarget=null; }); if(res==='water') gResolveResource(st,'food'); else gAfterSurvival(st); }
  }
  fbSetGalerapagos(st);
}

// ── Phase C : Troc entre naufragés ──
// Un joueur propose UNE carte de sa main à un autre. La cible accepte (cadeau), rend une carte en échange, ou refuse.
function galerapagosProposeTrade(from, to, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[from], t=st.players[to];
  if(!p || !p.alive || !t || !t.alive || from===to) return;
  if(!(p.hand||[]).some(c=>c.id===cardId)) return;                    // la carte doit être en main
  st.trades=st.trades||[];
  if(st.trades.some(tr=>tr.from===from && tr.to===to && tr.offer===cardId)) return;  // pas de doublon
  st.trades.push({ id:'t'+Date.now()+Math.floor(Math.random()*1000), from, to, offer:cardId });
  st.lastEvent=from+' propose un troc à '+to+' 🤝.';
  fbSetGalerapagos(st);
}

// Réponse au troc : giveId = id d'une carte rendue en échange, 'gift' = accepter sans rien donner, 'no' = refuser.
function galerapagosRespondTrade(tradeId, giveId){
  if(!galerapagos) return;
  const st=gNormalize(gClone(galerapagos));
  st.trades=st.trades||[];
  const i=st.trades.findIndex(tr=>tr.id===tradeId); if(i<0) return;
  const tr=st.trades[i], p=st.players[tr.from], t=st.players[tr.to];
  const drop=()=>st.trades.splice(i,1);
  if(giveId==='no'){ drop(); st.lastEvent=tr.to+' refuse le troc de '+tr.from+'.'; fbSetGalerapagos(st); return; }
  if(!p || !p.alive || !t || !t.alive){ drop(); fbSetGalerapagos(st); return; }
  const oi=(p.hand||[]).findIndex(c=>c.id===tr.offer);
  if(oi<0){ drop(); st.lastEvent='Troc annulé : la carte n\'est plus disponible.'; fbSetGalerapagos(st); return; }
  const offered=p.hand[oi];
  if(giveId==='gift'){
    p.hand.splice(oi,1); t.hand=t.hand||[]; t.hand.push(offered);
    st.lastEvent=tr.from+' donne '+offered.name+' à '+tr.to+' 🤝.';
  } else {
    const gi=(t.hand||[]).findIndex(c=>c.id===giveId);
    if(gi<0){ drop(); fbSetGalerapagos(st); return; }
    const given=t.hand[gi];
    p.hand.splice(oi,1); t.hand.splice(gi,1);
    p.hand.push(given); t.hand.push(offered);
    st.lastEvent=tr.from+' troque '+offered.name+' contre '+given.name+' avec '+tr.to+' 🤝.';
  }
  st.trades=st.trades.filter(x=>x.id!==tradeId && x.offer!==tr.offer);   // la carte a bougé → invalide les autres trocs dessus
  fbSetGalerapagos(st);
}

function galerapagosCancelTrade(tradeId){
  if(!galerapagos) return;
  const st=gNormalize(gClone(galerapagos));
  st.trades=(st.trades||[]).filter(tr=>tr.id!==tradeId);
  fbSetGalerapagos(st);
}

// Bloc « Troc » affiché sous la main du joueur.
function gTradeHtml(st, pseudo){
  const me=st.players[pseudo]; if(!me || !me.alive) return '';
  if(st.phase==='lobby' || st.phase==='gameEnd') return '';
  const esc=escAttr(pseudo), trades=st.trades||[];
  const incoming=trades.filter(t=>t.to===pseudo), outgoing=trades.filter(t=>t.from===pseudo);
  const others=gAlive(st).filter(p=>p.pseudo!==pseudo);
  let h='<div class="section-title" style="margin-top:.75rem">🤝 Troc</div>';
  incoming.forEach(tr=>{
    const from=st.players[tr.from], oc=((from&&from.hand)||[]).find(c=>c.id===tr.offer); if(!oc) return;
    const gives=(me.hand||[]).map(c=>'<button class="btn-small" onclick="galerapagosRespondTrade(\''+tr.id+'\',\''+c.id+'\')">Donner '+gCardIcon(c)+' '+escHtml(c.name)+'</button>').join('');
    h+='<div class="diamant-voted"><strong>'+escHtml(tr.from)+'</strong> t\'offre '+gCardIcon(oc)+' <strong>'+escHtml(oc.name)+'</strong> :'+
       '<div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.3rem">'+
       '<button class="btn-small" onclick="galerapagosRespondTrade(\''+tr.id+'\',\'gift\')">Accepter (cadeau)</button>'+gives+
       '<button class="btn-small btn-deactivate" onclick="galerapagosRespondTrade(\''+tr.id+'\',\'no\')">Refuser</button></div></div>';
  });
  outgoing.forEach(tr=>{
    const oc=(me.hand||[]).find(c=>c.id===tr.offer);
    h+='<div class="dplayer-row" style="justify-content:space-between"><span class="dplayer-name">⏳ Proposé à '+escHtml(tr.to)+' : '+(oc?gCardIcon(oc)+' '+escHtml(oc.name):'—')+'</span><button class="btn-small btn-deactivate" onclick="galerapagosCancelTrade(\''+tr.id+'\')">Annuler</button></div>';
  });
  const offerable=(me.hand||[]).filter(c=>!outgoing.some(o=>o.offer===c.id));
  if(others.length && offerable.length){
    h+='<div class="t-warm-sm" style="margin-top:.3rem">Proposer une de tes cartes :</div>'+
      offerable.map(c=>'<div class="dplayer-row" style="justify-content:space-between;flex-wrap:wrap;gap:.3rem"><span class="dplayer-name" style="color:var(--text-title)">'+gCardIcon(c)+' '+escHtml(c.name)+'</span><span style="display:flex;gap:.3rem;flex-wrap:wrap">'+
        others.map(t=>'<button class="btn-small" onclick="galerapagosProposeTrade(\''+esc+'\',\''+escAttr(t.pseudo)+'\',\''+c.id+'\')">→ '+escHtml(t.pseudo)+'</button>').join('')+'</span></div>').join('');
  } else if(!offerable.length && !incoming.length){
    h+='<div class="t-warm-sm">Aucune carte à proposer pour l\'instant.</div>';
  }
  return h;
}

// Assez de rations grâce aux cartes → la pénurie est résorbée, personne ne meurt.
function gRecheckShortage(st){
  const res=st.vote.resource, N=gAlive(st).length;
  if(res!=='raft' && st.counters[res]>=N){
    st.counters[res]-=N;
    const de = res==='water' ? "d'eau" : 'de nourriture';
    st.lastEvent='Pénurie '+de+' résorbée grâce aux cartes — personne ne meurt.';
    st.vote=null; Object.values(st.players).forEach(q=>{ q.voteTarget=null; });
    if(res==='water') gResolveResource(st,'food'); else gAfterSurvival(st);
  }
}

// Mort d'un naufragé. Par défaut sa main est répartie aux voisins ; si looter (tir de revolver), le tueur récupère objets posés + main.
function gKill(st, pseudo, looter){
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  p.alive=false;
  st.deathsThisTurn=(st.deathsThisTurn||0)+1;        // pour le Kit BBQ Cannibale
  const l=looter && st.players[looter];
  if(l && l.alive){
    l.hand=l.hand||[];
    (p.objects||[]).forEach(o=>l.hand.push(o));      // objets posés récupérés (reviennent en main du tueur)
    (p.hand||[]).forEach(c=>l.hand.push(c));         // et le reste de sa main
    p.objects=[]; p.hand=[];
  } else {
    p.objects=[];                                    // objets en jeu défaussés
    gRedistribute(st, pseudo);                       // main répartie aux voisins
  }
}
function gRedistribute(st, deadPseudo){
  const p=st.players[deadPseudo]; const hand=(p.hand||[]).slice(); p.hand=[];
  if(!hand.length) return;
  const order=st.turnOrder, n=order.length, di=order.indexOf(deadPseudo);
  const findAlive=(dir)=>{ for(let s=1;s<=n;s++){ const i=((di+dir*s)%n+n)%n; if(i===di) break; const q=st.players[order[i]]; if(q && q.alive) return q; } return null; };
  const left=findAlive(-1), right=findAlive(1);
  const targets=[]; if(left) targets.push(left); if(right && right!==left) targets.push(right);
  if(!targets.length) return;                         // plus aucun voisin vivant
  gShuffle(hand).forEach((card,i)=>{ const t=targets[i%targets.length]; t.hand=t.hand||[]; t.hand.push(card); });
}

// ── Votes (pénurie & sacrifice à l'embarquement) ──
function galerapagosVote(pseudo, target){
  if(!galerapagos || galerapagos.phase!=='vote') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo];
  if(!p || !p.alive || p.sick) return;                 // les malades ne votent pas
  if(!st.players[target] || !st.players[target].alive) return;
  p.voteTarget=target;
  fbSetGalerapagos(st);
}

function galerapagosReveal(){
  if(!galerapagos || galerapagos.phase!=='vote') return;
  const st=gNormalize(gClone(galerapagos));
  st.vote.revealed=true;
  fbSetGalerapagos(st);
}

function gVoteWeight(p){ return (gHasObj(p,'gourdin') || gHasObj(p,'revolver')) ? 2 : 1; } // gourdin OU revolver = 2 voix, sans cumul
function gTally(st){
  const t={}; gAlive(st).forEach(p=>{ if(p.voteTarget){ const tp=st.players[p.voteTarget]; if(tp && tp.conque) return; t[p.voteTarget]=(t[p.voteTarget]||0)+gVoteWeight(p); } });   // Conque : immunisé au vote
  return t;
}
// Révélation lisible (qui a voté quoi + totaux) — partagée vue joueur / stream.
function gRevealHtml(st){
  const who=gAlive(st).map(p=>escHtml(p.pseudo)+' → '+(p.voteTarget?escHtml(p.voteTarget):'—')+(gVoteWeight(p)>1?' <span class="t-warm-sm">(×2)</span>':'')).join('<br>');
  const t=gTally(st), max=Math.max(0,...Object.values(t));
  const tot=Object.keys(t).sort((a,b)=>t[b]-t[a]).map(k=>escHtml(k)+' : '+t[k]+' voix'+(t[k]===max&&max>0?' ◀':'')).join('<br>');
  return '<div class="diamant-voted">📊 <strong>Votes révélés</strong><br>'+who+'</div>'+
         '<div class="diamant-voted" style="margin-top:.4rem"><strong>Total</strong><br>'+(tot||'—')+'</div>';
}

function galerapagosEliminate(target){
  if(!galerapagos || galerapagos.phase!=='vote' || !galerapagos.vote || !galerapagos.vote.revealed) return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[target];
  if(!p || !p.alive) return;
  if(p.conque) return;                 // Conque : ce joueur est protégé, le meneur doit en désigner un autre
  const res=st.vote.resource, ctx=st.vote.context;
  gKill(st, target);   // mort + redistribution de sa main aux voisins
  st.lastEvent='💀 '+target+' est sacrifié ('+({water:'mort de soif',food:'mort de faim',raft:'pas de place sur le radeau'}[res])+').';
  Object.values(st.players).forEach(q=>{ q.voteTarget=null; });

  if(ctx==='penury'){
    const N=gAlive(st).length;
    if(st.counters[res] < N){                          // toujours en pénurie (compteur courant) → nouveau tour
      st.vote.revealed=false; st.vote.round++; st.vote.capacity=st.counters[res]; st.phase='vote';
      st.lastEvent+=' Encore trop de survivants — nouveau vote.';
    } else {                                            // assez de rations désormais : on sert et on continue
      st.counters[res]-=N;
      st.vote=null;
      if(res==='water') gResolveResource(st,'food'); else gAfterSurvival(st);
    }
  } else {                                             // contexte 'embark'
    st.vote=null; gTryEmbark(st,true);
  }
  fbSetGalerapagos(st);
}

// ── Embarquement & fin de partie ──
function gTryEmbark(st, forced){
  const alive=gAlive(st), N=alive.length, c=st.counters;
  if(N===0){ gWipe(st); return; }
  if(c.slots>=N && c.water>=N && c.food>=N){         // succès : tout le monde embarque
    c.water-=N; c.food-=N; st.escaped=true; st.survivors=N;
    st.phase='gameEnd'; st.result='win';
    st.lastEvent='🚣 '+N+' naufragé(s) quittent l\'île sur le radeau. VICTOIRE !';
    return;
  }
  if(forced){                                        // ouragan : il faut sacrifier pour que le radeau parte
    const M=Math.min(c.slots, c.water, c.food);      // nombre max qui peut réellement embarquer
    if(M<=0){                                         // personne ne peut partir → l'ouragan emporte tout le monde
      gAlive(st).forEach(p=>{ p.alive=false; });
      st.phase='gameEnd'; st.result='lose';
      st.lastEvent='🌀 L\'ouragan frappe et le radeau n\'est pas prêt (pas de place ou pas de vivres). Personne ne s\'échappe. DÉFAITE.';
      return;
    }
    let res; if(c.slots<N) res='raft'; else if(c.water<N) res='water'; else res='food';
    st.vote={ resource:res, context:'embark', capacity:M, revealed:false, round:1 };
    Object.values(st.players).forEach(p=>{ if(p.alive) p.voteTarget=null; });
    st.phase='vote';
    const rl={raft:'places sur le radeau',water:'eau pour le voyage',food:'nourriture pour le voyage'}[res];
    st.lastEvent='⚠️ Embarquement impossible pour tous ('+rl+' insuffisante). Seuls '+M+' peuvent partir — votez pour sacrifier un naufragé.';
  } else {
    st.phase='turnEnd';                              // embarquement volontaire mais conditions non réunies (ne devrait pas arriver)
  }
}

function galerapagosEmbark(){                          // embarquement volontaire (bouton meneur)
  if(!galerapagos || galerapagos.phase!=='turnEnd') return;
  const st=gNormalize(gClone(galerapagos));
  gTryEmbark(st,false);
  fbSetGalerapagos(st);
}

function galerapagosNextTurn(){
  if(!galerapagos || galerapagos.phase!=='turnEnd') return;
  const st=gNormalize(gClone(galerapagos));
  st.turn++; gStartTurn(st);
  fbSetGalerapagos(st);
}

// ── Contrôles meneur : lobby / lancement / clôture ──
function startGalerapagos(){
  fbSetGalerapagos({
    active:true, phase:'lobby', turn:1, firstIdx:0, currentIdx:0,
    turnOrder:[], players:{},
    weather:{ deck:[], current:null, isHurricane:false, hurricaneDrawn:false },
    counters:{ water:0, food:0, raft:0, slots:0 },
    vote:null, result:null, escaped:false, canEmbark:false,
    lastEvent:'Lobby ouvert — les naufragés peuvent rejoindre le radeau.'
  });
  toast('🏝️ Lobby de Galerapagos ouvert !');
}
function galerapagosJoin(pseudo){
  if(!galerapagos || galerapagos.phase!=='lobby') return;
  const st=gNormalize(gClone(galerapagos));
  if(!st.players[pseudo] && Object.keys(st.players).length>=G_MAX_PLAYERS){ toast('12 naufragés maximum.'); return; }
  if(!st.players[pseudo]) st.players[pseudo]={ pseudo, alive:true, sick:false, acted:false, action:null, voteTarget:null, hand:[], objects:[] };
  st.lastEvent=Object.keys(st.players).length+' naufragé(s) dans le lobby.';
  fbSetGalerapagos(st);
}
function galerapagosLeave(pseudo){
  if(!galerapagos || galerapagos.phase!=='lobby') return;
  const st=gNormalize(gClone(galerapagos));
  delete st.players[pseudo];
  st.lastEvent=Object.keys(st.players).length+' naufragé(s) dans le lobby.';
  fbSetGalerapagos(st);
}
function galerapagosLaunch(){
  if(!galerapagos || galerapagos.phase!=='lobby') return;
  const order=Object.keys(galerapagos.players);
  if(order.length<G_MIN_PLAYERS){ toast('Il faut au moins '+G_MIN_PLAYERS+' naufragés.'); return; }
  const st=gNormalize(gClone(galerapagos));
  st.turnOrder=gShuffle(order);
  Object.values(st.players).forEach(p=>{ p.alive=true; p.sick=false; p.acted=false; p.action=null; p.voteTarget=null; p.hand=[]; p.objects=[]; });
  st.counters=gInitCounters(order.length);
  st.weather={ deck:gBuildWeatherDeck(), current:null, isHurricane:false, hurricaneDrawn:false };
  gDealHands(st, gBuildEpaveDeck());   // deck Épave distribué (3-4 cartes/joueur), reste dans st.deck
  st.turn=1; st.firstIdx=0; st.currentIdx=0; st.vote=null; st.result=null; st.escaped=false; st.canEmbark=false; st.trades=[];
  gStartTurn(st);
  fbSetGalerapagos(st);
  toast('🏝️ Partie lancée avec '+order.length+' naufragés !');
}
function galerapagosCancel(){
  if(!confirm('Abandonner la partie de Galerapagos en cours ?')) return;
  fbSetGalerapagos(null);
  toast('Partie de Galerapagos annulée.');
}
function galerapagosEndToFire(){
  if(!galerapagos) return;
  const n=galerapagos.survivors||0, pts=n*G_FIRE_PER_SURVIVOR;
  if(!confirm('Ajouter '+pts+' points au feu de camp ('+n+' rescapé(s)) et clôturer ?')) return;
  fbSetFire(Object.assign({}, fire, { points:(fire.points||0)+pts }));
  fbSetGalerapagos(null);
  toast('🔥 +'+pts+' points au feu ! Partie clôturée.');
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDUS (placeholder — réutilise les classes existantes, à re-styler aux maquettes)
// ═══════════════════════════════════════════════════════════════════════════
function gTurnPills(st){
  const w = st.weather.isHurricane ? '🌀 OURAGAN' : (st.weather.current!=null ? gWeatherLabel(st.weather.current) : '—');
  return '<div class="dpill">Tour <strong>'+st.turn+'</strong></div><div class="dpill">Météo <strong>'+w+'</strong></div>';
}
function gCounterPills(st){
  const c=st.counters;
  return '<div class="dpill">💧 Eau <strong>'+c.water+'</strong></div>'+
         '<div class="dpill">🍖 Nourriture <strong>'+c.food+'</strong></div>'+
         '<div class="dpill">🪵 Radeau <strong>'+c.raft+'/6</strong></div>'+
         '<div class="dpill">🚣 Places <strong>'+c.slots+'</strong></div>';
}
function gPlayersList(st, highlight){
  return st.turnOrder.map(ps=>{
    const p=st.players[ps]; if(!p) return '';
    const dead=!p.alive;
    const isCur = st.phase==='action' && st.turnOrder[st.currentIdx]===ps && !dead;
    let badge='';
    if(dead)              badge='<span class="dvote-badge">💀 mort</span>';
    else if(p.sick)       badge='<span class="dvote-badge dvote-wait">🤕 malade</span>';
    else if(st.phase==='action') badge = isCur ? '<span class="dvote-badge dvote-wait">⏳ à jouer</span>' : (p.acted?'<span class="dvote-badge dvote-done">✓</span>':'');
    else if(st.phase==='vote')   badge = p.voteTarget ? '<span class="dvote-badge dvote-done">✓ a voté</span>' : '<span class="dvote-badge dvote-wait">…</span>';
    const cards=(!dead && Array.isArray(p.hand)) ? '<span class="t-warm-sm">🃏 '+p.hand.length+'</span>' : '';
    const objs =(!dead && p.objects && p.objects.length) ? '<span class="t-warm-sm">'+p.objects.map(o=>gCardIcon(o)).join('')+'</span>' : '';
    const chief=(!dead && p.conque) ? '<span class="dvote-badge">🐚 chef</span>' : '';
    const hl=(ps===highlight)?'u-outline':'';
    return '<div class="dplayer-row '+(dead?'out ':'')+hl+'">'+
      '<span class="dplayer-status '+(dead?'dstatus-out':'dstatus-in')+'">'+(dead?'🪦':'🧍')+'</span>'+
      '<span class="dplayer-name">'+escHtml(ps)+'</span>'+cards+objs+chief+badge+'</div>';
  }).join('');
}

// ── Vue meneur ──
function renderGalerapagosAdmin(){
  const panel=document.getElementById('galerapagos-panel');
  if(!panel) return;
  const active=document.getElementById('galerapagos-admin-active');
  if(!galerapagos || !galerapagos.active){ panel.style.display='none'; renderGameLibrary(); return; }
  panel.style.display='block'; if(active) active.style.display='block';

  const st=galerapagos, ph=st.phase, nP=Object.keys(st.players).length;
  document.getElementById('ga-status').innerHTML = gNoEmoji(ph==='lobby'
    ? '<div class="dpill">Lobby ouvert</div><div class="dpill">Naufragés <strong>'+nP+'</strong></div>'
    : gTurnPills(st)+gCounterPills(st));
  document.getElementById('ga-event').textContent  = gNoEmoji(st.lastEvent||'');
  document.getElementById('ga-players').innerHTML   = gNoEmoji(gPlayersList(st));

  const ctrl=document.getElementById('ga-controls'); let h='';
  if(ph==='lobby'){
    h='<div class="diamant-voted">🚪 '+nP+' naufragé(s). Lance quand tu veux (min '+G_MIN_PLAYERS+', max '+G_MAX_PLAYERS+').</div>'+
      '<button class="btn-draw" onclick="galerapagosLaunch()">🏝️ Lancer la partie'+(nP?(' ('+nP+')'):'')+'</button>'+
      '<button class="btn-deactivate u-mt-sm" onclick="galerapagosCancel()">✕ Fermer le lobby</button>';
  } else if(ph==='action'){
    const cur=st.turnOrder[st.currentIdx], w=st.weather.current||0;
    h='<div class="diamant-voted">⏳ Au tour de <strong>'+escHtml(cur)+'</strong>. (Le joueur agit sur son écran ; en cas d\'absence, joue pour lui.)</div>'+
      '<div class="diamant-vote-btns">'+
      '<button class="btn-small" onclick="galerapagosForceAction(\'fish\')">🎣 Pêcher</button>'+
      (w>0 ? '<button class="btn-small" onclick="galerapagosForceAction(\'water\')">💧 Eau</button>'
           : '<button class="btn-small" disabled style="opacity:.45;cursor:not-allowed">💧 Eau (0)</button>')+
      '<button class="btn-small" onclick="galerapagosForceAction(\'wood\')">🪵 Bois (sûr)</button>'+
      '<button class="btn-small" onclick="galerapagosForceAction(\'search\')">🔍 Fouiller</button>'+
      '</div>'+
      '<button class="btn-deactivate u-mt-sm" onclick="galerapagosCancel()">✕ Abandonner</button>';
  } else if(ph==='vote'){
    const t=gTally(st), voted=gAlive(st).filter(p=>p.voteTarget).length, elig=gAlive(st).filter(p=>!p.sick).length;
    if(!st.vote.revealed){
      h='<div class="diamant-voted">🗳️ Vote en cours… '+voted+'/'+elig+' ont voté.</div>'+
        '<button class="btn-draw" onclick="galerapagosReveal()">👁️ Révéler les votes</button>'+
        '<button class="btn-deactivate u-mt-sm" onclick="galerapagosCancel()">✕ Abandonner</button>';
    } else {
      const max=Math.max(0,...Object.values(t));
      h='<div class="diamant-voted">📊 Résultat — clique sur le naufragé à éliminer (départage meneur en cas d\'égalité) :</div>'+
        '<div class="diamant-players">'+gAlive(st).map(p=>{
          const n=t[p.pseudo]||0, lead=(n===max&&max>0);
          if(p.conque) return '<div class="dplayer-row" style="opacity:.6"><span class="dplayer-name">'+escHtml(p.pseudo)+'</span><span class="t-warm-sm">🐚 immunisé</span></div>';
          return '<button class="dplayer-row '+(lead?'u-outline':'')+'" style="width:100%;cursor:pointer;text-align:left;font:inherit;color:var(--text-title);background:var(--surface-sunken);border:1px solid var(--border-soft)" onclick="galerapagosEliminate(\''+escAttr(p.pseudo)+'\')">'+
            '<span class="dplayer-name" style="color:var(--text-title)">'+escHtml(p.pseudo)+'</span><span class="t-warm-sm">'+n+' vote'+(n>1?'s':'')+'</span></button>';
        }).join('')+'</div>'+
        '<button class="btn-deactivate u-mt-sm" onclick="galerapagosCancel()">✕ Abandonner</button>';
    }
  } else if(ph==='turnEnd'){
    h='<button class="btn-draw" onclick="galerapagosNextTurn()">▶ Tour suivant ('+(st.turn+1)+')</button>'+
      '<button class="btn-deactivate u-mt-sm" onclick="galerapagosCancel()">✕ Abandonner</button>';
  } else if(ph==='gameEnd'){
    if(st.result==='win'){
      h='<div class="dbank"><div class="dbank-item"><div class="dbank-val">'+(st.survivors||0)+'</div><div class="dbank-lbl">Rescapés</div></div></div>'+
        '<button class="btn-draw" onclick="galerapagosEndToFire()">🔥 +'+((st.survivors||0)*G_FIRE_PER_SURVIVOR)+' au feu + clôturer</button>'+
        '<button class="btn-deactivate u-mt-sm" onclick="galerapagosCancel()">✕ Clôturer sans ajouter</button>';
    } else {
      h='<div class="diamant-voted">💀 Partie perdue. L\'île a gagné.</div>'+
        '<button class="btn-deactivate" onclick="galerapagosCancel()">✕ Clôturer</button>';
    }
  }
  ctrl.innerHTML=gNoEmoji(h);
  renderGameLibrary();
}

// Main du joueur (visible seulement sur SON écran). Objets jouables ; certains encore en attente (Phase B+).
function gHandHtml(st, pseudo){
  const me=st.players[pseudo]; if(!me || !me.alive) return '';
  const hand=me.hand||[];
  const esc=escAttr(pseudo);
  const warn = me.sick
    ? '<div class="diamant-voted" style="border-color:var(--danger-line)">🤕 Tu es malade : tu passeras ton prochain tour (un Anti-venin te soigne).</div>'
    : '';
  const res  = (me.lastResult && me.lastResult.turn===st.turn) ? '<div class="diamant-voted">'+escHtml(me.lastResult.msg)+'</div>' : '';
  const shot = (me.shotAt && me.shotAt.turn===st.turn) ? '<div class="diamant-voted" style="border-color:var(--danger-line)">🛡️ '+escHtml(me.shotAt.by)+' t\'a tiré dessus — ta Plaque de tôle t\'a protégé !</div>' : '';
  const canPlay = st.phase!=='lobby' && st.phase!=='gameEnd';
  const sickAlive=gAlive(st).filter(p=>p.sick);
  const hasAllum=(hand.some(x=>x.sub==='allumettes'));
  const inPenury=(st.phase==='vote' && st.vote && st.vote.context==='penury');
  let handPart;
  if(!hand.length){
    handPart='<div class="section-title" style="margin-top:.75rem">Ta main (0)</div><div class="t-warm-sm">Vide — « Fouiller l\'épave » pour piocher.</div>';
  } else {
    const rows=hand.map(c=>{
      let act='';
      if(canPlay){
        if(c.cat==='water'||c.cat==='food'){
          act='<button class="btn-small" onclick="galerapagosPlayCard(\''+esc+'\',\''+c.id+'\')">Jouer +1</button>';
        } else if(c.cat==='obj'){
          const s=c.sub;
          if(['gourde','canne','hache','boule','revolver','gourdin'].includes(s)) act = gHasObj(me,s) ? '<span class="t-warm-sm">déjà en jeu</span>' : '<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">Poser</button>';
          else if(s==='noixcoco')  act='<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">Boire (+3 eau)</button>';
          else if(s==='sardines')  act='<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">Manger (+3 nourriture)</button>';
          else if(s==='moulin')    act='<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">2 nourriture → 2 eau</button>';
          else if(s==='placeradeau') act='<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">Ajouter au radeau (+1 place)</button>';
          else if(s==='kitbbq')    act='<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">🍖 Cuisiner les morts</button>';
          else if(s==='panier')    act = inPenury ? '<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">🧺 Personne ne meurt</button>' : '<span class="t-warm-sm">en cas de pénurie</span>';
          else if(s==='eaucroupie'||s==='poissonpourri'){
            const gain=(s==='eaucroupie')?'+1 eau':'+1 nourriture';
            act='<button class="btn-small" onclick="galerapagosConsumeBad(\''+esc+'\',\''+c.id+'\',false)">Consommer ('+gain+', malade 🤢)</button>'+
                (hasAllum?'<button class="btn-small" onclick="galerapagosConsumeBad(\''+esc+'\',\''+c.id+'\',true)">🔥 Sans risque</button>':'');
          }
          else if(s==='antivenin') act = sickAlive.length ? sickAlive.map(t=>'<button class="btn-small" onclick="galerapagosCure(\''+esc+'\',\''+c.id+'\',\''+escAttr(t.pseudo)+'\')">💉 Soigner '+escHtml(t.pseudo)+'</button>').join('') : '<span class="t-warm-sm">à garder (aucun malade)</span>';
          else if(s==='somni')     act='<button class="btn-small" onclick="galerapagosSomniferes(\''+esc+'\',\''+c.id+'\')">💤 Rafler à 3 naufragés</button>';
          else if(s==='reveil')    act='⏰ 1er joueur : '+gAlive(st).map(t=>'<button class="btn-small" onclick="galerapagosReveil(\''+esc+'\',\''+c.id+'\',\''+escAttr(t.pseudo)+'\')">'+escHtml(t.pseudo)+'</button>').join('');
          else if(s==='cartouche') act='<span class="t-warm-sm">munition (revolver)</span>';
          else if(s==='allumettes')act='<span class="t-warm-sm">à jouer avec une eau croupie / un poisson pourri</span>';
          else if(s==='plaque')    act='<span class="t-warm-sm">🛡️ te protège d\'un tir (automatique)</span>';
          else if(s==='longuevue') act='<button class="btn-small" onclick="galerapagosPeek(\''+esc+'\',\''+c.id+'\')">🔭 Voir les mains</button>';
          else if(s==='lampe')     act='<button class="btn-small" onclick="galerapagosPeek(\''+esc+'\',\''+c.id+'\')">🔦 Voir la pioche</button>';
          else if(s==='barometre') act='<button class="btn-small" onclick="galerapagosPeek(\''+esc+'\',\''+c.id+'\')">🌡️ Voir la météo</button>';
          else if(s==='cafe')    act = (st.phase==='action' && st.turnOrder[st.currentIdx]===pseudo && !me.acted) ? '<button class="btn-small" onclick="galerapagosCafe(\''+esc+'\',\''+c.id+'\')">☕ Café (2 actions)</button>' : '<span class="t-warm-sm">à jouer à ton tour</span>';
          else if(s==='conque')  act='<button class="btn-small" onclick="galerapagosConque(\''+esc+'\',\''+c.id+'\')">🐚 Devenir chef (immunité au vote)</button>';
          else if(s==='pendule'){
            if(st.phase!=='action'){ act='<span class="t-warm-sm">en phase d\'action</span>'; }
            else { const cibles=gAlive(st).filter(q=>q.pseudo!==pseudo && !q.acted);
              act = cibles.length ? ('⏳ Imposer : '+cibles.map(t=>escHtml(t.pseudo)+' '+[['fish','🎣'],['water','💧'],['wood','🪵'],['search','🔍']].filter(a=>a[0]!=='water'||(st.weather.current||0)>0).map(a=>'<button class="btn-small" onclick="galerapagosPendule(\''+esc+'\',\''+c.id+'\',\''+escAttr(t.pseudo)+'\',\''+a[0]+'\')">'+a[1]+'</button>').join('')).join(' · ')) : '<span class="t-warm-sm">personne à contraindre</span>'; }
          }
          else if(s==='poupee'){ const morts=Object.values(st.players).filter(q=>!q.alive);
            act = (st.phase==='action' && morts.length) ? ('🪆 Ressusciter : '+morts.map(t=>'<button class="btn-small" onclick="galerapagosResurrect(\''+esc+'\',\''+c.id+'\',\''+escAttr(t.pseudo)+'\')">'+escHtml(t.pseudo)+'</button>').join('')) : '<span class="t-warm-sm">'+(morts.length?'en début de tour':'aucun mort à ranimer')+'</span>'; }
          else act='<span class="t-warm-sm">objet</span>';
        } else act='<span class="t-warm-sm">sans effet</span>';
      }
      return '<div class="dplayer-row" style="justify-content:space-between;flex-wrap:wrap;gap:.3rem">'+
        '<span class="dplayer-name" style="color:var(--text-title)">'+gCardIcon(c)+' '+escHtml(c.name)+'</span><span style="display:flex;gap:.3rem;flex-wrap:wrap">'+act+'</span></div>';
    }).join('');
    handPart='<div class="section-title" style="margin-top:.75rem">Ta main ('+hand.length+')</div><div class="diamant-players">'+rows+'</div>';
  }
  return warn + res + shot + gPeekHtml(st, pseudo) + handPart + gObjectsHtml(st, pseudo) + gTradeHtml(st, pseudo);
}

// Objets posés « en jeu » par le joueur (+ capacités actives : tir du revolver, coup d'œil de la boule).
function gObjectsHtml(st, pseudo){
  const me=st.players[pseudo]; if(!me || !me.alive) return '';
  const objs=me.objects||[]; if(!objs.length) return '';
  const esc=escAttr(pseudo);
  const list='<div class="section-title" style="margin-top:.6rem">Tes objets en jeu</div><div class="diamant-players">'+
    objs.map(o=>'<div class="dplayer-row"><span class="dplayer-name" style="color:var(--text-title)">'+gCardIcon(o)+' '+escHtml(o.name)+'</span></div>').join('')+'</div>';
  let extra='';
  if(gHasObj(me,'revolver') && (me.hand||[]).some(c=>c.sub==='cartouche')){
    const targets=gAlive(st).filter(p=>p.pseudo!==pseudo);
    extra+='<div class="diamant-voted" style="margin-top:.4rem">🔫 Tirer (consomme 1 cartouche) :</div><div class="diamant-vote-btns">'+
      targets.map(t=>'<button class="btn-small" onclick="galerapagosShoot(\''+esc+'\',\''+escAttr(t.pseudo)+'\')">'+escHtml(t.pseudo)+'</button>').join('')+'</div>';
  }
  return list + extra;
}

// ── Vue joueur ──
function renderGalerapagosViewer(pseudo){
  const wrap=document.getElementById('viewer-galerapagos');
  if(!wrap) return;
  if(!galerapagos || !galerapagos.active){ wrap.style.display='none'; return; }
  wrap.style.display='block';
  const idle=document.getElementById('viewer-idle'); if(idle) idle.style.display='none';

  const st=galerapagos;
  document.getElementById('gv-status').innerHTML  = (st.phase==='lobby') ? '' : gTurnPills(st)+gCounterPills(st);
  document.getElementById('gv-event').textContent = st.lastEvent||'';
  document.getElementById('gv-players').innerHTML = gPlayersList(st, pseudo);

  const me=st.players[pseudo], zone=document.getElementById('gv-myzone');
  const esc=escAttr(pseudo);

  if(st.phase==='lobby'){
    zone.innerHTML = me
      ? '<div class="diamant-voted">✓ Tu es sur le radeau ! En attente du lancement par le meneur…</div><button class="btn-small u-full" onclick="galerapagosLeave(\''+esc+'\')">↩ Quitter le lobby</button>'
      : '<div class="diamant-voted">🚪 Une partie se prépare ! Rejoins avant le lancement.</div><button class="btn-continue u-full" onclick="galerapagosJoin(\''+esc+'\')">🏝️ Rejoindre</button>';
    return;
  }
  if(!me){ zone.innerHTML='<div class="diamant-voted">👀 Une partie est en cours. Tu joueras à la prochaine !</div>'; return; }
  if(!me.alive){
    const by = me.deathBy ? '<div class="diamant-voted" style="border-color:var(--danger-line)">🔫 Tu as été abattu par <strong>'+escHtml(me.deathBy)+'</strong>, qui a récupéré tes cartes et objets.</div>' : '';
    zone.innerHTML = by + '<div class="diamant-voted">🪦 Tu as péri sur l\'île. Regarde les autres survivre…</div>'; return;
  }

  if(st.phase==='gameEnd'){
    zone.innerHTML = (st.result==='win')
      ? '<div class="diamant-voted">🚣 Tu as quitté l\'île. VICTOIRE !</div>'
      : '<div class="diamant-voted">💀 Personne n\'a survécu…</div>';
    return;
  }
  if(st.phase==='action'){
    let z;
    if(st.turnOrder[st.currentIdx]===pseudo){
      const w=st.weather.current||0, wEff=w*(gHasObj(me,'gourde')?2:1);
      const waterBtn = w>0
        ? '<button class="btn-continue u-full u-mt-sm" onclick="galerapagosAct(\''+esc+'\',\'water\',0)">💧 Collecter de l\'eau (+'+wEff+')</button>'
        : '<button class="btn-continue u-full u-mt-sm" disabled style="opacity:.45;cursor:not-allowed">💧 Pas d\'eau à collecter aujourd\'hui</button>';
      z='<div class="diamant-voted">⏳ <strong>C\'est ton tour</strong> — choisis une action :</div>'+
        '<button class="btn-continue u-full" onclick="galerapagosAct(\''+esc+'\',\'fish\',0)">🎣 Pêcher (nourriture aléatoire)</button>'+
        waterBtn+
        '<button class="btn-continue u-full u-mt-sm" onclick="galerapagosAct(\''+esc+'\',\'search\',0)">🔍 Fouiller l\'épave (+1 carte)</button>'+
        '<div class="diamant-voted u-mt-sm">🪵 Collecter du bois — le 1ᵉʳ est gratuit. Combien risquer en plus (serpent 🐍) ?</div>'+
        '<div class="diamant-vote-btns">'+[0,1,2,3,4,5].map(k=>'<button class="btn-small" onclick="galerapagosAct(\''+esc+'\',\'wood\','+k+')">'+(k===0?'0 (sûr)':('+'+k))+'</button>').join('')+'</div>';
    } else {
      z='<div class="diamant-voted">🌊 En attente de <strong>'+escHtml(st.turnOrder[st.currentIdx])+'</strong>… tu peux jouer des cartes en attendant.</div>';
    }
    zone.innerHTML = z + gHandHtml(st,pseudo);
    return;
  }
  if(st.phase==='vote'){
    let z;
    if(me.sick){ z='<div class="diamant-voted">🤕 Tu es malade : tu ne peux pas voter ce tour-ci.</div>'; }
    else if(st.vote.revealed){ z=gRevealHtml(st)+'<div class="t-warm-sm" style="margin-top:.3rem">Le meneur tranche…</div>'; }
    else if(me.voteTarget){ z='<div class="diamant-voted">✓ Ton vote est enregistré ('+escHtml(me.voteTarget)+'). Tu peux encore jouer une carte ressource pour éviter la pénurie.</div>'; }
    else {
      const rl={water:'d\'eau',food:'de nourriture',raft:'de place'}[st.vote.resource];
      z='<div class="diamant-voted">🗳️ Pénurie '+rl+' — vote pour désigner qui sera sacrifié (ou joue une carte ressource pour éviter le vote) :</div>'+
        '<div class="diamant-players">'+gAlive(st).filter(p=>p.pseudo!==pseudo && !p.conque).map(p=>
          '<button class="dplayer-row" style="width:100%;cursor:pointer;text-align:left;font:inherit;color:var(--text-title);background:var(--surface-sunken);border:1px solid var(--border-soft)" onclick="galerapagosVote(\''+esc+'\',\''+escAttr(p.pseudo)+'\')"><span class="dplayer-name" style="color:var(--text-title)">'+escHtml(p.pseudo)+'</span></button>'
        ).join('')+'</div>';
    }
    if(gHasObj(me,'boule') && !st.vote.revealed && !me.sick){   // Boule de cristal : voir les votes en cours (tu votes en dernier)
      const live=gAlive(st).filter(p=>p.pseudo!==pseudo).map(p=>escHtml(p.pseudo)+' → '+(p.voteTarget?escHtml(p.voteTarget):'…')).join('<br>');
      z+='<div class="diamant-voted" style="margin-top:.4rem">🔮 <strong>Boule de cristal</strong> — tu votes en dernier. Votes en cours :<br>'+(live||'—')+'</div>';
    }
    zone.innerHTML = z + gHandHtml(st,pseudo);
    return;
  }
  if(st.phase==='turnEnd'){
    zone.innerHTML='<div class="diamant-voted">🏝️ Tour terminé. En attente du meneur…</div>' + gHandHtml(st,pseudo);
  }
}

// ── Vue stream (publique, lecture seule — aucune info secrète) ──
function renderGalerapagosStream(){
  const root=document.getElementById('gs-root'); if(!root) return;
  const st=galerapagos;
  if(!st || !st.active){
    root.innerHTML='<div class="game-card"><div class="game-card-header"><span class="game-card-icon">🏝️</span><div><div class="game-card-title">Galerapagos — L\'île du Village</div><div class="game-card-subtitle">En attente du lancement…</div></div></div></div>';
    return;
  }
  let vote='';
  if(st.phase==='vote'){
    vote = st.vote && st.vote.revealed
      ? '<div class="diamant-voted">📊 Votes révélés — le meneur tranche.</div>'
      : '<div class="diamant-voted">🗳️ Vote en cours…</div>';
  }
  root.innerHTML =
    '<div class="card fv-game">'+
      '<div class="fv-topbar"><span class="fv-game-title">🏝️ Galerapagos — L\'île du Village</span><div class="fv-pills">'+(st.phase==='lobby'?'':gTurnPills(st))+'</div></div>'+
      (st.phase==='lobby'?'':'<div class="fv-pills" style="margin:.4rem 0">'+gCounterPills(st)+'</div>')+
      '<div class="diamant-event">'+escHtml(st.lastEvent||'')+'</div>'+
      vote+
      '<div class="diamant-players" style="margin-top:.6rem">'+gPlayersList(st)+'</div>'+
    '</div>';
}

// ── Règles (popin) ──
function gRulesHtml(){
  return ''+
  '<h2 class="rules-title">🏝️ Galerapagos — L\'île du Village — Comment jouer</h2>'+
  '<div class="rules-section"><h3>🎯 Le but</h3><p>Naufragés sur une île, construisez ensemble un radeau et quittez l\'île avant l\'ouragan. Ceux qui embarquent gagnent.</p></div>'+
  '<div class="rules-section"><h3>🔄 Un tour</h3><p>À chaque tour : la météo est tirée (elle fixe l\'eau récoltable), puis chacun choisit <strong>une</strong> action :</p><ul>'+
    '<li>🎣 <strong>Pêcher</strong> : ajoute de la nourriture (quantité aléatoire).</li>'+
    '<li>💧 <strong>Collecter de l\'eau</strong> : ajoute l\'eau du jour (0 à 3 selon la météo).</li>'+
    '<li>🪵 <strong>Collecter du bois</strong> : +1 sûr, puis tu peux en risquer plus… mais gare au serpent 🐍 (morsure = malade au tour suivant).</li>'+
    '<li>🔍 <strong>Fouiller l\'épave</strong> : pioche une carte, gardée secrète dans ta main.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🃏 Les cartes</h3><p>Ta main n\'est visible que par toi. Joue une <strong>Bouteille d\'eau</strong> ou un <strong>Sandwich</strong> pour +1 au stock commun ; 🥥 Noix de coco = +3 eau, 🐟 Sardines = +3 nourriture. <strong>Eau croupie</strong> / <strong>Poisson pourri</strong> donnent +1 ration mais rendent MALADE 1 tour (les 🔥 Allumettes évitent ça). À la mort d\'un naufragé, ses cartes passent à ses voisins.</p></div>'+
  '<div class="rules-section"><h3>🎁 Les objets</h3><p><strong>Permanents</strong> (posés, visibles de tous) : 🍶 Gourde (eau ×2), 🎣 Canne (garde la meilleure de 3 boules), 🪓 Hache (2 bois sûrs), 🔮 Boule de cristal (vote en dernier), 🏏 Gourdin & 🔫 Revolver (voix double ; le revolver + • Cartouche abat un joueur). <strong>Consommables</strong> : 💉 Anti-venin (soigne la maladie), 💤 Somnifère (rafle 1 carte à 3 naufragés), ⏰ Réveil matin (choisis le 1er joueur), 🥣 Moulin (2 nourriture→2 eau), 🪵 Planche (+1 place), 🧺 Panier garni (en cas de pénurie : personne ne meurt, le stock est vidé), 🍖 Kit BBQ (+2 nourriture par mort du tour), 🛡️ Plaque de tôle (bloque un tir). D\'autres objets arrivent bientôt.</p></div>'+
  '<div class="rules-section"><h3>🍖 Survie</h3><p>À la fin du tour, chaque survivant consomme 1 eau et 1 nourriture. En cas de pénurie, un <strong>vote</strong> désigne qui est privé — et périt.</p></div>'+
  '<div class="rules-section"><h3>🚣 Fin de partie</h3><p>Dès qu\'il y a assez de places sur le radeau et des vivres pour le voyage, vous pouvez embarquer. Si l\'ouragan 🌀 arrive, le radeau doit partir immédiatement… ou tout le monde périt !</p></div>';
}
function galerapagosShowRules(){ const b=document.getElementById('galerapagos-rules-content'), m=document.getElementById('galerapagos-rules-modal'); if(!b||!m) return; b.innerHTML=gRulesHtml(); m.style.display='flex'; }
function galerapagosHideRules(){ const m=document.getElementById('galerapagos-rules-modal'); if(m) m.style.display='none'; }