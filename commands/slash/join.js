const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Fa entrare il bot nel tuo canale vocale.'),

  async execute(interaction) {
    const member = interaction.member;
    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({ content: '❌ Devi essere in un canale vocale per usare questo comando.', flags: 64 });
    }

    const existing = interaction.client.voiceConnection;
    if (existing && existing.joinConfig?.channelId === voiceChannel.id) {
      return interaction.reply({ content: '⚠️ Sono già in quel canale vocale.', flags: 64 });
    }

    if (existing) {
      existing.destroy();
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      try { connection.destroy(); } catch {}
      interaction.client.voiceConnection = null;
    });

    connection.on('error', err => {
      console.error('Errore connessione vocale:', err.message);
      try { connection.destroy(); } catch {}
      interaction.client.voiceConnection = null;
    });

    interaction.client.voiceConnection = connection;

    await interaction.reply({ content: `✅ Entrato in **${voiceChannel.name}**!` });
  },
};
