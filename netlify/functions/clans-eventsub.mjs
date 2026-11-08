// ══════════════════════════════════════════════════════════════════════════
//  GUERRE DES CLANS — réception des notifications Twitch (EventSub)
//
//  Adresse : /.netlify/functions/clans-eventsub  (appelée par Twitch, jamais par un joueur)
//  À chaque échange de la récompense « Lucioles » : on vérifie la signature de Twitch,
//  on crédite le porte-monnaie du viewer (uid « twitch:<id> »), puis on marque l'échange
//  « terminé » sur Twitch. Le viewer n'a pas besoin d'être déjà venu sur le site :
//  ses Lucioles l'attendent jusqu'à sa première connexion via Twitch.
// ══════════════════════════════════════════════════════════════════════════
import { verifyEventsub, dbGet, dbPatch, creditRedemption, broadcasterToken, fulfill, EVENTSUB_TYPE } from '../lib/clans-core.mjs';

export default async function handler(req){
  if(req.method !== 'POST') return new Response('Méthode non autorisée', { status:405 });
  const raw = await req.text();
  if(!verifyEventsub(req.headers, raw)) return new Response('Signature invalide', { status:403 });

  let body; try{ body = JSON.parse(raw); }catch(e){ return new Response('JSON invalide', { status:400 }); }
  const type = req.headers.get('twitch-eventsub-message-type');

  // Twitch vérifie l'adresse au moment de l'abonnement : on renvoie le « challenge »
  if(type === 'webhook_callback_verification'){
    await dbPatch('clans/status', { sub:'enabled' }).catch(() => {});
    return new Response(body.challenge, { status:200, headers:{ 'Content-Type':'text/plain' } });
  }

  // Abonnement coupé par Twitch (autorisation retirée, échecs répétés…)
  if(type === 'revocation'){
    const why = body.subscription && body.subscription.status;
    await dbPatch('clans/status', { sub:'revoked', connected:false,
      error:'Twitch a coupé la réception des échanges (' + why + ') : rebranche la chaîne.' }).catch(() => {});
    return new Response(null, { status:204 });
  }

  if(type === 'notification' && body.subscription && body.subscription.type === EVENTSUB_TYPE){
    const ev = body.event || {};
    try{
      const status = (await dbGet('clans/status')) || {};
      const rewardId = ev.reward && ev.reward.id;
      const out = await creditRedemption({ id:ev.id, user_id:ev.user_id, user_login:ev.user_login, user_name:ev.user_name,
        reward_id:rewardId, redeemed_at:ev.redeemed_at }, status.rewards);
      if(out !== 'ignored'){
        await dbPatch('clans/status', { lastEventAt:Date.now() });
        try{ const b = await broadcasterToken(); await fulfill(b, rewardId, ev.id); }
        catch(e){ console.error('clans fulfill :', e && e.message); }   // le crédit est fait ; le rattrapage terminera
      }
    }catch(e){
      // On répond quand même 200 : l'échange reste « en attente » sur Twitch et sera rattrapé
      console.error('clans eventsub :', e && e.message);
    }
  }
  return new Response(null, { status:204 });
}
