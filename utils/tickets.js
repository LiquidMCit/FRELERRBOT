const {
  ChannelType, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
} = require('discord.js');
const { supabase } = require('./supabase');
const { TICKET_CATEGORY_ID, TICKET_LOGS_CHANNEL_ID, STAFF_ROLE_ID } = require('../config');

const SC = {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'Q','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ'};
function toSmallCaps(str) { return str.toLowerCase().split('').map(c => SC[c] || c).join(''); }

const CATEGORIES = {
  account: { label: 'Account', emoji: '👤', description: 'Problemi con il tuo account' },
  player:  { label: 'Segnala un Player', emoji: '📢', description: 'Segnala un utente del server' },
  bug:     { label: 'Segnala un Bug', emoji: '🐛', description: 'Hai trovato un bug?' },
  collab:  { label: 'Collaborazione', emoji: '🤝', description: 'Proposte di collaborazione' },
};

async function loadTickets() {
  const { data } = await supabase.from('tickets').select('*');
  if (!data) return {};
  const result = {};
  for (const row of data) {
    result[row.channel_id] = {
      creatorId: row.creator_id, category: row.category, formData: row.form_data ?? {},
      staffId: row.staff_id, taken: row.taken, closed: row.closed,
      lastMessage: row.last_message, warningSent: row.warning_sent, guildId: row.guild_id,
    };
  }
  return result;
}

async function saveTickets(data) {
  for (const [channelId, t] of Object.entries(data)) {
    await supabase.from('tickets').upsert({
      channel_id: channelId, creator_id: t.creatorId, category: t.category,
      form_data: t.formData ?? {}, staff_id: t.staffId, taken: t.taken, closed: t.closed,
      last_message: t.lastMessage, warning_sent: t.warningSent, guild_id: t.guildId,
    }, { onConflict: 'channel_id' });
  }
}

async function loadTranscripts() {
  const { data } = await supabase.from('ticket_transcripts').select('*');
  if (!data) return {};
  const result = {};
  for (const row of data) {
    result[row.channel_id] = { lines: row.lines ?? [], category: row.category, creatorId: row.creator_id, closedAt: row.closed_at };
  }
  return result;
}

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🎟️ Apri un Ticket')
    .setDescription(
      'Seleziona il motivo dal menu qui sotto.\n\n' +
      'Ti verrà mostrato un modulo da compilare e verrà creato un canale privato dove lo staff ti assisterà.\n\n' +
      '*Non aprire ticket inutili. Leggi le regole prima di procedere.*'
    )
    .setFooter({ text: 'FrelerrBOT • Supporto' });
}

function buildPanelMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_select')
    .setPlaceholder('Scegli un motivo per aprire un ticket!')
    .addOptions(Object.entries(CATEGORIES).map(([value, { label, emoji, description }]) => ({ label, value, description, emoji })));
  return new ActionRowBuilder().addComponents(menu);
}

function buildStaffButtons(taken = false, takerId = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_take')
      .setLabel(taken ? `Preso da ${takerId ?? ''}` : 'Prendi')
      .setStyle(taken ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(taken),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('𝗖𝗛𝗜𝗨𝗗𝗜').setStyle(ButtonStyle.Danger),
  );
}

function buildSummaryEmbed(category, formData, creator) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const cat = CATEGORIES[category];
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setAuthor({ name: creator.displayName, iconURL: creator.user.displayAvatarURL({ size: 256 }) })
    .setTitle(`${cat.emoji} Ticket — ${cat.label}`)
    .addFields(Object.entries(formData).map(([name, value]) => ({ name, value: value || '—', inline: false })))
    .setFooter({ text: `FrelerrBOT • ${time}` });
}

async function createTicketChannel(guild, creator, category, formData) {
  const tickets = await loadTickets();

  for (const [channelId, t] of Object.entries(tickets)) {
    if (t.creatorId === creator.id && !t.closed && !guild.channels.cache.get(channelId)) {
      await supabase.from('tickets').update({ closed: true }).eq('channel_id', channelId);
    }
  }

  const fresh = await loadTickets();
  const existing = Object.values(fresh).find(t => t.creatorId === creator.id && !t.closed);
  if (existing) return null;

  const cat = CATEGORIES[category];
  const channelName = `${cat.emoji}│${toSmallCaps(creator.user.username)}-${toSmallCaps(cat.label)}`;

  const channel = await guild.channels.create({
    name: channelName, type: ChannelType.GuildText, parent: TICKET_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: creator.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  await channel.send({ embeds: [buildSummaryEmbed(category, formData, creator)], components: [buildStaffButtons(false)] });

  await supabase.from('tickets').insert({
    channel_id: channel.id, creator_id: creator.id, category, form_data: formData,
    staff_id: null, taken: false, closed: false, last_message: Date.now(),
    warning_sent: false, guild_id: guild.id,
  });

  return channel;
}

async function closeTicket(channel, closedBy, client) {
  const { data: ticketRow } = await supabase.from('tickets').select('*').eq('channel_id', channel.id).single();
  if (!ticketRow) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const lines = messages
    ? [...messages.values()].reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleTimeString('it-IT')}] ${m.author.username}: ${m.content || '[embed]'}`)
    : [];

  await supabase.from('ticket_transcripts').upsert({
    channel_id: channel.id, lines, category: ticketRow.category,
    creator_id: ticketRow.creator_id, closed_at: Date.now(),
  }, { onConflict: 'channel_id' });

  const logsChannel = client.channels.cache.get(TICKET_LOGS_CHANNEL_ID);
  if (logsChannel) {
    const cat = CATEGORIES[ticketRow.category];
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const logEmbed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(`🔒 Ticket chiuso — ${cat.label}`)
      .addFields(
        { name: 'Creatore', value: `<@${ticketRow.creator_id}>`, inline: true },
        { name: 'Chiuso da', value: `<@${closedBy.id}>`, inline: true },
        { name: 'Messaggi', value: `${lines.length}`, inline: true },
      )
      .setFooter({ text: `FrelerrBOT • ${time}` });
    const transcriptBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_transcript_${channel.id}`).setLabel('Visualizza Cronologia').setStyle(ButtonStyle.Secondary),
    );
    await logsChannel.send({ embeds: [logEmbed], components: [transcriptBtn] });
  }

  await supabase.from('tickets').update({ closed: true }).eq('channel_id', channel.id);

  const creator = await client.users.fetch(ticketRow.creator_id).catch(() => null);
  if (creator) {
    await creator.send(
      `🔒 Il tuo ticket **${CATEGORIES[ticketRow.category].label}** è stato chiuso dallo staff.\n` +
      `Se hai ancora bisogno di aiuto, apri un nuovo ticket nel server.`
    ).catch(() => {});
  }

  await channel.delete().catch(() => {});
}

module.exports = { loadTickets, saveTickets, loadTranscripts, buildPanelEmbed, buildPanelMenu, buildStaffButtons, createTicketChannel, closeTicket, CATEGORIES, toSmallCaps };
