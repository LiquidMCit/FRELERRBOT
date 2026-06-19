const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { saveGiveaway, parseDuration, buildEmbed, buildButtons } = require('../../utils/giveaway');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Crea un giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('premio').setDescription('Il premio del giveaway').setRequired(true))
    .addStringOption(o => o.setName('durata').setDescription('Durata (es. 1h, 30m, 7d)').setRequired(true))
    .addIntegerOption(o => o.setName('vincitori').setDescription('Numero di vincitori').setRequired(true).setMinValue(1).setMaxValue(20))
    .addChannelOption(o => o.setName('canale').setDescription('Canale dove mandare il giveaway').setRequired(true)),

  async execute(interaction) {
    const prize = interaction.options.getString('premio');
    const durationStr = interaction.options.getString('durata');
    const maxWinners = interaction.options.getInteger('vincitori');
    const channel = interaction.options.getChannel('canale');

    const duration = parseDuration(durationStr);
    if (!duration) {
      return interaction.reply({ content: '❌ Durata non valida. Usa formato: `1m`, `1h`, `1d`', flags: 64 });
    }

    const giveaway = {
      prize,
      maxWinners,
      endsAt: Date.now() + duration,
      channelId: channel.id,
      guildId: interaction.guildId,
      hostId: interaction.user.id,
      participants: [],
      ended: false,
    };

    const embed = buildEmbed(giveaway, interaction.member);
    const msg = await channel.send({ content: '@everyone 🏆 Nuovo Giveaway!', embeds: [embed], components: [buildButtons(0)] });

    giveaway.messageId = msg.id;
    await saveGiveaway(giveaway);

    await interaction.reply({ content: `✅ Giveaway creato in ${channel}!`, flags: 64 });
  },
};
