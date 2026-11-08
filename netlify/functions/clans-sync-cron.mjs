// ══════════════════════════════════════════════════════════════════════════
//  GUERRE DES CLANS — filet de sécurité horaire
//  Toutes les heures, Netlify relance le rattrapage : tout échange resté « en attente »
//  sur Twitch (notification perdue, panne) est crédité puis marqué « terminé ».
// ══════════════════════════════════════════════════════════════════════════
import { dbGet, syncPending } from '../lib/clans-core.mjs';

export default async function handler(){
  try{
    const st = await dbGet('clans/status');
    if(!st || !st.connected) return new Response(null, { status:204 });   // chaîne pas encore branchée
    const c = await syncPending();
    if(c.credited || c.errors) console.log('clans cron :', JSON.stringify(c));
  }catch(e){ console.error('clans cron :', e && e.message); }
  return new Response(null, { status:204 });
}

export const config = { schedule:'@hourly' };
