// ── FERME ENGINE + UI (étape 1 : squelette) ──────────────────────────────────
const F_METIERS_BASE = ['Pêcheur','Bûcheron','Agriculteur','Mineur'];
const F_LOCATIONS = ['Ferme','Magasin','Montagne','Lac','Plage','Forêt','Ranch'];
const F_LOC_ICON = { Ferme:'🏡', Magasin:'🏪', Montagne:'⛰️', Lac:'🎣', Plage:'🏖️', Forêt:'🌲', Ranch:'🐄' };
const F_METIER_ICON = { 'Pêcheur':'🎣', 'Bûcheron':'🪓', 'Agriculteur':'🌱', 'Mineur':'⛏️' };
const F_MAXTURNS = 10;

// ── Config Pêcheur (à ajuster) ──
// Espèces de poisson : val = difficulté (le dé d6 doit être ≥ à cette valeur pour attraper)
const F_FISH = [
  { nom:'Sardine',   val:2 },
  { nom:'Truite',    val:3 },
  { nom:'Bar',       val:4 },
  { nom:'Saumon',    val:5 },
  { nom:'Esturgeon', val:6 },
];
// Valeurs de vente en or (⚠️ VALEURS PAR DÉFAUT — remplace-les par les tiennes)
const F_SELL_VALUES = { 'poisson':3, 'poisson grillé':6 };
// Graines cultivables : maxLevel = niveau de maturité (planté au niv.1), sell = prix de vente de la récolte
// ⚠️ sell salade/tomate = VALEURS PROVISOIRES à ajuster
const F_SEEDS = [
  { type:'panais', maxLevel:2, sell:2 },
  { type:'tomate', maxLevel:3, sell:3 },
  { type:'salade', maxLevel:4, sell:2 },
];
const F_CROP_MAX = { panais:2, tomate:3, salade:4 };
const F_SEED_PRICE = 1; // prix d'achat d'une graine (identique pour toutes)

// ── Registre d'actions de métier (pattern réutilisable) ──
// Chaque action : { id, label, desc, locations (null=partout), check(st)->{ok,why}, apply(st)->message }
const F_ACTIONS = {
  'Bûcheron': [
    { id:'couper', label:'🪓 Couper du bois', desc:'+2 bois', locations:['Forêt'],
      check:(st)=>({ok:true}),
      apply:(st)=>{ st.inventory['bois']=(st.inventory['bois']||0)+2; return 'coupe du bois (+2 bois)'; } },
    { id:'buche', label:'🪵 1 bois → 1 bûche', desc:null, locations:null,
      check:(st)=>((st.inventory['bois']||0)>=1?{ok:true}:{ok:false,why:'besoin de 1 bois'}),
      apply:(st)=>{ st.inventory['bois']-=1; if(st.inventory['bois']<=0)delete st.inventory['bois']; st.inventory['bûche']=(st.inventory['bûche']||0)+1; return 'transforme 1 bois en 1 bûche'; } },
    { id:'brindille', label:'🌿 1 bois → 2 brindilles', desc:null, locations:null,
      check:(st)=>((st.inventory['bois']||0)>=1?{ok:true}:{ok:false,why:'besoin de 1 bois'}),
      apply:(st)=>{ st.inventory['bois']-=1; if(st.inventory['bois']<=0)delete st.inventory['bois']; st.inventory['brindille']=(st.inventory['brindille']||0)+2; return 'transforme 1 bois en 2 brindilles'; } },
  ],
  'Mineur': [
    { id:'explorer', label:'⛏️ Explorer la mine', locations:['Montagne'],
      desc:(st)=>{ const lvl=st.mineLevel||1; return 'niv. '+lvl+'/5 · risque crâne '+(5+(lvl-1)*5)+'%'; },
      check:(st)=>({ok:true}),
      apply:(st)=>{
        const lvl = st.mineLevel||1;
        const skull = 5 + (lvl-1)*5;
        const stairs = 15, coal = 30;
        const rock = 100 - skull - stairs - coal;
        const r = Math.random()*100;
        if(r < rock){ st.inventory['pierre brute']=(st.inventory['pierre brute']||0)+1; return 'explore la mine (niv. '+lvl+') et trouve 1 pierre brute'; }
        if(r < rock+coal){ st.inventory['minerai de charbon']=(st.inventory['minerai de charbon']||0)+1; return 'explore la mine (niv. '+lvl+') et trouve 1 minerai de charbon'; }
        if(r < rock+coal+stairs){
          if(lvl<5){ st.mineLevel=lvl+1; return 'découvre un escalier 🪜 et le groupe descend au niveau '+(lvl+1)+' de la mine'; }
          return 'découvre un escalier, mais la mine est déjà au plus profond (niv. 5)';
        }
        const keys = Object.keys(st.inventory);
        if(keys.length===0){ return 'réveille un crâne de monstre 💀… mais le groupe n\'a aucun objet à perdre !'; }
        const k = keys[Math.floor(Math.random()*keys.length)];
        st.inventory[k]-=1; if(st.inventory[k]<=0) delete st.inventory[k];
        return 'réveille un crâne de monstre 💀 et le groupe perd 1 '+k+' !';
      } },
    { id:'pierre', label:'🪨 Pierre brute → pierre', desc:null, locations:null,
      check:(st)=>((st.inventory['pierre brute']||0)>=1?{ok:true}:{ok:false,why:'besoin de 1 pierre brute'}),
      apply:(st)=>{ st.inventory['pierre brute']-=1; if(st.inventory['pierre brute']<=0)delete st.inventory['pierre brute']; st.inventory['pierre']=(st.inventory['pierre']||0)+1; return 'transforme 1 pierre brute en 1 pierre'; } },
    { id:'charbon', label:'⚫ Minerai de charbon → charbon', desc:null, locations:null,
      check:(st)=>((st.inventory['minerai de charbon']||0)>=1?{ok:true}:{ok:false,why:'besoin de 1 minerai de charbon'}),
      apply:(st)=>{ st.inventory['minerai de charbon']-=1; if(st.inventory['minerai de charbon']<=0)delete st.inventory['minerai de charbon']; st.inventory['charbon']=(st.inventory['charbon']||0)+1; return 'transforme 1 minerai de charbon en 1 charbon'; } },
  ],
  'Pêcheur': [
    { id:'pecher', label:'🎣 Pêcher', locations:['Lac','Plage'],
      desc:'carte poisson + dé',
      check:(st)=>({ok:true}),
      apply:(st)=>{
        const fish = F_FISH[Math.floor(Math.random()*F_FISH.length)];
        const roll = 1 + Math.floor(Math.random()*6);
        if(roll >= fish.val){
          st.inventory['poisson']=(st.inventory['poisson']||0)+1;
          return 'pêche un(e) '+fish.nom+' (difficulté '+fish.val+') · dé 🎲 '+roll+' ✓ attrapé ! (+1 poisson)';
        }
        return 'pêche un(e) '+fish.nom+' (difficulté '+fish.val+') · dé 🎲 '+roll+' ✗ le poisson s\'échappe';
      } },
    { id:'griller', label:'🔥 Griller un poisson', desc:'1 poisson + 1 bois → 1 poisson grillé', locations:null,
      check:(st)=>{ if((st.inventory['poisson']||0)<1) return {ok:false,why:'besoin de 1 poisson'}; if((st.inventory['bois']||0)<1) return {ok:false,why:'besoin de 1 bois'}; return {ok:true}; },
      apply:(st)=>{ st.inventory['poisson']-=1; if(st.inventory['poisson']<=0)delete st.inventory['poisson']; st.inventory['bois']-=1; if(st.inventory['bois']<=0)delete st.inventory['bois']; st.inventory['poisson grillé']=(st.inventory['poisson grillé']||0)+1; return 'grille un poisson (1 poisson + 1 bois → 1 poisson grillé)'; } },
    { id:'vendre_poisson', label:'🪙 Vendre un poisson', locations:null,
      desc:(st)=>'+'+(F_SELL_VALUES['poisson']||0)+' or',
      check:(st)=>((st.inventory['poisson']||0)>=1?{ok:true}:{ok:false,why:'aucun poisson'}),
      apply:(st)=>{ st.inventory['poisson']-=1; if(st.inventory['poisson']<=0)delete st.inventory['poisson']; const v=F_SELL_VALUES['poisson']||0; st.gold=(st.gold||0)+v; return 'vend 1 poisson (+'+v+' or)'; } },
  ],
  // Agriculteur : forme fonction (actions dynamiques — vente uniquement des récoltes en stock)
  'Agriculteur': (st)=>{
    // Achat : une action d'achat par type de graine (choix au Magasin)
    const buys = F_SEEDS.map(seed=>({
      id:'acheter_'+seed.type, label:'🌰 Acheter graine '+seed.type, desc:'-'+F_SEED_PRICE+' or · mûrit niv.'+seed.maxLevel, locations:['Magasin'],
      check:(st)=>((st.gold||0)>=F_SEED_PRICE?{ok:true}:{ok:false,why:'besoin de '+F_SEED_PRICE+' or'}),
      apply:(st)=>{ st.gold=(st.gold||0)-F_SEED_PRICE; if(!Array.isArray(st.crops))st.crops=[]; st.crops.push({ id:'crop'+Date.now()+'_'+Math.floor(Math.random()*1000), type:seed.type, level:1 }); return 'achète une graine de '+seed.type+' (-'+F_SEED_PRICE+' or) et la plante (niv. 1/'+seed.maxLevel+')'; }
    }));
    // Arroser : monte TOUT le champ d'un niveau ; chaque plante à maturité est récoltée
    const water = { id:'arroser', label:'💧 Arroser le champ', desc:'toutes les plantes +1 niveau', locations:null,
      check:(st)=>((st.crops||[]).length>0?{ok:true}:{ok:false,why:'aucune plante à arroser'}),
      apply:(st)=>{
        (st.crops||[]).forEach(c=>{ c.level=(c.level||1)+1; });
        const harvested=[]; const remaining=[];
        (st.crops||[]).forEach(c=>{
          const max = F_CROP_MAX[c.type];
          if(!c.type || !max){ return; } // culture invalide : on l'ignore (sécurité)
          if(c.level>=max){ st.inventory[c.type]=(st.inventory[c.type]||0)+1; harvested.push(c.type); }
          else remaining.push(c);
        });
        st.crops = remaining;
        if(harvested.length) return 'arrose tout le champ — récolte : '+harvested.join(', ')+' 🌾 !';
        return 'arrose tout le champ (chaque plante +1 niveau)';
      } };
    // Cuisiner : plat de veillée (Ferme) à partir de panais + tomate + salade + poisson grillé
    const cook = { id:'cuisiner', label:'🍲 Cuisiner un plat de veillée', desc:'1 panais + 1 tomate + 1 salade + 1 poisson grillé', locations:['Ferme'],
      check:(st)=>{ const need=['panais','tomate','salade','poisson grillé']; const miss=need.filter(k=>(st.inventory[k]||0)<1); return miss.length===0?{ok:true}:{ok:false,why:'manque '+miss.join(', ')}; },
      apply:(st)=>{ ['panais','tomate','salade','poisson grillé'].forEach(k=>{ st.inventory[k]-=1; if(st.inventory[k]<=0)delete st.inventory[k]; }); st.inventory['plat de veillée']=(st.inventory['plat de veillée']||0)+1; return 'cuisine un plat de veillée 🍲 !'; } };
    // Vente des récoltes (dynamique — seulement celles en stock)
    const sells = F_SEEDS.filter(s=>(st.inventory[s.type]||0)>0).map(s=>({
      id:'vendre_'+s.type, label:'🪙 Vendre 1 '+s.type, desc:'+'+s.sell+' or', locations:null,
      check:(st)=>((st.inventory[s.type]||0)>=1?{ok:true}:{ok:false,why:'aucun '+s.type}),
      apply:(st)=>{ st.inventory[s.type]-=1; if(st.inventory[s.type]<=0)delete st.inventory[s.type]; st.gold=(st.gold||0)+s.sell; return 'vend 1 '+s.type+' (+'+s.sell+' or)'; }
    }));
    return buys.concat([water, cook]).concat(sells);
  },
};

// Affichage du champ commun (cultures en cours)
function fCrops(st){
  const crops = st.crops||[];
  if(!crops.length) return '<div class="f-empty-mb">🌱 Champ commun : vide</div>';
  const cropIcon={ panais:'🥕', tomate:'🍅', salade:'🥬' };
  const badges = crops.slice().sort((a,b)=>b.level-a.level).map(c=>{
    const max = F_CROP_MAX[c.type] || 4;
    const ic = cropIcon[c.type] || '🌱';
    const ready = c.level>=max;
    return '<span class="finv-item"'+(ready?' class="badge-ready"':'')+'>'+ic+' '+(c.type||'?')+' niv. '+c.level+'/'+max+'</span>';
  }).join('');
  return '<div class="u-mb-sm"><div class="f-caption-warm">🌱 Champ commun ('+crops.length+' plante'+(crops.length>1?'s':'')+')</div><div class="finv">'+badges+'</div></div>';
}

function fMetierActions(metier, st){ const def = F_ACTIONS[metier]; if(typeof def==='function') return def(st||ferme||{inventory:{},crops:[],gold:0}) || []; return def || []; }
function fHasValidAction(st, pseudo){
  const p = st.players[pseudo]; if(!p) return false;
  return fMetierActions(p.metier, st).some(a => (!a.locations || a.locations.indexOf(p.location)>=0) && a.check(st).ok);
}
const F_LOC_CAP = 2; // nombre max de joueurs par lieu
function fLocationCount(st, loc, exceptPseudo){ return fPlayers(st).filter(p=>p.location===loc && p.pseudo!==exceptPseudo).length; }
function fCanEnter(st, loc, pseudo){ return fLocationCount(st, loc, pseudo) < F_LOC_CAP; }
function fShuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function fNormalize(st){
  if(!st) return st;
  st.players   = (st.players && typeof st.players==='object') ? st.players : {};
  st.turnOrder = Array.isArray(st.turnOrder) ? st.turnOrder : (st.turnOrder ? Object.values(st.turnOrder) : []);
  st.inventory = (st.inventory && typeof st.inventory==='object') ? st.inventory : {};
  st.locations = Array.isArray(st.locations) ? st.locations : F_LOCATIONS.slice();
  st.gold      = (typeof st.gold==='number') ? st.gold : 0;
  st.turn      = (typeof st.turn==='number') ? st.turn : 1;
  st.currentIdx= (typeof st.currentIdx==='number') ? st.currentIdx : 0;
  st.mineLevel = (typeof st.mineLevel==='number') ? st.mineLevel : 1;
  st.crops = Array.isArray(st.crops) ? st.crops : (st.crops ? Object.values(st.crops) : []);
  // Répare/purge les cultures héritées d'anciennes parties (sans type valide) pour éviter les récoltes "undefined"
  const _validTypes = (typeof F_CROP_MAX!=='undefined') ? Object.keys(F_CROP_MAX) : ['panais','tomate','salade'];
  st.crops = st.crops
    .filter(c => c && typeof c==='object')
    .map(c => ({ id: c.id || ('crop'+Math.random().toString(36).slice(2)), type: c.type, level: (typeof c.level==='number' && c.level>=1) ? c.level : 1 }))
    .filter(c => _validTypes.indexOf(c.type) >= 0);
  if(st.lastAction && typeof st.lastAction!=='object') st.lastAction = null;
  return st;
}
function fPlayers(st){ return Object.values(st.players); }
function fCurrent(st){ return st.turnOrder[st.currentIdx] || null; }

// ── Control handlers ──
function startFerme(){
  const target = Math.max(1, parseInt(document.getElementById('ferme-target').value)||4);
  fbSetFerme({
    active:true, phase:'lobby', targetPlayers:target, turn:1, maxTurns:F_MAXTURNS,
    players:{}, turnOrder:[], currentIdx:0, inventory:{}, gold:0, mineLevel:1, crops:[], locations:F_LOCATIONS.slice(),
    lastEvent:'Lobby ouvert — en attente des joueurs (0/'+target+').'
  });
  toast('🌾 Lobby de la Ferme ouvert !');
}

function fermeCancel(){
  if(!confirm('Abandonner la partie de la Ferme en cours ?')) return;
  fbSetFerme(null);
  toast('Partie de la Ferme annulée.');
}

function fermeJoin(pseudo){
  if(!ferme || ferme.phase!=='lobby') return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  if(!st.players[pseudo]) st.players[pseudo] = { pseudo, metier:null, location:null, done:false };
  const n = fPlayers(st).length;
  st.lastEvent = 'En attente des joueurs… ('+n+'/'+st.targetPlayers+')';
  if(n >= st.targetPlayers){ fStartPlanning(st); }
  fbSetFerme(st);
}

function fermeLeave(pseudo){
  if(!ferme || ferme.phase!=='lobby') return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  delete st.players[pseudo];
  st.lastEvent = 'En attente des joueurs… ('+fPlayers(st).length+'/'+st.targetPlayers+')';
  fbSetFerme(st);
}

function fermeForceStart(){
  if(!ferme || ferme.phase!=='lobby') return;
  if(fPlayers(ferme).length===0){ toast('Aucun joueur dans le lobby !'); return; }
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  fStartPlanning(st);
  fbSetFerme(st);
}

function fStartPlanning(st){
  const players = fPlayers(st);
  const order = fShuffle(players.map(p=>p.pseudo));
  // Les joueurs choisissent eux-mêmes leur métier ET leur lieu (dans n'importe quel ordre)
  order.forEach(pseudo=>{ st.players[pseudo].metier=null; st.players[pseudo].location=null; st.players[pseudo].done=false; st.players[pseudo].actionsDone=0; st.players[pseudo].hasMoved=false; });
  st.turnOrder = order; st.currentIdx=0; st.phase='planning';
  st.lastEvent = 'Tour '+st.turn+' — Planification : chacun choisit son métier et son lieu de départ.';
  return st;
}

function fermeSetMetier(pseudo, metier){
  if(!ferme || ferme.phase!=='planning') return;
  if(F_METIERS_BASE.indexOf(metier)<0) return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  if(st.players[pseudo]) st.players[pseudo].metier = metier;
  fbSetFerme(st);
}

function fermeSetLocation(pseudo, loc){
  if(!ferme || ferme.phase!=='planning') return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  if(!st.players[pseudo] || st.locations.indexOf(loc)<0) return;
  if(st.players[pseudo].location===loc){ st.players[pseudo].location=null; fbSetFerme(st); return; } // re-clic = désélection
  if(!fCanEnter(st, loc, pseudo)){ toast('Ce lieu est déjà occupé par '+F_LOC_CAP+' joueurs !'); return; }
  st.players[pseudo].location=loc;
  fbSetFerme(st);
}

function fermeStartAction(){
  if(!ferme || ferme.phase!=='planning') return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  // Tous les joueurs doivent avoir choisi un métier
  const sansMetier = fPlayers(st).filter(p=>!p.metier).map(p=>p.pseudo);
  if(sansMetier.length){ toast('En attente du choix de métier : '+sansMetier.join(', ')); return; }
  // Placement auto des joueurs non placés, en respectant la limite de 2 par lieu
  fPlayers(st).forEach(p=>{
    if(!p.location){
      const spot = st.locations.find(l=>fCanEnter(st, l, p.pseudo)) || 'Ferme';
      p.location = spot;
    }
  });
  st.phase='action'; st.currentIdx=0;
  st.lastEvent = 'Tour '+st.turn+' — Phase d\'action. Au tour de '+(st.turnOrder[0]||'—')+'.';
  fbSetFerme(st);
}

function fermeMove(pseudo, loc){
  if(!ferme || ferme.phase!=='action') return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  if(!st.players[pseudo] || st.locations.indexOf(loc)<0) return;
  if(st.players[pseudo].location!==loc && !fCanEnter(st, loc, pseudo)){ toast('Ce lieu est déjà complet ('+F_LOC_CAP+' joueurs).'); return; }
  st.players[pseudo].location=loc; st.lastEvent=pseudo+' se déplace vers '+F_LOC_ICON[loc]+' '+loc+'.';
  fbSetFerme(st);
}

function fAdvance(st){
  const cur = fCurrent(st);
  if(cur){ st.players[cur].done=true; st.players[cur].location='Ferme'; }
  st.currentIdx += 1;
  if(st.currentIdx >= st.turnOrder.length){ fEndTurn(st); }
  else { st.lastEvent = (cur?cur+' a terminé son tour. ':'')+'Au tour de '+fCurrent(st)+'.'; }
  return st;
}
function fermeEndPlayerTurn(){
  if(!ferme || ferme.phase!=='action') return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  fAdvance(st);
  fbSetFerme(st);
}

function fermeDoAction(pseudo, actionId){
  if(!ferme || ferme.phase!=='action') return;
  if(fCurrent(ferme)!==pseudo) return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  const p = st.players[pseudo];
  if(!p || (p.actionsDone||0)>=2) return;
  const act = fMetierActions(p.metier, st).find(a=>a.id===actionId);
  if(!act) return;
  if(act.locations && act.locations.indexOf(p.location)<0){ toast('Action impossible à '+p.location); return; }
  const chk = act.check(st);
  if(!chk.ok){ toast(chk.why||'Action impossible'); return; }
  const msg = act.apply(st);
  p.actionsDone = (p.actionsDone||0)+1;
  st.lastEvent = pseudo+' '+msg+'.';
  // résultat persistant de la dernière action (ne se fait pas écraser par le passage au joueur suivant)
  st.lastAction = { pseudo, msg, metier:p.metier, at:Date.now() };
  if(p.actionsDone>=2){ fAdvance(st); }
  fbSetFerme(st);
}

function fermePlayerMove(pseudo, loc){
  if(!ferme || ferme.phase!=='action') return;
  if(fCurrent(ferme)!==pseudo) return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  const p = st.players[pseudo];
  if(!p || p.hasMoved || (p.actionsDone||0)>=2){ toast('Déplacement impossible'); return; }
  if(st.locations.indexOf(loc)<0) return;
  if(!fCanEnter(st, loc, pseudo)){ toast('Ce lieu est déjà complet ('+F_LOC_CAP+' joueurs).'); return; }
  const done = p.actionsDone||0;
  if(done<1){
    // move-first only allowed if stuck (no valid action here); it consumes the first action slot
    if(fHasValidAction(st, pseudo)){ toast('Fais d\'abord une action, puis déplace-toi'); return; }
    p.actionsDone = 1;
  }
  p.location = loc; p.hasMoved = true;
  st.lastEvent = pseudo+' se déplace vers '+F_LOC_ICON[loc]+' '+loc+'.';
  fbSetFerme(st);
}

// Boutons d'action pour le joueur courant (utilisés côté joueur ET côté meneur)
function fActionButtons(st, pseudo){
  const p = st.players[pseudo]; if(!p) return '';
  const done = p.actionsDone||0;
  let html = '<div class="f-label-lg">Actions '+done+'/2 — '+(p.metier?(F_METIER_ICON[p.metier]+' '+p.metier):'sans métier')+' à '+F_LOC_ICON[p.location]+' '+p.location+'</div>';
  if(done>=2){ return html+'<div class="diamant-voted">Les 2 actions sont faites, le tour se termine.</div>'; }
  const avail = fMetierActions(p.metier, st).filter(a=>!a.locations || a.locations.indexOf(p.location)>=0);
  if(!p.metier){
    html += '<div class="f-empty">Pas de métier ce tour — tu peux te déplacer ou passer.</div>';
  } else if(avail.length===0){
    html += '<div class="f-empty">Aucune action de '+p.metier+' possible ici. Déplace-toi vers le bon lieu.</div>';
  } else {
    html += '<div class="f-actions-col">';
    avail.forEach(a=>{
      const chk = a.check(st);
      const dis = chk.ok ? '' : 'disabled';
      const why = chk.ok ? '' : ' <span class="u-dim">('+(chk.why||'indispo')+')</span>';
      const dtxt = (typeof a.desc==='function') ? a.desc(st) : a.desc;
      html += '<button class="btn-continue" '+dis+' onclick="fermeDoAction(\''+escAttr(pseudo)+'\',\''+a.id+'\')" class="u-textleft">'+a.label+(dtxt?(' — '+dtxt):'')+why+'</button>';
    });
    html += '</div>';
  }
  const canMove = !p.hasMoved && done<2 && (done>=1 || !fHasValidAction(st,pseudo));
  if(canMove){
    html += '<div class="f-label-mv">'+(done>=1?'Se déplacer, puis 1 dernière action :':'Se déplacer (aucune action possible ici) :')+'</div>'+
      '<div class="f-move-row">'+
      st.locations.filter(l=>l!==p.location).map(l=>'<button class="btn-small" onclick="fermePlayerMove(\''+escAttr(pseudo)+'\',\''+escAttr(l)+'\')">'+F_LOC_ICON[l]+' '+l+'</button>').join('')+'</div>';
  }
  return html;
}

function fEndTurn(st){
  if(st.turn >= st.maxTurns){ st.phase='gameEnd'; st.result=null; st.lastEvent='🏁 Fin du 10e tour ! Déclare victoire ou défaite.'; return st; }
  st.turn += 1; return fStartPlanning(st);
}

function fermeDeclare(victory){
  if(!ferme) return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  st.phase='gameEnd'; st.result = victory?'victory':'defeat';
  st.lastEvent = victory ? '🎉 Victoire ! Les objectifs de grand-père sont remplis.' : '😞 Défaite… objectifs non atteints.';
  fbSetFerme(st);
}

function fermeEndToFire(){
  if(!ferme) return;
  const pts = parseInt(prompt('Combien de points ajouter au feu de camp ?', ferme.result==='victory'?'30':'0'));
  if(isNaN(pts)) return;
  if(pts>0) fbSetFire(Object.assign({}, fire, { points:(fire.points||0)+pts }));
  fbSetFerme(null);
  toast(pts>0?('🔥 +'+pts+' pts au feu ! Partie clôturée.'):'Partie clôturée.');
}

// Inventory adjust
function fermeAddResource(){
  if(!ferme) return;
  const sel = document.getElementById('fa-res-select');
  const qty = parseInt(document.getElementById('fa-res-qty').value)||1;
  const key = sel.value;
  if(!key) return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  st.inventory[key] = (st.inventory[key]||0) + qty;
  if(st.inventory[key]<=0) delete st.inventory[key];
  fbSetFerme(st);
}
function fermeAdjustGold(delta){
  if(!ferme) return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  st.gold = Math.max(0, (st.gold||0)+delta);
  fbSetFerme(st);
}

const F_RESOURCES = ['bois','bûche','brindille','pierre brute','pierre','minerai de charbon','charbon','minerai de cuivre','cuivre','minerai de fer','fer','poisson','poisson grillé','panais','tomate','salade','plat de veillée','oeuf','lait','graine'];

// ── Rendering ──
function fLastActionBanner(st, opts){
  opts = opts||{};
  if(!st.lastAction || !st.lastAction.msg) return '';
  const skull = /crâne/.test(st.lastAction.msg);
  const border = skull ? 'var(--ember)' : 'var(--success)';
  const icon = skull ? '💀' : '✅';
  const body = escHtml(st.lastAction.msg.replace(st.lastAction.pseudo+' ',''));
  const dismiss = opts.dismiss
    ? '<button onclick="fermeClearLastAction()" class="dismiss-btn">✕</button>'
    : '';
  return '<div class="ferme-lastaction" style="border-left:3px solid '+border+'">'+
    '<span class="u-shrink0-lg">'+icon+'</span>'+
    '<span class="u-minw0">Dernière action — <strong class="t-bright">'+escHtml(st.lastAction.pseudo)+'</strong> '+body+'</span>'+
    dismiss+'</div>';
}
function fermeClearLastAction(){
  if(!ferme) return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  st.lastAction = null;
  fbSetFerme(st);
}

function fStatusPills(st){
  const phaseLabel = { lobby:'Lobby', planning:'Planification', action:'Action', gameEnd:'Fin' }[st.phase]||st.phase;
  return '<div class="fturn-pill">Tour <strong>'+st.turn+'/'+st.maxTurns+'</strong></div>'+
         '<span class="fphase-badge fphase-'+st.phase+'">'+phaseLabel+'</span>'+
         '<div class="fturn-pill">⛏️ Mine <strong>niv. '+(st.mineLevel||1)+'/5</strong></div>'+
         '<div class="fgold">🪙 '+st.gold+' or</div>';
}

function fBoard(st, opts){
  opts = opts||{};
  const cur = fCurrent(st);
  return '<div class="ferme-board">'+ st.locations.map(loc=>{
    const here = fPlayers(st).filter(p=>p.location===loc);
    const pawns = here.map(p=>'<span class="fpawn'+(p.pseudo===cur?' current':'')+'">'+escHtml(p.pseudo)+'</span>').join('');
    const clickable = opts.onPick ? ' floc-btn" onclick="'+opts.onPick+'(\''+escAttr(loc)+'\')"' : '"';
    const sel = (opts.selected===loc)?' selected':'';
    return '<div class="floc'+sel+(opts.onPick?' floc-btn':'')+'" '+(opts.onPick?('onclick="'+opts.onPick+'(\''+escAttr(loc)+'\')"'):'')+'>'+
      '<div class="floc-header">'+F_LOC_ICON[loc]+' '+loc+'</div>'+
      '<div class="floc-pawns">'+pawns+'</div></div>';
  }).join('') + '</div>';
}

function fPlayersList(st, highlight){
  const cur = fCurrent(st);
  return fPlayers(st).map(p=>{
    const isCur = (st.phase==='action' && p.pseudo===cur);
    const metier = p.metier ? '<span class="fmetier">'+(F_METIER_ICON[p.metier]||'')+' '+p.metier+'</span>' : '<span class="fmetier none">sans métier</span>';
    const loc = p.location ? '<span class="floc-tag">'+F_LOC_ICON[p.location]+' '+p.location+'</span>' : '<span class="floc-tag u-dimmer">non placé</span>';
    const hl = (p.pseudo===highlight)?'class="u-outline"':'';
    return '<div class="fplayer-row'+(isCur?' current':'')+(p.done?' done':'')+'" '+hl+'>'+
      '<span>'+(isCur?'▶ ':'')+escHtml(p.pseudo)+'</span>'+metier+loc+
      (p.done?'<span class="u-mla t-success">✓ fini</span>':'')+'</div>';
  }).join('');
}

function fInventory(st){
  const items = Object.keys(st.inventory);
  if(!items.length) return '<div class="finv"><span class="t-muted-it">Inventaire vide</span></div>';
  return '<div class="finv">'+items.map(k=>'<span class="finv-item">'+escHtml(k)+' <strong>×'+st.inventory[k]+'</strong></span>').join('')+'</div>';
}

function renderFermeAdmin(){
  const panel = document.getElementById('ferme-panel');
  if(!panel) return;
  const inactive = document.getElementById('ferme-admin-inactive');
  const active = document.getElementById('ferme-admin-active');
  if(!ferme || !ferme.active){ inactive.style.display='block'; active.style.display='none'; return; }
  inactive.style.display='none'; active.style.display='block';

  document.getElementById('fa-status').innerHTML = fStatusPills(ferme);
  document.getElementById('fa-lastaction').innerHTML = fLastActionBanner(ferme, {dismiss:true});
  document.getElementById('fa-event').textContent = ferme.lastEvent||'';
  document.getElementById('fa-board').innerHTML = fBoard(ferme);
  document.getElementById('fa-players').innerHTML = fPlayersList(ferme);

  // inventory + meneur adjust
  const resOpts = F_RESOURCES.map(r=>'<option value="'+r+'">'+r+'</option>').join('');
  document.getElementById('fa-inventory').innerHTML =
    '<div class="f-caption-warm-lg">Inventaire partagé</div>'+
    fInventory(ferme)+
    fCrops(ferme)+
    '<div class="f-row-center-mt">'+
      '<select id="fa-res-select" class="f-select-grow">'+resOpts+'</select>'+
      '<input type="number" id="fa-res-qty" value="1" class="fire-mini-input f-input-qty">'+
      '<button class="btn-small" onclick="fermeAddResource()">± Ressource</button>'+
      '<span class="u-mla-row">🪙'+
        '<button class="btn-icon" onclick="fermeAdjustGold(-5)">−5</button>'+
        '<button class="btn-icon" onclick="fermeAdjustGold(-1)">−</button>'+
        '<button class="btn-icon" onclick="fermeAdjustGold(1)">+</button>'+
        '<button class="btn-icon" onclick="fermeAdjustGold(5)">+5</button>'+
      '</span>'+
    '</div>';

  const ctrl = document.getElementById('fa-controls');
  const ph = ferme.phase;
  const cancelBtn = '<button class="btn-deactivate" onclick="fermeCancel()" class="u-mt-sm">✕ Abandonner la partie</button>';
  if(ph==='lobby'){
    ctrl.innerHTML = '<div class="diamant-voted">🚪 '+fPlayers(ferme).length+'/'+ferme.targetPlayers+' joueurs ont rejoint. La partie démarrera automatiquement, ou force le départ :</div>'+
      '<button class="btn-draw" onclick="fermeForceStart()">▶ Démarrer maintenant</button>'+cancelBtn;
  } else if(ph==='planning'){
    const total = fPlayers(ferme).length;
    const withMetier = fPlayers(ferme).filter(p=>p.metier).length;
    const placed = fPlayers(ferme).filter(p=>p.location).length;
    const allReady = withMetier===total;
    ctrl.innerHTML = '<div class="diamant-voted">📋 Planification — métiers choisis : <strong>'+withMetier+'/'+total+'</strong> · lieux choisis : <strong>'+placed+'/'+total+'</strong>.'+
      (allReady?'':' <span class="t-warm">En attente des choix de métier.</span>')+
      '<br><span class="u-dim8">Les joueurs non placés seront mis automatiquement au lancement.</span></div>'+
      '<button class="btn-draw" onclick="fermeStartAction()"'+(allReady?'':' disabled class="u-disabled"')+'>▶ Lancer la phase d\'action</button>'+cancelBtn;
  } else if(ph==='action'){
    const cur = fCurrent(ferme);
    const acts = cur ? fActionButtons(ferme, cur) : '';
    ctrl.innerHTML = '<div class="diamant-voted">▶ Au tour de <strong class="t-bright">'+(cur||'—')+'</strong>. Tu peux jouer à sa place (en cas d\'absence) :</div>'+
      acts +
      '<button class="btn-draw" onclick="fermeEndPlayerTurn()" class="u-mt-md">⏭️ Terminer le tour de ce joueur</button>'+cancelBtn;
  } else if(ph==='gameEnd'){
    let head = '';
    if(ferme.result==='victory') head='<div class="diamant-voted t-success">🎉 Victoire déclarée !</div>';
    else if(ferme.result==='defeat') head='<div class="diamant-voted t-danger">😞 Défaite déclarée.</div>';
    else head='<div class="diamant-voted">🏁 Fin des 10 tours. Les objectifs de grand-père sont-ils remplis ?</div>';
    ctrl.innerHTML = head +
      '<div class="u-mt-sm-flex">'+
        '<button class="btn-continue" onclick="fermeDeclare(true)">🎉 Victoire</button>'+
        '<button class="btn-leave" onclick="fermeDeclare(false)">😞 Défaite</button>'+
      '</div>'+
      '<button class="btn-draw" onclick="fermeEndToFire()" class="u-mt-md">🔥 Clôturer (+ points au feu)</button>';
  }
}

function renderFermeViewer(pseudo){
  const wrap = document.getElementById('viewer-ferme');
  if(!wrap) return;
  if(!ferme || !ferme.active){ wrap.style.display='none'; return; }
  wrap.style.display='block';
  document.getElementById('fv-status').innerHTML = fStatusPills(ferme);
  document.getElementById('fv-lastaction').innerHTML = fLastActionBanner(ferme);
  document.getElementById('fv-event').textContent = ferme.lastEvent||'';

  const zone = document.getElementById('fv-myzone');
  const me = ferme.players[pseudo];
  const ph = ferme.phase;

  if(ph==='lobby'){
    if(me){
      zone.innerHTML = '<div class="diamant-voted">✓ Tu as rejoint la partie ! En attente des autres ('+fPlayers(ferme).length+'/'+ferme.targetPlayers+')…</div>'+
        '<button class="btn-small" onclick="fermeLeave(\''+escAttr(pseudo)+'\')" class="u-full">↩ Quitter le lobby</button>';
    } else {
      zone.innerHTML = '<div class="diamant-voted">🚪 Une partie de la Ferme se prépare ! Rejoins avant le départ.</div>'+
        '<button class="btn-continue" onclick="fermeJoin(\''+escAttr(pseudo)+'\')" class="u-full">🌾 Rejoindre la partie</button>';
    }
    return;
  }

  // in-game board is useful for everyone
  let board = fBoard(ferme, {});
  let inv = fInventory(ferme) + fCrops(ferme);

  if(!me){
    zone.innerHTML = board + inv + '<div class="diamant-voted">👀 Tu n\'es pas dans cette partie. Tu pourras jouer à la prochaine !</div>';
    return;
  }

  if(ph==='planning'){
    const myLoc = me.location;
    // Choix du métier
    const metierBtns = F_METIERS_BASE.map(m=>{
      const chosen = (me.metier===m);
      return '<button class="btn-small" onclick="fermeSetMetier(\''+escAttr(pseudo)+'\',\''+escAttr(m)+'\')" style="'+(chosen?'background:rgba(83,74,183,.35);border-color:var(--metier);color:var(--metier-bright)':'')+'">'+(F_METIER_ICON[m]||'')+' '+m+(chosen?' ✓':'')+'</button>';
    }).join('');
    // Choix du lieu (avec occupation X/2, lieux complets désactivés)
    const board = '<div class="ferme-board">'+ ferme.locations.map(loc=>{
      const here = fPlayers(ferme).filter(p=>p.location===loc);
      const pawns = here.map(p=>'<span class="fpawn'+(p.pseudo===pseudo?' current':'')+'">'+escHtml(p.pseudo)+'</span>').join('');
      const sel = (myLoc===loc)?' selected':'';
      const full = here.length>=F_LOC_CAP && myLoc!==loc;
      const cnt = '<span style="font-size:.875rem;color:'+(full?'var(--ember)':'var(--amber-warm)')+'">'+here.length+'/'+F_LOC_CAP+'</span>';
      const click = full ? '' : ' onclick="fermeSetLocation(\''+escAttr(pseudo)+'\',\''+escAttr(loc)+'\')"';
      return '<div class="floc'+(full?'':' floc-btn')+sel+'"'+click+' style="'+(full?'opacity:.45;cursor:not-allowed':'')+'">'+
        '<div class="floc-header">'+F_LOC_ICON[loc]+' '+loc+' '+cnt+'</div><div class="floc-pawns">'+pawns+'</div></div>';
    }).join('') +'</div>';
    zone.innerHTML =
      '<div class="diamant-voted">Choisis ton <strong class="t-metier">métier</strong> et ton <strong class="t-bright">lieu de départ</strong> (dans l\'ordre que tu veux) :</div>'+
      '<div class="f-label">Métier '+(me.metier?'✓':'—')+' :</div>'+
      '<div class="f-row-mb">'+metierBtns+'</div>'+
      '<div class="f-label">Lieu '+(myLoc?'✓':'—')+' (max '+F_LOC_CAP+' par lieu) :</div>'+
      board + inv;
    return;
  }

  if(ph==='action'){
    const cur = fCurrent(ferme);
    const isMe = (cur===pseudo);
    zone.innerHTML = board + inv +
      (isMe
        ? '<div class="diamant-voted t-success">▶ C\'est ton tour !</div>' + fActionButtons(ferme, pseudo) + '<button class="btn-draw" onclick="fermeEndPlayerTurn()" class="u-mt-md">Terminer mon tour</button>'
        : '<div class="diamant-voted">Au tour de <strong class="t-bright">'+(cur||'—')+'</strong>. Ton métier ce tour : '+(me.metier||'—')+', ton lieu : '+(me.location||'—')+'.</div>');
    return;
  }

  if(ph==='gameEnd'){
    let msg = ferme.result==='victory' ? '🎉 Victoire ! Grand-père est fier de vous.' : ferme.result==='defeat' ? '😞 Défaite… ce sera pour la prochaine fois.' : '🏁 Fin de la partie.';
    zone.innerHTML = board + inv + '<div class="diamant-voted">'+msg+'</div>';
    return;
  }
}
