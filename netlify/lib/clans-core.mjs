// ══════════════════════════════════════════════════════════════════════════
//  GUERRE DES CLANS — boîte à outils commune aux fonctions Netlify « clans-* »
//  (tourne sur le serveur, jamais dans le navigateur)
//
//  Rôle : transformer un échange de points de chaîne Twitch en Lucioles.
//   - Firebase : le serveur écrit avec le compte de service (il passe outre les règles).
//     Les joueurs, eux, ne peuvent QUE lire leur propre porte-monnaie → pas de triche possible.
//   - Twitch : la récompense est créée par l'app (obligatoire pour pouvoir la marquer
//     « terminée »), et Twitch nous prévient de chaque échange (EventSub).
//
//  Variables d'environnement Netlify (JAMAIS dans le code) :
//   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET          (déjà présentes pour la connexion Twitch)
//   FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY     (déjà présentes)
//   TWITCH_BROADCASTER_LOGIN   nom de la chaîne (ex : carapain) — seule elle peut être branchée
//   FIREBASE_DATABASE_URL      facultatif (sinon l'adresse de la base de la Veillée)
//
//  Données Firebase :
//   clans/status                public  : état du branchement + derniers crédits (vue meneur)
//   clans/wallets/<uid>         lisible par son seul propriétaire : { lucioles, total, name, login, ledger }
//   clansPrivate/broadcaster    illisible par tous : jetons Twitch de la chaîne
// ══════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';

// ── Réglages du jeu (équilibrage) ──────────────────────────────────────────
// Paliers de la récompense Twitch. Pour en ajouter un : une ligne de plus, puis
// « Rebrancher la chaîne » dans la vue meneur (les récompenses sont créées / mises à jour).
// Renommer, changer le prix ou la description : modifier la ligne puis « Rebrancher » —
// la récompense existante est retrouvée par sa clé (key), JAMAIS la changer.
export const CL_TIERS = [
  { key:'lucioles10', title:'Obtenir des Lucioles', cost:1000, lucioles:10,
    prompt:'Reçois 10 Lucioles à dépenser dans la Guerre des clans. Connecte-toi avec Twitch sur le site de la Veillée (page Guerre des clans).' },
];
export const CL_RECENT_MAX = 12;     // nombre de derniers crédits affichés au meneur

const DEFAULT_DB_URL = 'https://veillee-village-default-rtdb.europe-west1.firebasedatabase.app';
const TWITCH_TOKEN   = 'https://id.twitch.tv/oauth2/token';
const HELIX          = 'https://api.twitch.tv/helix';
const GOOGLE_TOKEN   = 'https://oauth2.googleapis.com/token';
export const EVENTSUB_TYPE = 'channel.channel_points_custom_reward_redemption.add';
export const BROADCASTER_SCOPES = 'channel:manage:redemptions';

export const env = (k) => (process.env[k] || '').trim();
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
const dbUrl = () => (env('FIREBASE_DATABASE_URL') || DEFAULT_DB_URL).replace(/\/+$/,'');

// fetch remplaçable (tests)
let _fetch = (...a) => fetch(...a);
export function _setFetch(f){ _fetch = f; _gTok = null; _appTok = null; }

// ══ FIREBASE (REST, avec le compte de service) ═════════════════════════════
let _gTok = null;   // { token, exp } — mis en cache tant que la fonction reste « chaude »
async function googleToken(){
  const now = Math.floor(Date.now()/1000);
  if(_gTok && _gTok.exp - 60 > now) return _gTok.token;
  const email = env('FIREBASE_CLIENT_EMAIL');
  const key   = env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
  if(!email || !key) throw new Error('Compte de service Firebase non configuré');
  const unsigned = b64url(JSON.stringify({ alg:'RS256', typ:'JWT' })) + '.' + b64url(JSON.stringify({
    iss:email, aud:GOOGLE_TOKEN, iat:now, exp:now+3600,
    scope:'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
  }));
  const jwt = unsigned + '.' + b64url(crypto.createSign('RSA-SHA256').update(unsigned).sign(key));
  const r = await _fetch(GOOGLE_TOKEN, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:jwt }) });
  if(!r.ok) throw new Error('Jeton Google refusé : ' + r.status + ' ' + await r.text());
  const j = await r.json();
  _gTok = { token:j.access_token, exp:now + (j.expires_in || 3600) };
  return _gTok.token;
}

const dbPath = (path) => dbUrl() + '/' + path.split('/').map(encodeURIComponent).join('/') + '.json';

export async function dbGet(path){
  const r = await _fetch(dbPath(path) + '?access_token=' + await googleToken());
  if(!r.ok) throw new Error('Lecture Firebase ' + path + ' : ' + r.status);
  return r.json();
}
export async function dbPatch(path, obj){
  const r = await _fetch(dbPath(path) + '?access_token=' + await googleToken(),
    { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(obj) });
  if(!r.ok) throw new Error('Écriture Firebase ' + path + ' : ' + r.status);
  return r.json();
}
export async function dbPut(path, obj){
  const r = await _fetch(dbPath(path) + '?access_token=' + await googleToken(),
    { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(obj) });
  if(!r.ok) throw new Error('Écriture Firebase ' + path + ' : ' + r.status);
  return r.json();
}

// Transaction : lit la valeur + son ETag, applique fn, n'écrit que si personne n'a modifié entre-temps
// (sinon on recommence avec la nouvelle valeur). fn renvoie undefined pour abandonner.
export async function dbTx(path, fn, tries = 8){
  const url = dbPath(path) + '?access_token=' + await googleToken();
  let r = await _fetch(url, { headers:{ 'X-Firebase-ETag':'true' } });
  if(!r.ok) throw new Error('Lecture Firebase ' + path + ' : ' + r.status);
  let etag = r.headers.get('ETag'), cur = await r.json();
  for(let i = 0; i < tries; i++){
    const next = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
    if(next === undefined) return { committed:false, value:cur };
    const w = await _fetch(url, { method:'PUT', headers:{ 'Content-Type':'application/json', 'if-match':etag }, body:JSON.stringify(next) });
    if(w.ok) return { committed:true, value:next };
    if(w.status !== 412) throw new Error('Écriture Firebase ' + path + ' : ' + w.status);
    etag = w.headers.get('ETag'); cur = await w.json();     // quelqu'un est passé avant : on rejoue
  }
  throw new Error('Transaction Firebase ' + path + ' : trop de conflits');
}

// ══ TWITCH ═════════════════════════════════════════════════════════════════
// Secret partagé avec Twitch pour signer les notifications : dérivé du code secret de l'app
// (pas de variable de plus à régler). 64 caractères hexadécimaux.
export function eventsubSecret(){
  const s = env('TWITCH_CLIENT_SECRET');
  if(!s) throw new Error('TWITCH_CLIENT_SECRET manquant');
  return crypto.createHmac('sha256', s).update('veillee-clans-eventsub').digest('hex');
}

// Vérifie qu'une notification vient bien de Twitch (signature HMAC + fraîcheur ≤ 10 min)
export function verifyEventsub(headers, rawBody, secret = eventsubSecret(), now = Date.now()){
  const id  = headers.get('twitch-eventsub-message-id') || '';
  const ts  = headers.get('twitch-eventsub-message-timestamp') || '';
  const sig = headers.get('twitch-eventsub-message-signature') || '';
  if(!id || !ts || !sig) return false;
  const t = Date.parse(ts);
  if(!Number.isFinite(t) || Math.abs(now - t) > 10*60*1000) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(id + ts + rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let _appTok = null;
async function appToken(){
  const now = Date.now();
  if(_appTok && _appTok.exp - 60000 > now) return _appTok.token;
  const r = await _fetch(TWITCH_TOKEN, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({ client_id:env('TWITCH_CLIENT_ID'), client_secret:env('TWITCH_CLIENT_SECRET'), grant_type:'client_credentials' }) });
  if(!r.ok) throw new Error('Jeton d\'application Twitch refusé : ' + r.status);
  const j = await r.json();
  _appTok = { token:j.access_token, exp:now + (j.expires_in || 3600)*1000 };
  return _appTok.token;
}

// Jeton de la chaîne (rafraîchi automatiquement quand il expire)
export async function broadcasterToken(){
  const b = await dbGet('clansPrivate/broadcaster');
  if(!b || !b.refresh) throw new Error('Chaîne Twitch pas encore branchée');
  if(b.access && (b.exp || 0) - 120000 > Date.now()) return b;
  const r = await _fetch(TWITCH_TOKEN, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({ client_id:env('TWITCH_CLIENT_ID'), client_secret:env('TWITCH_CLIENT_SECRET'), grant_type:'refresh_token', refresh_token:b.refresh }) });
  if(!r.ok){
    await dbPatch('clans/status', { connected:false, error:'Autorisation Twitch perdue : rebranche la chaîne depuis la vue meneur.' });
    throw new Error('Rafraîchissement Twitch refusé : ' + r.status);
  }
  const j = await r.json();
  const nb = Object.assign({}, b, { access:j.access_token, refresh:j.refresh_token || b.refresh, exp:Date.now() + (j.expires_in || 3600)*1000 });
  await dbPut('clansPrivate/broadcaster', nb);
  return nb;
}

async function helix(method, path, token, body, useApp){
  const r = await _fetch(HELIX + path, { method, headers:Object.assign(
    { 'Authorization':'Bearer ' + (useApp ? await appToken() : token), 'Client-Id':env('TWITCH_CLIENT_ID') },
    body ? { 'Content-Type':'application/json' } : {}), body:body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let json = null; try{ json = txt ? JSON.parse(txt) : null; }catch(e){}
  return { ok:r.ok, status:r.status, json, txt };
}

// Crée (ou met à jour) les récompenses des paliers. Renvoie { <rewardId>: { key, title, cost, lucioles } }
// Une récompense déjà créée est retrouvée par son identifiant (noté dans clans/status, via la clé du palier),
// sinon par son titre : la renommer la MODIFIE au lieu d'en créer une seconde.
export async function ensureRewards(b){
  const previous = ((await dbGet('clans/status').catch(() => null)) || {}).rewards || {};
  const list = await helix('GET', '/channel_points/custom_rewards?broadcaster_id=' + b.id + '&only_manageable_rewards=true', b.access);
  if(!list.ok) throw new Error('Lecture des récompenses Twitch : ' + list.status + ' ' + list.txt);
  const mine = (list.json && list.json.data) || [];
  const out = {};
  for(const t of CL_TIERS){
    const body = { title:t.title, cost:t.cost, prompt:t.prompt, is_enabled:true, is_user_input_required:false,
      should_redemptions_skip_request_queue:false, background_color:'#F5B832' };
    const prevId = Object.keys(previous).find(id => previous[id] && previous[id].key === t.key);
    const existing = mine.find(r => r.id === prevId) || mine.find(r => r.title === t.title);
    const res = existing
      ? await helix('PATCH', '/channel_points/custom_rewards?broadcaster_id=' + b.id + '&id=' + existing.id, b.access, body)
      : await helix('POST',  '/channel_points/custom_rewards?broadcaster_id=' + b.id, b.access, body);
    if(!res.ok){
      const dup = /DUPLICATE/i.test(res.txt);
      throw new Error(dup
        ? 'Une récompense nommée « ' + t.title + ' » existe déjà sur la chaîne (créée à la main) : supprime-la sur Twitch puis recommence.'
        : 'Création de la récompense Twitch : ' + res.status + ' ' + res.txt);
    }
    const id = res.json.data[0].id;
    out[id] = { key:t.key, title:t.title, cost:t.cost, lucioles:t.lucioles };
  }
  return out;
}

// Abonne l'app aux échanges de la chaîne (une seule fois, sur la bonne adresse de rappel)
export async function ensureSubscription(b, callback){
  const list = await helix('GET', '/eventsub/subscriptions?type=' + EVENTSUB_TYPE, null, null, true);
  if(!list.ok) throw new Error('Lecture des abonnements Twitch : ' + list.status + ' ' + list.txt);
  let keep = null;
  for(const s of (list.json.data || [])){
    const sameChan = s.condition && s.condition.broadcaster_user_id === b.id;
    const good = sameChan && s.transport && s.transport.callback === callback && /enabled|pending/.test(s.status) && !s.condition.reward_id;
    if(good && !keep){ keep = s; continue; }
    if(sameChan) await helix('DELETE', '/eventsub/subscriptions?id=' + s.id, null, null, true);   // ancien ou en panne
  }
  if(keep) return keep.status;
  const res = await helix('POST', '/eventsub/subscriptions', null, {
    type:EVENTSUB_TYPE, version:'1', condition:{ broadcaster_user_id:b.id },
    transport:{ method:'webhook', callback, secret:eventsubSecret() } }, true);
  if(!res.ok) throw new Error('Abonnement Twitch : ' + res.status + ' ' + res.txt);
  return res.json.data[0].status;
}

// ══ CRÉDIT D'UN ÉCHANGE ════════════════════════════════════════════════════
// r : { id, user_id, user_login, user_name, reward_id, redeemed_at }
// Idempotent : un même échange n'est JAMAIS crédité deux fois (il est noté dans le porte-monnaie,
// dans la même transaction que le crédit). Renvoie 'credited' | 'already' | 'ignored'.
export async function creditRedemption(r, rewards){
  const tier = rewards && rewards[r.reward_id];
  if(!tier || !r.id || !r.user_id) return 'ignored';          // pas une récompense de la Guerre des clans
  const uid = 'twitch:' + r.user_id;
  const at  = Date.parse(r.redeemed_at) || Date.now();
  const name = String(r.user_name || r.user_login || '');
  const tx = await dbTx('clans/wallets/' + uid, (w) => {
    w = w && typeof w === 'object' ? w : { lucioles:0, total:0 };
    w.ledger = w.ledger && typeof w.ledger === 'object' ? w.ledger : {};
    if(w.ledger[r.id]) return undefined;                        // déjà crédité
    w.ledger[r.id] = { n:tier.lucioles, at, src:'twitch' };
    w.lucioles = (w.lucioles || 0) + tier.lucioles;
    w.total    = (w.total || 0) + tier.lucioles;
    w.name = name; w.login = String(r.user_login || '');
    w.updatedAt = Date.now();
    return w;
  });
  if(!tx.committed) return 'already';
  await dbTx('clans/status/recent', (list) => {
    const arr = Array.isArray(list) ? list : (list ? Object.values(list) : []);
    arr.unshift({ name, n:tier.lucioles, at });
    return arr.slice(0, CL_RECENT_MAX);
  }).catch(() => {});                                           // l'historique du meneur n'est pas critique
  return 'credited';
}

// Marque l'échange « terminé » sur Twitch (les points sont définitivement dépensés)
export async function fulfill(b, rewardId, redemptionId){
  const res = await helix('PATCH', '/channel_points/custom_rewards/redemptions?broadcaster_id=' + b.id +
    '&reward_id=' + rewardId + '&id=' + redemptionId, b.access, { status:'FULFILLED' });
  return res.ok;
}

// Rattrapage : traite tous les échanges restés « en attente » sur Twitch
// (fonction en panne, notification perdue…). Sans risque : le crédit est idempotent.
export async function syncPending(){
  const status = (await dbGet('clans/status')) || {};
  const rewards = status.rewards || {};
  const b = await broadcasterToken();
  const counts = { credited:0, already:0, ignored:0, errors:0 };
  for(const rewardId of Object.keys(rewards)){
    let cursor = '', guard = 0;
    do{
      const q = '/channel_points/custom_rewards/redemptions?broadcaster_id=' + b.id + '&reward_id=' + rewardId +
        '&status=UNFULFILLED&first=50' + (cursor ? '&after=' + encodeURIComponent(cursor) : '');
      const res = await helix('GET', q, b.access);
      if(!res.ok) throw new Error('Lecture des échanges Twitch : ' + res.status + ' ' + res.txt);
      for(const x of (res.json.data || [])){
        try{
          const out = await creditRedemption({ id:x.id, user_id:x.user_id, user_login:x.user_login, user_name:x.user_name,
            reward_id:rewardId, redeemed_at:x.redeemed_at }, rewards);
          counts[out]++;
          if(out !== 'ignored') await fulfill(b, rewardId, x.id);
        }catch(e){ counts.errors++; console.error('clans sync :', e && e.message); }
      }
      cursor = res.json.pagination && res.json.pagination.cursor;
    } while(cursor && ++guard < 20);
  }
  await dbPatch('clans/status', { lastSync:Date.now() });
  return counts;
}
