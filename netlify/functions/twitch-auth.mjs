// ══════════════════════════════════════════════════════════════════════════
//  CONNEXION VIA TWITCH — fonction Netlify (tourne sur le serveur, pas dans le navigateur)
//
//  Adresse : /.netlify/functions/twitch-auth
//   1. Sans paramètre      → envoie le joueur sur la page d'autorisation de Twitch.
//   2. Retour de Twitch    → échange le « code » contre le compte Twitch du joueur,
//                            puis fabrique un jeton Firebase personnalisé à son nom
//                            (uid « twitch:<id> », pseudo = nom Twitch).
//   Le jeton est remis au navigateur, qui se connecte à Firebase avec.
//
//  Aucune dépendance à installer : la signature du jeton utilise le module crypto de Node.
//
//  Variables d'environnement à régler dans Netlify (JAMAIS dans le code) :
//   TWITCH_CLIENT_ID        identifiant de l'application Twitch (dev.twitch.tv)
//   TWITCH_CLIENT_SECRET    code secret de l'application Twitch
//   FIREBASE_CLIENT_EMAIL   « client_email » du fichier de clé du compte de service Firebase
//   FIREBASE_PRIVATE_KEY    « private_key » du même fichier (avec ses \n, tel quel)
// ══════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';

const TWITCH_AUTHORIZE = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN     = 'https://id.twitch.tv/oauth2/token';
const TWITCH_USERS     = 'https://api.twitch.tv/helix/users';
const FIREBASE_AUD     = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const STATE_COOKIE     = 'tw_state';
const FN_PATH          = '/.netlify/functions/twitch-auth';

const env = (k) => (process.env[k] || '').trim();
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');

// Jeton personnalisé Firebase (JWT signé RS256 avec la clé du compte de service)
export function mintFirebaseToken(uid, claims, email, privateKey, now = Math.floor(Date.now()/1000)){
  const header  = { alg:'RS256', typ:'JWT' };
  const payload = { iss:email, sub:email, aud:FIREBASE_AUD, iat:now, exp:now+3600, uid, claims };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey);
  return unsigned + '.' + b64url(sig);
}

// Page minuscule renvoyée au navigateur : range le résultat puis retourne à l'accueil
function handoff(key, value){
  const html = '<!doctype html><meta charset="utf-8"><title>Connexion…</title>' +
    '<script>try{sessionStorage.setItem(' + JSON.stringify(key) + ',' + JSON.stringify(value) + ')}catch(e){}' +
    'location.replace("/")</script><noscript>Active JavaScript puis <a href="/">reviens à la veillée</a>.</noscript>';
  return new Response(html, { status:200, headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store',
    'Set-Cookie': STATE_COOKIE + '=; Path=' + FN_PATH + '; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  }});
}
const fail = (msg, detail) => { if(detail) console.error('twitch-auth :', msg, detail); return handoff('twErr', msg); };

function readCookie(req, name){
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export default async function handler(req){
  const url = new URL(req.url);
  const redirectUri = url.origin + FN_PATH;   // doit être déclarée à l'identique dans la console Twitch
  const clientId = env('TWITCH_CLIENT_ID'), clientSecret = env('TWITCH_CLIENT_SECRET');
  const saEmail  = env('FIREBASE_CLIENT_EMAIL');
  const saKey    = env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
  if(!clientId || !clientSecret || !saEmail || !saKey) return fail('Connexion Twitch pas encore configurée.', 'variables manquantes');

  // Le joueur a refusé sur la page Twitch
  if(url.searchParams.get('error')) return fail('Connexion Twitch annulée.');

  const code = url.searchParams.get('code');

  // ── 1. Départ : redirection vers Twitch (avec un « state » anti-falsification) ──
  if(!code){
    const state = b64url(crypto.randomBytes(18));
    const to = new URL(TWITCH_AUTHORIZE);
    to.searchParams.set('client_id', clientId);
    to.searchParams.set('redirect_uri', redirectUri);
    to.searchParams.set('response_type', 'code');
    to.searchParams.set('scope', '');           // aucun droit demandé : on lit seulement le nom public
    to.searchParams.set('state', state);
    to.searchParams.set('force_verify', 'false');
    return new Response(null, { status:302, headers:{
      'Location': to.toString(),
      'Cache-Control':'no-store',
      'Set-Cookie': STATE_COOKIE + '=' + state + '; Path=' + FN_PATH + '; Max-Age=600; HttpOnly; Secure; SameSite=Lax',
    }});
  }

  // ── 2. Retour : vérifier le state, échanger le code, lire le compte ──
  const state = url.searchParams.get('state') || '';
  const expected = readCookie(req, STATE_COOKIE);
  if(!expected || state !== expected) return fail('Connexion Twitch expirée, réessaie.', 'state invalide');

  try{
    const tokRes = await fetch(TWITCH_TOKEN, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id:clientId, client_secret:clientSecret, code, grant_type:'authorization_code', redirect_uri:redirectUri }),
    });
    if(!tokRes.ok) return fail('Twitch a refusé la connexion.', 'token ' + tokRes.status + ' ' + await tokRes.text());
    const { access_token } = await tokRes.json();

    const userRes = await fetch(TWITCH_USERS, { headers:{ 'Authorization':'Bearer ' + access_token, 'Client-Id':clientId } });
    if(!userRes.ok) return fail('Impossible de lire ton compte Twitch.', 'users ' + userRes.status);
    const user = ((await userRes.json()).data || [])[0];
    if(!user || !user.id) return fail('Impossible de lire ton compte Twitch.', 'users vide');

    const name = String(user.display_name || user.login || '').trim() || String(user.login);
    const fbToken = mintFirebaseToken('twitch:' + user.id, { tw:String(user.login), twn:name }, saEmail, saKey);
    return handoff('twToken', fbToken);
  } catch(e){
    return fail('Connexion Twitch impossible pour le moment.', e && e.message);
  }
}
