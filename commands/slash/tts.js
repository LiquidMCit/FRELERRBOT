const { SlashCommandBuilder } = require('discord.js');

// canali con TTS attivo → { textChannelId: voiceChannelId }
// salvato sul client per persistere finché il bot è acceso
function getTTSMap(client) {
  if (!client.ttsChannels) client.ttsChannels = new Map();
  return client.ttsChannels;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('Attiva o disattiva il TTS automatico nel canale.')
    .addStringOption(opt =>
      opt.setName('stato')
        .setDescription('ON per attivare, OFF per disattivare')
        .setRequired(true)
        .addChoices(
          { name: 'ON', value: 'on' },
          { name: 'OFF', value: 'off' },
        )
    ),

  async execute(interaction) {
    const stato = interaction.options.getString('stato');
    const ttsMap = getTTSMap(interaction.client);

    if (stato === 'on') {
      const voiceChannel = interaction.member.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({ content: '❌ Devi essere in un canale vocale per attivare il TTS.', flags: 64 });
      }

      ttsMap.set(interaction.channel.id, voiceChannel.id);
      return interaction.reply({ content: `🔊 TTS attivato! Ogni messaggio in questo canale verrà letto nel vocale **${voiceChannel.name}**.` });
    }

    if (stato === 'off') {
      if (!ttsMap.has(interaction.channel.id)) {
        return interaction.reply({ content: '⚠️ Il TTS non è attivo in questo canale.', flags: 64 });
      }
      ttsMap.delete(interaction.channel.id);
      return interaction.reply({ content: '🔇 TTS disattivato in questo canale.' });
    }
  },
};
