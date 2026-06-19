const { supabase } = require('./supabase');

// ── Warns ────────────────────────────────────────────────────────────

async function getWarns(userId) {
  const { data } = await supabase
    .from('warns')
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: true });
  return (data ?? []).map(w => ({ reason: w.reason, by: w.issued_by, at: w.issued_at, id: w.id }));
}

async function addWarn(userId, reason, issuedBy) {
  await supabase.from('warns').insert({ user_id: userId, reason, issued_by: issuedBy, issued_at: Date.now() });
  const { count } = await supabase.from('warns').select('*', { count: 'exact', head: true }).eq('user_id', userId);
  return count ?? 0;
}

async function clearWarns(userId) {
  const { count } = await supabase.from('warns').select('*', { count: 'exact', head: true }).eq('user_id', userId);
  await supabase.from('warns').delete().eq('user_id', userId);
  return count ?? 0;
}

// ── Ban info ─────────────────────────────────────────────────────────

async function getBanInfo(userId) {
  const { data } = await supabase.from('ban_info').select('*').eq('user_id', userId).single();
  if (!data) return null;
  return { reason: data.reason, bannedBy: data.banned_by, bannedAt: data.banned_at };
}

async function setBanInfo(userId, reason, bannedBy) {
  await supabase.from('ban_info').upsert({
    user_id: userId, reason, banned_by: bannedBy, banned_at: Date.now(),
  }, { onConflict: 'user_id' });
}

async function clearBanInfo(userId) {
  await supabase.from('ban_info').delete().eq('user_id', userId);
}

// ── Unban requests ───────────────────────────────────────────────────

async function getUnbanRequest(userId) {
  const { data } = await supabase.from('unban_requests').select('*').eq('user_id', userId).single();
  if (!data) return null;
  return { messageId: data.message_id, closed: data.closed, guildId: data.guild_id, ticketChannelId: data.ticket_channel_id };
}

async function saveUnbanRequest(userId, { messageId, closed, guildId, ticketChannelId = null }) {
  await supabase.from('unban_requests').upsert({
    user_id: userId,
    message_id: messageId,
    closed: closed ?? false,
    guild_id: guildId,
    ticket_channel_id: ticketChannelId,
  }, { onConflict: 'user_id' });
}

async function closeUnbanRequest(userId) {
  await supabase.from('unban_requests').update({ closed: true }).eq('user_id', userId);
}

async function setUnbanTicketChannel(userId, ticketChannelId) {
  await supabase.from('unban_requests').update({ ticket_channel_id: ticketChannelId }).eq('user_id', userId);
}

module.exports = {
  getWarns, addWarn, clearWarns,
  getBanInfo, setBanInfo, clearBanInfo,
  getUnbanRequest, saveUnbanRequest, closeUnbanRequest, setUnbanTicketChannel,
};
