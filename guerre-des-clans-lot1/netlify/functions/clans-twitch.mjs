// ══════════════════════════════════════════════════════════════════════════
//  GUERRE DES CLANS — branchement de la chaîne Twitch + rattrapage
//
//  Adresse : /.netlify/functions/clans-twitch
//   ?action=connect   → envoie le streamer sur Twitch pour autoriser la gestion des récompenses
//   (retour Twitch)   → enregistre l'autorisation, crée la récompense « 10 Lucioles »,
//                       abonne l'app aux échanges, rattrape les échanges en attente,
//                       puis revient sur /admin
//   ?action=sync      → rattrape les échanges restés en attente (réponse JSON)
//
//  Sécurité : seule la chaîne TWITCH_BROADCASTER_LOGIN peut être branchée.
//  À déclarer dans la console Twitch (dev.twitch.tv → l'app → « OAuth Redirect URLs ») :
//    https://<ton-site>/.netlify/functions/clans-twitch
// ══════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import { env, BROADCASTER_SCOPES, dbGet, dbPatch, dbPut, ensureRewards, ensureSubscription, syncPending } from '../lib/clans-core.mjs';

const FN_PATH      = '/.netlify/functions/clans-twitch';
const STATE_COOKIE = 'clans_state';
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');

function readCookie(req, name){
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

// Retour à la vue meneur avec un message (lu par clans.js)
function backToAdmin(msg, ok){
  const html = '<!doctype html><meta charset="utf-8"><title>Guerre des clans…</title>' +
    '<script>try{sessionStorage.setItem("clansMsg",' + JSON.stringify(JSON.stringify({ msg, ok:!!ok })) + ')}catch(e){}' +
    'location.replace("/admin")</script><noscript>' + (ok ? 'Chaîne branchée.' : 'Erreur.') + ' <a href="/admin">Retour</a></noscript>';
  return new Response(html, { status:200, headers:{
    'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store',
    'Set-Cookie': STATE_COOKIE + '=; Path=' + FN_PATH + '; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  }});
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' } });

export default async function handler(req){
  const url = new URL(req.url);
  const redirectUri = url.origin + FN_PATH;
  const clientId = env('TWITCH_CLIENT_ID'), clientSecret = env('TWITCH_CLIENT_SECRET');
  const channel  = env('TWITCH_BROADCASTER_LOGIN').toLowerCase();
  const action   = url.searchParams.get('action');

  // ── Rattrapage (sans risque : un échange n'est jamais crédité deux fois) ──
  if(action === 'sync'){
    try{
      const st = (await dbGet('clans/status')) || {};
      if(st.lastSync && Date.now() - st.lastSync < 15000) return json({ ok:true, skipped:true });   // anti-martelage
      return json(Object.assign({ ok:true }, await syncPending()));
    }catch(e){
      console.error('clans sync :', e && e.message);
      return json({ ok:false, error:String(e && e.message || e) }, 500);
    }
  }

  if(!clientId || !clientSecret || !channel) return backToAdmin('Configuration incomplète : ajoute TWITCH_BROADCASTER_LOGIN dans les variables Netlify.');
  if(url.searchParams.get('error')) return backToAdmin('Autorisation Twitch annulée.');

  const code = url.searchParams.get('code');

  // ── 1. Départ vers Twitch ──
  if(!code){
    const state = b64url(crypto.randomBytes(18));
    const to = new URL('https://id.twitch.tv/oauth2/authorize');
    to.searchParams.set('client_id', clientId);
    to.searchParams.set('redirect_uri', redirectUri);
    to.searchParams.set('response_type', 'code');
    to.searchParams.set('scope', BROADCASTER_SCOPES);
    to.searchParams.set('state', state);
    to.searchParams.set('force_verify', 'true');     // montre toujours le compte utilisé
    return new Response(null, { status:302, headers:{
      'Location':to.toString(), 'Cache-Control':'no-store',
      'Set-Cookie': STATE_COOKIE + '=' + state + '; Path=' + FN_PATH + '; Max-Age=600; HttpOnly; Secure; SameSite=Lax',
    }});
  }

  // ── 2. Retour de Twitch ──
  const state = url.searchParams.get('state') || '';
  const expected = readCookie(req, STATE_COOKIE);
  if(!expected || state !== expected) return backToAdmin('Autorisation expirée, recommence.');

  try{
    const tokRes = await fetch('https://id.twitch.tv/oauth2/token', { method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body:new URLSearchParams({ client_id:clientId, client_secret:clientSecret, code, grant_type:'authorization_code', redirect_uri:redirectUri }) });
    if(!tokRes.ok) return backToAdmin('Twitch a refusé l\'autorisation (' + tokRes.status + ').');
    const tok = await tokRes.json();

    const userRes = await fetch('https://api.twitch.tv/helix/users', { headers:{ 'Authorization':'Bearer ' + tok.access_token, 'Client-Id':clientId } });
    const user = userRes.ok ? ((await userRes.json()).data || [])[0] : null;
    if(!user) return backToAdmin('Impossible de lire le compte Twitch.');
    if(String(user.login).toLowerCase() !== channel)
      return backToAdmin('Ce compte (' + user.login + ') n\'est pas la chaîne ' + channel + '. Connecte-toi avec le compte de la chaîne.');
    if(!['affiliate','partner'].includes(user.broadcaster_type))
      return backToAdmin('Les points de chaîne demandent une chaîne affiliée ou partenaire.');

    const b = { id:user.id, login:user.login, access:tok.access_token, refresh:tok.refresh_token, exp:Date.now() + (tok.expires_in || 3600)*1000 };
    await dbPut('clansPrivate/broadcaster', b);

    const rewards = await ensureRewards(b);
    const sub = await ensureSubscription(b, url.origin + '/.netlify/functions/clans-eventsub');
    // « sub » n'est écrit que s'il est déjà actif : sinon c'est la vérification de Twitch qui le passera à « enabled »
    const patch = { connected:true, broadcaster:user.login, rewards, connectedAt:Date.now(), error:null };
    if(sub === 'enabled') patch.sub = 'enabled';
    await dbPatch('clans/status', patch);

    let extra = '';
    try{ const c = await syncPending(); if(c.credited) extra = ' ' + c.credited + ' échange(s) en attente crédité(s).'; }catch(e){}
    return backToAdmin('Chaîne branchée : la récompense « 10 Lucioles » est en place.' + extra, true);
  }catch(e){
    console.error('clans connect :', e && e.message);
    await dbPatch('clans/status', { error:String(e && e.message || e) }).catch(() => {});
    return backToAdmin('Branchement impossible : ' + (e && e.message || e));
  }
}
