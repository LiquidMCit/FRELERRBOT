const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { supabase } = require('./supabase');
const { load } = require('./levels');

const PAGE_SIZE = 5;

// messageId → { channelId, guildId } — solo messaggi pubblici
const activeLeaderboards = new Map();

async function saveActiveLeaderboards() {
  await supabase.from('leaderboard_messages').delete().neq('message_id', '0');
  const rows = Array.from(activeLeaderboards.entries()).map(([messageId, s]) => ({
    message_id: messageId, channel_id: s.channelId, guild_id: s.guildId,
  }));
  if (rows.length > 0) await supabase.from('leaderboard_messages').insert(rows);
}

async function loadActiveLeaderboardsFromFile() {
  const { data } = await supabase.from('leaderboard_messages').select('*');
  for (const row of data ?? []) {
    activeLeaderboards.set(row.message_id, { channelId: row.channel_id, guildId: row.guild_id });
  }
}

function getTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function buildPagedLeaderboardEmbed(guild, page, userId = null) {
  const data = await load();

  const sorted = Object.entries(data)
    .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const lines = [];
  for (let i = 0; i < slice.length; i++) {
    const globalPos = safePage * PAGE_SIZE + i + 1;
    const [uid, userData] = slice[i];
    const member = await guild.members.fetch(uid).catch(() => null);
    const name = member ? member.displayName : 'Utente sconosciuto';
    lines.push(`**${globalPos}.** **${name}** — __ʟᴠʟ ${userData.level}__`);
  }

  let description = lines.length > 0 ? lines.join('\n\n') : 'Nessun dato disponibile.';

  if (userId) {
    const pos = sorted.findIndex(([id]) => id === userId);
    const userStats = data[userId] ?? { level: 0, xp: 0 };
    const posLine = pos === -1
      ? '> Non sei ancora in classifica.'
      : `> Sei **#${pos + 1}** nella classifica\n> ${'　'.repeat(3)}__ʟᴠʟ ${userStats.level}__`;
    description += '\n\n' + posLine;
  }

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🏆 Classifica')
    .setDescription(description)
    .setFooter({ text: `FrelerrBOT • Aggiornato alle ${getTimeString()}` });

  return { embed, totalPages, currentPage: safePage };
}

// Bottone sul messaggio pubblico — apre la classifica privata
function buildPublicButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lb_open')
      .setLabel('Altro...')
      .setStyle(ButtonStyle.Secondary),
  );
}

// Bottoni di navigazione sul messaggio efimero privato
function buildPrivateButtons(currentPage, totalPages) {
  const isFirst = currentPage === 0;
  const isLast = currentPage >= totalPages - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lb_priv_${currentPage - 1}`)
      .setLabel('◀ Indietro')
      .setStyle(isFirst ? ButtonStyle.Secondary : ButtonStyle.Danger)
      .setDisabled(isFirst),
    new ButtonBuilder()
      .setCustomId(`lb_priv_${currentPage + 1}`)
      .setLabel('Avanti ▶')
      .setStyle(isLast ? ButtonStyle.Secondary : ButtonStyle.Danger)
      .setDisabled(isLast),
  );
}

module.exports = { buildPagedLeaderboardEmbed, buildPublicButton, buildPrivateButtons, activeLeaderboards, saveActiveLeaderboards, loadActiveLeaderboardsFromFile };
