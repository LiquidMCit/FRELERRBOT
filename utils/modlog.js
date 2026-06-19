const { EmbedBuilder } = require('discord.js');
const { MOD_LOG_CHANNEL_ID } = require('../config');

function getTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Invia un log di moderazione nel canale dedicato.
 * @param {Client} client
 * @param {object} opts
 * @param {string}           opts.action     - Titolo azione (es. "Ban", "Warn #2")
 * @param {number}           [opts.color]    - Colore embed (default rosso)
 * @param {GuildMember|string} opts.moderator - Chi ha eseguito l'azione (o stringa tipo "Auto")
 * @param {GuildMember|User} opts.target     - Utente colpito
 * @param {string}           opts.reason     - Motivo
 * @param {string}           [opts.extra]    - Info aggiuntiva (es. azione automatica)
 */
async function sendModLog(client, { action, color = 0xe74c3c, moderator, target, reason, extra = null }) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channel = guild.channels.cache.get(MOD_LOG_CHANNEL_ID);
  if (!channel) return;

  const targetId = target.id;
  const targetName = target.displayName ?? target.username ?? 'Sconosciuto';
  const targetStr = `**${targetName}** \`${targetId}\``;

  const modStr = typeof moderator === 'string'
    ? moderator
    : `**${moderator.displayName ?? moderator.username}** \`${moderator.id}\``;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: '👤 Utente', value: targetStr, inline: true },
      { name: '🛡️ Moderatore', value: modStr, inline: true },
      { name: '📋 Motivo', value: reason },
    )
    .setTimestamp()
    .setFooter({ text: `FrelerrBOT • ${getTimeString()}` });

  if (extra) embed.addFields({ name: '⚡ Azione automatica', value: extra });

  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { sendModLog };
