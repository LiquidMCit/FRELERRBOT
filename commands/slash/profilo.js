const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { BASE_STAFF_ROLE_ID } = require('../../config');
const { load: loadLevels } = require('../../utils/levels');
const { loadTickets } = require('../../utils/tickets');
const { getWarns, getBanInfo } = require('../../utils/moderation');

function fmtDate(ts) {
  if (!ts) return 'N/D';
  return new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeString() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profilo')
    .setDescription('Visualizza il profilo completo di un membro [staff only]')
    .addUserOption(o => o.setName('membro').setDescription('Il membro da consultare').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const isStaff = interaction.member.roles.cache.has(BASE_STAFF_ROLE_ID)
                 || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isStaff)
      return interaction.reply({ content: '❌ Solo lo staff può usare questo comando.', flags: 64 });

    await interaction.deferReply({ flags: 64 });

    const member = interaction.options.getMember('membro');
    const user   = member?.user ?? interaction.options.getUser('membro');

    const [warns, banData, levels, tickets] = await Promise.all([
      getWarns(user.id),
      getBanInfo(user.id),
      loadLevels(),
      loadTickets(),
    ]);

    const levelData  = levels[user.id] ?? { level: 0, xp: 0, messages: 0, voiceMinutes: 0 };
    const timedOut   = member?.isCommunicationDisabled() ?? false;
    const timeoutUntil = member?.communicationDisabledUntilTimestamp ?? null;

    const roles = member?.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => r.name).join(', ') || 'Nessuno';

    const userTickets = Object.entries(tickets)
      .filter(([, t]) => t.creatorId === user.id)
      .map(([, t]) => `${t.closed ? '🔒' : '🟢'} ${t.category ?? 'ticket'}`)
      .slice(0, 8).join(' • ') || 'Nessun ticket';

    const embed1 = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`👤 ${member?.displayName ?? user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🏷️ Username', value: user.username, inline: true },
        { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
        { name: '​', value: '​', inline: true },
        { name: '📅 Account creato', value: fmtDate(user.createdTimestamp), inline: true },
        { name: '📥 Entrato nel server', value: fmtDate(member?.joinedTimestamp), inline: true },
        { name: '​', value: '​', inline: true },
        { name: '🎭 Ruoli', value: roles.length > 1024 ? roles.slice(0, 1021) + '...' : roles },
      )
      .setFooter({ text: `FrelerrBOT • ${timeString()}` });

    const warnText = warns.length > 0
      ? warns.map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.by}> *(${fmtDate(w.at)})*`).join('\n')
      : '✅ Nessun warn';

    const banText = banData
      ? `🔴 Sì\n📋 ${banData.reason}\nBannato da <@${banData.bannedBy}> il ${fmtDate(banData.bannedAt)}`
      : '✅ No';

    const embed2 = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('🔨 Moderazione')
      .addFields(
        { name: '⏱️ Timeout attivo', value: timedOut ? `🔴 Sì, fino a:\n${fmtDate(timeoutUntil)}` : '✅ No', inline: true },
        { name: '🔒 Ban', value: banText, inline: true },
        { name: `⚠️ Warn (${warns.length})`, value: warnText },
      );

    const embed3 = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('📊 Attività')
      .addFields(
        { name: '⭐ Livello', value: `__ʟᴠʟ ${levelData.level}__ — ${levelData.xp} XP`, inline: true },
        { name: '💬 Messaggi', value: `${levelData.messages ?? 0}`, inline: true },
        { name: '🎙️ Minuti in vocale', value: `${levelData.voiceMinutes ?? 0}`, inline: true },
        { name: '🎟️ Ticket', value: userTickets },
      );

    const embeds = [embed1, embed2, embed3];
    try {
      await interaction.user.send({ embeds });
      await interaction.editReply({ content: `✅ Profilo di **${member?.displayName ?? user.username}** inviato in DM.` });
    } catch {
      await interaction.editReply({ content: '⚠️ Non riesco a inviarti il DM. Ecco il profilo:', embeds });
    }
  },
};
