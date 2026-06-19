const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const BULK_LIMIT   = 100;
const MAX_AGE_BULK = 14 * 24 * 60 * 60 * 1000; // 14 giorni in ms (limite Discord per bulkDelete)

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Elimina messaggi dal canale')
    .addStringOption(o => o
      .setName('quantità')
      .setDescription('Numero di messaggi da eliminare (1-500), oppure ALL per eliminare tutto')
      .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const input = interaction.options.getString('quantità').trim();
    const isAll = input.toUpperCase() === 'ALL';
    const amount = isAll ? null : parseInt(input);

    if (!isAll && (isNaN(amount) || amount < 1 || amount > 500))
      return interaction.reply({ content: '❌ Inserisci un numero tra **1** e **500**, oppure **ALL**.', flags: 64 });

    await interaction.deferReply({ flags: 64 });

    const channel = interaction.channel;
    let deleted = 0;

    async function deleteBatch(messages) {
      const now = Date.now();
      const bulk = messages.filter(m => now - m.createdTimestamp < MAX_AGE_BULK);
      const old  = messages.filter(m => now - m.createdTimestamp >= MAX_AGE_BULK);

      if (bulk.size >= 2) {
        const res = await channel.bulkDelete(bulk, true).catch(() => null);
        deleted += res?.size ?? 0;
      } else if (bulk.size === 1) {
        await bulk.first().delete().catch(() => {});
        deleted++;
      }

      for (const msg of old.values()) {
        await msg.delete().catch(() => {});
        deleted++;
        // Rispetta il rate-limit di Discord per delete singole
        await new Promise(r => setTimeout(r, 1100));
      }
    }

    if (isAll) {
      let keepGoing = true;
      while (keepGoing) {
        const fetched = await channel.messages.fetch({ limit: BULK_LIMIT }).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        await deleteBatch(fetched);
        if (fetched.size < BULK_LIMIT) keepGoing = false;
      }
    } else {
      let remaining = amount;
      while (remaining > 0) {
        const limit   = Math.min(remaining, BULK_LIMIT);
        const fetched = await channel.messages.fetch({ limit }).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        await deleteBatch(fetched);
        remaining -= fetched.size;
        if (fetched.size < limit) break;
      }
    }

    await interaction.editReply({ content: `✅ Eliminati **${deleted}** messaggi.` });
  },
};
