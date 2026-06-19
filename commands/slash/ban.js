const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { BAN_ROLE_ID } = require('../../config');
const { sendModLog } = require('../../utils/modlog');
const { setBanInfo } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banna un membro dal server assegnandogli il ruolo ban.')
    .addUserOption(opt => opt.setName('utente').setDescription('Il membro da bannare').setRequired(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Motivo del ban').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const target = interaction.options.getMember('utente');
    const motivo = interaction.options.getString('motivo');

    if (!target) return interaction.reply({ content: '❌ Utente non trovato.', flags: 64 });
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Non puoi bannare te stesso.', flags: 64 });

    const role = interaction.guild.roles.cache.get(BAN_ROLE_ID);
    if (!role) return interaction.reply({ content: '❌ Ruolo ban non trovato.', flags: 64 });
    if (target.roles.cache.has(BAN_ROLE_ID))
      return interaction.reply({ content: `⚠️ **${target.displayName}** è già bannato.`, flags: 64 });

    await target.roles.add(role).catch(() => {});
    await setBanInfo(target.id, motivo, interaction.user.id);

    await sendModLog(interaction.client, {
      action: 'Ban', moderator: interaction.member, target, reason: motivo,
    });

    await interaction.reply({ content: `✅ **${target.displayName}** è stato bannato.\n📋 Motivo: *${motivo}*`, flags: 64 });
  },
};
