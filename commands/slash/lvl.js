const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, xpForLevel, buildProgressBar } = require('../../utils/levels');
const { track } = require('../../utils/lvlMessages');

function buildLvlEmbed(target, userData) {
  const currentXP = userData.xp;
  const required = xpForLevel(userData.level + 1);
  const percent = Math.floor((currentXP / required) * 100);
  const bar = buildProgressBar(currentXP, required);

  const firstJoined = userData.firstJoined ?? target.joinedAt?.getTime() ?? null;
  const joinedTimestamp = firstJoined ? `<t:${Math.floor(firstJoined / 1000)}:D>` : 'N/A';

  const voiceMinutes = userData.voiceMinutes ?? 0;
  const voiceStr = voiceMinutes >= 60
    ? `${Math.floor(voiceMinutes / 60)}h ${voiceMinutes % 60}m`
    : `${voiceMinutes}m`;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setAuthor({ name: target.displayName, iconURL: target.user.displayAvatarURL({ size: 256 }) })
    .setThumbnail(target.user.displayAvatarURL({ size: 512 }))
    .addFields(
      { name: '⭐ Livello', value: `**${userData.level}**`, inline: true },
      { name: '✨ XP', value: `**${currentXP}** / **${required}**`, inline: true },
      { name: '📈 Progresso', value: `**${percent}%**`, inline: true },
      { name: '​', value: `${bar}`, inline: false },
      { name: '💬 Messaggi inviati', value: `**${userData.messages ?? 0}**`, inline: true },
      { name: '🎙️ Tempo in vocale', value: `**${voiceStr}**`, inline: true },
      { name: '📅 Nel server da', value: joinedTimestamp, inline: true },
    )
    .setFooter({ text: `FrelerrBOT • ${time}` });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lvl')
    .setDescription('Mostra il tuo livello o quello di un altro membro')
    .addUserOption(o =>
      o.setName('utente').setDescription('Membro da controllare').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getMember('utente') ?? interaction.member;
    const userData = await getUser(target.id);
    const embed = buildLvlEmbed(target, userData);

    await interaction.reply({ embeds: [embed] });
    const msg = await interaction.fetchReply();
    track(msg.id, msg.channelId, target.id);
  },

  buildLvlEmbed,
};
