const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { supabase } = require('./supabase');

function parseDuration(str) {
  const match = str.match(/^(\d+)(m|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return null;
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} alle ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function pickWinners(participants, count) {
  const pool = [...participants];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function buildEmbed(giveaway, host) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setAuthor({ name: host.displayName, iconURL: host.user.displayAvatarURL({ dynamic: true }) })
    .setTitle('🎉 GIVEAWAY')
    .addFields(
      { name: '🎁 Premio', value: giveaway.prize, inline: true },
      { name: '👑 Vincitori', value: `${giveaway.maxWinners}`, inline: true },
      { name: '⏰ Termina', value: formatDate(giveaway.endsAt), inline: false },
    )
    .setFooter({ text: `FrelerrBOT • ${time}` });
}

function buildEndedEmbed(giveaway, host, winnerTags) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setAuthor({ name: host.displayName, iconURL: host.user.displayAvatarURL({ dynamic: true }) })
    .setTitle('🎉 GIVEAWAY — TERMINATO')
    .addFields(
      { name: '🎁 Premio', value: giveaway.prize, inline: true },
      { name: '🏆 Vincitori', value: winnerTags.length > 0 ? winnerTags.join(', ') : 'Nessun partecipante', inline: false },
    )
    .setFooter({ text: `FrelerrBOT • ${time}` });
}

function buildButtons(participantCount, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('giveaway_join').setLabel('Partecipa!').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('giveaway_participants').setLabel(`Partecipanti: ${participantCount}`).setEmoji('👥').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}

async function loadGiveaways() {
  const { data } = await supabase.from('giveaways').select('*');
  if (!data) return {};
  const result = {};
  for (const row of data) {
    result[row.message_id] = {
      messageId: row.message_id, prize: row.prize, maxWinners: row.max_winners,
      endsAt: row.ends_at, channelId: row.channel_id, guildId: row.guild_id,
      hostId: row.host_id, participants: row.participants ?? [], ended: row.ended,
    };
  }
  return result;
}

async function saveGiveaway(giveaway) {
  await supabase.from('giveaways').upsert({
    message_id: giveaway.messageId, prize: giveaway.prize, max_winners: giveaway.maxWinners,
    ends_at: giveaway.endsAt, channel_id: giveaway.channelId, guild_id: giveaway.guildId,
    host_id: giveaway.hostId, participants: giveaway.participants, ended: giveaway.ended,
  }, { onConflict: 'message_id' });
}

async function endGiveaway(giveaway, client) {
  const { data } = await supabase.from('giveaways').select('ended').eq('message_id', giveaway.messageId).single();
  if (!data || data.ended) return;

  await supabase.from('giveaways').update({ ended: true }).eq('message_id', giveaway.messageId);

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) return;
  const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
  if (!guild) return;

  const host = await guild.members.fetch(giveaway.hostId).catch(() => null);
  const winnerIds = pickWinners(giveaway.participants, giveaway.maxWinners);
  const winnerTags = winnerIds.map(id => `<@${id}>`);

  const endedEmbed = buildEndedEmbed(
    giveaway,
    host ?? { displayName: 'Unknown', user: { displayAvatarURL: () => null } },
    winnerTags
  );
  await message.edit({ embeds: [endedEmbed], components: [buildButtons(giveaway.participants.length, true)] });

  if (winnerIds.length === 0) {
    await message.reply('⚠️ Nessun partecipante — impossibile estrarre un vincitore.');
    return;
  }
  await message.reply(`🏆 ${winnerTags.join(', ')} Ha vinto il seguente Giveaway, Congratulazioni!`);

  for (const winnerId of winnerIds) {
    const winner = await guild.members.fetch(winnerId).catch(() => null);
    if (!winner) continue;
    await winner.user.send(
      `🎉 Congratulazioni **${winner.displayName}**!\n\nHai vinto **${giveaway.prize}** nel giveaway di **${guild.name}**!\n\nIl premio ti verrà consegnato il prima possibile.`
    ).catch(() => {});
  }
}

module.exports = { loadGiveaways, saveGiveaway, parseDuration, buildEmbed, buildButtons, endGiveaway };
