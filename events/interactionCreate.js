const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildPagedLeaderboardEmbed, buildPrivateButtons, activeLeaderboards } = require('../utils/leaderboard');
const { createTempChannel, editTempChannel, getUserChannel, buildManageEmbed, buildManageButton } = require('../utils/tempChannels');
const { VIP_ROLE_ID } = require('../config');
const { loadGiveaways, saveGiveaway, buildEmbed, buildButtons } = require('../utils/giveaway');
const { loadTickets, saveTickets, loadTranscripts, buildStaffButtons, createTicketChannel, closeTicket, CATEGORIES } = require('../utils/tickets');
const { STAFF_ROLE_ID, TICKET_CATEGORY_ID, BAN_ROLE_ID, UNBAN_REQUESTS_CHANNEL_ID, UNBAN_TICKET_CATEGORY_ID } = require('../config');
const { getUnbanRequest, saveUnbanRequest, closeUnbanRequest, setUnbanTicketChannel, getBanInfo } = require('../utils/moderation');

function buildUnbanEmbed(member, user, fields, time, banInfo) {
  const { motivo, merito, cambiamento, durata, aggiunta } = fields;
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setAuthor({ name: member.displayName, iconURL: user.displayAvatarURL({ size: 256 }) })
    .setTitle('🔓 Richiesta Unban')
    .addFields(
      { name: '​', value: `__Perché sei stato bannato?__\n${motivo}` },
      { name: '​', value: `__Perché meriti l\'unban?__\n${merito}` },
      { name: '​', value: `__Cosa cambieresti del tuo comportamento?__\n${cambiamento}` },
      { name: '​', value: `__Da quanto sei bannato?__\n${durata}` },
      ...(aggiunta ? [{ name: '​', value: `__Aggiunta__\n${aggiunta}` }] : []),
    )
    .setFooter({ text: `FrelerrBOT • ${time}` });

  if (banInfo) {
    embed.addFields({
      name: '​',
      value: `__Motivo del ban__\n${banInfo.reason ?? 'Non specificato'} — bannato da <@${banInfo.bannedBy}>`,
    });
  }
  return embed;
}
const SC = {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'Q','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ'};
function toSC(str) { return str.toLowerCase().split('').map(c => SC[c] || c).join(''); }

function isStaff(member) {
  return member.roles.cache.has(STAFF_ROLE_ID) || member.permissions.has(PermissionFlagsBits.Administrator);
}

async function searchMember(guild, query) {
  const q = query.toLowerCase();
  // Usa l'API Discord per cercare per nome/nickname
  const results = await guild.members.search({ query, limit: 10 }).catch(() => null);
  if (results && results.size > 0) {
    // Preferisce la corrispondenza esatta
    const exact = results.find(m =>
      m.user.username.toLowerCase() === q ||
      m.displayName.toLowerCase() === q ||
      (m.user.globalName?.toLowerCase() ?? '') === q
    );
    return exact ?? results.first();
  }
  return null;
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {

    // ── Slash commands ──────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, client);
      return;
    }

    // ── Ticket: dropdown categoria ──────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
      const category = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${category}`)
        .setTitle(CATEGORIES[category].label);

      const fields = {
        account: [
          { id: 'problema', label: 'Descrivi il problema', style: TextInputStyle.Paragraph },
          { id: 'da_quando', label: 'Da quando si verifica?', style: TextInputStyle.Short },
        ],
        player: [
          { id: 'username', label: 'Username del player', style: TextInputStyle.Short },
          { id: 'motivo', label: 'Motivo della segnalazione', style: TextInputStyle.Paragraph },
          { id: 'prove', label: 'Prove (link o descrizione)', style: TextInputStyle.Paragraph, required: false },
        ],
        bug: [
          { id: 'descrizione', label: 'Descrivi il bug', style: TextInputStyle.Paragraph },
          { id: 'riproduci', label: 'Come si riproduce?', style: TextInputStyle.Paragraph },
        ],
        collab: [
          { id: 'tipo', label: 'Tipo di collaborazione', style: TextInputStyle.Short },
          { id: 'descrizione', label: 'Descriviti brevemente', style: TextInputStyle.Paragraph },
        ],
        live: [
          { id: 'tipo', label: 'Segnalazione o domanda?', style: TextInputStyle.Short },
          { id: 'descrizione', label: 'Descrivi', style: TextInputStyle.Paragraph },
          { id: 'username', label: 'Username del segnalato (se segnalazione)', style: TextInputStyle.Short, required: false },
        ],
      };

      modal.addComponents(
        ...fields[category].map(f =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(f.id)
              .setLabel(f.label)
              .setStyle(f.style)
              .setRequired(f.required !== false)
          )
        )
      );

      await interaction.showModal(modal);
      return;
    }

    // ── Ticket: invio modulo ────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('temp_modal_')) {
      const subtype = interaction.customId.replace('temp_modal_', '');
      const nome = interaction.fields.getTextInputValue('nome').trim();
      const maxRaw = parseInt(interaction.fields.getTextInputValue('max')) || 0;

      await interaction.deferReply({ flags: 64 });

      if (subtype === 'edit') {
        const entry = await getUserChannel(interaction.user.id);
        if (!entry) return interaction.editReply({ content: '❌ Stanza non trovata.' });
        const [channelId, channelData] = entry;
        const guild = interaction.guild ?? client.guilds.cache.get(channelData.guildId);
        if (!guild) return interaction.editReply({ content: '❌ Server non trovato.' });
        await editTempChannel(channelId, nome, maxRaw, guild);
        const newEntry = await getUserChannel(interaction.user.id);
        if (interaction.guild) {
          return interaction.editReply({
            embeds: [buildManageEmbed(interaction.member, newEntry ? newEntry[1] : null)],
            components: [buildManageButton(!!newEntry)],
          });
        } else {
          return interaction.editReply({ content: `✅ Stanza aggiornata: **${nome}** · Max ${maxRaw === 0 ? '∞' : maxRaw} giocatori.` });
        }
      }

      const nomeInvitato = interaction.fields.getTextInputValue('invitato').trim().toLowerCase();

      const { channel, error } = await createTempChannel(interaction.guild, interaction.member, nome, maxRaw);
      if (error) return interaction.editReply({ content: `❌ ${error}` });

      if (nomeInvitato) {
        const invitato = await searchMember(interaction.guild, nomeInvitato);
        if (invitato) {
          await channel.permissionOverwrites.create(invitato.id, { ViewChannel: true, Connect: true });
          await interaction.editReply({ content: `✅ Stanza **${nome}** creata: ${channel}\n➕ **${invitato.displayName}** può già accedervi.` });
        } else {
          await interaction.editReply({ content: `✅ Stanza **${nome}** creata: ${channel}\n⚠️ Nessun membro trovato con quel nome, aggiungilo dopo con il tasto Invita.` });
        }
      } else {
        await interaction.editReply({ content: `✅ Stanza **${nome}** creata: ${channel}` });
      }

      // DM al proprietario con i controlli
      try {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const dmEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🔒 La tua stanza è pronta!')
          .setDescription(
            `**${nome}** è ora attiva nel server.\n\n` +
            `Usa i pulsanti qui sotto per modificarla o per invitare qualcuno.`
          )
          .setFooter({ text: `FrelerrBOT • ${time}` });
        const dmButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('temp_dm_edit').setLabel('Modifica').setEmoji('✏️').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('temp_dm_invite').setLabel('Invita').setEmoji('➕').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('temp_dm_delete').setLabel('Elimina').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        );
        await interaction.user.send({ embeds: [dmEmbed], components: [dmButtons] });
      } catch {}
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'temp_invite_modal') {
      const nomeRicerca = interaction.fields.getTextInputValue('user_id').trim().toLowerCase();
      await interaction.deferReply({ flags: 64 });

      const entry = await getUserChannel(interaction.user.id);
      if (!entry) return interaction.editReply({ content: '❌ Stanza non trovata.' });

      const [channelId, channelData] = entry;
      const targetGuild = interaction.guild ?? client.guilds.cache.get(channelData.guildId);
      if (!targetGuild) return interaction.editReply({ content: '❌ Server non trovato.' });

      const channel = targetGuild.channels.cache.get(channelId);
      if (!channel) return interaction.editReply({ content: '❌ Canale non trovato.' });

      const member = await searchMember(targetGuild, nomeRicerca);

      if (!member) return interaction.editReply({ content: '❌ Nessun membro trovato con quel nome.' });

      await channel.permissionOverwrites.create(member.id, { ViewChannel: true, Connect: true });
      return interaction.editReply({ content: `✅ **${member.displayName}** può ora vedere e accedere alla tua stanza.` });
    }

    // ── Unban: invio modulo ────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId === 'unban_modal') {
      await interaction.deferReply({ flags: 64 });

      const existingReq = await getUnbanRequest(interaction.user.id);
      if (existingReq && !existingReq.closed)
        return interaction.editReply({ content: '❌ Hai già una richiesta in attesa.' });

      const motivo = interaction.fields.getTextInputValue('motivo');
      const merito = interaction.fields.getTextInputValue('merito');
      const cambiamento = interaction.fields.getTextInputValue('cambiamento');
      const durata = interaction.fields.getTextInputValue('durata');
      const aggiunta = interaction.fields.getTextInputValue('aggiunta') || null;

      const staffChannel = interaction.guild.channels.cache.get(UNBAN_REQUESTS_CHANNEL_ID);
      if (!staffChannel) return interaction.editReply({ content: '❌ Canale staff non trovato.' });

      const now = new Date();
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const banInfo = await getBanInfo(interaction.user.id);
      const embed = buildUnbanEmbed(
        interaction.member, interaction.user,
        { motivo, merito, cambiamento, durata, aggiunta },
        time, banInfo
      );

      const staffButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`unban_accept_${interaction.user.id}`).setLabel('Accetta').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`unban_reject_${interaction.user.id}`).setLabel('Rifiuta').setEmoji('❌').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`unban_ticket_${interaction.user.id}`).setLabel('Apri Ticket').setEmoji('🎟️').setStyle(ButtonStyle.Secondary),
      );

      const msg = await staffChannel.send({ embeds: [embed], components: [staffButtons] });

      await saveUnbanRequest(interaction.user.id, { messageId: msg.id, closed: false, guildId: interaction.guild.id });

      return interaction.editReply({ content: '✅ Richiesta inviata. Lo staff la valuterà al più presto.' });
    }

    // ── Modulo unban da staff (/modulo-unban) ──────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('unban_modulo_modal_')) {
      await interaction.deferReply({ flags: 64 });
      const targetId = interaction.customId.replace('unban_modulo_modal_', '');
      const target = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!target) return interaction.editReply({ content: '❌ Utente non trovato.' });

      const motivo = interaction.fields.getTextInputValue('motivo');
      const merito = interaction.fields.getTextInputValue('merito');
      const cambiamento = interaction.fields.getTextInputValue('cambiamento');
      const durata = interaction.fields.getTextInputValue('durata');
      const aggiunta = interaction.fields.getTextInputValue('aggiunta') || null;

      const staffChannel = interaction.guild.channels.cache.get(UNBAN_REQUESTS_CHANNEL_ID);
      if (!staffChannel) return interaction.editReply({ content: '❌ Canale staff non trovato.' });

      const now = new Date();
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const banInfo = await getBanInfo(targetId);
      const embed = buildUnbanEmbed(
        target, target.user,
        { motivo, merito, cambiamento, durata, aggiunta },
        time, banInfo
      );
      embed.setDescription(`*Modulo compilato da ${interaction.member} per conto di ${target}*`);

      const staffButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`unban_accept_${targetId}`).setLabel('Accetta').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`unban_reject_${targetId}`).setLabel('Rifiuta').setEmoji('❌').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`unban_ticket_${targetId}`).setLabel('Apri Ticket').setEmoji('🎟️').setStyle(ButtonStyle.Secondary),
      );

      const msg = await staffChannel.send({ embeds: [embed], components: [staffButtons] });

      await saveUnbanRequest(targetId, { messageId: msg.id, closed: false, guildId: interaction.guild.id });

      return interaction.editReply({ content: `✅ Modulo inviato per **${target.displayName}**.` });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
      const category = interaction.customId.replace('ticket_modal_', '');
      const fields = interaction.fields.fields;
      const formData = {};
      for (const [, field] of fields) {
        formData[field.customId] = field.value;
      }

      await interaction.deferReply({ flags: 64 });

      const tickets = await loadTickets();
      const existing = Object.values(tickets).find(t => t.creatorId === interaction.user.id && !t.closed);
      if (existing) {
        return interaction.editReply({ content: '❌ Hai già un ticket aperto. Chiudilo prima di aprirne un altro.' });
      }

      const channel = await createTicketChannel(interaction.guild, interaction.member, category, formData);
      if (!channel) return interaction.editReply({ content: '❌ Errore nella creazione del ticket.' });

      await interaction.editReply({ content: `✅ Ticket creato: ${channel}` });
      return;
    }

    // ── Giveaway buttons ────────────────────────────────────────────
    if (interaction.isButton()) {

      // Apre la classifica privata efimera
      if (interaction.customId === 'lb_open') {
        const { embed, totalPages, currentPage } = await buildPagedLeaderboardEmbed(interaction.guild, 0, interaction.user.id);
        const buttons = buildPrivateButtons(currentPage, totalPages);
        await interaction.reply({ flags: 64, embeds: [embed], components: [buttons] });
        return;
      }

      // Naviga dentro la classifica privata efimera
      if (interaction.customId.startsWith('lb_priv_')) {
        const page = parseInt(interaction.customId.replace('lb_priv_', ''));
        if (isNaN(page) || page < 0) return;
        const { embed, totalPages, currentPage } = await buildPagedLeaderboardEmbed(interaction.guild, page, interaction.user.id);
        const buttons = buildPrivateButtons(currentPage, totalPages);
        await interaction.update({ embeds: [embed], components: [buttons] });
        return;
      }

      if (interaction.customId === 'giveaway_join') {
        const giveaways = await loadGiveaways();
        const giveaway = giveaways[interaction.message.id];
        if (!giveaway) return interaction.reply({ content: '❌ Giveaway non trovato.', flags: 64 });
        if (giveaway.ended) return interaction.reply({ content: '⏰ Questo giveaway è già terminato.', flags: 64 });

        const idx = giveaway.participants.indexOf(interaction.user.id);
        if (idx === -1) {
          giveaway.participants.push(interaction.user.id);
          await interaction.reply({ content: '✅ Sei entrato nel giveaway!', flags: 64 });
        } else {
          giveaway.participants.splice(idx, 1);
          await interaction.reply({ content: '↩️ Hai abbandonato il giveaway.', flags: 64 });
        }

        await saveGiveaway(giveaways[interaction.message.id]);
        const host = await interaction.guild.members.fetch(giveaway.hostId).catch(() => null);
        if (host) {
          await interaction.message.edit({
            embeds: [buildEmbed(giveaway, host)],
            components: [buildButtons(giveaway.participants.length)],
          });
        }
        return;
      }

      if (interaction.customId === 'giveaway_participants') {
        const giveaways = await loadGiveaways();
        const giveaway = giveaways[interaction.message.id];
        if (!giveaway) return interaction.reply({ content: '❌ Giveaway non trovato.', flags: 64 });

        if (giveaway.participants.length === 0)
          return interaction.reply({ content: '👥 Nessun partecipante al momento.', flags: 64 });

        const { EmbedBuilder } = require('discord.js');
        const embeds = [];
        for (let i = 0; i < Math.min(giveaway.participants.length, 10); i++) {
          const member = await interaction.guild.members.fetch(giveaway.participants[i]).catch(() => null);
          if (!member) continue;
          embeds.push(
            new EmbedBuilder()
              .setColor(0x2b2d31)
              .setAuthor({
                name: `${i + 1}. ${member.displayName}`,
                iconURL: member.user.displayAvatarURL({ size: 256, extension: 'png' }),
              })
          );
        }

        const extra = giveaway.participants.length > 10
          ? `\n*...e altri ${giveaway.participants.length - 10} partecipanti*` : '';

        await interaction.reply({
          content: `👥 **Partecipanti (${giveaway.participants.length})**${extra}`,
          embeds,
          flags: 64,
        });
        return;
      }

      // ── Unban: apri modal ─────────────────────────────────────────
      if (interaction.customId === 'unban_request') {
        if (!interaction.member.roles.cache.has(BAN_ROLE_ID))
          return interaction.reply({ content: '❌ Non hai il ruolo ban.', flags: 64 });

        const existing = await getUnbanRequest(interaction.user.id);
        if (existing && !existing.closed)
          return interaction.reply({ content: '❌ Hai già una richiesta di unban in attesa. Aspetta che lo staff la valuti.', flags: 64 });

        const modal = new ModalBuilder()
          .setCustomId('unban_modal')
          .setTitle('🔓 Richiesta Unban')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('motivo').setLabel('Perché sei stato bannato?').setStyle(TextInputStyle.Paragraph).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('merito').setLabel('Perché meriti l\'unban?').setStyle(TextInputStyle.Paragraph).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('cambiamento').setLabel('Cosa cambieresti del tuo comportamento?').setStyle(TextInputStyle.Paragraph).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('durata').setLabel('Da quanto sei bannato?').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('aggiunta').setLabel('Vuoi aggiungere altro?').setStyle(TextInputStyle.Paragraph).setRequired(false)
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      // ── Unban: accetta ────────────────────────────────────────────
      if (interaction.customId.startsWith('unban_accept_')) {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: '❌ Solo lo staff può farlo.', flags: 64 });

        const targetId = interaction.customId.replace('unban_accept_', '');
        const target = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (target) await target.roles.remove(BAN_ROLE_ID).catch(() => {});

        const entry = await getUnbanRequest(targetId) ?? {};
        entry.closed = true;
        await closeUnbanRequest(targetId);

        const now = new Date();
        const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const updated = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x2ecc71)
          .setFooter({ text: `✅ Accettato da ${interaction.member.displayName} • ${time}` });
        await interaction.update({ embeds: [updated], components: [] });

        // Sincronizza la lista richieste se siamo nel ticket
        if (entry.messageId && interaction.channel.id === entry.ticketChannelId) {
          const listCh = interaction.guild.channels.cache.get(UNBAN_REQUESTS_CHANNEL_ID);
          const listMsg = await listCh?.messages.fetch(entry.messageId).catch(() => null);
          if (listMsg) await listMsg.edit({ embeds: [updated], components: [] }).catch(() => {});
        }

        // DM al bannato
        try {
          const dmUser = await client.users.fetch(targetId).catch(() => null);
          if (dmUser) await dmUser.send({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🔓 Richiesta Unban').setDescription(`✅ La tua richiesta di unban è stata **accettata** da **${interaction.member.displayName}**.\nSei stato sbannato.`).setFooter({ text: `FrelerrBOT • ${time}` })] });
        } catch {}

        // Elimina solo il ticket channel (via ID salvato, non parentId)
        if (entry.ticketChannelId) {
          const ticketCh = interaction.guild.channels.cache.get(entry.ticketChannelId);
          if (ticketCh && ticketCh.id !== interaction.channel.id)
            setTimeout(() => ticketCh.delete().catch(() => {}), 3000);
          else if (ticketCh)
            setTimeout(() => ticketCh.delete().catch(() => {}), 3000);
        }
        return;
      }

      // ── Unban: rifiuta ────────────────────────────────────────────
      if (interaction.customId.startsWith('unban_reject_')) {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: '❌ Solo lo staff può farlo.', flags: 64 });

        const targetId = interaction.customId.replace('unban_reject_', '');
        const entry = await getUnbanRequest(targetId) ?? {};
        entry.closed = true;
        await closeUnbanRequest(targetId);

        const now = new Date();
        const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const updated = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x95a5a6)
          .setFooter({ text: `❌ Rifiutato da ${interaction.member.displayName} • ${time}` });
        await interaction.update({ embeds: [updated], components: [] });

        // Sincronizza la lista richieste se siamo nel ticket
        if (entry.messageId && interaction.channel.id === entry.ticketChannelId) {
          const listCh = interaction.guild.channels.cache.get(UNBAN_REQUESTS_CHANNEL_ID);
          const listMsg = await listCh?.messages.fetch(entry.messageId).catch(() => null);
          if (listMsg) await listMsg.edit({ embeds: [updated], components: [] }).catch(() => {});
        }

        // DM al bannato
        try {
          const dmUser = await client.users.fetch(targetId).catch(() => null);
          if (dmUser) await dmUser.send({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🔓 Richiesta Unban').setDescription(`❌ La tua richiesta di unban è stata **rifiutata** da **${interaction.member.displayName}**.\nPuoi riprovare in futuro.`).setFooter({ text: `FrelerrBOT • ${time}` })] });
        } catch {}

        // Elimina solo il ticket channel (via ID salvato, non parentId)
        if (entry.ticketChannelId) {
          const ticketCh = interaction.guild.channels.cache.get(entry.ticketChannelId);
          if (ticketCh) setTimeout(() => ticketCh.delete().catch(() => {}), 3000);
        }
        return;
      }

      // ── Unban: chiudi ticket ──────────────────────────────────────
      if (interaction.customId.startsWith('unban_chiudi_')) {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: '❌ Solo lo staff può farlo.', flags: 64 });
        await interaction.reply('🔒 Ticket chiuso.');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        return;
      }

      // ── Unban: apri ticket ────────────────────────────────────────
      if (interaction.customId.startsWith('unban_ticket_')) {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: '❌ Solo lo staff può farlo.', flags: 64 });

        const targetId = interaction.customId.replace('unban_ticket_', '');
        const target = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!target) return interaction.reply({ content: '❌ Utente non trovato.', flags: 64 });

        const channelName = `${toSC(target.user.username)}-ᴜɴʙᴀɴ`;
        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: 0,
          parent: UNBAN_TICKET_CATEGORY_ID,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: target.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ],
        });

        const now = new Date();
        const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: target.displayName, iconURL: target.user.displayAvatarURL({ size: 256 }) })
          .setTitle('🔓 Ticket Unban')
          .setDescription(`${target} — Ticket aperto da ${interaction.member} per discutere la richiesta di unban.`)
          .setFooter({ text: `FrelerrBOT • ${time}` });

        const ticketButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`unban_accept_${targetId}`).setLabel('Accetta').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`unban_reject_${targetId}`).setLabel('Rifiuta').setEmoji('❌').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`unban_chiudi_${targetId}`).setLabel('𝗖𝗛𝗜𝗨𝗗𝗜').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
        );
        await ticketChannel.send({ embeds: [embed], components: [ticketButtons] });

        // Salva il ticketChannelId nell'unban data
        await setUnbanTicketChannel(targetId, ticketChannel.id);

        // DM al bannato
        try {
          const dmUser = await client.users.fetch(targetId).catch(() => null);
          if (dmUser) await dmUser.send({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🔓 Richiesta Unban').setDescription(`🎟️ Lo staff ha aperto un ticket per discutere la tua richiesta di unban.\nUnisciti al canale nel server per continuare.`).setFooter({ text: `FrelerrBOT • ${time}` })] });
        } catch {}

        await interaction.reply({ content: `✅ Ticket aperto: ${ticketChannel}`, flags: 64 });
        return;
      }

      // ── Stanze temporanee: bottoni da DM ─────────────────────────
      if (interaction.customId === 'temp_dm_edit') {
        const entry = await getUserChannel(interaction.user.id);
        if (!entry) return interaction.reply({ content: '❌ Nessuna stanza attiva.', flags: 64 });
        const [, data] = entry;
        const modal = new ModalBuilder()
          .setCustomId('temp_modal_edit')
          .setTitle('✏️ Modifica Stanza')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('nome').setLabel('Nuovo nome').setStyle(TextInputStyle.Short).setValue(data.name).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('max').setLabel('Max giocatori (vuoto = illimitato)').setStyle(TextInputStyle.Short).setValue(data.maxPlayers === 0 ? '' : String(data.maxPlayers)).setRequired(false)
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId === 'temp_dm_delete') {
        const entry = await getUserChannel(interaction.user.id);
        if (!entry) return interaction.reply({ content: '❌ Nessuna stanza attiva.', flags: 64 });
        const [channelId, channelData] = entry;
        const guild = client.guilds.cache.get(channelData.guildId);
        if (guild) {
          const ch = guild.channels.cache.get(channelId);
          if (ch) await ch.delete().catch(() => {});
        }
        const { deleteTempChannel } = require('../utils/tempChannels');
        await deleteTempChannel(channelId);
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('🗑️ Stanza eliminata.')],
          components: [],
        });
        return;
      }

      if (interaction.customId === 'temp_dm_invite') {
        const entry = await getUserChannel(interaction.user.id);
        if (!entry) return interaction.reply({ content: '❌ Nessuna stanza attiva.', flags: 64 });
        const modal = new ModalBuilder()
          .setCustomId('temp_invite_modal')
          .setTitle('➕ Invita nella Stanza')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('user_id')
                .setLabel('Chi vuoi invitare?')
                .setPlaceholder('Scrivi il nome utente del membro')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      // ── Stanze temporanee: Crea Privata ──────────────────────────
      if (interaction.customId === 'temp_create_private') {
        if (!interaction.member.roles.cache.has(VIP_ROLE_ID) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator))
          return interaction.reply({ content: '❌ Solo i membri **VIP** possono creare stanze temporanee.', flags: 64 });

        const modal = new ModalBuilder()
          .setCustomId('temp_modal_private')
          .setTitle('🔒 Crea Stanza Privata')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('nome').setLabel('Nome della stanza').setStyle(TextInputStyle.Short).setMaxLength(50).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('max').setLabel('Max giocatori (vuoto = illimitato)').setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('invitato').setLabel('Chi può accedere? (opzionale)').setPlaceholder('Scrivi il nome utente del membro').setStyle(TextInputStyle.Short).setRequired(false)
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      // ── Stanze temporanee: Modifica ───────────────────────────────
      if (interaction.customId === 'temp_edit') {
        const entry = await getUserChannel(interaction.user.id);
        if (!entry) return interaction.reply({ content: '❌ Non hai nessuna stanza attiva.', flags: 64 });
        const [, data] = entry;
        const modal = new ModalBuilder()
          .setCustomId('temp_modal_edit')
          .setTitle('✏️ Modifica Stanza')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('nome').setLabel('Nuovo nome').setStyle(TextInputStyle.Short).setValue(data.name).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('max').setLabel('Max giocatori (vuoto = illimitato)').setStyle(TextInputStyle.Short).setValue(data.maxPlayers === 0 ? '' : String(data.maxPlayers)).setRequired(false)
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      // ── Stanze temporanee: Invita ─────────────────────────────────
      if (interaction.customId === 'temp_invite') {
        const entry = await getUserChannel(interaction.user.id);
        if (!entry) return interaction.reply({ content: '❌ Non hai nessuna stanza attiva.', flags: 64 });

        const modal = new ModalBuilder()
          .setCustomId('temp_invite_modal')
          .setTitle('➕ Invita nella Stanza')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('user_id')
                .setLabel('Chi vuoi invitare?')
                .setPlaceholder('Scrivi il nome utente del membro')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      // ── Ticket: Prendi ────────────────────────────────────────────
      if (interaction.customId === 'ticket_take') {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: '❌ Solo lo staff può prendere i ticket.', flags: 64 });

        const tickets = await loadTickets();
        const ticket = tickets[interaction.channel.id];
        if (!ticket) return interaction.reply({ content: '❌ Ticket non trovato.', flags: 64 });
        if (ticket.taken) return interaction.reply({ content: '⚠️ Questo ticket è già stato preso.', flags: 64 });

        ticket.taken = true;
        ticket.staffId = interaction.user.id;
        await saveTickets(tickets);

        await interaction.channel.permissionOverwrites.edit(STAFF_ROLE_ID, { SendMessages: false });
        await interaction.channel.permissionOverwrites.create(interaction.user.id, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
        });

        await interaction.message.edit({ components: [buildStaffButtons(true, interaction.member.displayName)] });
        await interaction.reply(`<@&${STAFF_ROLE_ID}> **${interaction.member.displayName}** Ha preso il Ticket.`);
        return;
      }

      // ── Ticket: Chiudi ────────────────────────────────────────────
      if (interaction.customId === 'ticket_close') {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: '❌ Solo lo staff può chiudere i ticket.', flags: 64 });

        await interaction.reply('🔒 Chiusura ticket in corso...');
        await closeTicket(interaction.channel, interaction.member, client);
        return;
      }

      // ── Ticket: Visualizza Cronologia ─────────────────────────────
      if (interaction.customId.startsWith('ticket_transcript_')) {
        const channelId = interaction.customId.replace('ticket_transcript_', '');
        const transcripts = await loadTranscripts();
        const transcript = transcripts[channelId];

        if (!transcript || transcript.lines.length === 0)
          return interaction.reply({ content: '📭 Nessuna cronologia disponibile.', flags: 64 });

        const chunks = [];
        let current = '';
        for (const line of transcript.lines) {
          if (current.length + line.length > 1900) { chunks.push(current); current = ''; }
          current += line + '\n';
        }
        if (current) chunks.push(current);

        await interaction.reply({ content: `📋 **Cronologia ticket**\n\`\`\`${chunks[0]}\`\`\``, flags: 64 });
        for (let i = 1; i < Math.min(chunks.length, 5); i++) {
          await interaction.followUp({ content: `\`\`\`${chunks[i]}\`\`\``, flags: 64 });
        }
        return;
      }
    }
  },
};
