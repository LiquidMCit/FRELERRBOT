const activeLvlMessages = new Map();

function track(messageId, channelId, targetId) {
  activeLvlMessages.set(messageId, {
    channelId,
    targetId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
}

function getAll() {
  return activeLvlMessages;
}

module.exports = { track, getAll };
