require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();
const slashPath = path.join(__dirname, 'commands/slash');
for (const file of fs.readdirSync(slashPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(slashPath, file));
  client.commands.set(command.data.name, command);
}

const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  const method = event.once ? 'once' : 'on';
  client[method](event.name, (...args) => event.execute(...args, client));
}

client.login(process.env.DISCORD_TOKEN);
