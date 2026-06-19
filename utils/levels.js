const { supabase } = require('./supabase');

const voiceSessions = new Map();

function xpForLevel(level) {
  const base = 5 * level * level + 50 * level + 100;
  const multiplier = Math.pow(1.08, Math.max(0, level - 5));
  return Math.floor(base * multiplier);
}

function randomXP() {
  return Math.floor(Math.random() * 3) + 3; // 3-5 XP per messaggio
}

async function getUser(userId) {
  const { data } = await supabase.from('levels').select('*').eq('user_id', userId).single();
  if (!data) {
    await supabase.from('levels').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    return { xp: 0, level: 0, messages: 0, voiceMinutes: 0, firstJoined: null };
  }
  return { xp: data.xp, level: data.level, messages: data.messages, voiceMinutes: data.voice_minutes, firstJoined: data.first_joined };
}

async function setFirstJoined(userId, timestamp) {
  const { data } = await supabase.from('levels').select('first_joined').eq('user_id', userId).single();
  if (!data || !data.first_joined) {
    await supabase.from('levels').upsert(
      { user_id: userId, first_joined: timestamp },
      { onConflict: 'user_id' }
    );
  }
}

async function addXP(userId, amount) {
  const { data, error } = await supabase.from('levels').select('*').eq('user_id', userId).single();
  // PGRST116 = nessuna riga trovata (utente nuovo) — ok
  // Qualsiasi altro errore = problema Supabase → non sovrascrivere i dati
  if (error && error.code !== 'PGRST116') {
    console.error('addXP: errore lettura Supabase, skip per', userId, error.message);
    return { leveledUp: false, newLevel: 0 };
  }
  let xp    = (data?.xp ?? 0) + amount;
  let level = data?.level ?? 0;
  let leveledUp = false;
  let newLevel = level;

  while (xp >= xpForLevel(level + 1)) {
    xp -= xpForLevel(level + 1);
    level += 1;
    newLevel = level;
    leveledUp = true;
  }

  await supabase.from('levels').upsert({
    user_id: userId, xp, level,
    messages: data?.messages ?? 0,
    voice_minutes: data?.voice_minutes ?? 0,
  }, { onConflict: 'user_id' });

  return {
    user: { xp, level, messages: data?.messages ?? 0, voiceMinutes: data?.voice_minutes ?? 0 },
    leveledUp,
    newLevel,
  };
}

async function addMessage(userId) {
  await supabase.rpc('increment_messages', { p_user_id: userId });
}

async function addVoiceMinute(userId) {
  await supabase.rpc('increment_voice_minutes', { p_user_id: userId });
}

async function load() {
  const { data, error } = await supabase.from('levels').select('*');
  if (error) console.error('❌ Supabase load() error:', error.message);
  if (!data) return {};
  const result = {};
  for (const row of data) {
    result[row.user_id] = {
      xp: row.xp, level: row.level, messages: row.messages,
      voiceMinutes: row.voice_minutes, firstJoined: row.first_joined,
    };
  }
  return result;
}

function buildProgressBar(current, required) {
  const total = 20;
  const filled = Math.min(Math.floor((current / required) * total), total);
  return '▰'.repeat(filled) + '▱'.repeat(total - filled);
}

module.exports = { load, getUser, xpForLevel, randomXP, addXP, addMessage, addVoiceMinute, buildProgressBar, voiceSessions, setFirstJoined };
