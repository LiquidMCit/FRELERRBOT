const { voiceSessions } = require('../utils/levels');
const { load: loadTemp, deleteTempChannel } = require('../utils/tempChannels');

const emptyChannelTimers = new Map();

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const userId = newState.member?.id ?? oldState.member?.id;
    if (!userId || newState.member?.user.bot) return;

    const joinedChannel = !oldState.channelId && newState.channelId;
    const leftChannel = oldState.channelId && !newState.channelId;

    if (joinedChannel) voiceSessions.set(userId, Date.now());
    if (leftChannel) voiceSessions.delete(userId);

    // Se qualcuno entra in una stanza temporanea, annulla il timer di eliminazione
    if (newState.channelId) {
      const tempData = loadTemp();
      if (tempData[newState.channelId] && emptyChannelTimers.has(newState.channelId)) {
        clearTimeout(emptyChannelTimers.get(newState.channelId));
        emptyChannelTimers.delete(newState.channelId);
      }
    }

    // Se qualcuno lascia una stanza temporanea
    if (oldState.channelId) {
      const tempData = loadTemp();
      if (tempData[oldState.channelId]) {
        const channel = oldState.guild.channels.cache.get(oldState.channelId);
        if (channel && channel.members.size === 0) {
          // Avvia timer da 10 minuti prima di eliminare
          if (emptyChannelTimers.has(oldState.channelId)) {
            clearTimeout(emptyChannelTimers.get(oldState.channelId));
          }
          const timer = setTimeout(async () => {
            const ch = oldState.guild.channels.cache.get(oldState.channelId);
            if (ch && ch.members.size === 0) {
              await ch.delete().catch(() => {});
              await deleteTempChannel(oldState.channelId);
            }
            emptyChannelTimers.delete(oldState.channelId);
          }, 10 * 60 * 1000);
          emptyChannelTimers.set(oldState.channelId, timer);
        }
      }
    }
  },
};
