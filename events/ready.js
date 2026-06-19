const { EmbedBuilder } = require('discord.js');
const { MEMBRO_ROLE_ID, AUTO_ROLE_INTERVAL_MS, MEMBER_COUNTER_CHANNEL_ID, YOUTUBE_CHECK_INTERVAL_MS, TWITCH_CHECK_INTERVAL_MS, VIP_ROLE_ID, LEVELUP_CHANNEL_ID } = require('../config');
const { loadWelcomed, seedWelcomed, sendWelcome } = require('../utils/welcome');
const { checkNewVideo } = require('../utils/youtube');
const { checkLive } = require('../utils/twitch');
const { voiceSessions, addXP, addVoiceMinute, getUser, setFirstJoined } = require('../utils/levels');
const { loadGiveaways, endGiveaway } = require('../utils/giveaway');
const { checkAndSend } = require('../utils/infolvl');
const { buildPagedLeaderboardEmbed, buildPublicButton, activeLeaderboards, saveActiveLeaderboards, loadActiveLeaderboardsFromFile } = require('../utils/leaderboard');
const { loadTickets, saveTickets, closeTicket } = require('../utils/tickets');
const { getAll } = require('../utils/lvlMessages');
const { buildLvlEmbed } = require('../commands/slash/lvl');

async function updateMemberCounter(guild) {
  const channel = guild.channels.cache.get(MEMBER_COUNTER_CHANNEL_ID);
  if (!channel) return;
  await channel.setName(`👥 ᴍᴇᴍʙʀɪ: ${guild.memberCount}`).catch(() => {});
}

async function assignMissingRoles(guild) {
  const role = guild.roles.cache.get(MEMBRO_ROLE_ID);
  if (!role) return;
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;
  for (const member of members.values()) {
    if (!member.user.bot && !member.roles.cache.has(MEMBRO_ROLE_ID)) {
      await member.roles.add(role).catch(() => {});
    }
  }
}

async function handleOfflineJoins(guild, client) {
  const welcomed = await loadWelcomed();
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;

  // Prima volta: nessun membro welcomato → seed di tutti
  if (welcomed.size === 0) {
    await seedWelcomed(members.map(m => m.id));
    return;
  }

  const offline = members
    .filter(m => !m.user.bot && !welcomed.has(m.id))
    .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);

  const baseCount = guild.memberCount - offline.size;
  let i = 0;
  for (const member of offline.values()) {
    await sendWelcome(member, client, baseCount + i + 1);
    i++;
  }
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`✅ Bot online: ${client.user.tag}`);
    await loadActiveLeaderboardsFromFile();

    for (const guild of client.guilds.cache.values()) {
      await updateMemberCounter(guild);
      await assignMissingRoles(guild);
      await handleOfflineJoins(guild, client);

      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased()) continue;
        for (const member of channel.members.values()) {
          if (!member.user.bot) voiceSessions.set(member.id, Date.now());
        }
      }

      const members = await guild.members.fetch().catch(() => null);
      if (members) {
        for (const member of members.values()) {
          if (!member.user.bot && member.joinedTimestamp) {
            await setFirstJoined(member.id, member.joinedTimestamp);
          }
        }
      }
    }

    // ── Migrazione vecchi messaggi level-up → embed ─────────────────
    for (const guild of client.guilds.cache.values()) {
      const lvlChannel = guild.channels.cache.get(LEVELUP_CHANNEL_ID);
      if (!lvlChannel) continue;
      try {
        let lastId;
        while (true) {
          const options = { limit: 100 };
          if (lastId) options.before = lastId;
          const fetched = await lvlChannel.messages.fetch(options).catch(() => null);
          if (!fetched || fetched.size === 0) break;
          for (const msg of fetched.values()) {
            if (msg.author.id !== client.user.id) continue;
            let userId, level;
            const desc = msg.embeds[0]?.description ?? '';
            const content = msg.content ?? '';
            const matchText = content.match(/🎉 <@!?(\d+)> [Hh]a[i]? raggiunto il \*\*Livello (\d+)\*\*!?/);
            if (matchText) { userId = matchText[1]; level = matchText[2]; }
            if (!userId) {
              const matchDesc = desc.match(/🎉 <@!?(\d+)> [Hh]a[i]? raggiunto il \*\*Livello (\d+)\*\*!?/);
              if (matchDesc) { userId = matchDesc[1]; level = matchDesc[2]; }
            }
            if (!userId) {
              const matchContent = content.match(/^<@!?(\d+)>$/);
              const matchDescLow = desc.match(/🎉 [Hh]a raggiunto il \*\*Livello (\d+)\*\*!?/);
              if (matchContent && matchDescLow) { userId = matchContent[1]; level = matchDescLow[1]; }
            }
            if (!userId || !level) continue;
            if (content === `<@${userId}>` && desc === `🎉 Ha raggiunto il **Livello ${level}**!`) continue;
            const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`🎉 Ha raggiunto il **Livello ${level}**!`);
            await msg.edit({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
          }
          if (fetched.size < 100) break;
          lastId = fetched.last().id;
        }
      } catch {}
    }

    setInterval(async () => {
      for (const guild of client.guilds.cache.values()) await assignMissingRoles(guild);
    }, AUTO_ROLE_INTERVAL_MS);

    await checkNewVideo(client);
    setInterval(() => checkNewVideo(client), YOUTUBE_CHECK_INTERVAL_MS);

    await checkLive(client);
    setInterval(() => checkLive(client), TWITCH_CHECK_INTERVAL_MS);

    // ── Giveaway check ──────────────────────────────────────────────
    setInterval(async () => {
      const giveaways = await loadGiveaways();
      for (const giveaway of Object.values(giveaways)) {
        if (!giveaway.ended && Date.now() >= giveaway.endsAt) {
          await endGiveaway(giveaway, client);
        }
      }
    }, 15_000);

    // ── Leaderboard auto-update ─────────────────────────────────────
    setInterval(async () => {
      for (const [messageId, state] of activeLeaderboards) {
        const guild = client.guilds.cache.get(state.guildId);
        if (!guild) { activeLeaderboards.delete(messageId); await saveActiveLeaderboards(); continue; }
        const channel = guild.channels.cache.get(state.channelId);
        if (!channel) { activeLeaderboards.delete(messageId); await saveActiveLeaderboards(); continue; }
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (!msg) { activeLeaderboards.delete(messageId); await saveActiveLeaderboards(); continue; }
        const { embed } = await buildPagedLeaderboardEmbed(guild, 0);
        await msg.edit({ embeds: [embed], components: [buildPublicButton()] }).catch(() => {});
      }
    }, 60_000);

    // ── Ticket inactivity check ─────────────────────────────────────
    setInterval(async () => {
      const tickets = await loadTickets();
      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;
      for (const [channelId, ticket] of Object.entries(tickets)) {
        if (ticket.closed) continue;
        const idle = now - ticket.lastMessage;
        if (idle >= 2 * DAY) {
          const channel = client.channels.cache.get(channelId);
          if (channel) await closeTicket(channel, client.user, client);
        } else if (idle >= DAY && !ticket.warningSent) {
          const channel = client.channels.cache.get(channelId);
          if (channel) {
            await channel.send(`⚠️ <@${ticket.creatorId}> Non c'è stata attività in questo ticket da 24 ore. Verrà chiuso automaticamente tra 24 ore se non vengono inviati messaggi.`);
            ticket.warningSent = true;
            await saveTickets(tickets);
          }
        }
      }
    }, 60 * 60 * 1000);

    // ── Lvl message auto-update ─────────────────────────────────────
    setInterval(async () => {
      const messages = getAll();
      const now = Date.now();
      for (const [messageId, { channelId, targetId, expiresAt }] of messages) {
        if (now > expiresAt) { messages.delete(messageId); continue; }
        const channel = client.channels.cache.get(channelId);
        if (!channel) continue;
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (!msg) { messages.delete(messageId); continue; }
        const member = await channel.guild.members.fetch(targetId).catch(() => null);
        if (!member) continue;
        const userData = await getUser(targetId);
        await msg.edit({ embeds: [buildLvlEmbed(member, userData)] }).catch(() => {});
      }
    }, 30_000);

    // ── Voice XP ────────────────────────────────────────────────────
    setInterval(async () => {
      for (const [userId] of voiceSessions) {
        const { leveledUp, newLevel } = await addXP(userId, 10);
        await addVoiceMinute(userId);
        if (leveledUp) {
          for (const guild of client.guilds.cache.values()) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;
            if (newLevel === 50) {
              const vipRole = guild.roles.cache.get(VIP_ROLE_ID);
              if (vipRole) await member.roles.add(vipRole).catch(() => {});
            }
            const lvlChannel = guild.channels.cache.get(LEVELUP_CHANNEL_ID);
            if (lvlChannel) {
              const lvlEmbed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`🎉 Ha raggiunto il **Livello ${newLevel}**!`);
              await lvlChannel.send({ content: `${member}`, embeds: [lvlEmbed] });
            }
          }
        }
      }
    }, 60_000);

    // Controlla infolvl ogni 6 ore (non subito all'avvio)
    setInterval(() => checkAndSend(client), 6 * 60 * 60 * 1000);
  },
};
