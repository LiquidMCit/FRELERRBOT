/**
 * Script di migrazione da JSON a Supabase.
 * Esegui UNA SOLA VOLTA con: node scripts/migrate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const dataDir = path.join(__dirname, '../data');

function readJson(file) {
  const p = path.join(dataDir, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function migrate() {
  console.log('🚀 Inizio migrazione JSON → Supabase...\n');

  // ── levels.json ──────────────────────────────────────────────────
  const levels = readJson('levels.json');
  if (levels) {
    const rows = Object.entries(levels).map(([userId, d]) => ({
      user_id: userId, xp: d.xp ?? 0, level: d.level ?? 0,
      messages: d.messages ?? 0, voice_minutes: d.voiceMinutes ?? 0,
      first_joined: d.firstJoined ?? null,
    }));
    if (rows.length) {
      const { error } = await supabase.from('levels').upsert(rows, { onConflict: 'user_id' });
      console.log(error ? `❌ levels: ${error.message}` : `✅ levels: ${rows.length} utenti migrati`);
    }
  }

  // ── banInfo.json ─────────────────────────────────────────────────
  const banInfo = readJson('banInfo.json');
  if (banInfo) {
    const rows = Object.entries(banInfo).map(([userId, d]) => ({
      user_id: userId, reason: d.reason, banned_by: d.bannedBy, banned_at: d.bannedAt,
    }));
    if (rows.length) {
      const { error } = await supabase.from('ban_info').upsert(rows, { onConflict: 'user_id' });
      console.log(error ? `❌ ban_info: ${error.message}` : `✅ ban_info: ${rows.length} ban migrati`);
    }
  }

  // ── tickets.json ─────────────────────────────────────────────────
  const tickets = readJson('tickets.json');
  if (tickets) {
    const rows = Object.entries(tickets).map(([channelId, t]) => ({
      channel_id: channelId, creator_id: t.creatorId, category: t.category,
      form_data: t.formData ?? {}, staff_id: t.staffId, taken: t.taken ?? false,
      closed: t.closed ?? false, last_message: t.lastMessage,
      warning_sent: t.warningSent ?? false, guild_id: t.guildId,
    }));
    if (rows.length) {
      const { error } = await supabase.from('tickets').upsert(rows, { onConflict: 'channel_id' });
      console.log(error ? `❌ tickets: ${error.message}` : `✅ tickets: ${rows.length} ticket migrati`);
    }
  }

  // ── transcripts.json ─────────────────────────────────────────────
  const transcripts = readJson('transcripts.json');
  if (transcripts) {
    const rows = Object.entries(transcripts).map(([channelId, t]) => ({
      channel_id: channelId, lines: t.lines ?? [], category: t.category,
      creator_id: t.creatorId, closed_at: t.closedAt,
    }));
    if (rows.length) {
      const { error } = await supabase.from('ticket_transcripts').upsert(rows, { onConflict: 'channel_id' });
      console.log(error ? `❌ transcripts: ${error.message}` : `✅ transcripts: ${rows.length} trascritti migrati`);
    }
  }

  // ── giveaways.json ───────────────────────────────────────────────
  const giveaways = readJson('giveaways.json');
  if (giveaways) {
    const rows = Object.entries(giveaways).map(([msgId, g]) => ({
      message_id: msgId, prize: g.prize, max_winners: g.maxWinners ?? 1,
      ends_at: g.endsAt, channel_id: g.channelId, guild_id: g.guildId,
      host_id: g.hostId, participants: g.participants ?? [], ended: g.ended ?? false,
    }));
    if (rows.length) {
      const { error } = await supabase.from('giveaways').upsert(rows, { onConflict: 'message_id' });
      console.log(error ? `❌ giveaways: ${error.message}` : `✅ giveaways: ${rows.length} giveaway migrati`);
    }
  }

  // ── tempChannels.json ────────────────────────────────────────────
  const tempChannels = readJson('tempChannels.json');
  if (tempChannels && Object.keys(tempChannels).length > 0) {
    const rows = Object.entries(tempChannels).map(([channelId, c]) => ({
      channel_id: channelId, owner_id: c.ownerId, name: c.name,
      max_players: c.maxPlayers ?? 0, guild_id: c.guildId,
    }));
    if (rows.length) {
      const { error } = await supabase.from('temp_channels').upsert(rows, { onConflict: 'channel_id' });
      console.log(error ? `❌ temp_channels: ${error.message}` : `✅ temp_channels: ${rows.length} stanze migrate`);
    }
  } else {
    console.log('ℹ️  temp_channels: vuoto, nulla da migrare');
  }

  // ── welcomed.json ────────────────────────────────────────────────
  const welcomed = readJson('welcomed.json');
  if (welcomed && welcomed.length > 0) {
    const rows = welcomed.map(id => ({ user_id: id }));
    const { error } = await supabase.from('welcomed').upsert(rows, { onConflict: 'user_id', ignoreDuplicates: true });
    console.log(error ? `❌ welcomed: ${error.message}` : `✅ welcomed: ${rows.length} utenti migrati`);
  }

  // ── unbanRequests.json ───────────────────────────────────────────
  const unban = readJson('unbanRequests.json');
  if (unban) {
    const rows = Object.entries(unban).map(([userId, u]) => ({
      user_id: userId, message_id: u.messageId, closed: u.closed ?? false,
      guild_id: u.guildId, ticket_channel_id: u.ticketChannelId ?? null,
    }));
    if (rows.length) {
      const { error } = await supabase.from('unban_requests').upsert(rows, { onConflict: 'user_id' });
      console.log(error ? `❌ unban_requests: ${error.message}` : `✅ unban_requests: ${rows.length} richieste migrate`);
    }
  }

  // ── leaderboard.json ─────────────────────────────────────────────
  const lb = readJson('leaderboard.json');
  if (lb && Array.isArray(lb)) {
    const rows = lb.filter(e => e.messageId && e.channelId && e.guildId).map(e => ({
      message_id: e.messageId, channel_id: e.channelId, guild_id: e.guildId,
    }));
    if (rows.length) {
      const { error } = await supabase.from('leaderboard_messages').upsert(rows, { onConflict: 'message_id' });
      console.log(error ? `❌ leaderboard_messages: ${error.message}` : `✅ leaderboard_messages: ${rows.length} messaggi migrati`);
    }
  }

  console.log('\n✅ Migrazione completata!');
}

migrate().catch(console.error);
