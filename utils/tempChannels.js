const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { supabase } = require('./supabase');
const { TEMP_VOICE_CATEGORY_ID } = require('../config');

async function load() {
  const { data } = await supabase.from('temp_channels').select('*');
  if (!data) return {};
  const result = {};
  for (const row of data) {
    result[row.channel_id] = { ownerId: row.owner_id, name: row.name, maxPlayers: row.max_players, guildId: row.guild_id };
  }
  return result;
}

async function getUserChannel(userId) {
  const { data } = await supabase.from('temp_channels').select('*').eq('owner_id', userId).single();
  if (!data) return null;
  return [data.channel_id, { ownerId: data.owner_id, name: data.name, maxPlayers: data.max_players, guildId: data.guild_id }];
}

function buildPanelEmbed() {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🔒 Vocali Temporanee')
    .setDescription(
      'Crea la tua stanza vocale temporanea privata!\n\n' +
      '✉️ **Invito Personalizzabile** — Puoi invitare chi vuoi nella Vocale\n\n' +
      'Puoi modificarla quando vuoi **scrivendo in DM al bot**, ma ricorda: *verrà eliminata automaticamente quando è vuota.*'
    )
    .setFooter({ text: `FrelerrBOT • ${time}` });
}

function buildPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('temp_create_private').setLabel('Crea Stanza').setEmoji('➕').setStyle(ButtonStyle.Secondary),
  );
}

function buildManageEmbed(member, channelData) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle('⚙️ Gestisci la tua Stanza').setFooter({ text: `FrelerrBOT • ${time}` });
  if (channelData) {
    embed.setDescription(
      `Stai gestendo la tua stanza **${channelData.name}**.\n\n` +
      `🔒 **Privata** · 👥 Max **${channelData.maxPlayers === 0 ? '∞' : channelData.maxPlayers}** giocatori\n\n` +
      `Usa i pulsanti qui sotto per modificare le impostazioni o invitare un membro.`
    );
  } else {
    embed.setDescription('Non hai nessuna stanza temporanea attiva.\nCrea una stanza con il pannello dedicato.');
  }
  return embed;
}

function buildManageButton(hasChannel) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('temp_edit').setLabel('Modifica').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!hasChannel),
    new ButtonBuilder().setCustomId('temp_invite').setLabel('Invita').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(!hasChannel),
  );
}

async function createTempChannel(guild, owner, name, maxPlayers) {
  const existing = await getUserChannel(owner.id);
  if (existing) {
    const [existingId] = existing;
    if (!guild.channels.cache.get(existingId)) {
      await supabase.from('temp_channels').delete().eq('channel_id', existingId);
    } else {
      return { error: 'Hai già una stanza attiva.' };
    }
  }

  const channel = await guild.channels.create({
    name, type: ChannelType.GuildVoice, parent: TEMP_VOICE_CATEGORY_ID, userLimit: maxPlayers,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      { id: owner.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers] },
    ],
  });

  await supabase.from('temp_channels').insert({ channel_id: channel.id, owner_id: owner.id, name, max_players: maxPlayers, guild_id: guild.id });
  return { channel };
}

async function editTempChannel(channelId, name, maxPlayers, guild) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  await channel.setName(name);
  await channel.setUserLimit(maxPlayers);
  await supabase.from('temp_channels').update({ name, max_players: maxPlayers }).eq('channel_id', channelId);
}

async function deleteTempChannel(channelId) {
  await supabase.from('temp_channels').delete().eq('channel_id', channelId);
}

module.exports = { load, getUserChannel, buildPanelEmbed, buildPanelButtons, buildManageEmbed, buildManageButton, createTempChannel, editTempChannel, deleteTempChannel };
