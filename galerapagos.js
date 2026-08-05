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

// ── Deck Épave (V2) — 55 cartes. cat : water/water_bad/food/food_bad/antivenin/useless/obj ──
// Les 'obj' sont distribués mais non jouables tant que la Phase B n'est pas là.
const G_EPAVE = [
  { n:8, cat:'water',     name:"Bouteille d'eau" },
  { n:2, cat:'water_bad', name:"Eau croupie" },
  { n:8, cat:'food',      name:"Sandwich" },
  { n:4, cat:'food',      name:"Sardines" },
  { n:4, cat:'food',      name:"Noix de coco" },
  { n:2, cat:'food_bad',  name:"Poisson pourri" },
  { n:2, cat:'antivenin', name:"Anti-venin" },
  { n:1, cat:'useless',   name:"Vieux slip" },
  { n:1, cat:'useless',   name:"Clé de voiture" },
  { n:1, cat:'useless',   name:"Ticket de loterie périmé" },
  { n:2, cat:'obj', sub:'gourde',    name:"Gourde" }, { n:2, cat:'obj', sub:'canne', name:"Canne à pêche" },
  { n:2, cat:'obj', sub:'hache',     name:"Hache" },  { n:2, cat:'obj', sub:'gourdin', name:"Gourdin" },
  { n:3, cat:'obj', sub:'revolver',  name:"Revolver" }, { n:6, cat:'obj', sub:'cartouche', name:"Cartouche" },
  { n:1, cat:'obj', sub:'boule',     name:"Boule de cristal" }, { n:1, cat:'obj', sub:'somni', name:"Somnifères" },
  { n:1, cat:'obj', sub:'reveil',    name:"Réveil matin" }, { n:1, cat:'obj', sub:'poupee', name:"Poupée vaudou" },
  { n:1, cat:'obj', sub:'panier',    name:"Panier garni" },
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
  if(typeof st.turn!=='number')       st.turn=1;
  if(typeof st.firstIdx!=='number')   st.firstIdx=0;
  if(typeof st.currentIdx!=='number') st.currentIdx=0;
  Object.values(st.players).forEach(p=>{
    if(typeof p.alive!=='boolean') p.alive=true;
    if(typeof p.sick!=='boolean')  p.sick=false;
    if(typeof p.acted!=='boolean') p.acted=false;
    if(typeof p.poisoned!=='boolean') p.poisoned=false;
    if(!('action' in p))     p.action=null;
    if(!('voteTarget' in p)) p.voteTarget=null;
    p.hand    = Array.isArray(p.hand)    ? p.hand    : (p.hand    ? Object.values(p.hand)    : []);
    p.objects = Array.isArray(p.objects) ? p.objects : (p.objects ? Object.values(p.objects) : []);
  });
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
  if(c.cat==='obj') return ({ gourde:'🍶', canne:'🎣', hache:'🪓', gourdin:'🏏', revolver:'🔫', cartouche:'•', boule:'🔮', somni:'💤', reveil:'⏰', poupee:'🪆', panier:'🧺' })[c.sub] || '🎁';
  return ({ water:'💧', water_bad:'🤢', food:'🍖', food_bad:'🐟', antivenin:'💉', useless:'🗑️' })[c.cat] || '🃏';
}

// ── Déroulé d'un tour ──
function gStartTurn(st){
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
    let val=G_FISH_BAG[Math.floor(Math.random()*G_FISH_BAG.length)];
    if(gHasObj(p,'canne')) val*=2;                 // Canne à pêche : prise doublée
    c.food=Math.min(36,c.food+val);
    p.action='fish'; st.lastEvent=pseudo+' pêche 🐟 +'+val+' nourriture'+(gHasObj(p,'canne')?' (canne 🎣)':'')+'.';
  } else if(action==='water'){
    let w=st.weather.current||0;
    if(gHasObj(p,'gourde')) w*=2;                   // Gourde : collecte doublée
    c.water=Math.min(36,c.water+w);
    p.action='water'; st.lastEvent=pseudo+' collecte 💧 +'+w+' eau'+(w===0?' (rien aujourd\'hui…)':(gHasObj(p,'gourde')?' (gourde 🍶)':''))+'.';
  } else if(action==='wood'){
    const k=Math.max(0,Math.min(5, extra|0));
    let gained=1, bit=false;              // 1er bois gratuit en lisière
    if(k>0){
      const bag=[]; for(let i=0;i<G_WOOD_WHITE;i++) bag.push('w'); bag.push('b');
      const drawn=gShuffle(bag).slice(0,k);
      if(drawn.includes('b')) bit=true; else gained+=k;
    }
    if(gHasObj(p,'hache')) gained+=1;      // Hache : +1 bois
    c.raft+=gained;
    let built=0; while(c.raft>=6){ c.raft-=6; c.slots++; built++; }
    p.action='wood';
    if(bit){ p.sick=true; st.lastEvent=pseudo+' est mordu par un serpent 🐍 ! Malade au prochain tour. Bois rapporté : +'+gained+'.'; }
    else st.lastEvent=pseudo+' rapporte 🪵 +'+gained+' bois.'+(built?(' 🚣 Un morceau de radeau construit ('+c.slots+' place'+(c.slots>1?'s':'')+') !'):'');
  } else if(action==='search'){
    p.hand = p.hand || [];
    if(st.deck.length){ p.hand.push(st.deck.shift()); p.action='search'; st.lastEvent=pseudo+' fouille l\'épave 🔍 (+1 carte en main).'; }
    else { p.action='search'; st.lastEvent=pseudo+' fouille l\'épave… mais la cale est vide.'; }
  } else return;

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
  // Poison : à la fin de la journée, les empoisonnés non soignés succombent
  const poisoned=gAlive(st).filter(p=>p.poisoned);
  if(poisoned.length){
    const noms=poisoned.map(p=>p.pseudo).join(', ');
    poisoned.forEach(p=>gKill(st, p.pseudo));
    st.lastEvent='☠️ '+noms+' succombe(nt) au poison, faute d\'anti-venin.';
    if(gAlive(st).length===0){ gWipe(st); return; }
  }
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

// ── Cartes en main (V2-A) ──
// Jouer une carte ressource → +1 au stock commun (poison si eau croupie / poisson pourri).
function galerapagosPlayCard(pseudo, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId); if(idx<0) return;
  const card=p.hand[idx], c=st.counters;
  if(card.cat==='water'||card.cat==='water_bad')      c.water=Math.min(36,c.water+1);
  else if(card.cat==='food'||card.cat==='food_bad')   c.food =Math.min(36,c.food +1);
  else return;                                        // antivenin/useless/obj : pas ici
  p.hand.splice(idx,1);
  if(card.cat==='water_bad'||card.cat==='food_bad'){ p.poisoned=true; st.lastEvent=pseudo+' joue '+card.name+' (+1) — et se retrouve EMPOISONNÉ ☠️ !'; }
  else st.lastEvent=pseudo+' joue '+card.name+' (+1 au stock commun).';
  // Pendant un vote, les cartes peuvent résorber la pénurie / re-tenter l'embarquement
  if(st.phase==='vote' && st.vote){
    if(st.vote.context==='embark'){ st.vote=null; Object.values(st.players).forEach(q=>{ q.voteTarget=null; }); gTryEmbark(st,true); }
    else gRecheckShortage(st);
  }
  fbSetGalerapagos(st);
}

// Anti-venin → soigne un naufragé empoisonné (soi-même ou un autre).
function galerapagosCure(pseudo, cardId, target){
  if(!galerapagos) return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.cat==='antivenin'); if(idx<0) return;
  const t=st.players[target]; if(!t || !t.alive || !t.poisoned) return;
  t.poisoned=false; p.hand.splice(idx,1);
  st.lastEvent=pseudo+' utilise un Anti-venin sur '+target+' 💉 (guéri).';
  fbSetGalerapagos(st);
}

// Somnifères : rafle 1 carte au hasard à chaque naufragé actif (les malades sont épargnés), puis défausse.
function galerapagosSomniferes(pseudo, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='somni'); if(idx<0) return;
  p.hand.splice(idx,1);
  let n=0;
  gAlive(st).forEach(t=>{
    if(t.pseudo===pseudo || t.sick) return;             // ni soi, ni les malades
    const th=t.hand||[]; if(!th.length) return;
    p.hand.push(th.splice(Math.floor(Math.random()*th.length),1)[0]); n++;
  });
  st.lastEvent=pseudo+' joue les Somnifères 💤 et rafle 1 carte à '+n+' naufragé(s) !';
  fbSetGalerapagos(st);
}

// Réveil matin : désigne qui débutera le prochain tour (déplace le jeton de premier joueur), puis défausse.
function galerapagosReveil(pseudo, cardId, target){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='reveil'); if(idx<0) return;
  const t=st.players[target]; if(!t || !t.alive) return;
  p.hand.splice(idx,1);
  st.forcedFirst=target;                                // pris en compte au prochain gStartTurn
  st.lastEvent=pseudo+' règle le Réveil matin ⏰ : '+target+' débutera le prochain tour.';
  fbSetGalerapagos(st);
}

// ── Objets (V2-B) ──
// Poser un permanent (gourde/canne/hache/boule/revolver) en jeu, ou ouvrir un Panier garni (+3/+3).
function galerapagosPlayObject(pseudo, cardId){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.cat==='obj'); if(idx<0) return;
  const card=p.hand[idx], sub=card.sub;
  if(['gourde','canne','hache','boule','revolver','gourdin'].includes(sub)){
    p.objects=p.objects||[]; p.objects.push(card); p.hand.splice(idx,1);
    st.lastEvent=pseudo+' pose '+card.name+' '+gCardIcon(card)+' en jeu.';
  } else if(sub==='panier'){
    const c=st.counters; c.water=Math.min(36,c.water+3); c.food=Math.min(36,c.food+3); p.hand.splice(idx,1);
    st.lastEvent=pseudo+' ouvre un Panier garni 🧺 (+3 eau, +3 nourriture).';
    if(st.phase==='vote' && st.vote) gRecheckShortage(st);   // peut résorber une pénurie
  } else return;                                             // gourdin/somni/reveil/poupée/cartouche : ailleurs ou en attente
  fbSetGalerapagos(st);
}

// Poupée vaudou : vole une carte au hasard dans la main d'un joueur.
function galerapagosVoodoo(pseudo, cardId, target){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  const idx=(p.hand||[]).findIndex(c=>c.id===cardId && c.sub==='poupee'); if(idx<0) return;
  const t=st.players[target]; if(!t || !t.alive || target===pseudo) return;
  p.hand.splice(idx,1);
  const th=t.hand||[];
  if(th.length){ const stolen=th.splice(Math.floor(Math.random()*th.length),1)[0]; p.hand.push(stolen); st.lastEvent=pseudo+' vole une carte à '+target+' avec la Poupée vaudou 🪆.'; }
  else st.lastEvent=pseudo+' brandit la Poupée vaudou sur '+target+'… mais sa main est vide.';
  fbSetGalerapagos(st);
}

// Revolver (en jeu) + Cartouche (en main) → abat un joueur. Jouable à tout moment.
function galerapagosShoot(pseudo, target){
  if(!galerapagos || galerapagos.phase==='lobby' || galerapagos.phase==='gameEnd') return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[pseudo]; if(!p || !p.alive || !gHasObj(p,'revolver')) return;
  const ci=(p.hand||[]).findIndex(c=>c.sub==='cartouche'); if(ci<0) return;   // pas de munition
  const t=st.players[target]; if(!t || !t.alive || target===pseudo) return;
  p.hand.splice(ci,1);                                   // consomme la cartouche
  gKill(st, target);
  st.lastEvent='🔫 '+pseudo+' abat '+target+' d\'un coup de revolver !';
  if(gAlive(st).length===0){ gWipe(st); fbSetGalerapagos(st); return; }
  // Si le tir change le déroulé d'un vote en cours, on ré-évalue
  if(st.phase==='vote' && st.vote){
    const res=st.vote.resource, ctx=st.vote.context;
    if(ctx==='embark'){ st.vote=null; Object.values(st.players).forEach(q=>{ q.voteTarget=null; }); gTryEmbark(st,true); }
    else if(gAlive(st).length <= st.vote.capacity){ st.counters[res]=0; st.vote=null; Object.values(st.players).forEach(q=>{ q.voteTarget=null; }); if(res==='water') gResolveResource(st,'food'); else gAfterSurvival(st); }
  }
  fbSetGalerapagos(st);
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

// Mort d'un naufragé : sa main est mélangée et répartie alternativement à ses voisins (gauche d'abord).
function gKill(st, pseudo){
  const p=st.players[pseudo]; if(!p || !p.alive) return;
  p.alive=false; p.poisoned=false; p.objects=[];   // objets en jeu défaussés
  gRedistribute(st, pseudo);
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
  const t={}; gAlive(st).forEach(p=>{ if(p.voteTarget){ t[p.voteTarget]=(t[p.voteTarget]||0)+gVoteWeight(p); } });
  return t;
}

function galerapagosEliminate(target){
  if(!galerapagos || galerapagos.phase!=='vote' || !galerapagos.vote || !galerapagos.vote.revealed) return;
  const st=gNormalize(gClone(galerapagos));
  const p=st.players[target];
  if(!p || !p.alive) return;
  const res=st.vote.resource, ctx=st.vote.context;
  gKill(st, target);   // mort + redistribution de sa main aux voisins
  st.lastEvent='💀 '+target+' est sacrifié ('+({water:'mort de soif',food:'mort de faim',raft:'pas de place sur le radeau'}[res])+').';
  Object.values(st.players).forEach(q=>{ q.voteTarget=null; });

  if(ctx==='penury'){
    if(gAlive(st).length > st.vote.capacity){       // encore trop de bouches → nouveau tour de vote
      st.vote.revealed=false; st.vote.round++; st.phase='vote';
      st.lastEvent+=' Encore trop de survivants — nouveau vote.';
    } else {
      st.counters[res]=0;                            // les rations restantes sont consommées
      st.vote=null;
      if(res==='water') gResolveResource(st,'food'); else gAfterSurvival(st);
    }
  } else {                                           // contexte 'embark'
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
  if(forced){                                        // ouragan : il faut sacrifier
    let res; if(c.slots<N) res='raft'; else if(c.water<N) res='water'; else res='food';
    st.vote={ resource:res, context:'embark', capacity:(res==='raft'?c.slots:c[res]), revealed:false, round:1 };
    Object.values(st.players).forEach(p=>{ if(p.alive) p.voteTarget=null; });
    st.phase='vote';
    const rl={raft:'places sur le radeau',water:'eau pour le voyage',food:'nourriture pour le voyage'}[res];
    st.lastEvent='⚠️ Embarquement impossible pour tous ('+rl+' insuffisante). Votez pour sacrifier un naufragé.';
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
  if(!st.players[pseudo]) st.players[pseudo]={ pseudo, alive:true, sick:false, poisoned:false, acted:false, action:null, voteTarget:null, hand:[], objects:[] };
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
  Object.values(st.players).forEach(p=>{ p.alive=true; p.sick=false; p.poisoned=false; p.acted=false; p.action=null; p.voteTarget=null; p.hand=[]; p.objects=[]; });
  st.counters=gInitCounters(order.length);
  st.weather={ deck:gBuildWeatherDeck(), current:null, isHurricane:false, hurricaneDrawn:false };
  gDealHands(st, gBuildEpaveDeck());   // deck Épave distribué (3-4 cartes/joueur), reste dans st.deck
  st.turn=1; st.firstIdx=0; st.currentIdx=0; st.vote=null; st.result=null; st.escaped=false; st.canEmbark=false;
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
    const pois =(!dead && p.poisoned) ? '<span class="dvote-badge">☠️</span>' : '';
    const hl=(ps===highlight)?'u-outline':'';
    return '<div class="dplayer-row '+(dead?'out ':'')+hl+'">'+
      '<span class="dplayer-status '+(dead?'dstatus-out':'dstatus-in')+'">'+(dead?'🪦':'🧍')+'</span>'+
      '<span class="dplayer-name">'+escHtml(ps)+'</span>'+cards+objs+pois+badge+'</div>';
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
    const cur=st.turnOrder[st.currentIdx];
    h='<div class="diamant-voted">⏳ Au tour de <strong>'+escHtml(cur)+'</strong>. (Le joueur agit sur son écran ; en cas d\'absence, joue pour lui.)</div>'+
      '<div class="diamant-vote-btns">'+
      '<button class="btn-small" onclick="galerapagosForceAction(\'fish\')">🎣 Pêcher</button>'+
      '<button class="btn-small" onclick="galerapagosForceAction(\'water\')">💧 Eau</button>'+
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
  const warn = me.poisoned
    ? '<div class="diamant-voted" style="border-color:var(--danger-line);color:var(--danger)">☠️ Tu es EMPOISONNÉ — fais-toi soigner par un Anti-venin avant la fin du tour, sinon tu meurs.</div>'
    : '';
  const canPlay = st.phase!=='lobby' && st.phase!=='gameEnd';
  const poisonedAlive=gAlive(st).filter(p=>p.poisoned);
  const others=gAlive(st).filter(p=>p.pseudo!==pseudo);
  let handPart;
  if(!hand.length){
    handPart='<div class="section-title" style="margin-top:.75rem">Ta main (0)</div><div class="t-warm-sm">Vide — « Fouiller l\'épave » pour piocher.</div>';
  } else {
    const rows=hand.map(c=>{
      let act='';
      if(canPlay){
        if(c.cat==='water'||c.cat==='water_bad'||c.cat==='food'||c.cat==='food_bad'){
          const bad=(c.cat==='water_bad'||c.cat==='food_bad');
          act='<button class="btn-small" onclick="galerapagosPlayCard(\''+esc+'\',\''+c.id+'\')">Jouer +1'+(bad?' ☠️':'')+'</button>';
        } else if(c.cat==='antivenin'){
          act = poisonedAlive.length
            ? poisonedAlive.map(t=>'<button class="btn-small" onclick="galerapagosCure(\''+esc+'\',\''+c.id+'\',\''+escAttr(t.pseudo)+'\')">Soigner '+escHtml(t.pseudo)+'</button>').join('')
            : '<span class="t-warm-sm">à garder</span>';
        } else if(c.cat==='obj'){
          if(['gourde','canne','hache','boule','revolver','gourdin'].includes(c.sub)) act='<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">Poser</button>';
          else if(c.sub==='panier')    act='<button class="btn-small" onclick="galerapagosPlayObject(\''+esc+'\',\''+c.id+'\')">Ouvrir +3/+3</button>';
          else if(c.sub==='cartouche') act='<span class="t-warm-sm">munition (revolver)</span>';
          else if(c.sub==='poupee')    act='🪆 Voler à : '+others.map(t=>'<button class="btn-small" onclick="galerapagosVoodoo(\''+esc+'\',\''+c.id+'\',\''+escAttr(t.pseudo)+'\')">'+escHtml(t.pseudo)+'</button>').join('');
          else if(c.sub==='somni')     act='<button class="btn-small" onclick="galerapagosSomniferes(\''+esc+'\',\''+c.id+'\')">💤 Rafler 1 carte à tous</button>';
          else if(c.sub==='reveil')    act='⏰ 1er joueur : '+gAlive(st).map(t=>'<button class="btn-small" onclick="galerapagosReveil(\''+esc+'\',\''+c.id+'\',\''+escAttr(t.pseudo)+'\')">'+escHtml(t.pseudo)+'</button>').join('');
          else act='<span class="t-warm-sm">objet</span>';
        } else act='<span class="t-warm-sm">sans effet</span>';
      }
      return '<div class="dplayer-row" style="justify-content:space-between;flex-wrap:wrap;gap:.3rem">'+
        '<span class="dplayer-name" style="color:var(--text-title)">'+gCardIcon(c)+' '+escHtml(c.name)+'</span><span style="display:flex;gap:.3rem;flex-wrap:wrap">'+act+'</span></div>';
    }).join('');
    handPart='<div class="section-title" style="margin-top:.75rem">Ta main ('+hand.length+')</div><div class="diamant-players">'+rows+'</div>';
  }
  return warn + handPart + gObjectsHtml(st, pseudo);
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
  if(gHasObj(me,'boule')){
    const nextW = (st.weather.deck && st.weather.deck.length) ? (st.weather.deck[0]==='H'?'🌀 Ouragan':gWeatherLabel(st.weather.deck[0])) : '—';
    const top   = (st.deck && st.deck.length) ? (gCardIcon(st.deck[0])+' '+st.deck[0].name) : '—';
    extra+='<div class="diamant-voted" style="margin-top:.4rem">🔮 Prochaine météo : <strong>'+escHtml(nextW)+'</strong> · dessus de l\'épave : <strong>'+escHtml(top)+'</strong></div>';
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
  if(!me.alive){ zone.innerHTML='<div class="diamant-voted">🪦 Tu as péri sur l\'île. Regarde les autres survivre…</div>'; return; }

  if(st.phase==='gameEnd'){
    zone.innerHTML = (st.result==='win')
      ? '<div class="diamant-voted">🚣 Tu as quitté l\'île. VICTOIRE !</div>'
      : '<div class="diamant-voted">💀 Personne n\'a survécu…</div>';
    return;
  }
  if(st.phase==='action'){
    let z;
    if(st.turnOrder[st.currentIdx]===pseudo){
      const w=st.weather.current||0;
      z='<div class="diamant-voted">⏳ <strong>C\'est ton tour</strong> — choisis une action :</div>'+
        '<button class="btn-continue u-full" onclick="galerapagosAct(\''+esc+'\',\'fish\',0)">🎣 Pêcher (nourriture aléatoire)</button>'+
        '<button class="btn-continue u-full u-mt-sm" onclick="galerapagosAct(\''+esc+'\',\'water\',0)">💧 Collecter de l\'eau (+'+w+')</button>'+
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
    else if(st.vote.revealed){ z='<div class="diamant-voted">📊 Votes révélés — le meneur tranche…</div>'; }
    else if(me.voteTarget){ z='<div class="diamant-voted">✓ Ton vote est enregistré ('+escHtml(me.voteTarget)+'). Tu peux encore jouer une carte ressource pour éviter la pénurie.</div>'; }
    else {
      const rl={water:'d\'eau',food:'de nourriture',raft:'de place'}[st.vote.resource];
      z='<div class="diamant-voted">🗳️ Pénurie '+rl+' — vote pour désigner qui sera sacrifié (ou joue une carte ressource pour éviter le vote) :</div>'+
        '<div class="diamant-players">'+gAlive(st).filter(p=>p.pseudo!==pseudo).map(p=>
          '<button class="dplayer-row" style="width:100%;cursor:pointer;text-align:left;font:inherit;color:var(--text-title);background:var(--surface-sunken);border:1px solid var(--border-soft)" onclick="galerapagosVote(\''+esc+'\',\''+escAttr(p.pseudo)+'\')"><span class="dplayer-name" style="color:var(--text-title)">'+escHtml(p.pseudo)+'</span></button>'
        ).join('')+'</div>';
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
  '<div class="rules-section"><h3>🃏 Les cartes</h3><p>Ta main n\'est visible que par toi. Joue une carte <strong>ressource</strong> pour ajouter 1 eau ou 1 nourriture au stock commun (utile pour éviter une pénurie !). Attention : <strong>Eau croupie</strong> et <strong>Poisson pourri</strong> empoisonnent celui qui les joue ☠️ — sans <strong>Anti-venin</strong> avant la fin du tour, il meurt. À la mort d\'un naufragé, ses cartes passent à ses voisins.</p></div>'+
  '<div class="rules-section"><h3>🎁 Les objets</h3><p>Les <strong>permanents</strong> se posent en jeu (visibles de tous) : 🍶 Gourde (eau ×2), 🎣 Canne à pêche (pêche ×2), 🪓 Hache (+1 bois), 🔮 Boule de cristal (tu vois la prochaine météo et le dessus de l\'épave), 🏏 Gourdin (ta voix compte double aux votes), 🔫 Revolver (voix double aussi ; avec une • Cartouche, abats un joueur). À <strong>usage unique</strong> : 🧺 Panier garni (+3 eau / +3 nourriture), 🪆 Poupée vaudou (vole 1 carte à une cible), 💤 Somnifères (rafle 1 carte à chaque naufragé actif), ⏰ Réveil matin (choisis qui débute le prochain tour).</p></div>'+
  '<div class="rules-section"><h3>🍖 Survie</h3><p>À la fin du tour, chaque survivant consomme 1 eau et 1 nourriture. En cas de pénurie, un <strong>vote</strong> désigne qui est privé — et périt.</p></div>'+
  '<div class="rules-section"><h3>🚣 Fin de partie</h3><p>Dès qu\'il y a assez de places sur le radeau et des vivres pour le voyage, vous pouvez embarquer. Si l\'ouragan 🌀 arrive, le radeau doit partir immédiatement… ou tout le monde périt !</p></div>';
}
function galerapagosShowRules(){ const b=document.getElementById('galerapagos-rules-content'), m=document.getElementById('galerapagos-rules-modal'); if(!b||!m) return; b.innerHTML=gRulesHtml(); m.style.display='flex'; }
function galerapagosHideRules(){ const m=document.getElementById('galerapagos-rules-modal'); if(m) m.style.display='none'; }