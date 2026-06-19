const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { sendModLog } = require('../../utils/modlog');
const { BASE_STAFF_ROLE_ID } = require('../../config');
const { getWarns, addWarn, clearWarns } = require('../../utils/moderation');

function timeString() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Gestisci i warn dei membri')
    .addSubcommand(sub => sub
      .setName('aggiungi')
      .setDescription('Aggiungi un warn a un membro')
      .addUserOption(opt => opt.setName('utente').setDescription('Il membro da warnare').setRequired(true))
      .addStringOption(opt => opt.setName('motivo').setDescription('Motivo del warn').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('lista')
      .setDescription('Vedi i warn di un membro')
      .addUserOption(opt => opt.setName('utente').setDescription('Il membro').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('rimuovi')
      .setDescription('Rimuovi tutti i warn di un membro')
      .addUserOption(opt => opt.setName('utente').setDescription('Il membro').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'lista') {
      const isStaff = interaction.member.roles.cache.has(BASE_STAFF_ROLE_ID)
                   || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!isStaff)
        return interaction.reply({ content: '❌ Solo lo staff può usare questo comando.', flags: 64 });

      const target = interaction.options.getMember('utente') ?? interaction.options.getUser('utente');
      const warns = await getWarns(target.id);

      if (warns.length === 0)
        return interaction.reply({ content: `✅ **${target.displayName ?? target.username}** non ha warn.`, flags: 64 });

      const lines = warns.map((w, i) => {
        const date = new Date(w.at).toLocaleDateString('it-IT');
        return `**${i + 1}.** ${w.reason} — <@${w.by}> il ${date}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`⚠️ Warn di ${target.displayName ?? target.username}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `FrelerrBOT • ${timeString()}` });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === 'rimuovi') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Solo gli amministratori possono rimuovere i warn.', flags: 64 });

      const target = interaction.options.getMember('utente') ?? interaction.options.getUser('utente');
      const count = await clearWarns(target.id);

      await sendModLog(interaction.client, {
        action: 'Warn rimossi', color: 0x2ecc71,
        moderator: interaction.member, target,
        reason: `Rimossi ${count} warn`,
      });

      return interaction.reply({ content: `✅ Rimossi **${count}** warn da **${target.displayName ?? target.username}**.`, flags: 64 });
    }

    // aggiungi
    const target = interaction.options.getMember('utente');
    const motivo = interaction.options.getString('motivo');

    if (!target) return interaction.reply({ content: '❌ Utente non trovato nel server.', flags: 64 });
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Non puoi warnare te stesso.', flags: 64 });
    if (target.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Non puoi warnare un amministratore.', flags: 64 });

    const count = await addWarn(target.id, motivo, interaction.user.id);
    let autoAction = null;

    if (count === 3) {
      await target.timeout(60 * 60 * 1000, '3 warn raggiunti').catch(() => {});
      autoAction = '⏱️ Timeout automatico di **1 ora** (3 warn)';
    } else if (count >= 5) {
      await target.timeout(24 * 60 * 60 * 1000, '5 warn raggiunti').catch(() => {});
      autoAction = '⏱️ Timeout automatico di **24 ore** (5+ warn)';
    }

    await sendModLog(interaction.client, {
      action: `Warn #${count}`, color: 0xe67e22,
      moderator: interaction.member, target,
      reason: motivo, extra: autoAction,
    });

    const lines = [`✅ **${target.displayName}** ha ricevuto il warn **#${count}**.`, `📋 Motivo: *${motivo}*`];
    if (autoAction) lines.push(autoAction);
    return interaction.reply({ content: lines.join('\n'), flags: 64 });
  },
};
