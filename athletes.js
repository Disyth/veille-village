// ══════════════════════════════════════════════════════════════════════════
//  LES ATHLÈTES DU VILLAGE — course chaotique (adaptation d'Athlètes de Compète)
//  LOT 1 : lobby (3 à 9 joueurs), draft « 3 athlètes proposés, on en garde 1 »
//  (4 fois), choix secret de l'athlète avant chaque course, course tour par tour
//  avec minuteur (lancer automatique quand le temps est écoulé), piste Pépère /
//  Galère TEMPORAIRE, 12 premiers athlètes, or / argent / bronze, feu commun.
//  À VENIR : les 24 autres athlètes, la vraie piste (maquette de Damien),
//  l'animation pas à pas des réactions en chaîne, la vue stream.
//  Nœud Firebase : « athletes » (doit être autorisé dans les règles de la base).
//  Toutes les modifications passent par fbTxAthletes (transaction) : deux
//  joueurs qui cliquent en même temps ne s'écrasent pas.
// ══════════════════════════════════════════════════════════════════════════

// ── LEVIERS (ajustables) ──
const AT_MIN_PLAYERS = 3;      // 3 places récompensées : il faut au moins 3 coureurs
const AT_MAX_PLAYERS = 9;      // 9 joueurs × 4 athlètes = 36 athlètes (le jeu complet)
const AT_TEAM        = 4;      // athlètes par équipe = nombre de courses
const AT_OFFER       = 3;      // athlètes proposés à chaque tour de draft
const AT_LEN         = 30;     // case 0 = départ, case 30 = arrivée
const AT_TRACKS      = ['mild','wild','mild','wild'];   // Pépère, Galère, Pépère, Galère
const AT_GOLD   = [3,4,4,5];   // points de la 1re place, course par course
const AT_SILVER = [1,2,2,3];   // 2e place
const AT_BRONZE = [1,1,2,2];   // 3e place (ajout de la Veillée)
const AT_STAR_PTS = 1;         // case étoile de la piste Galère
const AT_DRAFT_SECS  = 20;     // temps pour garder 1 athlète parmi 3
const AT_CHOOSE_SECS = 25;     // temps pour choisir (en secret) l'athlète de la course
const AT_TURN_SECS   = 15;     // temps pour jouer son tour (sinon lancer automatique)
const AT_PODIUM_SECS = 12;     // pause sur le podium avant la course suivante
// Doublons TEMPORAIRES (lot 1, décision de Damien) : tant que les 36 athlètes ne sont pas
// tous codés, plusieurs joueurs peuvent avoir le même athlète. À passer à false au dernier lot.
const AT_ALLOW_DUP = true;

// Piste Galère TEMPORAIRE (Damien dessinera la vraie) : case → effet
//  star = +1 point · oups = l'athlète trébuche · arrow = déplacement de n cases (n<0 : recule)
const AT_WILD = {
  3:{ t:'star' },  5:{ t:'arrow', n:2 },  8:{ t:'oups' },  10:{ t:'star' },
  12:{ t:'arrow', n:-3 }, 14:{ t:'oups' }, 16:{ t:'star' }, 18:{ t:'arrow', n:3 },
  21:{ t:'oups' }, 23:{ t:'star' }, 25:{ t:'arrow', n:-4 }, 27:{ t:'star' }, 28:{ t:'oups' }
};
const AT_TRACK_NAME = { mild:'Pépère', wild:'Galère' };

// ── LES ATHLÈTES (lot 1 : 12 sur 36) — personnages du village, pouvoirs réécrits ──
const AT_ATHLETES = {
  glissant:   { nom:'Gaston la Glissade', ico:'🍌', txt:'Tout athlète qui le dépasse trébuche.' },
  gadoue:     { nom:'Mère Gadoue',        ico:'🟤', txt:'Les autres athlètes ont −1 à leur déplacement principal.' },
  lievre:     { nom:'Le Lièvre du Bois',  ico:'🐇', txt:'+2 à son déplacement principal. S\'il commence son tour seul en tête, il fait la sieste : pas de déplacement principal.' },
  grenouille: { nom:'Rainette',           ico:'🐸', txt:'En se déplaçant, elle saute par-dessus les cases occupées (elle ne les compte pas).' },
  facteur:    { nom:'Le Facteur',         ico:'📯', txt:'À son tour, peut avancer de 5 cases au lieu de lancer le dé.' },
  commere:    { nom:'La Commère',         ico:'💬', txt:'Avance d\'1 case chaque fois que le pouvoir d\'un autre athlète se déclenche.' },
  maitre:     { nom:'Le Maître d\'école', ico:'📏', txt:'Chaque athlète sur sa case, lui compris, a +1 à son déplacement principal.' },
  lavandiere: { nom:'La Lavandière',      ico:'🧺', txt:'Fait trébucher qui s\'arrête sur sa case. Quand elle s\'arrête sur une case, elle fait trébucher ceux qui y sont.' },
  valet:      { nom:'Le Valet de ferme',  ico:'🥾', txt:'Quand un autre athlète fait 6 au dé, le Valet avance de 2 cases, avant lui.' },
  chenille:   { nom:'La Chenille',        ico:'🐛', txt:'Quand un autre athlète fait 1 au dé, il ne bouge pas et la Chenille avance d\'1 case.' },
  ravi:       { nom:'Le Ravi',            ico:'🙌', txt:'Au début de son tour, s\'il est seul à la dernière place, il gagne 1 point de bronze.' },
  inventeur:  { nom:'L\'Inventeur',       ico:'🚀', txt:'Après son lancer, peut doubler son déplacement, mais il trébuche ensuite.' },
};
const AT_KEYS = Object.keys(AT_ATHLETES);

// ═══════════════════════════════════════════════════════════════════════════
//  OUTILS
// ═══════════════════════════════════════════════════════════════════════════
function atShuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function atDie(){ return 1+Math.floor(Math.random()*6); }
function atNow(){ return Date.now() + ((typeof window!=='undefined' && window.FB_OFFSET) ? window.FB_OFFSET : 0); }
function atDef(k){ return AT_ATHLETES[k] || { nom:'?', ico:'❔', txt:'' }; }
function atLabel(k){ const d=atDef(k); return d.ico+' '+d.nom; }
function atNoEmoji(s){ return (typeof fNoEmoji==='function') ? fNoEmoji(s) : s; }
function atArr(v){ return Array.isArray(v) ? v : (v ? Object.values(v) : []); }
function atPlural(n, w){ return n+' '+w+(n>1?'s':''); }
function atPlace(n){ return n===1 ? '1er' : n+'e'; }
// Écrit dans le DOM seulement si le contenu change (anti-clignotement)
function atSet(id, html){
  const el=document.getElementById(id); if(!el) return null;
  if(el.__atHtml !== html){ el.innerHTML = html; el.__atHtml = html; }
  return el;
}

// ── Journal : bandeau + historique. epic=true → mise en avant ──
const AT_HISTORY_MAX = 200;
function atLog(st, msg, epic){
  st.seq = (st.seq||0) + 1;
  st.lastEvent = msg;
  st.history = Array.isArray(st.history) ? st.history : [];
  st.history.push({ n:st.seq, msg, race:st.race||0, epic:!!epic });
  if(st.history.length > AT_HISTORY_MAX) st.history = st.history.slice(-AT_HISTORY_MAX);
}

// Firebase supprime les tableaux / objets vides et les null : on reconstruit à chaque lecture
function atNormalize(st){
  if(!st) return st;
  st.players = (st.players && typeof st.players==='object') ? st.players : {};
  st.order   = atArr(st.order);
  st.racers  = atArr(st.racers);
  st.history = atArr(st.history);
  st.results = atArr(st.results).map(r=>{ r.gold=r.gold||null; r.silver=r.silver||null; r.bronze=r.bronze||null; return r; });
  ['race','seq','mseq','deadline','turn','draftRound','points'].forEach(k=>{ if(typeof st[k]!=='number') st[k]=0; });
  if(!st.phase) st.phase='lobby';
  Object.values(st.players).forEach(p=>{
    p.hand = atArr(p.hand);
    p.used = atArr(p.used);
    p.offer = atArr(p.offer);
    if(!p.chosen) p.chosen=null;
    ['pts','gold','silver','bronze','stars'].forEach(k=>{ if(typeof p[k]!=='number') p[k]=0; });
  });
  st.racers.forEach(r=>{
    if(typeof r.pos!=='number') r.pos=0;
    if(typeof r.place!=='number') r.place=0;
    if(typeof r.arr!=='number') r.arr=0;
    r.trip=!!r.trip;
  });
  if(!st.pend) st.pend=null;
  return st;
}

// Modifie l'état par transaction. fn(st) modifie st ; renvoie un message d'erreur pour annuler
// ('silent' = annuler sans message).
function atTx(fn){
  let err=null;
  return fbTxAthletes(cur=>{
    if(cur===null) return null;   // 1er passage sans cache local : Firebase relance avec la vraie valeur
    const st=atNormalize(cur);
    err=null;
    const e=fn(st);
    if(e){ err=e; return; }
    return st;
  }).then(res=>{ if(res && !res.committed && err && err!=='silent') toast(err); return res; });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MOTEUR DE COURSE
// ═══════════════════════════════════════════════════════════════════════════
function atIsWild(st){ return AT_TRACKS[(st.race||1)-1]==='wild'; }
function atRacing(st){ return st.racers.filter(r=>!r.place); }
function atWho(r){ return atLabel(r.a)+' ('+r.p+')'; }
function atRacerOf(st, pseudo){ return st.racers.find(r=>r.p===pseudo) || null; }
function atActive(st){ return st.racers[st.turn] || null; }
// Ordre de réaction des pouvoirs : joueur actif, puis les autres dans l'ordre des sièges
function atReactOrder(st){
  const n=st.racers.length, out=[];
  for(let k=0;k<n;k++) out.push((st.turn+k)%n);
  return out;
}
function atAloneLast(st, ri){
  const me=st.racers[ri], others=atRacing(st).filter(r=>r!==me);
  return others.length>0 && others.every(o=>o.pos>me.pos);
}
function atAloneFirst(st, ri){
  const me=st.racers[ri], others=atRacing(st).filter(r=>r!==me);
  return others.length>0 && others.every(o=>o.pos<me.pos);
}
function atOccupied(st, pos, ri){ return st.racers.some((r,i)=>i!==ri && !r.place && r.pos===pos); }
function atTrip(st, ri){ st.racers[ri].trip=true; }

// Un pouvoir se déclenche : on le note, puis la Commère réagit.
// ctx.n compte les réactions du tour (garde-fou contre les boucles).
function atTrigger(st, ctx, ri, msg){
  atLog(st, msg);
  ctx.n=(ctx.n||0)+1;
  if(ctx.n>60) return;
  const src=st.racers[ri];
  if(src && src.a==='commere') return;   // les Commères ne se répondent pas entre elles (pas de boucle infinie)
  atReactOrder(st).forEach(ci=>{
    const c=st.racers[ci];
    if(ci===ri || c.place || c.a!=='commere' || st.phase!=='race') return;
    atLog(st, atLabel(c.a)+' l\'a vu ! Elle avance d\'1 case.');
    atMove(st, ctx, ci, 1);
  });
}

// Déplace un athlète de n cases (n<0 : recule). Gère Rainette, les dépassements,
// l'arrivée, puis les cases spéciales et les pouvoirs déclenchés par l'arrêt.
function atMove(st, ctx, ri, n){
  const r=st.racers[ri];
  if(!r || r.place || !n || st.phase!=='race') return;
  if(st.racers.filter(o=>o.place).length>=2) return;   // la course est déjà jouée : plus personne ne bouge
  const start=r.pos, dir=n>0?1:-1, frog=r.a==='grenouille';
  let pos=start, left=Math.abs(n), skipped=0;
  while(left>0){
    const nxt=pos+dir;
    if(nxt<0) break;
    pos=nxt;
    if(pos>=AT_LEN) break;
    if(frog && atOccupied(st, pos, ri)){ skipped++; continue; }   // saute la case sans la compter
    left--;
  }
  if(pos===start) return;
  r.pos=Math.min(pos, AT_LEN);
  const passed = dir>0 ? st.racers.map((o,i)=>i).filter(i=>i!==ri && !st.racers[i].place && st.racers[i].pos>start && st.racers[i].pos<r.pos) : [];
  if(frog && skipped) atTrigger(st, ctx, ri, atLabel(r.a)+' saute par-dessus '+atPlural(skipped,'case')+' occupée'+(skipped>1?'s':'')+' !');
  if(r.pos>=AT_LEN){ atFinish(st, ri); return; }
  r.arr=++st.mseq;
  atAfterStop(st, ctx, ri, passed);
}

function atFinish(st, ri){
  const r=st.racers[ri];
  const place=st.racers.filter(o=>o.place).length+1;
  r.place=place; r.trip=false;
  atLog(st, (place===1?'🥇 ':'🥈 ')+atWho(r)+' franchit la ligne d\'arrivée en '+atPlace(place)+' position !', true);
}

function atAfterStop(st, ctx, ri, passed){
  const r=st.racers[ri], stopPos=r.pos;
  // 1. Cases spéciales de la piste Galère (étoile, OUPS !) — la flèche se joue après les pouvoirs
  const cell = atIsWild(st) ? AT_WILD[r.pos] : null;
  if(cell && cell.t==='star'){
    const p=st.players[r.p]; if(p){ p.stars+=AT_STAR_PTS; p.pts+=AT_STAR_PTS; }
    atLog(st, '⭐ '+atWho(r)+' s\'arrête sur une étoile : +'+AT_STAR_PTS+' point de bronze.');
  }
  if(cell && cell.t==='oups'){ atTrip(st, ri); atLog(st, '💥 OUPS ! '+atWho(r)+' trébuche.'); }
  // 2. Pouvoirs, dans l'ordre : joueur actif, puis les autres
  atReactOrder(st).forEach(ci=>{
    const c=st.racers[ci];
    if(c.place || r.place) return;
    // Gaston la Glissade : tout athlète qui le dépasse trébuche
    if(c.a==='glissant' && passed.includes(ci)){
      atTrip(st, ri);
      atTrigger(st, ctx, ci, '🍌 '+atWho(r)+' dépasse '+atDef(c.a).nom+' et glisse : il trébuche !');
    }
    // La Lavandière (arrêt) : qui s'arrête sur sa case trébuche ; si c'est elle qui s'arrête, ceux de la case trébuchent
    if(c.a==='lavandiere' && ci!==ri && c.pos===r.pos){
      atTrip(st, ri);
      atTrigger(st, ctx, ci, '🧺 '+atWho(r)+' s\'arrête chez '+atDef(c.a).nom+' et trébuche dans son linge !');
    }
    if(c.a==='lavandiere' && ci===ri){
      const hit=st.racers.map((o,i)=>i).filter(i=>i!==ri && !st.racers[i].place && st.racers[i].pos===r.pos);
      if(hit.length){
        hit.forEach(i=>atTrip(st, i));
        atTrigger(st, ctx, ci, '🧺 '+atDef(c.a).nom+' débarque : '+hit.map(i=>st.racers[i].p).join(', ')+' trébuche'+(hit.length>1?'nt':'')+' !');
      }
    }
  });
  // 3. Flèche (déplacement distinct), si l'athlète est toujours sur la case
  if(cell && cell.t==='arrow' && !r.place && r.pos===stopPos){
    atLog(st, (cell.n>0?'⏩ ':'⏪ ')+atWho(r)+' prend la flèche : '+(cell.n>0?'+':'')+cell.n+' cases.');
    ctx.n=(ctx.n||0)+1;
    if(ctx.n<=60) atMove(st, ctx, ri, cell.n);
  }
}

// Déplacement principal : bonus et malus des pouvoirs, puis déplacement
function atMainMove(st, ctx, ri, base, label){
  const r=st.racers[ri];
  let amount=base;
  const mods=[];
  if(r.a==='lievre'){ amount+=2; mods.push('+2 du Lièvre'); }
  const teachers=st.racers.filter(o=>!o.place && o.a==='maitre' && o.pos===r.pos);
  if(teachers.length){ amount+=teachers.length; mods.push('+'+teachers.length+' du Maître d\'école'); }
  const mud=st.racers.filter((o,i)=>i!==ri && !o.place && o.a==='gadoue');
  if(mud.length){ amount-=mud.length; mods.push('−'+mud.length+' de Mère Gadoue'); }
  amount=Math.max(0, amount);
  atLog(st, atWho(r)+' '+label+(mods.length?' ('+mods.join(', ')+')':'')+' : '+atPlural(amount,'case')+'.');
  // Les bonus / malus sont des pouvoirs qui se déclenchent (la Commère réagit)
  if(r.a==='lievre') atTrigger(st, ctx, ri, '🐇 Le Lièvre file à toute allure.');
  teachers.forEach(t=>atTrigger(st, ctx, st.racers.indexOf(t), '📏 Le Maître d\'école encourage '+r.p+'.'));
  mud.forEach(m=>atTrigger(st, ctx, st.racers.indexOf(m), '🟤 Mère Gadoue englue '+r.p+'.'));
  atMove(st, ctx, ri, amount);
}

// Le joueur actif joue : mode 'roll' (lancer le dé) ou 'five' (Facteur : avance de 5)
function atPlay(st, mode){
  const ri=st.turn, r=atActive(st);
  if(!r) return 'Personne ne doit jouer.';
  const ctx={ n:0 };
  if(mode==='five'){
    if(r.a!=='facteur') return 'Ton athlète ne peut pas faire ça.';
    atTrigger(st, ctx, ri, '📯 Le Facteur ne lance pas le dé : il fait sa tournée.');
    atMainMove(st, ctx, ri, 5, 'avance de 5');
    return atEndTurn(st);
  }
  const d=atDie();
  atLog(st, '🎲 '+r.p+' lance le dé : '+d+'.');
  // La Chenille : sur un 1, le lanceur ne bouge pas et la Chenille avance d'1
  if(d===1){
    const worms=atReactOrder(st).filter(i=>i!==ri && !st.racers[i].place && st.racers[i].a==='chenille');
    if(worms.length){
      worms.forEach(i=>{ atTrigger(st, ctx, i, '🐛 La Chenille profite du 1 : '+r.p+' ne bouge pas.'); atMove(st, ctx, i, 1); });
      return atEndTurn(st);
    }
  }
  // Le Valet : sur un 6, il avance de 2 avant le lanceur
  if(d===6){
    atReactOrder(st).filter(i=>i!==ri && !st.racers[i].place && st.racers[i].a==='valet').forEach(i=>{
      atTrigger(st, ctx, i, '🥾 Un 6 ! Le Valet de ferme s\'élance en premier.'); atMove(st, ctx, i, 2);
    });
    if(st.racers.filter(x=>x.place).length>=2) return atEndTurn(st);
  }
  // L'Inventeur choisit s'il double (son minuteur repart)
  if(r.a==='inventeur'){
    st.pend={ d, ctx:ctx.n };
    st.deadline=atNow()+AT_TURN_SECS*1000;
    return;
  }
  atMainMove(st, ctx, ri, d, 'avance de '+d);
  return atEndTurn(st);
}

// Réponse de l'Inventeur : double (true) ou non
function atInventor(st, double){
  const ri=st.turn, r=atActive(st);
  if(!r || !st.pend) return 'Rien à choisir.';
  const d=st.pend.d, ctx={ n:st.pend.ctx||0 };
  st.pend=null;
  if(double){
    atTrigger(st, ctx, ri, '🚀 L\'Inventeur allume sa fusée : déplacement doublé !');
    atMainMove(st, ctx, ri, d*2, 'avance de '+(d*2));
    if(!r.place){ atTrip(st, ri); atLog(st, '🚀 La fusée s\'écrase : '+atWho(r)+' trébuche.'); }
  } else atMainMove(st, ctx, ri, d, 'avance de '+d);
  return atEndTurn(st);
}

// Fin du tour : course terminée (2 arrivés) ou joueur suivant
function atEndTurn(st){
  if(st.phase!=='race') return;
  st.pend=null;
  if(st.racers.filter(r=>r.place).length>=2) return atEndRace(st);
  atNextTurn(st, (st.turn+1)%st.racers.length);
}

// Donne la main à l'athlète idx (ou au suivant encore en course), en jouant les effets
// de début de tour : se relever, la sieste du Lièvre, le bonus du Ravi.
function atNextTurn(st, idx){
  const n=st.racers.length;
  for(let guard=0; guard<n*4; guard++){
    const ri=idx%n, r=st.racers[ri];
    idx=ri+1;
    if(r.place) continue;
    st.turn=ri;
    const ctx={ n:0 };
    if(r.trip){
      r.trip=false;
      atLog(st, '🤕 '+atWho(r)+' se relève (pas de déplacement ce tour).');
      continue;
    }
    if(r.a==='ravi' && atAloneLast(st, ri)){
      const p=st.players[r.p]; if(p){ p.pts+=1; p.bronze+=1; }
      atTrigger(st, ctx, ri, '🙌 Le Ravi est bon dernier et ravi de l\'être : +1 point de bronze pour '+r.p+'.');
      if(st.phase!=='race') return;
      if(st.racers.filter(x=>x.place).length>=2) return atEndRace(st);
    }
    if(r.a==='lievre' && atAloneFirst(st, ri)){
      atTrigger(st, ctx, ri, '💤 Le Lièvre est seul en tête : il fait la sieste.');
      if(st.phase!=='race') return;
      if(st.racers.filter(x=>x.place).length>=2) return atEndRace(st);
      continue;
    }
    if(r.place) continue;
    st.pend=null;
    st.deadline=atNow()+AT_TURN_SECS*1000;
    return;
  }
  // Garde-fou : ne devrait jamais arriver
  st.deadline=atNow()+AT_TURN_SECS*1000;
}

// Fin de course : or, argent, bronze (le plus avancé des autres ;
// à égalité, celui qui est arrivé le premier sur sa case)
function atEndRace(st){
  const i=(st.race||1)-1;
  const by=pl=>st.racers.find(r=>r.place===pl);
  const gold=by(1), silver=by(2);
  const rest=atRacing(st).slice().sort((a,b)=>(b.pos-a.pos) || (a.arr-b.arr));
  const bronze=rest[0] || null;
  const give=(r, medal, pts)=>{ if(!r) return; const p=st.players[r.p]; if(!p) return; p.pts+=pts; p[medal]+=1; };
  give(gold,'gold',AT_GOLD[i]); give(silver,'silver',AT_SILVER[i]); give(bronze,'bronze',AT_BRONZE[i]);
  const name=r=>r ? { p:r.p, a:r.a } : null;
  st.results.push({ race:st.race, track:AT_TRACKS[i], gold:name(gold), silver:name(silver), bronze:name(bronze) });
  // Le dernier commencera la course suivante
  const last=rest.length ? rest[rest.length-1] : null;
  st.nextFirst = last ? last.p : null;
  atLog(st, '🏁 Fin de la course '+st.race+' ! 🥇 '+(gold?gold.p:'—')+' (+'+AT_GOLD[i]+') · 🥈 '+(silver?silver.p:'—')+' (+'+AT_SILVER[i]+') · 🥉 '+(bronze?bronze.p:'—')+' (+'+AT_BRONZE[i]+')', true);
  st.pend=null;
  st.phase='podium';
  st.deadline=atNow()+AT_PODIUM_SECS*1000;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DRAFT ET CHOIX DE L'ATHLÈTE
// ═══════════════════════════════════════════════════════════════════════════
function atStartDraftRound(st){
  st.draftRound=(st.draftRound||0)+1;
  const ps=st.order.map(p=>st.players[p]).filter(Boolean);
  if(AT_ALLOW_DUP){
    ps.forEach(p=>{ p.offer=atShuffle(AT_KEYS.filter(k=>!p.hand.includes(k))).slice(0, AT_OFFER); });
  } else {
    const taken=[].concat(...ps.map(p=>p.hand));
    const pool=atShuffle(AT_KEYS.filter(k=>!taken.includes(k)));
    const k=Math.max(1, Math.min(AT_OFFER, Math.floor(pool.length/ps.length)));
    ps.forEach(p=>{ p.offer=pool.splice(0, k); });
  }
  st.deadline=atNow()+AT_DRAFT_SECS*1000;
  atLog(st, '📜 Recrutement, tour '+st.draftRound+'/'+AT_TEAM+' : chacun garde 1 athlète parmi ceux proposés.');
}
function atDraftPick(st, pseudo, key, auto){
  const p=st.players[pseudo]; if(!p || !p.offer.length) return 'silent';
  const k=(key && p.offer.includes(key)) ? key : p.offer[Math.floor(Math.random()*p.offer.length)];
  p.hand.push(k); p.offer=[];
  if(auto) atLog(st, '⏱️ '+pseudo+' n\'a pas choisi à temps : un athlète lui est attribué au hasard.');
  if(st.order.every(ps=>!st.players[ps] || !st.players[ps].offer.length)){
    if(st.draftRound>=AT_TEAM) atStartChoose(st, true);
    else atStartDraftRound(st);
  }
}

// Choix secret de l'athlète de la course (automatique quand il n'en reste qu'un)
function atStartChoose(st, first){
  if(!first) st.race=(st.race||0)+1;
  else st.race=1;
  st.racers=[]; st.pend=null;
  Object.values(st.players).forEach(p=>{ p.chosen=null; });
  const left=p=>p.hand.filter(k=>!p.used.includes(k));
  st.phase='choose';
  if(st.order.every(ps=>left(st.players[ps]).length<=1)){
    st.order.forEach(ps=>{ const p=st.players[ps]; p.chosen=left(p)[0]||null; });
    return atStartRace(st);
  }
  st.deadline=atNow()+AT_CHOOSE_SECS*1000;
  atLog(st, '🤫 Course '+st.race+' ('+AT_TRACK_NAME[AT_TRACKS[st.race-1]]+') : choisissez en secret votre athlète.', true);
}
function atChoose(st, pseudo, key, auto){
  const p=st.players[pseudo]; if(!p || p.chosen) return 'silent';
  const left=p.hand.filter(k=>!p.used.includes(k));
  if(!left.length) return 'silent';
  p.chosen=(key && left.includes(key)) ? key : left[Math.floor(Math.random()*left.length)];
  if(auto) atLog(st, '⏱️ '+pseudo+' n\'a pas choisi à temps : son athlète est tiré au hasard.');
  if(st.order.every(ps=>!st.players[ps] || st.players[ps].chosen)) atStartRace(st);
}

function atStartRace(st){
  st.phase='race';
  st.racers=st.order.map(ps=>{ const p=st.players[ps]; p.used.push(p.chosen); return { p:ps, a:p.chosen, pos:0, trip:false, place:0, arr:0 }; });
  st.mseq=0; st.pend=null;
  atLog(st, '📣 Course '+st.race+' — piste '+AT_TRACK_NAME[AT_TRACKS[st.race-1]]+' ! Sur la ligne de départ : '+st.racers.map(r=>atDef(r.a).ico+' '+r.p).join(', ')+'.', true);
  // Qui commence : au hasard pour la 1re course, puis le dernier de la course précédente
  let first=Math.floor(Math.random()*st.racers.length);
  if(st.race>1 && st.nextFirst){ const i=st.racers.findIndex(r=>r.p===st.nextFirst); if(i>=0) first=i; }
  atLog(st, '▶️ '+st.racers[first].p+' commence.');
  atNextTurn(st, first);
}

function atNextRace(st){
  if(st.race>=AT_TEAM) return atEndGame(st);
  atStartChoose(st, false);
}

function atEndGame(st){
  st.phase='end';
  st.racers=[]; st.pend=null;
  st.points=Object.values(st.players).reduce((s,p)=>s+(p.pts||0),0);
  st.endAt=atNow();
  const best=Math.max(0, ...Object.values(st.players).map(p=>p.pts||0));
  const win=st.order.filter(ps=>(st.players[ps].pts||0)===best);
  atLog(st, '🏆 Fin de la compétition ! '+(win.length>1?'Victoire partagée : ':'Victoire de ')+win.join(', ')+' avec '+atPlural(best,'point')+'. 🔥 '+st.points+' points pour le feu.', true);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIONS DES JOUEURS
// ═══════════════════════════════════════════════════════════════════════════
function athletesJoin(pseudo){
  atTx(st=>{
    if(st.phase!=='lobby') return 'La compétition a déjà commencé.';
    if(!st.players[pseudo] && Object.keys(st.players).length>=AT_MAX_PLAYERS) return AT_MAX_PLAYERS+' joueurs maximum.';
    if(!st.players[pseudo]) st.players[pseudo]={ pseudo, at:atNow(), hand:[], used:[], offer:[], chosen:null, pts:0, gold:0, silver:0, bronze:0, stars:0 };
    st.lastEvent=atPlural(Object.keys(st.players).length,'athlète')+' inscrit'+(Object.keys(st.players).length>1?'s':'')+'.';
  });
}
function athletesLeave(pseudo){
  atTx(st=>{
    if(st.phase!=='lobby') return 'silent';
    delete st.players[pseudo];
    st.lastEvent=atPlural(Object.keys(st.players).length,'athlète')+' inscrit'+(Object.keys(st.players).length>1?'s':'')+'.';
  });
}
function athletesDraft(pseudo, key){
  atTx(st=>{
    if(st.phase!=='draft') return 'silent';
    return atDraftPick(st, pseudo, key, false);
  });
}
function athletesChoose(pseudo, key){
  atTx(st=>{
    if(st.phase!=='choose') return 'silent';
    return atChoose(st, pseudo, key, false);
  });
}
function athletesRoll(pseudo, mode){
  atTx(st=>{
    if(st.phase!=='race') return 'La course n\'est pas en cours.';
    const r=atActive(st);
    if(!r || r.p!==pseudo) return 'Ce n\'est pas ton tour.';
    if(st.pend) return 'Choisis d\'abord si tu doubles.';
    return atPlay(st, mode==='five' ? 'five' : 'roll');
  });
}
function athletesInventor(pseudo, double){
  atTx(st=>{
    if(st.phase!=='race') return 'silent';
    const r=atActive(st);
    if(!r || r.p!==pseudo || !st.pend) return 'silent';
    return atInventor(st, !!double);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MENEUR : lobby, lancement, secours, clôture
// ═══════════════════════════════════════════════════════════════════════════
function startAthletes(){
  fbSetAthletes({ active:true, phase:'lobby', players:{}, order:[], racers:[], results:[], history:[], race:0, seq:0,
    lastEvent:'Les inscriptions sont ouvertes : rejoignez la compétition !' });
  toast('Inscriptions des Athlètes du Village ouvertes !');
}
function athletesLaunch(){
  atTx(st=>{
    if(st.phase!=='lobby') return 'silent';
    const order=Object.values(st.players).sort((a,b)=>(a.at||0)-(b.at||0)).map(p=>p.pseudo);
    if(order.length<AT_MIN_PLAYERS) return 'Il faut au moins '+AT_MIN_PLAYERS+' joueurs.';
    st.order=order; st.history=[]; st.seq=0; st.results=[]; st.race=0; st.draftRound=0; st.startedAt=atNow();
    order.forEach(ps=>Object.assign(st.players[ps], { hand:[], used:[], offer:[], chosen:null, pts:0, gold:0, silver:0, bronze:0, stars:0 }));
    st.phase='draft';
    atLog(st, '🏟️ La compétition commence avec '+atPlural(order.length,'joueur')+' ! D\'abord, recrutez votre équipe de '+AT_TEAM+' athlètes.', true);
    atStartDraftRound(st);
  }).then(r=>{ if(r && r.committed) toast('Compétition lancée !'); });
}
// Secours : le meneur joue à la place de qui traîne (même effet que la fin du minuteur)
function athletesForce(){
  atTx(st=>atAuto(st, null));
}
function athletesNextRace(){
  atTx(st=>{ if(st.phase!=='podium') return 'silent'; atNextRace(st); });
}
function athletesEndToFire(){
  if(!athletes || athletes.phase!=='end') return;
  const pts=athletes.points||0;
  if(!confirm('Ajouter '+pts+' points au feu de camp et clôturer la compétition ?')) return;
  fbSetFire(Object.assign({}, fire, { points:(fire.points||0)+pts }));
  const sc={}; Object.values(athletes.players||{}).forEach(p=>{ sc[p.pseudo]=p.pts||0; });
  const best=Math.max(0, ...Object.values(sc));
  const win=Object.keys(sc).filter(ps=>sc[ps]===best);
  if(typeof lbRecord==='function') lbRecord('athletes', { fire:pts, label:win.join(', ')+' · '+best+' pts', pseudos:Object.keys(athletes.players||{}), scores:sc, startedAt:athletes.startedAt });
  fbSetAthletes(null);
  toast('🔥 +'+pts+' points au feu ! Compétition clôturée.');
}
function athletesCancel(){
  if(!confirm('Clôturer la compétition des Athlètes du Village ?')) return;
  fbSetAthletes(null);
  toast('Compétition clôturée.');
}

// Fin de minuteur : ce qui se passe à la place du joueur qui n'a pas joué.
// stamp = deadline attendue (null : forcé par le meneur)
function atAuto(st, stamp){
  if(stamp!==null && (st.deadline!==stamp || atNow()<st.deadline)) return 'silent';
  if(st.phase==='draft'){
    st.order.filter(ps=>st.players[ps] && st.players[ps].offer.length).forEach(ps=>{ if(st.phase==='draft') atDraftPick(st, ps, null, true); });
    return;
  }
  if(st.phase==='choose'){
    st.order.filter(ps=>st.players[ps] && !st.players[ps].chosen).forEach(ps=>{ if(st.phase==='choose') atChoose(st, ps, null, true); });
    return;
  }
  if(st.phase==='race'){
    const r=atActive(st); if(!r) return 'silent';
    atLog(st, '⏱️ Temps écoulé pour '+r.p+' : le dé est lancé pour lui.');
    if(st.pend) return atInventor(st, false);
    return atPlay(st, 'roll');
  }
  if(st.phase==='podium'){ atNextRace(st); return; }
  return 'silent';
}

// ── Horloge (chaque seconde) : temps restant + fins de minuteur ──
let atTickFired={};
function atFmt(ms){ const s=Math.max(0, Math.ceil(ms/1000)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function atTick(){
  if(typeof document==='undefined' || !document.querySelectorAll) return;
  document.querySelectorAll('[data-at-until]').forEach(el=>{
    const left=parseInt(el.getAttribute('data-at-until'),10)-atNow();
    el.textContent=atFmt(left);
    el.classList.toggle('is-urgent', left<=5000);
  });
  if(!athletes || !athletes.active || !['draft','choose','race','podium'].includes(athletes.phase)) return;
  // Seuls les écrans « actifs » (meneur ou joueur connecté) déclenchent les fins automatiques
  if(!currentViewerPseudo && !(document.getElementById('page-admin')||{}).classList?.contains('active')) return;
  const st=athletes;
  if(st.deadline && atNow()>st.deadline+800){
    const key=st.phase+'_'+st.deadline;
    if(!atTickFired[key]){
      atTickFired[key]=true;
      const stamp=st.deadline;
      atTx(s=>atAuto(s, stamp));
    }
  }
}
if (typeof setInterval!=='undefined' && typeof document!=='undefined') setInterval(atTick, 1000);

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU
// ═══════════════════════════════════════════════════════════════════════════
function atTimerSpan(until){ return '<span class="av-timer" data-at-until="'+until+'">'+atFmt(until-atNow())+'</span>'; }
function atSeat(st, pseudo){ return Math.max(0, st.order.indexOf(pseudo)); }
function atChip(st, r, me){
  const d=atDef(r.a), act=st.phase==='race' && atActive(st)===r;
  return '<span class="at-chip'+(r.trip?' is-trip':'')+(act?' is-turn':'')+(r.p===me?' is-me':'')+'" style="--chip:var(--runner-'+(atSeat(st,r.p)+1)+')" title="'+escHtml(r.p+' — '+d.nom+(r.trip?' (a trébuché)':''))+'">'+d.ico+'</span>';
}

function atStatusPills(st){
  const z=[];
  if(st.race) z.push('<div class="dpill">Course <strong>'+st.race+'/'+AT_TEAM+'</strong></div>');
  if(st.race) z.push('<div class="dpill">Piste <strong>'+AT_TRACK_NAME[AT_TRACKS[st.race-1]]+'</strong></div>');
  if(st.phase==='draft') z.push('<div class="dpill">Recrutement <strong>'+st.draftRound+'/'+AT_TEAM+'</strong></div>');
  if(st.phase==='race'){ const r=atActive(st); if(r) z.push('<div class="dpill">Au tour de <strong>'+escHtml(r.p)+'</strong></div>'); }
  if(['draft','choose','race','podium'].includes(st.phase) && st.deadline) z.push('<div class="dpill av-timer-pill">⏱ <strong>'+atTimerSpan(st.deadline)+'</strong></div>');
  return z.join('');
}

// Piste en serpentin : 31 cases (0 = départ, 30 = arrivée), 8 par rangée
const AT_COLS = 8;
function atTrackHtml(st, me){
  const wild=atIsWild(st);
  let h='<div class="at-track'+(wild?' is-wild':'')+'">';
  for(let i=0;i<=AT_LEN;i++){
    const row=Math.floor(i/AT_COLS), c=i%AT_COLS, col=(row%2===0) ? c : (AT_COLS-1-c);
    const cell=wild ? AT_WILD[i] : null;
    let fx='';
    if(cell && cell.t==='star') fx='<span class="at-fx">⭐</span>';
    else if(cell && cell.t==='oups') fx='<span class="at-fx">💥</span>';
    else if(cell && cell.t==='arrow') fx='<span class="at-fx">'+(cell.n>0?'⏩+':'⏪')+cell.n+'</span>';
    const lab=i===0?'🚩<span class="at-lab"> Départ</span>':(i===AT_LEN?'🏁<span class="at-lab"> Arrivée</span>':String(i));
    const here=st.racers.filter(r=>!r.place && r.pos===i);
    const done=i===AT_LEN ? st.racers.filter(r=>r.place).sort((a,b)=>a.place-b.place) : [];
    h+='<div class="at-cell'+(i===0?' is-start':'')+(i===AT_LEN?' is-finish':'')+(cell?' is-'+cell.t:'')+'" style="grid-row:'+(row+1)+';grid-column:'+(col+1)+'">'+
      '<span class="at-num">'+lab+'</span>'+fx+'<span class="at-chips">'+here.concat(done).map(r=>atChip(st,r,me)).join('')+'</span></div>';
  }
  return h+'</div>';
}

function atCard(k, onclick, sub){
  const d=atDef(k);
  return '<button class="pick-card"'+(onclick?' onclick="'+onclick+'"':' disabled')+'><span class="pick-card-ico">'+d.ico+'</span><span class="pick-card-name">'+escHtml(d.nom)+'</span>'+
    (sub?'<span class="pick-card-slot">'+escHtml(sub)+'</span>':'')+'<span class="pick-card-fx">'+escHtml(d.txt)+'</span></button>';
}

function atTeamHtml(st, p){
  if(!p || !p.hand.length) return '';
  return '<div class="section-title u-mt-md">Mon équipe</div><div class="at-team">'+p.hand.map(k=>{
    const used=p.used.includes(k), d=atDef(k);
    return '<div class="at-team-item'+(used?' is-used':'')+'" title="'+escHtml(d.txt)+'"><span class="at-team-ico">'+d.ico+'</span><span class="at-team-name">'+escHtml(d.nom)+'</span><span class="at-team-sub">'+(used?'a couru':'disponible')+'</span></div>';
  }).join('')+'</div>';
}

function atMedals(p){
  const z=[];
  if(p.gold) z.push('🥇'+(p.gold>1?'×'+p.gold:''));
  if(p.silver) z.push('🥈'+(p.silver>1?'×'+p.silver:''));
  if(p.bronze) z.push('🥉'+(p.bronze>1?'×'+p.bronze:''));
  if(p.stars) z.push('⭐'+(p.stars>1?'×'+p.stars:''));
  return z.join(' ');
}

function atPlayersHtml(st, me){
  const list=st.order.length ? st.order : Object.values(st.players).sort((a,b)=>(a.at||0)-(b.at||0)).map(p=>p.pseudo);
  return list.map(ps=>{
    const p=st.players[ps]; if(!p) return '';
    const r=atRacerOf(st, ps);
    let status='', out=false, info='';
    if(st.phase==='lobby') status='inscrit';
    else if(st.phase==='draft'){ status=p.offer.length?'recrute…':'prêt'; out=!p.offer.length; }
    else if(st.phase==='choose'){ status=p.chosen?'prêt':'choisit…'; out=!!p.chosen; }
    else if(st.phase==='race' && r){
      info='<span class="player-info">'+atDef(r.a).ico+' case '+Math.min(r.pos,AT_LEN)+'</span>';
      if(r.place){ status=atPlace(r.place); out=true; }
      else if(atActive(st)===r) status='son tour';
      else if(r.trip) status='a trébuché';
    }
    else if(st.phase==='podium' || st.phase==='end') status=atPlural(p.pts,'pt');
    const pts=st.phase==='lobby' ? '' : '<span class="player-info">'+atPlural(p.pts,'pt')+'</span>';
    const med=atMedals(p);
    return '<div class="player-row'+(ps===me?' is-current':'')+(out?' is-out':'')+'">'+
      '<span class="at-dot" style="background:var(--runner-'+(atSeat(st,ps)+1)+')"></span>'+
      '<span class="player-name">'+escHtml(ps)+'</span>'+
      '<span class="player-infos">'+info+pts+(med?'<span class="player-info">'+med+'</span>':'')+'</span>'+
      (status?'<span class="player-status">'+escHtml(status)+'</span>':'')+'</div>';
  }).join('');
}

function atPodiumHtml(res){
  if(!res) return '';
  const line=(ico, m, pts)=>m ? '<div class="stat-row"><span>'+ico+' '+escHtml(m.p)+' <span class="action-row-sub">'+escHtml(atLabel(m.a))+'</span></span><strong>+'+pts+'</strong></div>' : '';
  const i=res.race-1;
  return '<div class="at-podium"><h3 class="rules-title">🏁 Course '+res.race+' — piste '+AT_TRACK_NAME[res.track]+'</h3>'+
    line('🥇',res.gold,AT_GOLD[i])+line('🥈',res.silver,AT_SILVER[i])+line('🥉',res.bronze,AT_BRONZE[i])+'</div>';
}

function atRankingHtml(st){
  const rows=st.order.map(ps=>st.players[ps]).filter(Boolean).sort((a,b)=>b.pts-a.pts || b.gold-a.gold || b.silver-a.silver);
  const best=rows.length ? rows[0].pts : 0;
  return '<div class="at-podium"><h3 class="rules-title">🏆 Classement final</h3>'+rows.map((p,i)=>
    '<div class="stat-row"><span>'+(p.pts===best?'👑 ':(i+1)+'. ')+escHtml(p.pseudo)+' <span class="action-row-sub">'+atMedals(p)+'</span></span><strong>'+atPlural(p.pts,'pt')+'</strong></div>').join('')+
    '<div class="stat-row"><span>🔥 Points pour le feu</span><strong>'+(st.points||0)+'</strong></div>'+
    '<div class="action-row-sub">Somme des points de tous les joueurs. Le meneur les ajoute au feu.</div></div>';
}

// Dernière action (bandeau de la carte Joueurs) : file d'attente côté navigateur
const AT_TOAST_MS = 1800, AT_TOAST_EPIC_MS = 3600;
let atToastSeen=null, atToastQueue=[], atToastBusy=false, atToastGame=null;
function atFeedToast(st){
  const hist=st.history||[];
  const gameId=st.startedAt || 'lobby';
  if(atToastGame!==gameId){ atToastGame=gameId; atToastSeen=null; atToastQueue=[]; }
  const last=hist[hist.length-1];
  if(atToastSeen===null){
    atToastSeen = last ? last.n : 0;
    atShowToast(last ? last : { msg:st.lastEvent||'' }, false);
    return;
  }
  hist.filter(e=>e.n>atToastSeen).forEach(e=>atToastQueue.push(e));
  if(last) atToastSeen=Math.max(atToastSeen, last.n);
  atPumpToast();
}
function atShowToast(e, animate){
  const el=document.getElementById('at-toast'); if(!el) return;
  el.className='av-toast'+(e.epic?' is-epic':'')+(animate?' is-enter':'')+(e.msg?'':' is-empty');
  el.textContent=e.msg||'';
}
function atPumpToast(){
  if(atToastBusy || !atToastQueue.length) return;
  // Les réactions en chaîne s'affichent une par une ; au-delà de 6 en attente, on garde les dernières
  if(atToastQueue.length>6){
    const epic=atToastQueue.filter(e=>e.epic), rest=atToastQueue.filter(e=>!e.epic);
    atToastQueue=epic.concat(rest.slice(-Math.max(1, 6-epic.length))).sort((a,b)=>a.n-b.n);
  }
  const e=atToastQueue.shift();
  atToastBusy=true;
  atShowToast(e, true);
  setTimeout(()=>{ atToastBusy=false; atPumpToast(); }, e.epic?AT_TOAST_EPIC_MS:AT_TOAST_MS);
}

// ── VUE JOUEUR ──
function renderAthletesViewer(pseudo){
  const wrap=document.getElementById('viewer-athletes'); if(!wrap) return;
  if(!athletes || !athletes.active){ wrap.style.display='none'; atToastSeen=null; return; }
  wrap.style.display='block';
  const idle=document.getElementById('viewer-idle'); if(idle) idle.style.display='none';
  const st=athletes, esc=escAttr(pseudo), me=st.players[pseudo];
  const inGame=!!(me && st.order.includes(pseudo));

  atSet('at-status', atStatusPills(st));
  atSet('at-players', atPlayersHtml(st, pseudo) || '<div class="t-warm-sm">Personne ne s\'est encore inscrit.</div>');
  if(st.phase==='lobby') atShowToast({ msg:st.lastEvent||'' }, false);
  else atFeedToast(st);

  let ins='', main='', track='', cta='';
  if(st.phase==='lobby'){
    const n=Object.keys(st.players).length;
    main = me
      ? '<div class="diamant-voted">✓ Tu es inscrit ('+atPlural(n,'joueur')+'). En attente du départ donné par le meneur…</div><button class="btn-secondary u-full" onclick="athletesLeave(\''+esc+'\')">Me désinscrire</button>'
      : '<div class="diamant-voted">🏟️ La compétition du village va commencer ! Inscris-toi avant le départ ('+AT_MIN_PLAYERS+' à '+AT_MAX_PLAYERS+' joueurs).</div><button class="btn-primary-continue u-full" onclick="athletesJoin(\''+esc+'\')"'+(n>=AT_MAX_PLAYERS?' disabled':'')+'>Rejoindre la compétition</button>';
  }
  else if(!inGame && st.phase!=='end'){
    main='<div class="diamant-voted">👀 Une compétition est en cours. Tu joueras à la prochaine !</div>';
    if(st.phase==='race') track=atTrackHtml(st, null);
    if(st.phase==='podium') main+=atPodiumHtml(st.results[st.results.length-1]);
  }
  else if(st.phase==='draft'){
    if(me.offer.length){
      ins='📜 <strong>Recrutement '+st.draftRound+'/'+AT_TEAM+'</strong> — garde 1 athlète pour ton équipe.';
      main='<div class="pick-grid">'+me.offer.map(k=>atCard(k, 'athletesDraft(\''+esc+'\',\''+k+'\')')).join('')+'</div>';
    } else {
      const w=st.order.filter(ps=>st.players[ps].offer.length).length;
      ins='✓ Athlète recruté. En attente de '+atPlural(w,'joueur')+'…';
    }
  }
  else if(st.phase==='choose'){
    const left=me.hand.filter(k=>!me.used.includes(k));
    if(!me.chosen){
      ins='🤫 <strong>Course '+st.race+' — piste '+AT_TRACK_NAME[AT_TRACKS[st.race-1]]+'</strong> — choisis en secret ton athlète. Chacun ne court qu\'une fois !';
      main='<div class="pick-grid">'+left.map(k=>atCard(k, 'athletesChoose(\''+esc+'\',\''+k+'\')')).join('')+'</div>';
    } else {
      const w=st.order.filter(ps=>!st.players[ps].chosen).length;
      ins='✓ Tu as choisi '+escHtml(atLabel(me.chosen))+' (les autres ne le voient pas). En attente de '+atPlural(w,'joueur')+'…';
    }
  }
  else if(st.phase==='race'){
    const r=atActive(st), mine=atRacerOf(st, pseudo);
    track=atTrackHtml(st, pseudo);
    if(mine && mine.place) ins='🏅 Ton athlète a terminé '+atPlace(mine.place)+' ! Attends la fin de la course.';
    else if(r && r.p===pseudo){
      if(st.pend){
        ins='🚀 <strong>Tu as fait '+st.pend.d+'.</strong> Doubler ton déplacement ? (tu trébucheras ensuite)';
        cta='<div class="at-cta">'+
          '<button class="btn-primary-continue" onclick="athletesInventor(\''+esc+'\',true)">Doubler : '+(st.pend.d*2)+' cases</button>'+
          '<button class="btn-primary" onclick="athletesInventor(\''+esc+'\',false)">Avancer de '+st.pend.d+'</button></div>';
      } else {
        ins='🎲 <strong>À toi de jouer</strong> avec '+escHtml(atLabel(r.a))+' !';
        cta='<div class="at-cta">'+
          '<button class="btn-primary-continue" onclick="athletesRoll(\''+esc+'\',\'roll\')">🎲 Lancer le dé</button>'+
          (r.a==='facteur' ? '<button class="btn-primary" onclick="athletesRoll(\''+esc+'\',\'five\')">📯 Avancer de 5</button>' : '')+'</div>';
      }
    }
    else if(r) ins='⏳ Au tour de <strong>'+escHtml(r.p)+'</strong> ('+escHtml(atLabel(r.a))+').';
    if(mine) cta+='<div class="action-row-sub u-mt-sm">Ton athlète : '+escHtml(atLabel(mine.a))+' — '+escHtml(atDef(mine.a).txt)+'</div>';
  }
  else if(st.phase==='podium'){
    ins=st.race>=AT_TEAM ? 'Dernière course terminée ! Classement dans quelques secondes…' : 'Course suivante dans quelques secondes…';
    main=atPodiumHtml(st.results[st.results.length-1]);
  }
  else if(st.phase==='end') main=atRankingHtml(st);

  atSet('at-instruction', ins);
  atSet('at-main', main);
  atSet('at-track', track);
  atSet('at-cta', cta);
  atSet('at-team', inGame && st.phase!=='lobby' ? atTeamHtml(st, me) : '');
  atRefreshModal();
}

// ── VUE MENEUR (sans emoji) ──
function renderAthletesAdmin(){
  const panel=document.getElementById('athletes-panel'); if(!panel) return;
  if(!athletes || !athletes.active){ panel.style.display='none'; renderGameLibrary(); return; }
  panel.style.display='block';
  const st=athletes, nP=Object.keys(st.players).length;
  let status, players, ctrl;
  if(st.phase==='lobby'){
    status='<div class="dpill">Inscriptions ouvertes</div><div class="dpill">Joueurs <strong>'+nP+'/'+AT_MAX_PLAYERS+'</strong></div>';
    players=Object.values(st.players).sort((a,b)=>(a.at||0)-(b.at||0)).map(p=>'<div class="player-row"><span class="player-name">'+escHtml(p.pseudo)+'</span></div>').join('');
    ctrl='<div class="diamant-voted">'+nP+' joueur(s). Il en faut entre '+AT_MIN_PLAYERS+' et '+AT_MAX_PLAYERS+'.</div>'+
      '<button class="btn-primary u-mt-sm" onclick="athletesLaunch()"'+(nP>=AT_MIN_PLAYERS?'':' disabled')+'>Lancer la compétition'+(nP?' ('+nP+')':'')+'</button>'+
      '<button class="btn-primary-danger u-mt-sm" onclick="athletesCancel()">Fermer les inscriptions</button>';
  } else {
    status=atStatusPills(st);
    players=atPlayersHtml(st, null);
    if(st.phase==='end'){
      ctrl='<div class="diamant-voted">Compétition terminée : '+(st.points||0)+' points pour le feu (somme des points de tous les joueurs).</div>'+
        '<button class="btn-primary" onclick="athletesEndToFire()">Ajouter '+(st.points||0)+' points au feu et clôturer</button>'+
        '<button class="btn-primary-danger u-mt-sm" onclick="athletesCancel()">Clôturer sans ajouter</button>';
    } else {
      const lbl={ draft:'Terminer le recrutement maintenant (au hasard pour les retardataires)', choose:'Terminer le choix maintenant (au hasard pour les retardataires)',
        race:'Jouer le tour à la place du joueur', podium:'Passer à la course suivante' }[st.phase];
      ctrl=(st.phase==='podium' ? '<button class="btn-primary" onclick="athletesNextRace()">'+lbl+'</button>' : '<button class="btn-primary" onclick="athletesForce()">'+lbl+'</button>')+
        '<button class="btn-primary-danger u-mt-sm" onclick="athletesCancel()">Abandonner la compétition</button>';
    }
  }
  atSet('ata-status', atNoEmoji(status));
  atSet('ata-event', atNoEmoji(escHtml(st.lastEvent||'')));
  atSet('ata-players', atNoEmoji(players));
  atSet('ata-controls', ctrl);
  renderGameLibrary();
}

// ── MODALE (règles / historique) ──
let atModal=null;
function atOpenModal(type){ atModal=type; atRefreshModal(); const m=document.getElementById('athletes-modal'); if(m) m.style.display='flex'; }
function athletesHideModal(){ atModal=null; const m=document.getElementById('athletes-modal'); if(m) m.style.display='none'; }
function athletesShowRules(){ atOpenModal('rules'); }
function athletesShowHistory(){ atOpenModal('history'); }
function atRefreshModal(){
  if(!atModal) return;
  let h='';
  if(atModal==='rules') h=atRulesHtml();
  else if(atModal==='history'){
    const hist=(athletes && athletes.history) || [];
    h='<h2 class="rules-title">📋 Historique des actions</h2>'+(hist.length ? '<div class="hist-list">'+hist.slice().reverse().map(a=>
      '<div class="hist-row"><span class="hist-msg">'+escHtml(a.msg||'')+'</span><span class="hist-turn">'+(a.race?'C'+a.race:'')+'</span></div>').join('')+'</div>' : '<p>Aucune action pour l\'instant.</p>');
  }
  atSet('athletes-modal-content', h);
}
function atRulesHtml(){
  const pts=AT_GOLD.map((g,i)=>'<tr><td>Course '+(i+1)+' — '+AT_TRACK_NAME[AT_TRACKS[i]]+'</td><td>'+g+'</td><td>'+AT_SILVER[i]+'</td><td>'+AT_BRONZE[i]+'</td></tr>').join('');
  return '<h2 class="rules-title">🏃 Les Athlètes du Village — Comment jouer</h2>'+
  '<div class="rules-section"><h3>🎯 Le but</h3><ul>'+
    '<li>Une compétition en <strong>'+AT_TEAM+' courses</strong>, de '+AT_MIN_PLAYERS+' à '+AT_MAX_PLAYERS+' joueurs. Le joueur qui a le plus de points à la fin gagne (égalité : victoire partagée).</li>'+
    '<li>Chaque athlète a un <strong>pouvoir farfelu</strong> qui casse les règles de la course. Tout peut arriver jusqu\'à la dernière case !</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>📜 Le recrutement</h3><ul>'+
    '<li>'+AT_TEAM+' tours : à chaque tour, '+AT_OFFER+' athlètes te sont proposés, tu en gardes <strong>1</strong> ('+AT_DRAFT_SECS+' s, sinon au hasard).</li>'+
    '<li>Ton équipe compte donc '+AT_TEAM+' athlètes. Chacun ne court <strong>qu\'une seule fois</strong> : garde les meilleurs pour la fin, les dernières courses rapportent plus.</li>'+
    (AT_ALLOW_DUP ? '<li><em>Pour l\'instant, plusieurs joueurs peuvent avoir le même athlète (tous les athlètes ne sont pas encore arrivés au village).</em></li>' : '')+
  '</ul></div>'+
  '<div class="rules-section"><h3>🏁 Une course</h3><ul>'+
    '<li>Avant chaque course, chacun choisit <strong>en secret</strong> l\'athlète qu\'il envoie ('+AT_CHOOSE_SECS+' s). Tous sont révélés en même temps sur la ligne de départ.</li>'+
    '<li>À ton tour, lance le dé et avance d\'autant de cases : c\'est ton <strong>déplacement principal</strong>. Tu as '+AT_TURN_SECS+' s, sinon le dé est lancé pour toi.</li>'+
    '<li>Les pouvoirs se déclenchent dans l\'ordre : cases spéciales, joueur actif, puis les autres joueurs.</li>'+
    '<li>La course s\'arrête dès que le <strong>2e athlète</strong> franchit l\'arrivée (case '+AT_LEN+'). Le 3e est le plus avancé des autres ; à égalité, celui qui est arrivé le premier sur sa case.</li>'+
    '<li>Le dernier de la course commence la suivante.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🧩 Les mots à connaître</h3><ul>'+
    '<li><strong>Dépasser</strong> : commencer un déplacement derrière un athlète et le finir devant lui.</li>'+
    '<li><strong>S\'arrêter sur une case</strong> : finir son déplacement dessus. Juste passer ne compte pas.</li>'+
    '<li><strong>Trébucher</strong> : au prochain tour, l\'athlète se relève au lieu de se déplacer. Son pouvoir reste actif.</li>'+
    '<li><strong>En tête / dernière place</strong> : l\'athlète le plus proche de l\'arrivée / du départ.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🌪️ La piste Galère (courses 2 et 4)</h3><ul>'+
    '<li>⭐ <strong>Étoile</strong> : t\'y arrêter rapporte '+AT_STAR_PTS+' point de bronze.</li>'+
    '<li>⏩ / ⏪ <strong>Flèche</strong> : t\'y arrêter te fait avancer ou reculer du nombre indiqué (c\'est un nouveau déplacement).</li>'+
    '<li>💥 <strong>OUPS !</strong> : t\'y arrêter te fait trébucher.</li>'+
    '<li>La piste Pépère (courses 1 et 3) est une simple ligne droite.</li>'+
  '</ul></div>'+
  '<div class="rules-section"><h3>🏅 Les points</h3><table class="rules-table"><thead><tr><th>Course</th><th>🥇 1er</th><th>🥈 2e</th><th>🥉 3e</th></tr></thead><tbody>'+pts+'</tbody></table>'+
    '<p class="rules-note">🔥 Feu de camp : la somme des points de tous les joueurs.</p></div>'+
  '<div class="rules-section"><h3>🏃 Les athlètes</h3><table class="rules-table"><tbody>'+
    AT_KEYS.map(k=>'<tr><td>'+AT_ATHLETES[k].ico+' <strong>'+escHtml(AT_ATHLETES[k].nom)+'</strong></td><td>'+escHtml(AT_ATHLETES[k].txt)+'</td></tr>').join('')+
  '</tbody></table></div>';
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') athletesHideModal(); });
}
