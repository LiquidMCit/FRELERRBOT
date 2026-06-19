const https = require('https');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { TWITCH_NOTIF_CHANNEL_ID } = require('../config');

const DATA_FILE = path.join(__dirname, '../data/twitch.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { lastStreamId: null };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

function httpsPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(url, options, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });
}

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
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

async function fetchStream() {
  const token = await getAccessToken();
  const username = process.env.TWITCH_USERNAME;
  const data = await httpsGet(
    `https://api.twitch.tv/helix/streams?user_login=${username}`,
    {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    }
  );
  return data.data?.[0] ?? null;
}

async function sendLiveNotification(channel, stream) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const username = process.env.TWITCH_USERNAME;
  const thumbnail = stream.thumbnail_url
    .replace('{width}', '1280')
    .replace('{height}', '720')
    + `?t=${Date.now()}`;

  const embed = new EmbedBuilder()
    .setColor(0x9146ff)
    .setTitle('🎥 Nuova Live di Frelerr!')
    .setDescription(`**${stream.title}**\n\n🔗 https://twitch.tv/${username}`)
    .setImage(thumbnail)
    .setFooter({ text: `FrelerrBOT • ${time}` });

  await channel.send({ content: '@everyone 🎥 Nuova Live iniziata!', embeds: [embed] });
}

async function checkLive(client) {
  const stream = await fetchStream().catch(() => null);
  const data = loadData();

  if (!stream) {
    if (data.lastStreamId) {
      data.lastStreamId = null;
      saveData(data);
    }
    return;
  }

  if (stream.id === data.lastStreamId) return;

  data.lastStreamId = stream.id;
  saveData(data);

  const channel = client.channels.cache.get(TWITCH_NOTIF_CHANNEL_ID);
  if (!channel) return;

  await sendLiveNotification(channel, stream);
}

module.exports = { checkLive };
