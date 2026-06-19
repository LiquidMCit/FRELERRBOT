const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { EmbedBuilder } = require('discord.js');
const { LIVE_NOTIF_CHANNEL_ID } = require('../config');

const STATE_FILE = path.join(__dirname, '../data/liveState.json');

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { twitchStreamId: null, ytLiveId: null, notifKey: null };
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { twitchStreamId: null, ytLiveId: null, notifKey: null }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function httpsPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const req  = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });
}

// ── Twitch ───────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getTwitchToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const data = await httpsPost('https://id.twitch.tv/oauth2/token', {
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function fetchTwitchStream() {
  const token = await getTwitchToken();
  const data  = await httpsGet(
    `https://api.twitch.tv/helix/streams?user_login=${process.env.TWITCH_USERNAME}`,
    { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
  );
  return data.data?.[0] ?? null;
}

// ── YouTube ──────────────────────────────────────────────────────────
async function fetchYTLive() {
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  const apiKey    = process.env.YOUTUBE_API_KEY;
  const url       = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
  const data      = await httpsGet(url);
  const item      = data.items?.[0];
  if (!item) return null;
  return {
    id:        item.id.videoId,
    title:     item.snippet.title,
    url:       `https://www.youtube.com/watch?v=${item.id.videoId}`,
    thumbnail: item.snippet.thumbnails?.high?.url ?? null,
  };
}

// ── Notifiche ────────────────────────────────────────────────────────
function timeStr() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

async function sendCombined(channel, twitch, yt) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🔴 Frelerr è Live su ENTRAMBE le piattaforme!')
    .setDescription([
      `**${twitch.title}**`,
      '',
      `🟣 **Twitch** → https://twitch.tv/${process.env.TWITCH_USERNAME}`,
      `🔴 **YouTube** → ${yt.url}`,
    ].join('\n'))
    .setImage(twitch.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`)
    .setFooter({ text: `FrelerrBOT • ${timeStr()}` });

  await channel.send({ content: '@everyone 🔴 Frelerr è live su **Twitch** e **YouTube** contemporaneamente!', embeds: [embed] });
}

async function sendTwitchOnly(channel, stream) {
  const thumbnail = stream.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`;
  const embed = new EmbedBuilder()
    .setColor(0x9146ff)
    .setTitle('🟣 Frelerr è in Live su Twitch!')
    .setDescription(`**${stream.title}**\n\n🔗 https://twitch.tv/${process.env.TWITCH_USERNAME}`)
    .setImage(thumbnail)
    .setFooter({ text: `FrelerrBOT • ${timeStr()}` });

  await channel.send({ content: '@everyone 🟣 Live su Twitch iniziata!', embeds: [embed] });
}

async function sendYTOnly(channel, live) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🔴 Frelerr è in Live su YouTube!')
    .setDescription(`**${live.title}**\n\n🔗 ${live.url}`)
    .setImage(live.thumbnail)
    .setFooter({ text: `FrelerrBOT • ${timeStr()}` });

  await channel.send({ content: '@everyone 🔴 Live su YouTube iniziata!', embeds: [embed] });
}

// ── Check principale ─────────────────────────────────────────────────
async function checkLive(client) {
  const [twitchStream, ytLive] = await Promise.all([
    fetchTwitchStream().catch(() => null),
    fetchYTLive().catch(() => null),
  ]);

  const twitchId = twitchStream?.id ?? null;
  const ytId     = ytLive?.id ?? null;
  const key      = `T${twitchId ?? '0'}_Y${ytId ?? '0'}`;

  const state = loadState();
  if (key === state.notifKey) return;

  const channel = client.channels.cache.get(LIVE_NOTIF_CHANNEL_ID);

  if (twitchId && ytId) {
    if (channel) await sendCombined(channel, twitchStream, ytLive);
  } else if (twitchId) {
    if (channel) await sendTwitchOnly(channel, twitchStream);
  } else if (ytId) {
    if (channel) await sendYTOnly(channel, ytLive);
  }

  state.notifKey = (twitchId || ytId) ? key : null;
  saveState(state);
}

module.exports = { checkLive };
