// ══════════════════════════════════════════════════════════════════════════
//  GUERRE DES CLANS — lot 1 : la bourse de Lucioles
//
//  Page /clans (ou #clans en local). Le viewer se connecte via Twitch et voit son solde.
//  Les Lucioles s'obtiennent UNIQUEMENT en échangeant la récompense de points de chaîne
//  sur le live : c'est le serveur (fonctions Netlify « clans-* ») qui crédite.
//  Le navigateur ne fait que LIRE (les règles Firebase interdisent toute écriture ici).
//
//  Nœuds Firebase lus :
//   clans/status           état du branchement Twitch + récompenses + derniers crédits (public)
//   clans/wallets/<uid>    { lucioles, total, name, login, ledger:{ <échange>:{ n, at } } } (le joueur seul)
// ══════════════════════════════════════════════════════════════════════════

let clansStatus    = null;   // copie de clans/status
let clansWallet    = null;   // porte-monnaie du joueur connecté (null si aucun)
let clansWalletUid = null;   // uid dont on écoute le porte-monnaie
let clansWalletOff = null;   // fonction de désabonnement Firebase
let clansWalletLoaded = false;
let clansShown     = null;   // solde actuellement affiché (pour l'animation du compteur)
let clansView      = '';     // type d'écran rendu ('login' | 'wallet' | …) — évite de tout redessiner
let clansAdminMsg  = null;   // message de retour du branchement Twitch (vue meneur)

const CL_REDUCED = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── ABONNEMENTS ─────────────────────────────────────────────────────────────
function clansAttach(){
  if(!window.FB || !window.FB.ready) return;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, 'clans/status'), (snap) => {
    clansStatus = snap.val() || {};
    renderClans(); renderClansAdmin();
  }, (e) => { console.warn('clans/status illisible (règle Firebase « clans » absente ?)', e && e.code); clansStatus = {}; renderClansAdmin(); });
}
window.addEventListener('fb-ready', clansAttach);

// Le porte-monnaie suit le compte connecté (uniquement un compte Twitch)
function clansWatchWallet(){
  const tw  = window.FB && window.FB.twitch;
  const uid = tw && window.FB.user ? window.FB.user.uid : null;
  if(uid === clansWalletUid) { renderClans(); return; }
  if(clansWalletOff){ clansWalletOff(); clansWalletOff = null; }
  clansWalletUid = uid; clansWallet = null; clansWalletLoaded = false; clansShown = null;
  if(uid && window.FB.ready){
    const { db, ref, onValue } = window.FB;
    clansWalletOff = onValue(ref(db, 'clans/wallets/' + uid), (snap) => {
      clansWallet = snap.val(); clansWalletLoaded = true; renderClans();
    }, (e) => { console.warn('Porte-monnaie illisible (règle Firebase « clans » absente ?)', e && e.code); clansWalletLoaded = true; renderClans(); });
  }
  renderClans();
}
window.addEventListener('fb-auth', clansWatchWallet);

// Retour depuis la page Twitch : revenir ici plutôt que sur l'accueil de la veillée
function clansRememberBack(){ try{ sessionStorage.setItem('twBack', '/clans'); }catch(e){} }

// Récompense principale (pour l'aide affichée au joueur)
function clansMainReward(){
  const r = clansStatus && clansStatus.rewards ? Object.values(clansStatus.rewards) : [];
  return r.sort((a,b) => (a.cost||0) - (b.cost||0))[0] || { title:'10 Lucioles · Guerre des clans', cost:1000, lucioles:10 };
}
const clFmt = (n) => Number(n || 0).toLocaleString('fr-FR');
function clDate(at){
  try{ return new Date(at).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return ''; }
}

// ── ILLUSTRATION : le bocal à lucioles (SVG, couleurs du design system) ─────
function clansJarSvg(){
  // Lucioles : position (cx, cy), rayon, délai d'animation — elles flottent et scintillent
  const flies = [[38,70,3.2,0],[58,82,2.6,.7],[48,58,2.8,1.4],[66,62,2.4,.3],[32,88,2.2,1.1],[54,98,3,1.8],[70,92,2.2,.5]];
  return `<svg class="cl-jar" viewBox="0 0 100 124" aria-hidden="true">
    <defs>
      <radialGradient id="cl-glow"><stop offset="0" stop-color="var(--fire)" stop-opacity=".55"/><stop offset="1" stop-color="var(--fire)" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse class="cl-jar-halo" cx="50" cy="80" rx="46" ry="44" fill="url(#cl-glow)"/>
    <rect x="30" y="8" width="40" height="12" rx="3" class="cl-jar-lid"/>
    <path d="M33 20 h34 v6 c10 6 15 14 15 26 v52 c0 9 -7 14 -16 14 H34 c-9 0 -16 -5 -16 -14 V52 c0 -12 5 -20 15 -26 z" class="cl-jar-glass"/>
    <path d="M26 54 c0 -8 3 -14 9 -18" class="cl-jar-shine"/>
    ${flies.map(([x,y,r,d]) => `<g class="cl-fly" style="animation-delay:-${d}s"><circle cx="${x}" cy="${y}" r="${r*2.6}" class="cl-fly-glow"/><circle cx="${x}" cy="${y}" r="${r}" class="cl-fly-core"/></g>`).join('')}
  </svg>`;
}

// ── PAGE /clans ─────────────────────────────────────────────────────────────
function renderClans(){
  const root = document.getElementById('clans-root');
  if(!root || !document.getElementById('page-clans').classList.contains('active')) return;

  let kind;
  if(!window.FB) kind = 'loading';
  else if(!window.FB.ready) kind = 'offline';
  else if(!window.FB.user) kind = 'loading';
  else if(!window.FB.twitch) kind = 'login';
  else if(!clansWalletLoaded) kind = 'loading';
  else kind = 'wallet';

  if(kind !== clansView){
    clansView = kind;
    if(kind === 'loading') root.innerHTML = '<div class="empty-state">Chargement…</div>';
    else if(kind === 'offline') root.innerHTML = '<div class="card"><div class="empty-state">La Guerre des clans a besoin de la base en ligne.</div></div>';
    else if(kind === 'login') root.innerHTML = `
      <div class="card login-card cl-login">
        <div class="card-title">Rejoindre la Guerre des clans</div>
        <p class="cl-text">Ta bourse de Lucioles est liée à ton compte Twitch : connecte-toi pour la retrouver.</p>
        <a class="btn-twitch" href="/.netlify/functions/twitch-auth" onclick="clansRememberBack()">Connexion via Twitch</a>
        <p class="cl-text cl-small">Tu as déjà échangé des points de chaîne ? Tes Lucioles t'attendent : elles apparaîtront dès ta connexion.</p>
      </div>`;
    else root.innerHTML = `
      <div class="card cl-purse-card">
        <div class="container-head"><span class="container-title">Ta bourse de Lucioles</span></div>
        <div class="cl-purse" id="cl-purse">
          ${clansJarSvg()}
          <div class="cl-count">
            <div class="cl-amount" id="cl-amount" aria-live="polite">0</div>
            <div class="cl-amount-label">Lucioles</div>
            <div class="cl-total" id="cl-total"></div>
          </div>
        </div>
        <p class="cl-text" id="cl-how"></p>
      </div>
      <div class="card">
        <div class="container-head"><span class="container-title is-label">Derniers gains</span></div>
        <div id="cl-history"></div>
      </div>
      <div class="card cl-teaser">
        <div class="container-head"><span class="container-title">Bientôt dans la forêt de Nibel</span></div>
        <p class="cl-text">Choisis ton clan, finance les chantiers de ses bâtiments, envoie des expéditions et défends-toi contre les sabotages des clans voisins. Garde tes Lucioles : elles serviront dès l'ouverture du village.</p>
      </div>`;
  }
  if(kind !== 'wallet') return;

  // ── Mise à jour fine (sans redessiner) ──
  const w = clansWallet || {};
  const rw = clansMainReward();
  const how = document.getElementById('cl-how');
  const howHtml = 'Pour en obtenir : sur le live, échange la récompense <strong>« ' + escHtml(rw.title) + ' »</strong> (' +
    clFmt(rw.cost) + ' points de chaîne). Tes Lucioles arrivent ici en quelques secondes.';
  if(how && how.innerHTML !== howHtml) how.innerHTML = howHtml;
  const tot = document.getElementById('cl-total');
  const totTxt = (w.total || 0) > (w.lucioles || 0) ? clFmt(w.total) + ' gagnées au total' : '';
  if(tot && tot.textContent !== totTxt) tot.textContent = totTxt;

  const hist = document.getElementById('cl-history');
  const entries = Object.values(w.ledger || {}).filter(e => e && e.n).sort((a,b) => (b.at||0) - (a.at||0)).slice(0, 8);
  const histHtml = entries.length
    ? entries.map(e => `<div class="cl-row"><span class="cl-row-gain">+${clFmt(e.n)} Lucioles</span><span class="cl-row-date">${escHtml(clDate(e.at))}</span></div>`).join('')
    : '<div class="empty-state">Aucun échange pour l\'instant.</div>';
  if(hist && hist.innerHTML !== histHtml) hist.innerHTML = histHtml;

  clansCountTo(w.lucioles || 0);
}

// Compteur qui défile + lucioles qui volent vers le bocal quand le solde augmente
function clansCountTo(target){
  const el = document.getElementById('cl-amount');
  if(!el) return;
  const from = clansShown;
  clansShown = target;
  if(from === null || target <= from || CL_REDUCED()){ el.textContent = clFmt(target); return; }
  const gain = target - from, t0 = performance.now(), dur = 1100;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    if(clansShown !== target) return;                       // un autre crédit est arrivé entre-temps
    el.textContent = clFmt(Math.round(from + gain * e));
    if(k < 1) requestAnimationFrame(step);
    else { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }
  };
  requestAnimationFrame(step);
  clansBurst(gain);
}

function clansBurst(gain){
  const purse = document.getElementById('cl-purse');
  const jar = purse && purse.querySelector('.cl-jar');
  if(!purse || !jar || !purse.animate) return;
  const pb = purse.getBoundingClientRect(), jb = jar.getBoundingClientRect();
  const tx = jb.left - pb.left + jb.width / 2, ty = jb.top - pb.top + jb.height * .62;
  const n = Math.min(14, 5 + Math.round(gain / 5));
  for(let i = 0; i < n; i++){
    const s = document.createElement('span');
    s.className = 'cl-spark';
    purse.appendChild(s);
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 80;
    const sx = tx + Math.cos(a) * d, sy = ty + Math.sin(a) * d * .6 - 30;
    const mx = (sx + tx) / 2 + (Math.random() - .5) * 60, my = Math.min(sy, ty) - 40 - Math.random() * 30;
    s.animate([
      { transform:`translate(${sx}px,${sy}px) scale(.2)`, opacity:0 },
      { transform:`translate(${sx}px,${sy}px) scale(1)`, opacity:1, offset:.18 },
      { transform:`translate(${mx}px,${my}px) scale(1)`, opacity:1, offset:.6 },
      { transform:`translate(${tx}px,${ty}px) scale(.3)`, opacity:0 },
    ], { duration:1000 + Math.random() * 500, delay:i * 55, easing:'cubic-bezier(.45,.05,.4,1)', fill:'both' }).onfinish = () => s.remove();
  }
  const plus = document.createElement('span');
  plus.className = 'cl-plus';
  plus.textContent = '+' + clFmt(gain);
  purse.appendChild(plus);
  plus.animate([
    { transform:'translateY(10px) scale(.7)', opacity:0 },
    { transform:'translateY(-6px) scale(1.1)', opacity:1, offset:.25 },
    { transform:'translateY(-34px) scale(1)', opacity:0 },
  ], { duration:1800, easing:'ease-out', fill:'both' }).onfinish = () => plus.remove();
  jar.classList.remove('is-filling'); void jar.getBoundingClientRect(); jar.classList.add('is-filling');
}

// ── VUE MENEUR : branchement de la chaîne + suivi des échanges ──────────────
function renderClansAdmin(){
  const el = document.getElementById('clans-admin');
  if(!el) return;
  const st = clansStatus || {};
  const rewards = Object.values(st.rewards || {});
  const subTxt = st.sub === 'enabled' ? 'active' : st.sub === 'revoked' ? 'coupée' : st.connected ? 'en attente de vérification' : '—';
  const recent = Array.isArray(st.recent) ? st.recent : Object.values(st.recent || {});
  const msg = clansAdminMsg ? `<div class="cl-admin-msg ${clansAdminMsg.ok ? 'is-ok' : 'is-ko'}">${escHtml(clansAdminMsg.msg)}</div>` : '';
  const html = `
    ${msg}
    <div class="cl-admin-line"><span>Chaîne</span><strong>${st.connected ? escHtml(st.broadcaster || '') : 'non branchée'}</strong></div>
    <div class="cl-admin-line"><span>Réception des échanges</span><strong class="${st.sub === 'enabled' ? 'is-ok' : (st.sub === 'revoked' ? 'is-ko' : '')}">${subTxt}</strong></div>
    ${rewards.map(r => `<div class="cl-admin-line"><span>${escHtml(r.title)}</span><strong>${clFmt(r.cost)} points → ${clFmt(r.lucioles)} Lucioles</strong></div>`).join('')}
    ${st.error ? `<div class="cl-admin-msg is-ko">${escHtml(st.error)}</div>` : ''}
    <div class="cl-admin-sub">Derniers crédits</div>
    ${recent.length ? recent.slice(0, 6).map(r => `<div class="cl-admin-line"><span>${escHtml(r.name || '?')}</span><strong>+${clFmt(r.n)} · ${escHtml(clDate(r.at))}</strong></div>`).join('')
                    : '<div class="empty-state">Aucun échange pour l\'instant.</div>'}
    <div class="cl-admin-actions">
      <a class="btn-secondary" href="/.netlify/functions/clans-twitch?action=connect">${st.connected ? 'Rebrancher la chaîne' : 'Brancher la chaîne Twitch'}</a>
      <button class="btn-secondary" id="cl-sync-btn" onclick="clansSync()" ${st.connected ? '' : 'disabled'}>Rattraper les échanges</button>
    </div>`;
  if(el.innerHTML !== html) el.innerHTML = html;
}

async function clansSync(){
  const btn = document.getElementById('cl-sync-btn');
  if(btn) btn.disabled = true;
  try{
    const r = await fetch('/.netlify/functions/clans-twitch?action=sync', { cache:'no-store' });
    const j = await r.json();
    if(!j.ok) toast('Rattrapage impossible : ' + (j.error || r.status));
    else if(j.skipped) toast('Rattrapage déjà fait il y a quelques secondes.');
    else toast(j.credited ? j.credited + ' échange(s) crédité(s).' : 'Aucun échange en attente.');
  }catch(e){ toast('Rattrapage impossible (fonction injoignable).'); }
  if(btn) btn.disabled = false;
}

// Message déposé par la fonction après le branchement Twitch
(function clansReadAdminMsg(){
  try{
    const m = sessionStorage.getItem('clansMsg');
    if(m){ sessionStorage.removeItem('clansMsg'); clansAdminMsg = JSON.parse(m); setTimeout(() => toast(clansAdminMsg.msg), 400); }
  }catch(e){}
})();

// Cas où les évènements Firebase sont passés avant le chargement de ce script
if(window.FB && window.FB.ready) clansAttach();
if(window.FB && window.FB.user) clansWatchWallet();
