// ── DIAMANT ENGINE + UI ──────────────────────────────────────────────────────
const D_HAZARDS = ['serpent','araignee','eboulement'];
const D_TREASURES = [1,2,3,4,5,5,7,7,9,11,11,13,14,15,17];
const D_MAXROUNDS = 5;
let __dseq = 0;
function dCardId(){ return 'c'+Date.now()+'_'+(__dseq++); }
function dShuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function dNewDeck(){
  const cards=[];
  D_TREASURES.forEach(v=>cards.push({id:dCardId(),type:'treasure',value:v}));
  D_HAZARDS.forEach(t=>{ for(let i=0;i<3;i++) cards.push({id:dCardId(),type:'hazard',hazard:t}); });
  return dShuffle(cards);
}
function dHazLabel(h){ return {serpent:'🐍 Serpent',araignee:'🕷️ Araignée',eboulement:'🪨 Éboulement'}[h]||h; }
function dHazIcon(h){ return {serpent:'🐍',araignee:'🕷️',eboulement:'🪨'}[h]||'⚠️'; }
function dInPlayers(st){ return Object.values(st.players).filter(p=>p.status==='in'); }
function dTotalBanked(st){ return Object.values(st.players).reduce((s,p)=>s+p.banked,0); }
function dNormalize(st){
  if(!st) return st;
  // Firebase drops empty arrays/objects/null — rebuild them so the engine never hits undefined
  st.board       = Array.isArray(st.board) ? st.board : (st.board ? Object.values(st.board) : []);
  st.deck        = Array.isArray(st.deck)  ? st.deck  : (st.deck  ? Object.values(st.deck)  : []);
  st.hazardsSeen = (st.hazardsSeen && typeof st.hazardsSeen==='object') ? st.hazardsSeen : {};
  st.players     = (st.players && typeof st.players==='object') ? st.players : {};
  st.pathTreasure= (typeof st.pathTreasure==='number') ? st.pathTreasure : 0;
  return st;
}

// ── Control handlers (write to Firebase) ──
function startDiamant(){
  const pseudos = Object.values(viewers).map(v=>(v&&v.pseudo)?v.pseudo:v).filter(p=>typeof p==='string');
  if(pseudos.length===0){ toast('Aucun villageois connecté pour jouer !'); return; }
  if(!confirm('Lancer une partie de Diamant avec les '+pseudos.length+' villageois connectés ?')) return;
  const players={};
  pseudos.forEach(p=>{ players[p]={pseudo:p,status:'in',held:0,banked:0,vote:null}; });
  fbSetDiamant({
    active:true, round:1, maxRounds:D_MAXROUNDS, phase:'exploring',
    deck:dNewDeck(), board:[], pathTreasure:0, hazardsSeen:{}, players,
    lastEvent:'La partie commence ! Révèle la première carte.'
  });
  toast('💎 Partie de Diamant lancée !');
}

function diamantCancel(){
  if(!confirm('Abandonner la partie de Diamant en cours ? (le trésor sécurisé ne sera pas ajouté au feu)')) return;
  fbSetDiamant(null);
  toast('Partie de Diamant annulée.');
}

function diamantDraw(){
  if(!diamant || diamant.phase!=='exploring') return;
  const st = dNormalize(JSON.parse(JSON.stringify(diamant)));
  if(!st.deck.length){ st.lastEvent='Deck vide, la manche se termine.'; dEndRound(st); fbSetDiamant(st); return; }
  const card = st.deck.shift();
  st.board.push(card);
  if(card.type==='treasure'){
    const ins = dInPlayers(st); const N=ins.length;
    if(N>0){
      const share=Math.floor(card.value/N), rem=card.value%N;
      ins.forEach(p=>p.held+=share); st.pathTreasure+=rem;
      st.lastEvent='💎 Trésor de '+card.value+' ! Chaque explorateur ('+N+') gagne '+share+(rem?(' — '+rem+' sur le chemin.'):'.');
    }
    Object.values(st.players).forEach(p=>{ if(p.status==='in') p.vote=null; });
    st.phase='voting';
  } else {
    const seen = st.hazardsSeen[card.hazard]||0;
    if(seen>=1){
      const lost = dInPlayers(st).reduce((s,p)=>s+p.held,0)+st.pathTreasure;
      dInPlayers(st).forEach(p=>p.held=0); st.pathTreasure=0; st.hazardsSeen[card.hazard]=seen+1;
      st.lastEvent='💥 Double '+dHazLabel(card.hazard)+' ! Manche perdue. '+lost+' trésor'+(lost>1?'s':'')+' non sécurisé'+(lost>1?'s':'')+' perdu'+(lost>1?'s':'')+'.';
      dEndRound(st); fbSetDiamant(st); return;
    } else {
      st.hazardsSeen[card.hazard]=1;
      Object.values(st.players).forEach(p=>{ if(p.status==='in') p.vote=null; });
      st.phase='voting';
      st.lastEvent='⚠️ '+dHazLabel(card.hazard)+' ! Un deuxième serait fatal. Continuer ou rentrer ?';
    }
  }
  fbSetDiamant(st);
}

function diamantVote(pseudo, vote){
  if(!diamant || diamant.phase!=='voting') return;
  const st = dNormalize(JSON.parse(JSON.stringify(diamant)));
  const p = st.players[pseudo];
  if(!p || p.status!=='in') return;
  p.vote = vote;
  const ins = dInPlayers(st);
  if(ins.every(pl=>pl.vote)) dResolveVotes(st);
  fbSetDiamant(st);
}

function diamantForceResolve(){
  if(!diamant || diamant.phase!=='voting') return;
  const st = dNormalize(JSON.parse(JSON.stringify(diamant)));
  dInPlayers(st).forEach(p=>{ if(!p.vote) p.vote='continue'; });
  dResolveVotes(st);
  fbSetDiamant(st);
}

function dResolveVotes(st){
  const ins = dInPlayers(st);
  const leavers = ins.filter(p=>p.vote==='leave');
  const M = leavers.length;
  if(M>0){
    const share=Math.floor(st.pathTreasure/M), rem=st.pathTreasure%M;
    leavers.forEach(p=>{ p.banked+=p.held+share; p.held=0; p.status='out'; p.vote=null; });
    st.pathTreasure=rem;
    st.lastEvent=M+' explorateur'+(M>1?'s rentrent':' rentre')+' au camp avec leur butin.';
  } else { st.lastEvent='Tout le monde continue l\'exploration !'; }
  dInPlayers(st).forEach(p=>p.vote=null);
  if(dInPlayers(st).length===0){ dEndRound(st); return; }
  st.phase='exploring';
}

function dEndRound(st){
  dInPlayers(st).forEach(p=>{ p.held=0; p.status='out'; p.vote=null; });
  st.pathTreasure=0; st.phase='roundEnd';
}

function diamantNextRound(){
  if(!diamant || diamant.phase!=='roundEnd') return;
  const st = dNormalize(JSON.parse(JSON.stringify(diamant)));
  if(st.round>=st.maxRounds){
    st.phase='gameEnd';
    st.lastEvent='🏁 Partie terminée ! Trésor total sécurisé : '+dTotalBanked(st)+'.';
    fbSetDiamant(st); return;
  }
  st.round+=1; st.deck=dNewDeck(); st.board=[]; st.pathTreasure=0; st.hazardsSeen={};
  Object.values(st.players).forEach(p=>{ p.status='in'; p.held=0; p.vote=null; });
  st.phase='exploring';
  st.lastEvent='Manche '+st.round+' ! Tous repartent dans la grotte.';
  fbSetDiamant(st);
}

function diamantEndToFire(){
  if(!diamant) return;
  const total = dTotalBanked(diamant);
  if(!confirm('Ajouter '+total+' points au feu de camp et clôturer la partie ?')) return;
  fbSetFire(Object.assign({}, fire, { points:(fire.points||0)+total }));
  fbSetDiamant(null);
  toast('🔥 +'+total+' points au feu ! Partie clôturée.');
}

// ── Rendering ──
function dRenderPath(el, board){
  if(!el) return;
  if(!board || !board.length){ el.innerHTML='<div class="dcard-empty">La grotte est encore inexplorée…</div>'; return; }
  el.innerHTML = board.map(c=>{
    if(c.type==='treasure') return '<div class="dcard dcard-treasure"><span class="dico">💎</span><span class="dval">'+c.value+'</span></div>';
    return '<div class="dcard dcard-hazard"><span class="dico">'+dHazIcon(c.hazard)+'</span></div>';
  }).join('');
  el.scrollLeft = el.scrollWidth;
}

function dStatusPills(st){
  const ins = dInPlayers(st).length;
  const total = dTotalBanked(st);
  return '<div class="dpill">Manche <strong>'+st.round+'/'+st.maxRounds+'</strong></div>'+
         '<div class="dpill">Dans la grotte <strong>'+ins+'</strong></div>'+
         '<div class="dpill">Sur le chemin <strong>'+st.pathTreasure+'</strong></div>'+
         '<div class="dpill">Trésor sécurisé <strong>'+total+'</strong></div>';
}

function dPlayersList(st, highlightPseudo){
  return Object.values(st.players).map(p=>{
    const isIn = p.status==='in';
    const voteBadge = (st.phase==='voting' && isIn)
      ? (p.vote ? '<span class="dvote-badge dvote-done">✓ a voté</span>' : '<span class="dvote-badge dvote-wait">…réfléchit</span>')
      : '';
    const hl = (p.pseudo===highlightPseudo) ? 'style="outline:1px solid var(--amber-warm)"' : '';
    return '<div class="dplayer-row '+(isIn?'':'out')+'" '+hl+'>'+
      '<span class="dplayer-status '+(isIn?'dstatus-in':'dstatus-out')+'">'+(isIn?'⛏️ explore':'🏕️ au camp')+'</span>'+
      '<span>'+escHtml(p.pseudo)+'</span>'+
      '<span style="color:var(--amber-warm);font-size:.8rem">'+(isIn?('+'+p.held+' en jeu'):('🔒 '+p.banked))+'</span>'+
      voteBadge+'</div>';
  }).join('');
}

function renderDiamantAdmin(){
  const panel = document.getElementById('diamant-panel');
  if(!panel) return;
  const inactive = document.getElementById('diamant-admin-inactive');
  const active   = document.getElementById('diamant-admin-active');
  if(!diamant || !diamant.active){ inactive.style.display='block'; active.style.display='none'; return; }
  inactive.style.display='none'; active.style.display='block';

  document.getElementById('da-status').innerHTML = dStatusPills(diamant);
  document.getElementById('da-event').textContent = diamant.lastEvent||'';
  dRenderPath(document.getElementById('da-path'), diamant.board);
  document.getElementById('da-players').innerHTML = dPlayersList(diamant);

  const ctrl = document.getElementById('da-controls');
  const ph = diamant.phase;
  if(ph==='exploring'){
    ctrl.innerHTML = '<button class="btn-draw" onclick="diamantDraw()">🎴 Révéler une carte ('+diamant.deck.length+' restantes)</button>'+
      '<button class="btn-deactivate" onclick="diamantCancel()" style="margin-top:.6rem">✕ Abandonner la partie</button>';
  } else if(ph==='voting'){
    const ins = dInPlayers(diamant); const voted = ins.filter(p=>p.vote).length;
    ctrl.innerHTML = '<div class="diamant-voted">🗳️ Vote en cours… '+voted+'/'+ins.length+' ont voté</div>'+
      '<button class="btn-draw" onclick="diamantForceResolve()">⏭️ Forcer la résolution (absents = continuent)</button>'+
      '<button class="btn-deactivate" onclick="diamantCancel()" style="margin-top:.6rem">✕ Abandonner la partie</button>';
  } else if(ph==='roundEnd'){
    const last = diamant.round>=diamant.maxRounds;
    ctrl.innerHTML = '<button class="btn-draw" onclick="diamantNextRound()">'+(last?'🏁 Voir le résultat final':'▶ Manche suivante ('+(diamant.round+1)+'/'+diamant.maxRounds+')')+'</button>'+
      '<button class="btn-deactivate" onclick="diamantCancel()" style="margin-top:.6rem">✕ Abandonner la partie</button>';
  } else if(ph==='gameEnd'){
    const total = dTotalBanked(diamant);
    ctrl.innerHTML = '<div class="dbank"><div class="dbank-item"><div class="dbank-val">'+total+'</div><div class="dbank-lbl">Trésor total</div></div></div>'+
      '<button class="btn-draw" onclick="diamantEndToFire()">🔥 Ajouter '+total+' pts au feu + clôturer</button>'+
      '<button class="btn-deactivate" onclick="diamantCancel()" style="margin-top:.6rem">✕ Clôturer sans ajouter au feu</button>';
  }
}

function renderDiamantViewer(pseudo){
  const wrap = document.getElementById('viewer-diamant');
  if(!wrap) return;
  if(!diamant || !diamant.active){ wrap.style.display='none'; return; }
  wrap.style.display='block';

  document.getElementById('dv-status').innerHTML = dStatusPills(diamant);
  document.getElementById('dv-event').textContent = diamant.lastEvent||'';
  dRenderPath(document.getElementById('dv-path'), diamant.board);
  document.getElementById('dv-players').innerHTML = dPlayersList(diamant, pseudo);

  const me = diamant.players[pseudo];
  const zone = document.getElementById('dv-myzone');
  if(!me){
    zone.innerHTML = '<div class="diamant-voted">👀 Une partie est en cours. Tu pourras jouer à la prochaine !</div>';
    return;
  }
  if(diamant.phase==='gameEnd'){
    zone.innerHTML = '<div class="dbank"><div class="dbank-item"><div class="dbank-val">'+me.banked+'</div><div class="dbank-lbl">Ton trésor</div></div>'+
      '<div class="dbank-item"><div class="dbank-val">'+dTotalBanked(diamant)+'</div><div class="dbank-lbl">Total du groupe</div></div></div>'+
      '<div class="diamant-voted">🏁 Partie terminée ! Bravo aux explorateurs.</div>';
    return;
  }
  if(me.status==='out'){
    zone.innerHTML = '<div class="diamant-voted">🏕️ Tu es rentré au camp avec <strong style="color:var(--amber-bright)">'+me.banked+'</strong> de trésor sécurisé. Regarde les autres continuer…</div>';
    return;
  }
  // me is 'in'
  if(diamant.phase==='voting'){
    if(me.vote){
      zone.innerHTML = '<div class="diamant-voted">✓ Ton choix est enregistré ('+(me.vote==='leave'?'🎒 rentrer':'⛏️ continuer')+'). En attente des autres explorateurs…</div>';
    } else {
      zone.innerHTML = '<div class="dbank"><div class="dbank-item"><div class="dbank-val">'+me.held+'</div><div class="dbank-lbl">Ton butin en jeu</div></div></div>'+
        '<div class="diamant-vote-btns">'+
        '<button class="btn-continue" onclick="diamantVote(\''+escAttr(pseudo)+'\',\'continue\')">⛏️ Continuer</button>'+
        '<button class="btn-leave" onclick="diamantVote(\''+escAttr(pseudo)+'\',\'leave\')">🎒 Rentrer</button>'+
        '</div>';
    }
  } else {
    zone.innerHTML = '<div class="diamant-voted">⛏️ Tu explores la grotte — butin en jeu : <strong style="color:var(--amber-bright)">'+me.held+'</strong>. En attente de la prochaine carte…</div>';
  }
}
