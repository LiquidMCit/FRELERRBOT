const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { EmbedBuilder } = require('discord.js');
const { LIVE_NOTIF_CHANNEL_ID } = require('../config');

const STATE_FILE = path.join(__dirname, '../data/liveState.json');

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { twitchId: null, ytId: null, notifiedTwitchId: null, notifiedYtId: null, ...s };
  } catch {
    return { twitchId: null, ytId: null, notifiedTwitchId: null, notifiedYtId: null };
  }
}

function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }

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
  const d = await httpsGet(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${process.env.YOUTUBE_CHANNEL_ID}&eventType=live&type=video&key=${process.env.YOUTUBE_API_KEY}`
  );
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
// Logica: invia notifica SOLO quando una piattaforma diventa NUOVAMENTE live
// (ID diverso da quello già notificato). Ignora quando va offline.
async function checkLive(client) {
  const state = loadState();

  const [tr, yr] = await Promise.allSettled([fetchTwitchStream(), fetchYTLive()]);
  if (tr.status === 'rejected' && yr.status === 'rejected') return;

  // Se l'API risponde → aggiorna stato. Se crasha → tieni l'ultimo valore noto.
  const curTwitch = tr.status === 'fulfilled' ? (tr.value?.id ?? null) : state.twitchId;
  const curYT     = yr.status === 'fulfilled' ? (yr.value?.id ?? null) : state.ytId;

  if (tr.status === 'fulfilled') state.twitchId = curTwitch;
  if (yr.status === 'fulfilled') state.ytId = curYT;

  // Quando una piattaforma va offline (confermato dall'API), resetta il suo ID notificato
  // così la prossima live ripartirà con notifica fresca
  if (tr.status === 'fulfilled' && !curTwitch) state.notifiedTwitchId = null;
  if (yr.status === 'fulfilled' && !curYT) state.notifiedYtId = null;

  // Una piattaforma è "nuova" solo se ha un ID live che non abbiamo ancora notificato
  const newTwitch = !!(curTwitch && curTwitch !== state.notifiedTwitchId);
  const newYT     = !!(curYT     && curYT     !== state.notifiedYtId);

  if (!newTwitch && !newYT) { saveState(state); return; }

  const channel = client.channels.cache.get(LIVE_NOTIF_CHANNEL_ID);

  if (newTwitch && newYT) {
    if (channel) await sendCombined(channel, tr.value, yr.value);
    state.notifiedTwitchId = curTwitch;
    state.notifiedYtId     = curYT;
  } else if (newTwitch) {
    if (curYT) {
      // Twitch nuova, YT già live → combined
      const ytData = yr.status === 'fulfilled' ? yr.value : null;
      if (channel && ytData) await sendCombined(channel, tr.value, ytData);
      else if (channel) await sendTwitchOnly(channel, tr.value);
      state.notifiedTwitchId = curTwitch;
      state.notifiedYtId     = curYT;
    } else {
      if (channel) await sendTwitchOnly(channel, tr.value);
      state.notifiedTwitchId = curTwitch;
    }
  } else if (newYT) {
    if (curTwitch) {
      // YT nuova, Twitch già live → combined
      const twData = tr.status === 'fulfilled' ? tr.value : null;
      if (channel && twData) await sendCombined(channel, twData, yr.value);
      else if (channel) await sendYTOnly(channel, yr.value);
      state.notifiedYtId     = curYT;
      state.notifiedTwitchId = curTwitch;
    } else {
      if (channel) await sendYTOnly(channel, yr.value);
      state.notifiedYtId = curYT;
    }
  }

  saveState(state);
}

module.exports = { checkLive };
