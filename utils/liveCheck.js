const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { EmbedBuilder } = require('discord.js');
const { LIVE_NOTIF_CHANNEL_ID } = require('../config');

const STATE_FILE = path.join(__dirname, '../data/liveState.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { twitchId: null, ytId: null, notifKey: null }; }
}

function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s));
}

function httpsPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const req  = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let r = ''; res.on('data', c => (r += c)); res.on('end', () => resolve(JSON.parse(r))); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let r = '';
      res.on('data', c => (r += c));
      res.on('end', () => resolve(JSON.parse(r)));
    }).on('error', reject);
  });
}

// ── Twitch ────────────────────────────────────────────────────────────
let cachedToken = null, tokenExpiry = 0;

async function getTwitchToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const d = await httpsPost('https://id.twitch.tv/oauth2/token', {
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  cachedToken = d.access_token;
  tokenExpiry = Date.now() + (d.expires_in - 60) * 1000;
  return cachedToken;
}

async function fetchTwitchStream() {
  const token = await getTwitchToken();
  const d = await httpsGet(
    `https://api.twitch.tv/helix/streams?user_login=${process.env.TWITCH_USERNAME}`,
    { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
  );
  return d.data?.[0] ?? null;
}

// ── YouTube ───────────────────────────────────────────────────────────
async function fetchYTLive() {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${process.env.YOUTUBE_CHANNEL_ID}&eventType=live&type=video&key=${process.env.YOUTUBE_API_KEY}`;
  const d   = await httpsGet(url);
  const item = d.items?.[0];
  if (!item) return null;
  return {
    id:        item.id.videoId,
    title:     item.snippet.title,
    url:       `https://youtube.com/live/${item.id.videoId}`,
    thumbnail: item.snippet.thumbnails?.high?.url ?? null,
  };
}

// ── Notifiche ─────────────────────────────────────────────────────────
function timeStr() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

async function sendCombined(channel, twitch, yt) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('📽️ Frelerr è Live su ENTRAMBE le piattaforme!')
    .setDescription([
      `**${twitch.title}**`,
      '',
      `🟣 **Twitch** → https://twitch.tv/${process.env.TWITCH_USERNAME}`,
      `🔴 **YouTube** → ${yt.url}`,
    ].join('\n'))
    .setImage(twitch.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`)
    .setFooter({ text: `FrelerrBOT • ${timeStr()}` });

  await channel.send({ content: '@everyone 📽️ Frelerr è live su **Twitch** e **YouTube** contemporaneamente!', embeds: [embed] });
}

async function sendTwitchOnly(channel, stream) {
  const thumbnail = stream.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`;
  const embed = new EmbedBuilder()
    .setColor(0x9146ff)
    .setTitle('📽️ Frelerr è in Live su Twitch!')
    .setDescription(`**${stream.title}**\n\n🟣 https://twitch.tv/${process.env.TWITCH_USERNAME}`)
    .setImage(thumbnail)
    .setFooter({ text: `FrelerrBOT • ${timeStr()}` });

  await channel.send({ content: '@everyone 📽️ Live su Twitch iniziata!', embeds: [embed] });
}

async function sendYTOnly(channel, live) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('📽️ Frelerr è in Live su YouTube!')
    .setDescription(`**${live.title}**\n\n🔴 ${live.url}`)
    .setImage(live.thumbnail)
    .setFooter({ text: `FrelerrBOT • ${timeStr()}` });

  await channel.send({ content: '@everyone 📽️ Live su YouTube iniziata!', embeds: [embed] });
}

// ── Check principale ──────────────────────────────────────────────────
async function checkLive(client) {
  const state = loadState();

  // Usa Promise.allSettled: rejected = errore API → non toccare lo stato per quella piattaforma
  const [tr, yr] = await Promise.allSettled([fetchTwitchStream(), fetchYTLive()]);

  // Se entrambe le API sono crashate, salta questo ciclo senza toccare nulla
  if (tr.status === 'rejected' && yr.status === 'rejected') return;

  // Se l'API ha risposto (anche con null = offline), aggiorna lo stato per quella piattaforma
  // Se l'API ha crashato, usa l'ultimo valore noto per evitare falsi reset
  const twitchId = tr.status === 'fulfilled' ? (tr.value?.id ?? null) : (state.twitchId ?? null);
  const ytId     = yr.status === 'fulfilled' ? (yr.value?.id ?? null) : (state.ytId     ?? null);

  if (tr.status === 'fulfilled') state.twitchId = twitchId;
  if (yr.status === 'fulfilled') state.ytId     = ytId;

  const key = `T${twitchId ?? '0'}_Y${ytId ?? '0'}`;

  // Nessun cambiamento → salva stati aggiornati e basta
  if (key === state.notifKey) { saveState(state); return; }

  const channel = client.channels.cache.get(LIVE_NOTIF_CHANNEL_ID);

  if (twitchId && ytId) {
    const ts = tr.value, yl = yr.value;
    if (channel && ts && yl) await sendCombined(channel, ts, yl);
  } else if (twitchId) {
    const ts = tr.value;
    if (channel && ts) await sendTwitchOnly(channel, ts);
  } else if (ytId) {
    const yl = yr.value;
    if (channel && yl) await sendYTOnly(channel, yl);
  }

  state.notifKey = (twitchId || ytId) ? key : null;
  saveState(state);
}

module.exports = { checkLive };
