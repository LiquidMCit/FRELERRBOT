const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const RESET_ROLE_ID = '1519779044797976586';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ristrutturazione')
    .setDescription('Rimuove tutti i ruoli da tutti i membri e assegna il ruolo base [ADMIN]')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const guild     = interaction.guild;
    const resetRole = guild.roles.cache.get(RESET_ROLE_ID);
    if (!resetRole) return interaction.editReply({ content: '❌ Ruolo non trovato (`' + RESET_ROLE_ID + '`).' });

    const members = await guild.members.fetch().catch(() => null);
    if (!members) return interaction.editReply({ content: '❌ Impossibile recuperare i membri.' });

    let success = 0, failed = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue;
      try {
        // roles.set sostituisce tutti i ruoli con solo quello indicato (singola chiamata API)
        await member.roles.set([resetRole], 'Ristrutturazione server');
        success++;
      } catch {
        failed++;
      }
    }

    await interaction.editReply({
      content: [
        '✅ **Ristrutturazione completata!**',
        `👥 **${success}** membri aggiornati`,
        failed > 0 ? `⚠️ **${failed}** non aggiornati (ruoli superiori al bot)` : '',
      ].filter(Boolean).join('\n'),
    });
  },
};
