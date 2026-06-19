const https = require('https');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { YOUTUBE_NOTIF_CHANNEL_ID } = require('../config');

const DATA_FILE = path.join(__dirname, '../data/youtube.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { lastVideoId: null };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

function fetchRSS() {
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => resolve(raw));
    }).on('error', reject);
  });
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseLatestVideo(xml) {
  const videoIdMatch = xml.match(/<yt:videoId>(.+?)<\/yt:videoId>/);
  const titles = [...xml.matchAll(/<title>(.+?)<\/title>/g)];
  if (!videoIdMatch || titles.length < 2) return null;

  const videoId = videoIdMatch[1].trim();
  const title = decodeEntities(titles[1][1].trim());

  return {
    id: videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };
}

async function sendVideoNotification(channel, video) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('📺 Nuovo Video di Frelerr!')
    .setDescription(`**${video.title}**\n\n🔗 ${video.url}`)
    .setImage(video.thumbnail)
    .setFooter({ text: `FrelerrBOT • ${time}` });

  await channel.send({ content: '@everyone 📺 Nuovo video!', embeds: [embed] });
}

async function checkNewVideo(client) {
  const xml = await fetchRSS().catch(() => null);
  if (!xml) return;

  const video = parseLatestVideo(xml);
  if (!video) return;

  const data = loadData();
  if (video.id === data.lastVideoId) return;

  data.lastVideoId = video.id;
  saveData(data);

  const channel = client.channels.cache.get(YOUTUBE_NOTIF_CHANNEL_ID);
  if (!channel) return;

  await sendVideoNotification(channel, video);
}

module.exports = { checkNewVideo };
