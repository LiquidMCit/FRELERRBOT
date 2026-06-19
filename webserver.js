require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const session    = require('express-session');
const { spawn }  = require('child_process');
const path       = require('path');
const { fetch }  = require('undici');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
const PORT   = process.env.WEB_PORT || 4000;

const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN     = process.env.DISCORD_TOKEN;
const GUILD_ID      = process.env.GUILD_ID;
const REDIRECT_URI  = process.env.WEB_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;

let botProcess = null;

function botStatus() {
  return botProcess && !botProcess.killed ? 'online' : 'offline';
}

app.use(express.json());
app.use(session({
  secret: process.env.WEB_SESSION_SECRET || 'frelerr_secret_xk92',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, 'web')));

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ ok: false, message: 'Non autenticato.' });
}

// ── Discord OAuth2 ───────────────────────────────────────────────────
app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/login.html?error=1');

  try {
    // Scambia codice per access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/login.html?error=2');

    // Dati utente Discord
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // Verifica che l'utente sia nel server
    const memberRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${user.id}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (memberRes.status !== 200) return res.redirect('/login.html?error=3');

    req.session.user = {
      id:       user.id,
      username: user.global_name || user.username,
      avatar:   user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/0.png`,
    };

    res.redirect('/');
  } catch (err) {
    console.error('[auth] Errore OAuth:', err.message);
    res.redirect('/login.html?error=4');
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── API ──────────────────────────────────────────────────────────────
app.get('/api/status', requireAuth, (req, res) => {
  res.json({ status: botStatus(), user: req.session.user });
});

app.post('/api/start', requireAuth, (req, res) => {
  if (botStatus() === 'online') return res.json({ ok: false, message: 'Bot già online.' });

  botProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });

  botProcess.on('exit', (code) => {
    console.log(`[webserver] Bot terminato (exit ${code})`);
    botProcess = null;
    io.emit('status', 'offline');
  });

  botProcess.on('error', (err) => {
    console.error('[webserver] Errore avvio bot:', err.message);
    botProcess = null;
    io.emit('status', 'offline');
  });

  setTimeout(() => io.emit('status', botStatus()), 1500);
  res.json({ ok: true });
});

// ── Socket.io ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('status', botStatus());
});

server.listen(PORT, () => {
  console.log(`🌐 Webserver avviato su http://localhost:${PORT}`);
});
