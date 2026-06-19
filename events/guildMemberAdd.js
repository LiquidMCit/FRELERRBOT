const { MEMBRO_ROLE_ID, MEMBER_COUNTER_CHANNEL_ID } = require('../config');
const { sendWelcome } = require('../utils/welcome');
const { setFirstJoined } = require('../utils/levels');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const role = member.guild.roles.cache.get(MEMBRO_ROLE_ID);
    if (role) await member.roles.add(role).catch(() => {});

    const channel = member.guild.channels.cache.get(MEMBER_COUNTER_CHANNEL_ID);
    if (channel) {
      await channel.setName(`👥 ᴍᴇᴍʙʀɪ: ${member.guild.memberCount}`).catch(() => {});
    }

    await setFirstJoined(member.id, member.joinedTimestamp);
    await sendWelcome(member, client, member.guild.memberCount);
  },
};
