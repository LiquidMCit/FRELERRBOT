const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { addXP, addMessage, randomXP, load } = require('../utils/levels');
const { enqueueTTS } = require('../utils/voice');
const { buildPagedLeaderboardEmbed, buildPublicButton, activeLeaderboards, saveActiveLeaderboards } = require('../utils/leaderboard');
const { sendModLog } = require('../utils/modlog');
const { VIP_ROLE_ID, LEVELUP_CHANNEL_ID } = require('../config');
const { loadTickets, saveTickets, buildPanelEmbed, buildPanelMenu } = require('../utils/tickets');
const { buildPanelEmbed: buildTempEmbed, buildPanelButtons, buildManageEmbed, buildManageButton, getUserChannel } = require('../utils/tempChannels');

const spamTracker = new Map();

async function handleAntiSpam(message) {
  const userId = message.author.id;
  const now = Date.now();

  if (!spamTracker.has(userId)) spamTracker.set(userId, []);
  const timestamps = spamTracker.get(userId).filter(t => now - t < 5000);
  timestamps.push(now);
  spamTracker.set(userId, timestamps);

  if (timestamps.length >= 5) {
    spamTracker.delete(userId);
    await message.member.timeout(60_000, 'Spam rilevato').catch(() => {});
    const warn = await message.channel.send(`⚠️ ${message.member} sei stato silenziato per 1 minuto per spam.`);
    setTimeout(() => warn.delete().catch(() => {}), 8000);
    await sendModLog(message.client, {
      action: 'Timeout (Anti-spam)', color: 0xe67e22,
      moderator: '🤖 Sistema Anti-Spam', target: message.member,
      reason: '5 messaggi in meno di 5 secondi', extra: '⏱️ Timeout di **1 minuto**',
    });
    return true;
  }
  return false;
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;

    // ── TTS automatico ──────────────────────────────────────────────
    if (client.ttsChannels?.has(message.channel.id)) {
      const voiceChannelId = client.ttsChannels.get(message.channel.id);
      const voiceChannel = message.guild.channels.cache.get(voiceChannelId);
      if (voiceChannel) {
        const nome = message.member?.displayName ?? message.author.username;
        const testo = `${nome} ha scritto: ${message.content}`;
        enqueueTTS(client, message.guild, voiceChannel, testo);
      }
    }

    if (!message.content.startsWith('!')) {
      const tickets = await loadTickets();
      if (tickets[message.channel.id] && !tickets[message.channel.id].closed) {
        tickets[message.channel.id].lastMessage = Date.now();
        tickets[message.channel.id].warningSent = false;
        await saveTickets(tickets);
      }

      const spammed = await handleAntiSpam(message);
      if (spammed) return;

      const { leveledUp, newLevel } = await addXP(message.author.id, randomXP());
      await addMessage(message.author.id);

      if (leveledUp) {
        if (newLevel === 50) {
          const vipRole = message.guild.roles.cache.get(VIP_ROLE_ID);
          if (vipRole) await message.member.roles.add(vipRole).catch(() => {});
        }
        const lvlChannel = message.guild.channels.cache.get(LEVELUP_CHANNEL_ID);
        if (lvlChannel) {
          const lvlEmbed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`🎉 Ha raggiunto il **Livello ${newLevel}**!`);
          await lvlChannel.send({ content: `${message.member}`, embeds: [lvlEmbed] });
        }
      }
      return;
    }

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'annuncio') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const reply = await message.reply('❌ Non hai i permessi per usare questo comando.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }
      const full = message.content.slice('!annuncio'.length + 1).trim();
      const separatorIndex = full.indexOf('|');
      if (separatorIndex === -1 || separatorIndex === 0 || separatorIndex === full.length - 1) {
        const reply = await message.reply('❌ Formato corretto: `!annuncio Titolo | Testo`');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }
      const title = full.slice(0, separatorIndex).trim();
      const text = full.slice(separatorIndex + 1).trim();
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: message.member.displayName, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTitle(title).setDescription(text)
        .setFooter({ text: `FrelerrBOT • ${time}` });
      await message.channel.send({ content: '@everyone', embeds: [embed] });
      await message.delete().catch(() => {});
    }

    if (command === 'ticketpanel') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const reply = await message.reply('❌ Non hai i permessi per usare questo comando.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }
      await message.channel.send({ embeds: [buildPanelEmbed()], components: [buildPanelMenu()] });
      await message.delete().catch(() => {});
    }

    if (command === 'infolvl') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const reply = await message.reply('❌ Non hai i permessi per usare questo comando.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }
      const { buildInfoEmbed } = require('../utils/infolvl');
      await message.channel.send({ embeds: [buildInfoEmbed()] });
      await message.delete().catch(() => {});
    }

    if (command === 'stanzatemporanea') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const reply = await message.reply('❌ Non hai i permessi per usare questo comando.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }
      await message.channel.send({ embeds: [buildTempEmbed()], components: [buildPanelButtons()] });
      await message.delete().catch(() => {});
    }

    if (command === 'unban') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const reply = await message.reply('❌ Non hai i permessi per usare questo comando.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c).setTitle('🔓 Richiesta Unban')
        .setDescription('Sei stato bannato dal server.\n\nSe ritieni che il ban sia ingiusto o vuoi spiegare la tua situazione, puoi inviare una richiesta di unban premendo il pulsante qui sotto.\n\n*La tua richiesta verrà valutata dallo staff. Non abusare di questo sistema.*')
        .setFooter({ text: `FrelerrBOT • ${time}` });
      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('unban_request').setLabel('𝗥𝗜𝗖𝗛𝗜𝗘𝗦𝗧𝗔 𝗨𝗡𝗕𝗔𝗡').setStyle(ButtonStyle.Danger),
      );
      await message.channel.send({ embeds: [embed], components: [button] });
      await message.delete().catch(() => {});
    }

    if (command === 'leaderboard') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const reply = await message.reply('❌ Non hai i permessi per usare questo comando.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }
      const { embed } = await buildPagedLeaderboardEmbed(message.guild, 0);
      const sent = await message.channel.send({ embeds: [embed], components: [buildPublicButton()] });
      activeLeaderboards.set(sent.id, { channelId: message.channel.id, guildId: message.guild.id });
      await saveActiveLeaderboards();
      await message.delete().catch(() => {});
    }

    if (command === 'yourposition') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const reply = await message.reply('❌ Non hai i permessi per usare questo comando.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }
      const data = await load();
      const sorted = Object.entries(data).sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp);
      const pos = sorted.findIndex(([id]) => id === message.author.id);
      const userData = data[message.author.id] ?? { level: 0, xp: 0 };
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c).setTitle('📊 La tua posizione')
        .setDescription(pos === -1 ? '❌ Non sei ancora in classifica.' : `Sei **#${pos + 1}** nella classifica\n__ʟᴠʟ ${userData.level}__ • **${userData.xp} XP**`)
        .setFooter({ text: `FrelerrBOT • Aggiornato alle ${time}` });
      await message.channel.send({ embeds: [embed] });
      await message.delete().catch(() => {});
    }

    if (command === 'gestiscistanza') {
      const entry = await getUserChannel(message.author.id);
      const channelData = entry ? entry[1] : null;
      await message.channel.send({ embeds: [buildManageEmbed(message.member, channelData)], components: [buildManageButton(!!channelData)] });
      await message.delete().catch(() => {});
    }
  },
};
