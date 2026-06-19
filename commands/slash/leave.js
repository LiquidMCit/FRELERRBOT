const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Fa uscire il bot dal canale vocale. (Solo admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const connection = interaction.client.voiceConnection;

    if (!connection) {
      return interaction.reply({ content: '❌ Il bot non è in nessun canale vocale.', flags: 64 });
    }

    connection.destroy();
    interaction.client.voiceConnection = null;

    await interaction.reply({ content: '✅ Uscito dal canale vocale.' });
  },
};
