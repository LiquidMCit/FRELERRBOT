const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { BAN_ROLE_ID, MODULO_UNBAN_ROLE_ID } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modulo-unban')
    .setDescription('Invia il modulo di unban per conto di un membro bannato.')
    .addUserOption(opt => opt.setName('utente').setDescription('Il membro bannato').setRequired(true)),

  async execute(interaction) {
    const hasRole = interaction.member.roles.cache.has(MODULO_UNBAN_ROLE_ID);
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!hasRole && !isAdmin)
      return interaction.reply({ content: '❌ Non hai i permessi per usare questo comando.', flags: 64 });

    const target = interaction.options.getMember('utente');
    if (!target) return interaction.reply({ content: '❌ Utente non trovato.', flags: 64 });
    if (!target.roles.cache.has(BAN_ROLE_ID))
      return interaction.reply({ content: '❌ Questo utente non è bannato.', flags: 64 });

    const modal = new ModalBuilder()
      .setCustomId(`unban_modulo_modal_${target.id}`)
      .setTitle(`Modulo Unban — ${target.user.username}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('motivo').setLabel('Perché è stato bannato?').setStyle(TextInputStyle.Paragraph).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('merito').setLabel('Perché merita l\'unban?').setStyle(TextInputStyle.Paragraph).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cambiamento').setLabel('Cosa cambierebbe del suo comportamento?').setStyle(TextInputStyle.Paragraph).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('durata').setLabel('Da quanto è bannato?').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('aggiunta').setLabel('Vuoi aggiungere altro?').setStyle(TextInputStyle.Paragraph).setRequired(false)
        ),
      );

    await interaction.showModal(modal);
  },
};
