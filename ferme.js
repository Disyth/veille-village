// ── FERME ENGINE + UI (étape 1 : squelette) ──────────────────────────────────
const F_METIERS_BASE = ['Pêcheur','Bûcheron','Agriculteur','Mineur'];
const F_LOCATIONS = ['Ferme','Magasin','Montagne','Rivière','Plage','Forêt'];
const F_LOC_ICON = { Ferme:'🏡', Magasin:'🏪', Montagne:'⛰️', 'Rivière':'🎣', Plage:'🏖️', Forêt:'🌲' };
// Visuels des lieux (à déposer dans un dossier « images » à côté de index.html)
const F_LOC_IMG = { 'Ferme':'images/ferme.png', 'Magasin':'images/magasin.png', 'Montagne':'images/montagne.png', 'Rivière':'images/riviere.png', 'Plage':'images/plage.png', 'Forêt':'images/foret.png' };
const F_METIER_ICON = { 'Pêcheur':'🎣', 'Bûcheron':'🪓', 'Agriculteur':'🌱', 'Mineur':'⛏️' };
const F_MAXTURNS = 20;

// ── Config Pêcheur (à ajuster) ──
// Reliques recherchées par le musée : val = difficulté (dé d6 ≥ val pour la ramener)
// Chaque relique a la MÊME chance d'être trouvée ; seule la difficulté de capture varie.
// Une relique déjà au musée ne peut plus être trouvée.
// 10 reliques, deux par niveau de difficulté (2 à 6) — couvre les parties jusqu'à 10 joueurs
const F_RELICS = [
  { nom:'Parchemin des Nains', val:2 },
  { nom:'Cuillère rouillée',   val:2 },
  { nom:'Éventail décoratif',  val:3 },
  { nom:'Flûte en os',         val:3 },
  { nom:'Outil préhistorique', val:4 },
  { nom:'Gadget de Nain',      val:4 },
  { nom:'Masque doré',         val:5 },
  { nom:'Relique dorée',       val:5 },
  { nom:'Poupée étrange',      val:6 },
  { nom:'Fossile de palmier',  val:6 },
];

// Poissons par lieu de pêche : val = difficulté (dé d6 ≥ val pour attraper). Apparition UNIFORME : tous les
// poissons d'un lieu ont la même chance ; le légendaire (val 6) n'est plus rare, seule sa difficulté le distingue. (poids : hérité, non utilisé)
const F_FISH_BY_LOC = {
  'Plage': [
    { nom:'Concombre de mer', val:2, poids:20 },
    { nom:'Anguille',         val:3, poids:20 },
    { nom:'Poisson-globe',    val:4, poids:20 },
    { nom:'Poulpe',           val:5, poids:15 },
    { nom:'Poisson écarlate', val:6, poids:5, legendaire:true },
  ],
  'Rivière': [
    { nom:'Perche',             val:2, poids:20 },
    { nom:'Truite arc-en-ciel', val:3, poids:20 },
    { nom:'Carpe de minuit',    val:4, poids:20 },
    { nom:'Esturgeon',          val:5, poids:10 },
    { nom:'Légende',            val:6, poids:5, legendaire:true },
  ],
};
// Tirage UNIFORME : tous les poissons d'un lieu ont la MÊME chance d'apparaître (seule la difficulté « val » varie) — comme les reliques.
function fPickFish(loc, legBoost){
  const table = F_FISH_BY_LOC[loc] || [];
  if(!table.length) return null;
  if(legBoost){   // appât miracle : +legBoost points de % d'apparition pour le légendaire, ce tirage seulement
    const legP = (1/table.length) + (legBoost/100);   // ex : 1/5 + 0,10 = 30% pour le légendaire
    if(Math.random() < legP){ return table.find(f=>f.legendaire) || table[table.length-1]; }
    const others = table.filter(f=>!f.legendaire);
    return others.length ? others[Math.floor(Math.random()*others.length)] : table[0];
  }
  return table[Math.floor(Math.random()*table.length)];
}
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
const F_FIELD_BASE = 4;   // nombre de graines plantables au départ
const F_FIELD_BONUS = 2;  // gain de capacité par amélioration de la ferme
function fFieldCapacity(st){ return (typeof st.fieldCapacity==='number') ? st.fieldCapacity : F_FIELD_BASE; }

// Table de la mine par niveau (probabilités en %, total 100) + or gagné selon le niveau.
// Descendre plus profond = plus de risque de monstre MAIS plus de chances d'or.
const F_MINE_TABLE = {
  1:{ pierre:50, charbon:30, escalier:15, or:0,  monstre:5  },
  2:{ pierre:45, charbon:30, escalier:15, or:5,  monstre:5  },
  3:{ pierre:40, charbon:30, escalier:15, or:10, monstre:5  },
  4:{ pierre:35, charbon:30, escalier:10, or:15, monstre:10 },
  5:{ pierre:30, charbon:30, escalier:0,  or:20, monstre:20 },
};
const F_MINE_GOLD = { 2:3, 3:3, 4:5, 5:8 };   // or trouvé selon le niveau

// ── Registre d'actions de métier (pattern réutilisable) ──
// Chaque action : { id, label, desc, locations (null=partout), check(st)->{ok,why}, apply(st)->message }
const F_ACTIONS = {
  'Bûcheron': [
    { id:'hache', label:'🪓 Hache améliorée', desc:'5 or → « Couper du bois » rapporte ×2 (définitif)', locations:['Magasin'],
      check:(st, ctx)=>{
        if(ctx && ctx.player && ctx.player.betterAxe) return {ok:false, why:'tu as déjà une hache améliorée'};
        return (st.gold||0)>=5 ? {ok:true} : {ok:false, why:'besoin de 5 or'};
      },
      apply:(st, ctx)=>{
        st.gold=(st.gold||0)-5;
        if(ctx && ctx.player) ctx.player.betterAxe = true;
        return 'achète une hache améliorée 🪓 (-5 or) : « Couper du bois » rapporte désormais le double';
      } },
    { id:'couper', label:'🪓 Couper du bois', desc:'+2 bois', locations:['Forêt'],
      check:(st)=>({ok:true}),
      apply:(st, ctx)=>{ const n=(ctx && ctx.player && ctx.player.betterAxe)?4:2; st.inventory['bois']=(st.inventory['bois']||0)+n; return 'coupe du bois (+'+n+' bois'+(n>2?' 🪓 hache améliorée':'')+')'; } },
    { id:'buche', label:'🪵 1 bois → 1 bûche', desc:null, locations:null,
      check:(st)=>((st.inventory['bois']||0)>=1?{ok:true}:{ok:false,why:'besoin de 1 bois'}),
      apply:(st)=>{ st.inventory['bois']-=1; if(st.inventory['bois']<=0)delete st.inventory['bois']; st.inventory['bûche']=(st.inventory['bûche']||0)+1; return 'transforme 1 bois en 1 bûche'; } },
    { id:'brindille', label:'🌿 1 bois → 2 brindilles', desc:null, locations:null,
      check:(st)=>((st.inventory['bois']||0)>=1?{ok:true}:{ok:false,why:'besoin de 1 bois'}),
      apply:(st)=>{ st.inventory['bois']-=1; if(st.inventory['bois']<=0)delete st.inventory['bois']; st.inventory['brindille']=(st.inventory['brindille']||0)+2; return 'transforme 1 bois en 2 brindilles'; } },
    { id:'couper_dur', label:'🪵 Couper du bois dur', desc:'+1 bois dur', locations:['Montagne'],
      check:(st)=>({ok:true}),
      apply:(st)=>{ st.inventory['bois dur']=(st.inventory['bois dur']||0)+1; return 'coupe du bois dur en montagne (+1 bois dur)'; } },
    { id:'ameliorer', label:'🏡 Améliorer la ferme', locations:['Ferme'],
      desc:(st)=>'2 bois + 1 bois dur → champ '+fFieldCapacity(st)+' → '+(fFieldCapacity(st)+F_FIELD_BONUS),
      check:(st)=>{ const miss=[]; if((st.inventory['bois']||0)<2) miss.push('2 bois'); if((st.inventory['bois dur']||0)<1) miss.push('1 bois dur'); return miss.length?{ok:false,why:'besoin de '+miss.join(' + ')}:{ok:true}; },
      apply:(st)=>{
        st.inventory['bois']-=2; if(st.inventory['bois']<=0)delete st.inventory['bois'];
        st.inventory['bois dur']-=1; if(st.inventory['bois dur']<=0)delete st.inventory['bois dur'];
        st.fieldCapacity = fFieldCapacity(st) + F_FIELD_BONUS;
        return 'améliore la ferme 🏡 : le champ peut désormais accueillir '+st.fieldCapacity+' cultures (+'+F_FIELD_BONUS+')';
      } },
  ],
  'Mineur': [
    { id:'pioche', label:'⛏️ Pioche améliorée', desc:'5 or → pierre/charbon ×2 en mine (définitif)', locations:['Magasin'],
      check:(st, ctx)=>{
        if(ctx && ctx.player && ctx.player.betterPick) return {ok:false, why:'tu as déjà une pioche améliorée'};
        return (st.gold||0)>=5 ? {ok:true} : {ok:false, why:'besoin de 5 or'};
      },
      apply:(st, ctx)=>{
        st.gold=(st.gold||0)-5;
        if(ctx && ctx.player) ctx.player.betterPick = true;
        return 'achète une pioche améliorée ⛏️ (-5 or) : pierre et charbon rapportent le double en mine';
      } },
    { id:'explorer', label:'⛏️ Explorer la mine', locations:['Montagne'],
      desc:(st)=>{ const lvl=st.mineLevel||1; const t=F_MINE_TABLE[lvl]||F_MINE_TABLE[5]; return 'niv. '+lvl+'/5 · monstre '+t.monstre+'%'+(t.or?(' · or '+t.or+'%'):''); },
      check:(st)=>({ok:true}),
      apply:(st, ctx)=>{
        const lvl = st.mineLevel||1;
        const t = F_MINE_TABLE[lvl] || F_MINE_TABLE[5];
        const r = Math.random()*100;
        let acc = t.pierre;
        if(r < acc){ const n=(ctx&&ctx.player&&ctx.player.betterPick)?2:1; st.inventory['pierre']=(st.inventory['pierre']||0)+n; return 'explore la mine (niv. '+lvl+') et trouve '+n+' pierre'+(n>1?'s ⛏️':''); }
        acc += t.charbon;
        if(r < acc){ const n=(ctx&&ctx.player&&ctx.player.betterPick)?2:1; st.inventory['charbon']=(st.inventory['charbon']||0)+n; return 'explore la mine (niv. '+lvl+') et trouve '+n+' charbon'+(n>1?' ⛏️':''); }
        acc += t.or;
        if(r < acc){ const g=F_MINE_GOLD[lvl]||0; st.gold=(st.gold||0)+g; return 'explore la mine (niv. '+lvl+') et trouve un filon d\'or (+'+g+' or) !'; }
        acc += t.escalier;
        if(r < acc){
          if(lvl<5){ st.mineLevel=lvl+1; if(st.mineLevel>=5) st.mineBottomReached=true; return 'découvre un escalier 🪜 et le groupe descend au niveau '+(lvl+1)+' de la mine'; }
          return 'découvre un escalier, mais la mine est déjà au plus profond (niv. 5)';
        }
        const F_SKULL_SAFE = ['poisson grillé','plat de veillée'];   // ne peuvent jamais être perdus sur un crâne
        const keys = Object.keys(st.inventory).filter(k=>F_SKULL_SAFE.indexOf(k)<0);
        if(keys.length===0){ return 'réveille un crâne de monstre 💀… mais le groupe n\'a aucun objet à perdre !'; }
        const k = keys[Math.floor(Math.random()*keys.length)];
        st.inventory[k]-=1; if(st.inventory[k]<=0) delete st.inventory[k];
        return 'réveille un crâne de monstre 💀 et le groupe perd 1 '+k+' !';
      } },
    { id:'echanger_charbon', label:'⛏️ Transformer une pierre en charbon', desc:'-1 pierre · +1 charbon', locations:null,
      check:(st)=>((st.inventory['pierre']||0)>=1 ? {ok:true} : {ok:false, why:'il faut au moins 1 pierre'}),
      apply:(st)=>{ st.inventory['pierre']=(st.inventory['pierre']||0)-1; if(st.inventory['pierre']<=0) delete st.inventory['pierre']; st.inventory['charbon']=(st.inventory['charbon']||0)+1; return 'transforme 1 pierre en 1 charbon ⚫'; } },
    { id:'relique', label:'🏺 Chercher une relique', locations:['Montagne'],
      desc:(st)=>{ const rest=fRelicsLeft(st).length; return rest+' relique'+(rest>1?'s':'')+' encore \u00e0 d\u00e9couvrir'; },
      check:(st)=>(fRelicsLeft(st).length>0?{ok:true}:{ok:false,why:'toutes les reliques sont au mus\u00e9e'}),
      apply:(st)=>{
        const left = fRelicsLeft(st);
        if(!left.length) return 'fouille les galeries, mais le mus\u00e9e a d\u00e9j\u00e0 toutes les reliques';
        // Toutes les reliques restantes ont la m\u00eame chance d'\u00eatre trouv\u00e9es
        const relic = left[Math.floor(Math.random()*left.length)];
        const roll = 1 + Math.floor(Math.random()*6);
        if(roll >= relic.val){
          if(!Array.isArray(st.museum)) st.museum=[];
          st.museum.push(relic.nom);
          return 'd\u00e9couvre \u00ab '+relic.nom+' \u00bb (difficult\u00e9 '+relic.val+') \u00b7 d\u00e9 \ud83c\udfb2 '+roll+' \u2713 ramen\u00e9e au mus\u00e9e \ud83c\udffa !';
        }
        return 'd\u00e9couvre \u00ab '+relic.nom+' \u00bb (difficult\u00e9 '+relic.val+') \u00b7 d\u00e9 \ud83c\udfb2 '+roll+' \u2717 la relique se brise en la d\u00e9gageant\u2026';
      } },
  ],
  'Pêcheur': [
    { id:'canne', label:'🎣 Canne améliorée', desc:'10 poissons → +1 au dé sur les légendaires (définitif)', locations:['Plage'],
      check:(st, ctx)=>{
        if(ctx && ctx.player && ctx.player.betterRod) return {ok:false, why:'tu as déjà une canne améliorée'};
        return (st.inventory['poisson']||0)>=10 ? {ok:true} : {ok:false, why:'besoin de 10 poissons'};
      },
      apply:(st, ctx)=>{
        st.inventory['poisson']=(st.inventory['poisson']||0)-10; if(st.inventory['poisson']<=0) delete st.inventory['poisson'];
        if(ctx && ctx.player) ctx.player.betterRod = true;
        return 'échange 10 poissons contre une canne à pêche améliorée 🎣 (+1 au dé sur les légendaires)';
      } },
    { id:'appat', label:'✨ Acheter un appât miracle', desc:'-1 or · +10% d\'apparition du légendaire au prochain lancer', locations:['Plage'],
      check:(st)=>((st.gold||0)>=1 ? {ok:true} : {ok:false, why:'besoin de 1 or'}),
      apply:(st)=>{ st.gold=(st.gold||0)-1; st.inventory['appât miracle']=(st.inventory['appât miracle']||0)+1; return 'achète un appât miracle à la plage (-1 or) : +10% de chance de croiser un légendaire au prochain lancer'; } },
    { id:'pecher', label:'🎣 Pêcher', locations:['Rivière','Plage'],
      desc:'carte poisson + dé',
      check:(st)=>({ok:true}),
      apply:(st, ctx)=>{
        const loc = (ctx && ctx.location) || 'Rivière';
        const miracle = (st.inventory['appât miracle']||0) > 0;
        if(miracle){ st.inventory['appât miracle']-=1; if(st.inventory['appât miracle']<=0) delete st.inventory['appât miracle']; }
        const fish = fPickFish(loc, miracle ? 10 : 0);   // appât miracle : +10% d'apparition du légendaire ce tirage
        if(!fish){ return 'lance sa ligne, mais il n\'y a rien à pêcher ici'; }
        const rodBonus = (fish.legendaire && ctx && ctx.player && ctx.player.betterRod) ? 1 : 0;   // canne améliorée : +1 sur les légendaires uniquement
        const roll = 1 + Math.floor(Math.random()*6) + rodBonus;
        const bonusTxt = (miracle?' (appât miracle)':'') + (rodBonus?' (canne +1)':'');
        const nm = fish.legendaire ? ('✨ '+fish.nom+' (LÉGENDAIRE)') : fish.nom;
        if(roll >= fish.val){
          const gain = fish.legendaire ? 2 : 1;   // bonus : +1 poisson supplémentaire pour un légendaire
          st.inventory['poisson']=(st.inventory['poisson']||0)+gain;
          if(fish.legendaire) st.legendaryCount=(st.legendaryCount||0)+1;
          return 'pêche '+nm+' (difficulté '+fish.val+') · dé 🎲 '+roll+bonusTxt+' ✓ attrapé ! (+'+gain+' poisson'+(gain>1?'s':'')+(fish.legendaire?' ✨ LÉGENDAIRE !':'')+')';
        }
        return 'pêche '+nm+' (difficulté '+fish.val+') · dé 🎲 '+roll+bonusTxt+' ✗ le poisson s\'échappe';
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
      check:(st)=>{
        const cap=fFieldCapacity(st), n=(st.crops||[]).length;
        if(n>=cap) return {ok:false,why:'champ plein ('+n+'/'+cap+') — fais améliorer la ferme'};
        return (st.gold||0)>=F_SEED_PRICE ? {ok:true} : {ok:false,why:'besoin de '+F_SEED_PRICE+' or'};
      },
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

// Affichage des objectifs de grand-père (cartes visuelles avec progression)
// Libellé simplifié d'une ressource d'objectif (suit la maquette : « bûche » s'affiche « Bois »)
function fPartLabel(key){
  const map = {};
  const l = map[key] || key;
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function fObjectivesCards(st){
  const objs = fObjectivesState(st).filter(o=>!o.def.hidden);   // les objectifs « hidden » sont suivis mais pas encore affichés
  const N = Math.max(1, fPlayers(st).length);
  const allDone = objs.every(o=>o.done);
  const cards = objs.map(o=>{
    const pct = o.target>0 ? Math.round(o.current/o.target*100) : 0;
    const parts = o.def.parts;
    const partsHtml = parts.map(p=>{
      let t = p.per*N;
      if(p.key==='__museum__') t = Math.min(t, F_RELICS.length);
      let have;
      if(p.key==='__legendary__') have = st.legendaryCount||0;
      else if(p.key==='__museum__') have = (Array.isArray(st.museum)?st.museum.length:0);
      else have = st.inventory[p.key]||0;
      const ok = have>=t;
      const label = p.key==='__legendary__' ? 'Légendaire' : (p.key==='__museum__' ? 'Relique' : (p.key.charAt(0).toUpperCase()+p.key.slice(1)));
      return '<span class="obj-part'+(ok?' ok':'')+'">'+escHtml(label)+' '+Math.min(have,t)+'/'+t+'</span>';
    }).join('');
    return '<div class="obj-item'+(o.done?' done':'')+'">'+
      '<div class="obj-head">'+
        '<span class="obj-title">'+escHtml(o.def.titre)+'</span>'+
        (o.done?'<span class="obj-check">✓</span>':'<span class="obj-count">'+o.current+'/'+o.target+'</span>')+'</div>'+
      '<div class="obj-bar"><div class="obj-bar-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="obj-parts">'+partsHtml+'</div></div>';
  }).join('');
  return '<div class="obj-list">'+cards+'</div>';
}

// Affichage du musée (reliques rapportées)
function fMuseum(st){
  const mus = Array.isArray(st.museum)?st.museum:[];
  const total = F_RELICS.length;
  if(!mus.length) return '<div class="f-empty-mb">🏺 Musée : aucune relique rapportée ('+total+' à découvrir)</div>';
  const badges = mus.map(n=>'<span class="inv-item pill-ready">🏺 '+escHtml(n)+'</span>').join('');
  return '<div class="u-mb-sm"><div class="f-caption-sm">🏺 Musée ('+mus.length+'/'+total+' reliques)</div><div class="finv">'+badges+'</div></div>';
}

// Affichage du champ commun (cultures en cours)
function fCrops(st){
  const crops = st.crops||[];
  const cap = fFieldCapacity(st);
  if(!crops.length) return '<div class="f-empty-mb">🌱 Champ commun : vide (0/'+cap+')</div>';
  const cropIcon={ panais:'🥕', tomate:'🍅', salade:'🥬' };
  const badges = crops.slice().sort((a,b)=>b.level-a.level).map(c=>{
    const max = F_CROP_MAX[c.type] || 4;
    const ic = cropIcon[c.type] || '🌱';
    const ready = c.level>=max;
    return '<span class="inv-item'+(ready?' pill-ready':'')+'">'+ic+' '+(c.type||'?')+' niv. '+c.level+'/'+max+'</span>';
  }).join('');
  return '<div class="u-mb-sm"><div class="f-caption-warm">🌱 Champ commun ('+crops.length+'/'+cap+')</div><div class="finv">'+badges+'</div></div>';
}

function fMetierActions(metier, st){ const def = F_ACTIONS[metier]; if(typeof def==='function') return def(st||ferme||{inventory:{},crops:[],gold:0}) || []; return def || []; }
function fHasValidAction(st, pseudo){
  const p = st.players[pseudo]; if(!p) return false;
  return fMetierActions(p.metier, st).some(a => (!a.locations || a.locations.indexOf(p.location)>=0) && a.check(st, { location:p.location, player:p }).ok);
}
const F_LOC_CAP = 2; // nombre max de joueurs par lieu
function fLocationCount(st, loc, exceptPseudo){ return fPlayers(st).filter(p=>p.location===loc && p.pseudo!==exceptPseudo && !p.done).length; } // !p.done : les joueurs ayant fini leur tour (garés à la Ferme) n'occupent plus de place
function fCanEnter(st, loc, pseudo){ return fLocationCount(st, loc, pseudo) < F_LOC_CAP; }
// Reliques pas encore ramenées au musée
function fRelicsLeft(st){ const mus = Array.isArray(st.museum)?st.museum:[]; return F_RELICS.filter(r=>mus.indexOf(r.nom)<0); }

// ── Objectifs de grand-père (suivi, sans consommation) ──
// Chaque objectif : par joueur (× nombre de joueurs). progress(st, N) -> { current, target }
const F_OBJECTIVES = [
  {
    id:'feu', icon:'🔥', titre:'Préparer le feu de camp',
    desc:'Rassembler le bois, la pierre et le charbon pour un grand feu.',
    // 4 ressources, chacune 2 par joueur
    parts:[
      { key:'bûche',     per:2, icon:'🪵' },
      { key:'brindille', per:2, icon:'🌿' },
      { key:'pierre',    per:2, icon:'🪨' },
      { key:'charbon',   per:2, icon:'⚫' },
    ],
    progress:(st, N)=>{
      let cur=0, tgt=0;
      F_OBJECTIVES[0].parts.forEach(p=>{ const t=p.per*N; tgt+=t; cur+=Math.min(st.inventory[p.key]||0, t); });
      return { current:cur, target:tgt };
    },
  },
  {
    id:'plats', icon:'🍲', titre:'Nourrir les villageois',
    desc:'Cuisiner un plat de veillée pour chaque villageois.',
    parts:[ { key:'plat de veillée', per:1, icon:'🍲' } ],
    progress:(st, N)=>{
      const t=N; return { current:Math.min(st.inventory['plat de veillée']||0, t), target:t };
    },
  },
  {
    id:'legende', icon:'🎣', titre:'Pêcher un poisson légendaire',
    desc:'Décrocher un poisson légendaire pour chaque villageois.',
    parts:[ { key:'__legendary__', per:1, icon:'✨' } ],
    progress:(st, N)=>{
      const t=N; return { current:Math.min(st.legendaryCount||0, t), target:t };
    },
  },
  {
    id:'musee', icon:'🏺', titre:'Faire un don au musée',
    desc:'Rapporter une relique au musée de la ville pour chaque villageois.',
    parts:[ { key:'__museum__', per:1, icon:'🏺' } ],
    progress:(st, N)=>{
      // plafonné au nombre de reliques existantes pour que l'objectif reste atteignable
      const t = Math.min(N, F_RELICS.length);
      const mus = Array.isArray(st.museum)?st.museum.length:0;
      return { current:Math.min(mus, t), target:t };
    },
  },
  {
    // BONUS préparé mais MASQUÉ (hidden:true) — Damien réfléchit à l'affichage. Suivi = validé quand la mine atteint le niveau 5.
    id:'fond', icon:'⛏️', titre:'Atteindre le fond de la mine', hidden:true,
    desc:'Descendre jusqu\'au niveau 5 de la mine.',
    parts:[ { key:'__minebottom__', per:1, icon:'⛏️' } ],
    progress:(st, N)=>({ current: st.mineBottomReached?1:0, target:1 }),
  },
];

function fObjectivesState(st){
  const N = Math.max(1, fPlayers(st).length);
  return F_OBJECTIVES.map(o=>{
    const pr = o.progress(st, N);
    return { def:o, current:pr.current, target:pr.target, done: pr.current>=pr.target };
  });
}
function fShuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function fNormalize(st){
  if(!st) return st;
  st.players   = (st.players && typeof st.players==='object') ? st.players : {};
  st.turnOrder = Array.isArray(st.turnOrder) ? st.turnOrder : (st.turnOrder ? Object.values(st.turnOrder) : []);
  st.inventory = (st.inventory && typeof st.inventory==='object') ? st.inventory : {};
  st.locations = F_LOCATIONS.slice();  // la carte est définie par le code (gère la suppression de lieux)
  st.gold      = (typeof st.gold==='number') ? st.gold : 0;
  st.turn      = (typeof st.turn==='number') ? st.turn : 1;
  st.currentIdx= (typeof st.currentIdx==='number') ? st.currentIdx : 0;
  st.mineLevel = (typeof st.mineLevel==='number') ? st.mineLevel : 1;
  st.mineBottomReached = !!st.mineBottomReached;
  st.legendaryCount = (typeof st.legendaryCount==='number') ? st.legendaryCount : 0;
  st.fieldCapacity = (typeof st.fieldCapacity==='number' && st.fieldCapacity>0) ? st.fieldCapacity : F_FIELD_BASE;
  // Firebase supprime les tableaux vides : on reconstruit toujours le musée
  st.museum = Array.isArray(st.museum) ? st.museum : (st.museum ? Object.values(st.museum) : []);
  st.history = Array.isArray(st.history) ? st.history : (st.history ? Object.values(st.history) : []);
  st.crops = Array.isArray(st.crops) ? st.crops : (st.crops ? Object.values(st.crops) : []);
  // Répare/purge les cultures héritées d'anciennes parties (sans type valide) pour éviter les récoltes "undefined"
  const _validTypes = (typeof F_CROP_MAX!=='undefined') ? Object.keys(F_CROP_MAX) : ['panais','tomate','salade'];
  st.crops = st.crops
    .filter(c => c && typeof c==='object')
    .map(c => ({ id: c.id || ('crop'+Math.random().toString(36).slice(2)), type: c.type, level: (typeof c.level==='number' && c.level>=1) ? c.level : 1 }))
    .filter(c => _validTypes.indexOf(c.type) >= 0);
  if(st.lastAction && typeof st.lastAction!=='object') st.lastAction = null;
  fFixLocations(st);
  return st;
}
function fPlayers(st){ return Object.values(st.players); }
// Un joueur situé sur un lieu qui n'existe plus est remis "non placé"
function fFixLocations(st){ fPlayers(st).forEach(p=>{ if(p.location && F_LOCATIONS.indexOf(p.location)<0) p.location=null; }); return st; }
function fCurrent(st){ return st.turnOrder[st.currentIdx] || null; }
// Un joueur qui n'a pas choisi de métier est considéré absent : son tour est passé automatiquement
function fIsAbsent(p){ return !p || !p.metier; }
// Avance currentIdx jusqu'au prochain joueur actif (marque les absents comme terminés)
function fSkipAbsent(st){
  while(st.currentIdx < st.turnOrder.length){
    const p = st.players[st.turnOrder[st.currentIdx]];
    if(!fIsAbsent(p)) break;
    if(p) p.done = true;
    st.currentIdx += 1;
  }
  return st;
}

// ── Control handlers ──
const F_START_GOLD = 5;  // or commun au début de la partie

function startFerme(){
  // Lobby ouvert : pas de nombre de joueurs à fixer, le meneur lance quand il est prêt
  fbSetFerme({
    active:true, phase:'lobby', turn:1, maxTurns:F_MAXTURNS,
    players:{}, turnOrder:[], currentIdx:0, inventory:{}, gold:F_START_GOLD, mineLevel:1, crops:[], legendaryCount:0, museum:[], fieldCapacity:F_FIELD_BASE, locations:F_LOCATIONS.slice(),
    lastEvent:'Lobby ouvert — les villageois peuvent rejoindre la partie.'
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
  st.lastEvent = n+' villageois dans le lobby.';
  fbSetFerme(st);
}

function fermeLeave(pseudo){
  if(!ferme || ferme.phase!=='lobby') return;
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  delete st.players[pseudo];
  st.lastEvent = fPlayers(st).length+' villageois dans le lobby.';
  fbSetFerme(st);
}

function fermeForceStart(){
  if(!ferme || ferme.phase!=='lobby') return;
  if(fPlayers(ferme).length===0){ toast('Aucun villageois n\'a rejoint le lobby !'); return; }
  const st = fNormalize(JSON.parse(JSON.stringify(ferme)));
  fStartPlanning(st);
  fbSetFerme(st);
}

function fStartPlanning(st){
  const players = fPlayers(st);
  // Ordre = celui de la liste des joueurs (déterministe) ; le « premier joueur » tourne à chaque tour (comme le vrai jeu) → prévisible.
  const base = players.map(p=>p.pseudo);
  const startIdx = base.length ? ((st.turn-1) % base.length) : 0;
  const order = base.slice(startIdx).concat(base.slice(0, startIdx));
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
  // Les joueurs sans métier sont considérés ABSENTS : on peut lancer sans les attendre
  const sansMetier = fPlayers(st).filter(p=>!p.metier).map(p=>p.pseudo);
  if(sansMetier.length){
    if(!confirm(sansMetier.length+' joueur(s) sans métier : '+sansMetier.join(', ')+'.\n\nLancer quand même ? Ils seront marqués absents (sans métier, non placés) et leur tour sera passé automatiquement.')) return;
  }
  fPlayers(st).forEach(p=>{
    if(!p.metier){
      // Absent : non placé, il n'occupe donc aucune place et ne gêne personne
      p.location = null; p.done = true; p.actionsDone = 0; p.hasMoved = false;
      return;
    }
    // Présent mais sans lieu choisi : placement auto en respectant la limite de 2 par lieu
    if(!p.location){
      const spot = st.locations.find(l=>fCanEnter(st, l, p.pseudo)) || 'Ferme';
      p.location = spot;
    }
  });
  st.phase='action'; st.currentIdx=0;
  fSkipAbsent(st);
  if(st.currentIdx >= st.turnOrder.length){
    // Aucun joueur actif ce tour : on enchaîne directement
    st.lastEvent = 'Tour '+st.turn+' — aucun joueur actif, le tour passe.';
    fEndTurn(st);
    fbSetFerme(st);
    return;
  }
  const nAbs = sansMetier.length;
  st.lastEvent = 'Tour '+st.turn+' — Phase d\'action. Au tour de '+(fCurrent(st)||'—')+'.'+(nAbs?(' ('+nAbs+' absent'+(nAbs>1?'s':'')+')'):'');
  fbSetFerme(st);
}


function fAdvance(st){
  const cur = fCurrent(st);
  if(cur){ st.players[cur].done=true; st.players[cur].location='Ferme'; }
  st.currentIdx += 1;
  fSkipAbsent(st);   // les joueurs absents sont passés automatiquement
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
  const chk = act.check(st, { location:p.location, player:p });
  if(!chk.ok){ toast(chk.why||'Action impossible'); return; }
  const msg = act.apply(st, { location: p.location, player:p, pseudo });
  p.actionsDone = (p.actionsDone||0)+1;
  st.lastEvent = pseudo+' '+msg+'.';
  // résultat persistant de la dernière action (ne se fait pas écraser par le passage au joueur suivant)
  st.lastAction = { pseudo, msg, metier:p.metier, at:Date.now() };
  st.history = Array.isArray(st.history) ? st.history : [];
  st.history.push({ pseudo, msg, metier:p.metier, turn:st.turn, at:Date.now() });
  if(st.history.length>120) st.history = st.history.slice(-120);   // borne pour ne pas gonfler Firebase
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
  const locTxt = p.location ? ((F_LOC_ICON[p.location]||'')+' '+p.location) : 'non placé';
  let html = '<div class="f-label-lg">Actions '+done+'/2 — '+(p.metier?(F_METIER_ICON[p.metier]+' '+p.metier):'sans métier')+' à '+locTxt+'</div>';
  if(done>=2){ return html+'<div class="diamant-voted">Les 2 actions sont faites, le tour se termine.</div>'; }
  const avail = fMetierActions(p.metier, st).filter(a=>!a.locations || a.locations.indexOf(p.location)>=0);
  if(!p.metier){
    html += '<div class="f-empty">Pas de métier ce tour — tu peux te déplacer ou passer.</div>';
  } else if(avail.length===0){
    html += '<div class="f-empty">Aucune action de '+p.metier+' possible ici. Déplace-toi vers le bon lieu.</div>';
  } else {
    // Boutons d'action sur une seule ligne, sans les indications de règles
    // (la raison d'un blocage reste accessible en infobulle)
    html += '<div class="f-actions-row">';
    avail.forEach(a=>{
      const chk = a.check(st, { location:p.location, player:p });
      const dis = chk.ok ? '' : 'disabled';
      const dtxt = (typeof a.desc==='function') ? a.desc(st) : a.desc;
      const tip = chk.ok ? (dtxt||'') : (chk.why||'indisponible');
      html += '<button class="btn-primary-continue" '+dis+(tip?(' title="'+escAttr(tip)+'"'):'')+' onclick="fermeDoAction(\''+escAttr(pseudo)+'\',\''+a.id+'\')">'+a.label+'</button>';
    });
    html += '</div>';
  }
  const canMove = !p.hasMoved && done<2 && (done>=1 || !fHasValidAction(st,pseudo));
  if(canMove){
    html += '<div class="f-label-mv">'+(done>=1?'Se déplacer, puis 1 dernière action :':'Se déplacer (aucune action possible ici) :')+'</div>'+
      '<div class="f-move-row">'+
      st.locations.filter(l=>l!==p.location).map(l=>'<button class="btn-secondary" onclick="fermePlayerMove(\''+escAttr(pseudo)+'\',\''+escAttr(l)+'\')">'+F_LOC_ICON[l]+' '+l+'</button>').join('')+'</div>';
  }
  return html;
}

function fEndTurn(st){
  if(st.turn >= st.maxTurns){ st.phase='gameEnd'; st.result=null; st.lastEvent='🏁 Fin du dernier tour ! Déclare victoire ou défaite.'; return st; }
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

const F_RESOURCES = ['bois','bois dur','bûche','brindille','pierre','charbon','minerai de cuivre','cuivre','minerai de fer','fer','poisson','poisson grillé','appât miracle','panais','tomate','salade','plat de veillée','oeuf','lait'];

// ── Rendering ──
function fLastActionBanner(st, opts){
  opts = opts||{};
  if(!st.lastAction || !st.lastAction.msg) return '';
  const skull = /crâne/.test(st.lastAction.msg);
  const border = skull ? 'var(--danger)' : 'var(--success)';
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

function fStatusPills(st, opts){
  opts = opts||{};
  const phaseLabel = { lobby:'Lobby', planning:'Planification', action:'Action', gameEnd:'Fin' }[st.phase]||st.phase;
  let html = '<div class="fturn-pill">Tour <strong>'+st.turn+'/'+st.maxTurns+'</strong></div>'+
         '<span class="fphase-badge fphase-'+st.phase+'">'+phaseLabel+'</span>'+
         '<div class="fturn-pill">⛏️ Mine <strong>niv. '+(st.mineLevel||1)+'/5</strong></div>';
  if(opts.gold!==false) html += '<div class="fgold">🪙 '+st.gold+' or</div>';
  return html;
}

function fBoard(st, opts){
  opts = opts||{};
  const cur   = fCurrent(st);
  const me    = opts.pseudo || null;                                  // joueur qui peut cliquer (vue joueur)
  const myLoc = me && st.players[me] ? st.players[me].location : null;
  return '<div class="ferme-board">'+ st.locations.map(loc=>{
    const here = fPlayers(st).filter(p=>p.location===loc);
    // Noms des joueurs présents, affichés SOUS la carte du lieu
    const names = here.map(p=>'<span class="fpawn'+(p.pseudo===cur?' current':'')+(p.pseudo===me?' mine':'')+'">'+escHtml(p.pseudo)+'</span>').join('');
    const active    = here.filter(p=>!p.done).length;   // seuls les joueurs encore actifs occupent une place (les « done » garés à la Ferme ne bloquent pas)
    const full      = active>=F_LOC_CAP && myLoc!==loc;
    const clickable = !!opts.pick && !full;
    const sel  = (myLoc===loc)?' selected':'';
    const cls  = 'floc'+sel+(clickable?' floc-btn':'')+((opts.pick&&full)?' floc-full':'');
    const click = clickable ? ' onclick="'+opts.pick+'(\''+escAttr(me)+'\',\''+escAttr(loc)+'\')"' : '';
    const badge = (opts.pick && full) ? '<span class="floc-badge">complet</span>' : '';
    return '<div class="'+cls+'"'+click+'>'+
      '<div class="floc-visual"><img class="floc-img" src="'+F_LOC_IMG[loc]+'" alt="'+escAttr(loc)+'" draggable="false">'+badge+'</div>'+
      '<div class="floc-pawns">'+names+'</div></div>';
  }).join('') + '</div>';
}

function fPlayersList(st, highlight){
  const cur = fCurrent(st);
  return fPlayers(st).map(p=>{
    const isCur = (st.phase==='action' && p.pseudo===cur);
    const absent = (st.phase==='action' && fIsAbsent(p));
    const metier = p.metier ? '<span class="player-info">'+(F_METIER_ICON[p.metier]||'')+' '+p.metier+'</span>' : '<span class="player-info u-dimmer">sans métier</span>';
    const loc = p.location ? '<span class="player-info">'+F_LOC_ICON[p.location]+' '+p.location+'</span>' : '<span class="player-info u-dimmer">non placé</span>';
    const status = absent ? 'absent' : (p.done ? 'a joué' : (isCur ? 'à son tour' : 'en jeu'));
    const isCurrent = isCur || (p.pseudo===highlight);
    const cls = 'player-row'+(isCurrent?' is-current':'')+((p.done||absent)?' is-out':'');
    return '<div class="'+cls+'">'+
      '<span class="player-name">'+escHtml(p.pseudo)+'</span>'+
      '<span class="player-infos">'+metier+loc+'</span>'+
      '<span class="player-status">'+status+'</span></div>';
  }).join('');
}

// Liste des joueurs — VUE JOUEUR (maquette Ferme) : métier + icône, badges « à son tour » / « 1er joueur »,
// pas de lieu, ordre = liste des joueurs (1er joueur du tour 1 en tête), ta propre ligne surlignée.
function fViewerPlayers(st, mePseudo){
  const cur   = fCurrent(st);
  const first = (st.turnOrder||[])[0] || null;
  return fPlayers(st).map(p=>{
    const inAction = (st.phase==='action');
    const isCur    = inAction && p.pseudo===cur;
    const isFirst  = p.pseudo===first;
    const absent   = inAction && fIsAbsent(p);
    const metier = p.metier
      ? '<span class="player-info">'+p.metier+'</span>'
      : '<span class="player-info u-dimmer">sans métier</span>';
    let objet = '';
    if(p.betterRod)  objet += '<span class="player-info" title="Canne à pêche améliorée">🎣</span>';
    if(p.betterAxe)  objet += '<span class="player-info" title="Hache améliorée">🪓</span>';
    if(p.betterPick) objet += '<span class="player-info" title="Pioche améliorée">⛏️</span>';
    let status = '';
    if(absent) status = 'absent';
    else if(isCur) status = 'à son tour';
    else if(isFirst) status = '1er joueur';
    else if(p.done) status = 'a joué';
    const cls = 'player-row'+(p.pseudo===mePseudo?' is-current':'')+((p.done||absent)?' is-out':'');
    return '<div class="'+cls+'">'+
      '<span class="player-name">'+escHtml(p.pseudo)+'</span>'+
      '<span class="player-infos">'+metier+objet+'</span>'+
      '<span class="player-status">'+status+'</span></div>';
  }).join('');
}

function fInventory(st){
  const CROPS = (typeof F_CROP_MAX!=='undefined') ? Object.keys(F_CROP_MAX) : ['panais','tomate','salade'];
  const keys = Object.keys(st.inventory);
  const recolte    = keys.filter(k=>CROPS.indexOf(k)>=0);   // produits de récolte (panais/tomate/salade)
  const ressources = keys.filter(k=>CROPS.indexOf(k)<0);    // tout le reste (bois, pierre, poisson, plats…)
  const pill = k=>'<span class="inv-item">'+escHtml(k)+' <strong>×'+st.inventory[k]+'</strong></span>';
  let h = '<div class="u-mb-sm"><div class="f-caption-sm">Or</div><div class="finv"><span class="inv-item">Or <strong>×'+(st.gold||0)+'</strong></span></div></div>';
  if(ressources.length) h += '<div class="u-mb-sm"><div class="f-caption-sm">Ressources</div><div class="finv">'+ressources.map(pill).join('')+'</div></div>';
  if(recolte.length)    h += '<div class="u-mb-sm"><div class="f-caption-sm">Récolte</div><div class="finv">'+recolte.map(pill).join('')+'</div></div>';
  return h;
}

// Retire les emojis d'une chaîne d'affichage — vue meneur : emotes réservées à la vue joueur.
// (préserve − U+2212, —, ·, «», … qui ne sont pas dans les plages emoji)
function fNoEmoji(s){
  return String(s).replace(/([\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}])\uFE0F?\s?/gu,'');
}

function renderFermeAdmin(){
  const panel = document.getElementById('ferme-panel');
  if(!panel) return;
  const active = document.getElementById('ferme-admin-active');
  // Le panneau n'apparaît dans la zone « jeu actif » que si une partie tourne
  if(!ferme || !ferme.active){ panel.style.display='none'; renderGameLibrary(); return; }
  panel.style.display='block';
  if(active) active.style.display='block';

  // Statut (Tour / phase / Mine / Or)
  document.getElementById('fa-status').innerHTML = fNoEmoji(fStatusPills(ferme));

  // Liste des joueurs (colonne principale) — affichage seul
  document.getElementById('fa-players').innerHTML = fNoEmoji(fPlayersList(ferme));

  // Ligne d'événement
  document.getElementById('fa-event').textContent = fNoEmoji(ferme.lastEvent||'');

  // Colonne de droite (contexte de phase / actions du joueur courant) + CTA
  const prog = document.getElementById('fa-progress');
  const ctrl = document.getElementById('fa-controls');
  const ph = ferme.phase;
  const cancelBtn = '<button class="btn-primary-danger" onclick="fermeCancel()">Abandonner la partie</button>';
  const ctaRow = (main)=>'<div class="fa-cta-row">'+main+cancelBtn+'</div>';

  if(ph==='lobby'){
    const nJoin = fPlayers(ferme).length;
    prog.innerHTML = '<div class="diamant-voted">'+nJoin+' villageois ont rejoint. Lance quand tu veux — la partie démarrera avec les joueurs présents.</div>';
    ctrl.innerHTML = ctaRow('<button class="btn-primary" onclick="fermeForceStart()">Lancer la partie'+(nJoin?(' ('+nJoin+' joueur'+(nJoin>1?'s':'')+')'):'')+'</button>');

  } else if(ph==='planning'){
    const total = fPlayers(ferme).length;
    const withMetier = fPlayers(ferme).filter(p=>p.metier).length;
    const placed = fPlayers(ferme).filter(p=>p.location).length;
    const allReady = withMetier===total;
    const nAbs = total - withMetier;
    prog.innerHTML = '<div class="diamant-voted">Planification — métiers choisis : <strong>'+withMetier+'/'+total+'</strong> · lieux choisis : <strong>'+placed+'/'+total+'</strong>.'+
      (allReady?'':' <span class="t-warm">'+nAbs+' joueur(s) sans métier seront marqués <strong>absents</strong> et passés automatiquement.</span>')+
      '<br><span class="u-dim8">Les joueurs placés nulle part sont positionnés automatiquement au lancement.</span></div>';
    ctrl.innerHTML = ctaRow('<button class="btn-primary" onclick="fermeStartAction()">Lancer la phase d\'action'+(allReady?'':' (forcer, '+nAbs+' absent'+(nAbs>1?'s':'')+')')+'</button>');

  } else if(ph==='action'){
    const cur = fCurrent(ferme);
    prog.innerHTML = cur ? fActionButtons(ferme, cur) : '';
    ctrl.innerHTML = ctaRow('<button class="btn-primary" onclick="fermeEndPlayerTurn()">Terminer le tour de ce joueur</button>');

  } else if(ph==='gameEnd'){
    let head = '';
    if(ferme.result==='victory') head='<div class="diamant-voted t-success">Victoire déclarée !</div>';
    else if(ferme.result==='defeat') head='<div class="diamant-voted t-danger">Défaite déclarée.</div>';
    else head='<div class="diamant-voted">Fin de la partie. Les objectifs de grand-père sont-ils remplis ?</div>';
    prog.innerHTML = head;
    ctrl.innerHTML = '<div class="fa-cta-row">'+
      '<button class="btn-primary-continue" onclick="fermeDeclare(true)">Victoire</button>'+
      '<button class="btn-primary" onclick="fermeDeclare(false)">Défaite</button>'+
      '<button class="btn-primary" onclick="fermeEndToFire()">Clôturer</button>'+
    '</div>';
  }

  // Donner une ressource + ajuster l'or (toujours accessible, en bas)
  const resOpts = F_RESOURCES.map(r=>'<option value="'+r+'">'+r+'</option>').join('');
  document.getElementById('fa-give').innerHTML =
    '<div class="fa-give-row">'+
      '<span class="fa-give-label">Donner :</span>'+
      '<select id="fa-res-select" class="f-select-grow">'+resOpts+'</select>'+
      '<span class="fa-give-label">Quantité :</span>'+
      '<input type="number" id="fa-res-qty" value="1" class="fire-mini-input f-input-qty">'+
      '<button class="btn-secondary" onclick="fermeAddResource()">Donner</button>'+
    '</div>'+
    '<div class="fa-give-row">'+
      '<span class="fa-give-label">Or commun</span>'+
      '<button class="btn-icon" onclick="fermeAdjustGold(-5)">−5</button>'+
      '<button class="btn-icon" onclick="fermeAdjustGold(-1)">−</button>'+
      '<button class="btn-icon" onclick="fermeAdjustGold(1)">+</button>'+
      '<button class="btn-icon" onclick="fermeAdjustGold(5)">+5</button>'+
    '</div>';

  // Vue meneur : pas d'emote (réservées à la vue joueur)
  prog.innerHTML = fNoEmoji(prog.innerHTML);
  ctrl.innerHTML = fNoEmoji(ctrl.innerHTML);

  renderGameLibrary();
}

function renderFermeViewer(pseudo){
  const wrap = document.getElementById('viewer-ferme');
  if(!wrap) return;
  if(!ferme || !ferme.active){ wrap.style.display='none'; return; }
  wrap.style.display='block';

  const ph = ferme.phase;
  const inGame = (ph!=='lobby');
  const me = ferme.players[pseudo];
  const cur = fCurrent(ferme);

  // Barre du haut : pastilles Tour / phase / Mine (l'or est dans l'inventaire)
  document.getElementById('fv-status').innerHTML = fStatusPills(ferme, {gold:false});

  // Instruction de phase, sous la barre, sans fond
  const instr = document.getElementById('fv-instruction');
  if(ph==='planning'){
    instr.innerHTML = 'Phase Planification : Choisis ton métier et ton lieu de départ (dans l\'ordre que tu veux)';
  } else if(ph==='action'){
    instr.innerHTML = (cur===pseudo)
      ? 'Phase Action : ▶ C\'est ton tour ! Réalise tes actions ou déplace toi'
      : 'Phase Action : Au tour de ' + (cur||'—');
  } else {
    instr.innerHTML = '';
  }

  // Colonne de droite : inventaire + objectifs (seulement en jeu)
  const side  = document.getElementById('fv-side');
  const invEl = document.getElementById('fv-inventory');
  const objEl = document.getElementById('fv-objectives');
  if(side) side.style.display = inGame ? '' : 'none';
  const playersEl = document.getElementById('fv-players');
  if(inGame){
    if(invEl) invEl.innerHTML = fInventory(ferme) + fCrops(ferme);
    if(objEl) objEl.innerHTML = fObjectivesCards(ferme);
    if(playersEl) playersEl.innerHTML = fViewerPlayers(ferme, pseudo);
  }

  const zone = document.getElementById('fv-myzone');

  if(ph==='lobby'){
    if(me){
      zone.innerHTML = '<div class="diamant-voted">✓ Tu as rejoint la partie ! En attente du lancement par le meneur ('+fPlayers(ferme).length+' villageois)…</div>'+
        '<button class="btn-secondary u-full" onclick="fermeLeave(\''+escAttr(pseudo)+'\')">↩ Quitter le lobby</button>';
    } else {
      zone.innerHTML = '<div class="diamant-voted">🚪 Une partie de la Ferme se prépare ! Rejoins avant le lancement.</div>'+
        '<button class="btn-primary-continue u-full" onclick="fermeJoin(\''+escAttr(pseudo)+'\')">🌾 Rejoindre la partie</button>';
    }
    return;
  }

  const board = fBoard(ferme, {});

  if(!me){
    zone.innerHTML = board + '<div class="diamant-voted">👀 Tu n\'es pas dans cette partie. Tu pourras jouer à la prochaine !</div>';
    return;
  }

  if(ph==='planning'){
    const metierBtns = F_METIERS_BASE.map(m=>{
      const chosen = (me.metier===m);
      return '<button class="btn-secondary" onclick="fermeSetMetier(\''+escAttr(pseudo)+'\',\''+escAttr(m)+'\')" style="'+(chosen?'background:var(--metier-line);border-color:var(--metier);color:var(--metier)':'')+'">'+(F_METIER_ICON[m]||'')+' '+m+(chosen?' ✓':'')+'</button>';
    }).join('');
    const boardPick = fBoard(ferme, { pseudo:pseudo, pick:'fermeSetLocation' });
    zone.innerHTML =
      '<div class="f-label">Les métiers</div>'+
      '<div class="f-row-mb">'+metierBtns+'</div>'+
      '<div class="f-label">Lieux (max '+F_LOC_CAP+' par lieu)</div>'+
      boardPick;
    return;
  }

  if(ph==='action'){
    const isMe = (cur===pseudo);
    const lastAct = fLastActionBanner(ferme);
    if(isMe){
      zone.innerHTML = board + fActionButtons(ferme, pseudo) + lastAct +
        '<button class="btn-primary u-mt-md" onclick="fermeEndPlayerTurn()">Terminer mon tour</button>';
    } else if(fIsAbsent(me)){
      zone.innerHTML = board + '<div class="diamant-voted">💤 Tu es absent ce tour : tu n\'as pas choisi de métier à temps. Tu pourras rejouer au tour suivant en choisissant un métier pendant la planification.</div>' + lastAct;
    } else {
      zone.innerHTML = board + '<div class="diamant-voted">Ton métier ce tour : <strong class="t-metier">'+(me.metier||'—')+'</strong>, ton lieu : <strong class="t-bright">'+(me.location||'—')+'</strong>.</div>' + lastAct;
    }
    return;
  }

  if(ph==='gameEnd'){
    let msg = ferme.result==='victory' ? '🎉 Victoire ! Grand-père est fier de vous.' : ferme.result==='defeat' ? '😞 Défaite… ce sera pour la prochaine fois.' : '🏁 Fin de la partie.';
    zone.innerHTML = board + '<div class="diamant-voted">'+msg+'</div>';
    return;
  }
}

// ── RÈGLES DU JEU (popin « Comment jouer ») ────────────────────────────────
// Le contenu est généré depuis les constantes du jeu : si une valeur change,
// les règles affichées restent automatiquement justes.
function fRulesHtml(){
  const loc = (l)=> (F_LOC_ICON[l]||'')+' '+l;

  // Actions par métier, avec leur lieu
  const neutre = { inventory:{}, crops:[], gold:99, museum:[], mineLevel:1, fieldCapacity:F_FIELD_BASE };
  const metierBlocks = F_METIERS_BASE.map(m=>{
    const acts = fMetierActions(m, neutre);
    const lines = acts.map(a=>{
      const where = a.locations ? a.locations.map(loc).join(' ou ') : 'partout';
      let d = a.desc;
      if(typeof d === 'function'){ try { d = d(neutre); } catch(e){ d = ''; } }
      d = d || '';
      return '<li><strong>'+escHtml(a.label)+'</strong> <span class="rules-where">'+escHtml(where)+'</span>'+(d?(' — '+escHtml(d)):'')+'</li>';
    }).join('');
    return '<div class="rules-metier"><h4>'+(F_METIER_ICON[m]||'')+' '+escHtml(m)+'</h4><ul>'+lines+'</ul></div>';
  }).join('');

  // Tableaux de pêche par lieu
  const fishBlocks = Object.keys(F_FISH_BY_LOC).map(l=>{
    const rows = F_FISH_BY_LOC[l].map(f=>
      '<tr><td>'+escHtml(f.nom)+(f.legendaire?' <span class="rules-star">★ légendaire</span>':'')+'</td>'+
      '<td>dé ≥ '+f.val+'</td></tr>'
    ).join('');
    return '<div class="rules-half"><h4>'+loc(l)+'</h4><table class="rules-table">'+
      '<tr><th>Poisson</th><th>Capture</th></tr>'+rows+'</table></div>';
  }).join('');

  // Reliques groupées par difficulté
  const byVal = {};
  F_RELICS.forEach(r=>{ (byVal[r.val]=byVal[r.val]||[]).push(r.nom); });
  const relicRows = Object.keys(byVal).sort().map(v=>
    '<tr><td>'+escHtml(byVal[v].join(', '))+'</td><td>dé ≥ '+v+'</td><td>'+Math.round((7-v)/6*100)+'%</td></tr>'
  ).join('');

  // Graines
  const seedRows = F_SEEDS.map(s=>
    '<tr><td>'+escHtml(s.type)+'</td><td>'+(s.maxLevel-1)+' arrosage'+((s.maxLevel-1)>1?'s':'')+'</td><td>'+s.sell+' or</td></tr>'
  ).join('');

  // Mine : chances par niveau (dérivées de F_MINE_TABLE / F_MINE_GOLD → toujours à jour)
  const mineRows = [1,2,3,4,5].map(lvl=>{
    const t = F_MINE_TABLE[lvl]; const g = F_MINE_GOLD[lvl]||0;
    return '<tr><td>'+lvl+'</td><td>'+t.pierre+'%</td><td>'+t.charbon+'%</td><td>'+t.or+'%'+(g?(' <span class="rules-star">+'+g+' or</span>'):'')+'</td><td>'+t.escalier+'%</td><td>'+t.monstre+'%</td></tr>';
  }).join('');

  // Objectifs
  const objRows = F_OBJECTIVES.filter(o=>!o.hidden).map(o=>{
    const need = o.parts.map(p=>{
      const label = p.key==='__legendary__' ? 'poisson légendaire' : (p.key==='__museum__' ? 'relique' : p.key);
      return p.per+'× '+label;
    }).join(', ');
    return '<tr><td>'+o.icon+' '+escHtml(o.titre)+'</td><td>'+escHtml(need)+' <em>par joueur</em></td></tr>';
  }).join('');

  return ''+
  '<h2 class="rules-title">🌾 La Ferme du Village — Comment jouer</h2>'+

  '<div class="rules-section"><h3>🎯 Le but</h3>'+
  '<p>Une partie <strong>coopérative</strong> en <strong>'+F_MAXTURNS+' tours</strong>. Tout le village joue ensemble pour remplir les <strong>objectifs de grand-père</strong> avant la fin. Les ressources, l\'or et le champ sont <strong>communs</strong> : ce que tu récoltes profite à tout le monde.</p></div>'+

  '<div class="rules-section"><h3>🔄 Le déroulé d\'un tour</h3>'+
  '<p><strong>1. Planification</strong> — tu choisis ton <strong>métier</strong> pour ce tour et ton <strong>lieu de départ</strong>, dans l\'ordre que tu veux. Plusieurs joueurs peuvent prendre le même métier, mais un lieu n\'accueille que <strong>'+F_LOC_CAP+' joueurs maximum</strong>. Le métier se rechoisit à chaque tour.</p>'+
  '<p><strong>2. Action</strong> — chacun joue à son tour, dans l\'<strong>ordre de la liste des joueurs</strong> ; le <strong>premier joueur change à chaque tour</strong> (il passe au suivant), pour un ordre prévisible qui aide à s\'organiser. Tu disposes de <strong>2 actions</strong> :</p>'+
  '<ul><li><strong>Action + Action</strong> — deux actions sur ton lieu actuel</li>'+
  '<li><strong>Action + Déplacement + Action</strong> — une action, tu te déplaces, puis une dernière action</li></ul>'+
  '<p class="rules-note">Si aucune action n\'est possible à ton emplacement, tu peux te déplacer d\'emblée — mais ça te coûte une de tes deux actions. Une fois tes 2 actions faites, ton pion rentre à la Ferme et le tour passe au joueur suivant.</p></div>'+

  '<div class="rules-section"><h3>🗺️ Les lieux</h3>'+
  '<p>'+F_LOCATIONS.map(loc).map(escHtml).join(' · ')+'</p>'+
  '<p class="rules-note">Chaque lieu accueille au maximum '+F_LOC_CAP+' joueurs : anticipe, les bons spots partent vite !</p></div>'+

  '<div class="rules-section"><h3>👷 Les métiers et leurs actions</h3>'+
  '<div class="rules-metiers">'+metierBlocks+'</div></div>'+

  '<div class="rules-section"><h3>🎣 La pêche</h3>'+
  '<p>Un poisson du lieu est tiré <strong>au hasard, à chances égales</strong> — tous les poissons ont la même probabilité d\'apparaître, seule leur <strong>difficulté de capture</strong> change. Tu lances ensuite un dé à 6 faces : si le résultat atteint la difficulté, le poisson est ferré. Un <strong>poisson légendaire</strong> rapporte <strong>2 poissons</strong> et compte pour l\'objectif de grand-père. Acheter un <strong>appât miracle</strong> à la plage (1 or, 1 action) augmente de <strong>+10%</strong> la chance qu\'un <strong>légendaire</strong> apparaisse à ton prochain lancer. Contre <strong>10 poissons</strong>, un pêcheur peut acquérir une <strong>canne améliorée</strong> (définitive) qui lui donne <strong>+1</strong> au dé, mais uniquement sur les <strong>poissons légendaires</strong>.</p>'+
  '<div class="rules-cols">'+fishBlocks+'</div></div>'+

  '<div class="rules-section"><h3>⛏️ La mine</h3>'+
  '<p>Explorer la mine peut donner de la <strong>pierre</strong>, du <strong>charbon</strong>, de l\'<strong>or</strong>, un <strong>escalier</strong> (le groupe descend d\'un niveau) ou réveiller un <strong>crâne de monstre</strong> (le groupe perd un objet au hasard, <em>sauf</em> le plat de veillée et le poisson grillé). Les chances dépendent de la profondeur :</p>'+
  '<table class="rules-table"><tr><th>Niveau</th><th>Pierre</th><th>Charbon</th><th>Or</th><th>Escalier</th><th>Monstre</th></tr>'+mineRows+'</table>'+
  '<p class="rules-note">La mine a 5 niveaux, <strong>communs à tout le groupe</strong> : elle ne remonte jamais. Plus on descend, plus le <strong>monstre</strong> guette — mais l\'<strong>or</strong> devient plus fréquent et plus généreux. Descendre est un pari : plus de risque, plus de richesse. Une <strong>pioche améliorée</strong> (achetée au Magasin, 5 or) double la pierre et le charbon trouvés en mine.</p></div>'+

  '<div class="rules-section"><h3>🏺 Les reliques du musée</h3>'+
  '<p>Chercher une relique en montagne en révèle une parmi celles <strong>encore à découvrir</strong> (toutes ont la même chance d\'apparaître). Un jet de dé décide si tu parviens à la dégager intacte. Une relique rapportée rejoint le <strong>musée</strong> et ne peut plus être retrouvée.</p>'+
  '<table class="rules-table"><tr><th>Reliques</th><th>Difficulté</th><th>Réussite</th></tr>'+relicRows+'</table></div>'+

  '<div class="rules-section"><h3>🌱 Le champ</h3>'+
  '<p>Une graine achetée au Magasin ('+F_SEED_PRICE+' or) est plantée aussitôt au niveau 1. <strong>Arroser fait monter toutes les plantes du champ</strong> d\'un niveau d\'un coup ; celles qui atteignent leur maturité sont récoltées automatiquement.</p>'+
  '<table class="rules-table"><tr><th>Graine</th><th>Arrosages nécessaires</th><th>Valeur à la vente</th></tr>'+seedRows+'</table>'+
  '<p class="rules-note">Le champ accueille <strong>'+F_FIELD_BASE+' cultures</strong> au départ. Le Bûcheron peut l\'agrandir de '+F_FIELD_BONUS+' places en améliorant la ferme.</p></div>'+

  '<div class="rules-section"><h3>📋 Les objectifs de grand-père</h3>'+
  '<p>Ils se comptent <strong>par joueur</strong> : à 4 joueurs, il faut 4 plats de veillée, 4 reliques, etc. Ils se remplissent automatiquement avec l\'inventaire commun, <strong>sans rien consommer</strong>.</p>'+
  '<table class="rules-table"><tr><th>Objectif</th><th>Nécessite</th></tr>'+objRows+'</table></div>'+

  '<div class="rules-section"><h3>💡 Conseils</h3>'+
  '<ul><li>Coordonnez-vous : les métiers se complètent (le Pêcheur a besoin du <strong>bois</strong> du Bûcheron pour griller, l\'Agriculteur a besoin d\'un <strong>poisson grillé</strong> pour cuisiner).</li>'+
  '<li>Le village démarre avec <strong>'+F_START_GOLD+' or</strong> : de quoi lancer les premières cultures.</li>'+
  '<li>Vendre rapporte de l\'or commun, mais attention à ne pas brader une ressource dont un objectif a besoin.</li>'+
  '<li>Si tu ne choisis pas de métier pendant la planification, tu es marqué absent et ton tour est passé — pense à valider ton choix !</li></ul></div>';
}

function fermeShowRules(){
  const box = document.getElementById('ferme-rules-content');
  const modal = document.getElementById('ferme-rules-modal');
  if(!box || !modal) return;
  box.innerHTML = fRulesHtml();
  modal.style.display = 'flex';
}
function fermeHideRules(){
  const modal = document.getElementById('ferme-rules-modal');
  if(modal) modal.style.display = 'none';
}

// ── Historique des actions (popin) — du plus récent au plus ancien ──
function fHistoryHtml(st){
  const hist = Array.isArray(st.history) ? st.history : [];
  let h = '<h2 class="rules-title">📋 Historique des actions</h2>';
  if(!hist.length) return h + '<p>Aucune action pour l\'instant — l\'historique se remplit au fil de la partie.</p>';
  h += '<div class="hist-list">' + hist.slice().reverse().map(a=>
    '<div class="hist-row">'+
      '<span class="hist-who">'+(F_METIER_ICON[a.metier]||'')+' '+escHtml(a.pseudo)+'</span>'+
      '<span class="hist-msg">'+escHtml(a.msg||'')+'</span>'+
      '<span class="hist-turn">T'+(a.turn||'?')+'</span>'+
    '</div>'
  ).join('') + '</div>';
  return h;
}
function fermeShowHistory(){
  const box = document.getElementById('ferme-history-content');
  const modal = document.getElementById('ferme-history-modal');
  if(!box || !modal || !ferme) return;
  box.innerHTML = fHistoryHtml(ferme);
  modal.style.display = 'flex';
}
function fermeHideHistory(){
  const modal = document.getElementById('ferme-history-modal');
  if(modal) modal.style.display = 'none';
}
// Fermeture à la touche Échap
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') fermeHideRules(); });
}