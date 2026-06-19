const { MEMBER_COUNTER_CHANNEL_ID } = require('../config');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    const channel = member.guild.channels.cache.get(MEMBER_COUNTER_CHANNEL_ID);
    if (channel) {
      await channel.setName(`👥 ᴍᴇᴍʙʀɪ: ${member.guild.memberCount}`).catch(() => {});
    }
  },
};
