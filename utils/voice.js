const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  StreamType,
  entersState,
} = require('@discordjs/voice');
const gtts = require('node-gtts')('it');
const { PassThrough } = require('stream');

process.env.FFMPEG_PATH = require('ffmpeg-static');

const queues = new Map(); // guildId → [{ testo, voiceChannel }]

async function getOrCreateConnection(client, guild, voiceChannel) {
  let connection = client.voiceConnection;

  if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      console.log('[VOICE] Disconnesso.');
      try { connection.destroy(); } catch {}
      client.voiceConnection = null;
    });

    connection.on('error', err => {
      console.error('[VOICE] Errore connessione:', err.message);
      try { connection.destroy(); } catch {}
      client.voiceConnection = null;
    });

    client.voiceConnection = connection;
  }

  if (connection.state.status !== VoiceConnectionStatus.Ready) {
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
    } catch {
      console.error('[VOICE] Timeout: connessione non pronta in 10s.');
      try { connection.destroy(); } catch {}
      client.voiceConnection = null;
      return null;
    }
  }

  return connection;
}

async function processQueue(client, guild) {
  const queue = queues.get(guild.id);
  if (!queue || queue.length === 0) return;

  const { testo, voiceChannel } = queue[0];
  const connection = await getOrCreateConnection(client, guild, voiceChannel);
  if (!connection) {
    queue.shift();
    if (queue.length > 0) processQueue(client, guild);
    return;
  }

  const passthrough = new PassThrough();
  gtts.stream(testo).pipe(passthrough);

  const resource = createAudioResource(passthrough, { inputType: StreamType.Arbitrary });
  const player = createAudioPlayer();

  player.on('error', err => console.error('[PLAYER] Errore:', err.message));

  player.on('stateChange', (_, newState) => {
    if (newState.status === AudioPlayerStatus.Idle) {
      queue.shift();
      if (queue.length > 0) processQueue(client, guild);
    }
  });

  connection.subscribe(player);
  player.play(resource);
}

function enqueueTTS(client, guild, voiceChannel, testo) {
  const guildId = guild.id;
  if (!queues.has(guildId)) queues.set(guildId, []);
  const queue = queues.get(guildId);
  queue.push({ testo, voiceChannel });
  if (queue.length === 1) processQueue(client, guild);
}

module.exports = { getOrCreateConnection, enqueueTTS };
