require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  console.log('Rimozione comandi globali...');
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
  console.log('Rimozione comandi del server...');
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
  console.log('✅ Tutti i comandi rimossi!');
})();
