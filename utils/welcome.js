const { EmbedBuilder } = require('discord.js');
const { supabase } = require('./supabase');
const { WELCOME_CHANNEL_ID } = require('../config');

async function loadWelcomed() {
  const { data } = await supabase.from('welcomed').select('user_id');
  return new Set((data ?? []).map(r => r.user_id));
}

async function markWelcomed(memberId) {
  await supabase.from('welcomed').upsert({ user_id: memberId }, { onConflict: 'user_id', ignoreDuplicates: true });
}

async function seedWelcomed(memberIds) {
  if (!memberIds.length) return;
  await supabase.from('welcomed').upsert(memberIds.map(id => ({ user_id: id })), { onConflict: 'user_id', ignoreDuplicates: true });
}

async function sendWelcome(member, client, memberNumber) {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel) return;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`Benvenuto ${member.displayName}!`)
    .setDescription(`Siamo lieti di accoglierti come il **${memberNumber}°** membro della nostra Community.\n\nBuon Divertimento!`)
    .setThumbnail(member.user.displayAvatarURL({ size: 4096, extension: 'png', forceStatic: false }))
    .setFooter({ text: `FrelerrBOT • ${time}` });

  await channel.send({ content: `Benvenuto nel Server ${member}!`, embeds: [embed] });
  await markWelcomed(member.id);
}

module.exports = { loadWelcomed, seedWelcomed, sendWelcome };
