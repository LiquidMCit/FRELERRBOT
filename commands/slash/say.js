const { SlashCommandBuilder } = require('discord.js');
const { VoiceConnectionStatus } = require('@discordjs/voice');
const { enqueueTTS } = require('../../utils/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Fa parlare il bot nel canale vocale.')
    .addStringOption(opt =>
      opt.setName('testo').setDescription('Cosa deve dire il bot').setRequired(true)
    ),

  async execute(interaction) {
    const testo = interaction.options.getString('testo');
    const voiceChannel = interaction.member.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({ content: '❌ Devi essere in un canale vocale.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const nome = interaction.member?.displayName ?? interaction.user.username;
    enqueueTTS(interaction.client, interaction.guild, voiceChannel, `${nome} dice: ${testo}`);

    await interaction.editReply({ content: `🔊 **"${testo}"**` });
  },
};
