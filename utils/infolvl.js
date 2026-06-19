const { EmbedBuilder } = require('discord.js');
const { supabase } = require('./supabase');
const { INFOLVL_CHANNEL_ID, INFOLVL_INTERVAL_DAYS } = require('../config');

function buildInfoEmbed() {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⭐ Sistema di Livelli')
    .setDescription(
      '> Il sistema di livelli di **Frelerr** è completamente **infinito**.\n' +
      '> Più sei attivo nel server, più accumuli esperienza e sali di livello.\n\n' +
      '- **Messaggi** guadagni XP scrivendo nel server\n' +
      '- **Vocali** guadagni XP stando nei canali vocali\n' +
      '- **Interazioni** guadagni XP reagendo e partecipando alla community'
    )
    .addFields(
      { name: '​', value: '<@&1506227253191770185>\n╰ Ruolo **VIP** esclusivo\n╰ Accesso alla categoria **VIP**\n╰ Possibilità di creare **canali vocali temporanei** pubblici o privati' },
      { name: '​', value: '<@&1506227296862732349>\n╰ Tutto il precedente\n╰ Possibilità di richiedere una **funzione custom** *(nei limiti del possibile)*' },
      { name: '​', value: '<@&1506227320782979142>\n╰ Ogni **50 lvl** dopo il 100 puoi richiedere una **funzione custom** *(150, 200, 250...)*\n╰ Le funzioni si accumulano nel tempo' },
      { name: '📌 Note', value: '- Le funzioni custom devono essere tecnicamente realizzabili\n- I canali vocali temporanei si eliminano automaticamente quando sono vuoti' }
    )
    .setFooter({ text: `FrelerrBOT • ${time}` });
}

async function checkAndSend(client) {
  const { data } = await supabase.from('settings').select('value').eq('key', 'infolvl_last_sent').single();
  const lastSent = parseInt(data?.value ?? '0');
  const intervalMs = INFOLVL_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() - lastSent >= intervalMs) {
    const channel = client.channels.cache.get(INFOLVL_CHANNEL_ID);
    if (channel) {
      await channel.send({ embeds: [buildInfoEmbed()] });
      await supabase.from('settings').upsert({ key: 'infolvl_last_sent', value: String(Date.now()) }, { onConflict: 'key' });
    }
  }
}

module.exports = { buildInfoEmbed, checkAndSend };
