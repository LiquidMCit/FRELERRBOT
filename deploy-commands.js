require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const slashPath = path.join(__dirname, 'commands/slash');
for (const file of fs.readdirSync(slashPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(slashPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  console.log('Registrando comandi slash...');
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✅ Comandi registrati!');
})();
