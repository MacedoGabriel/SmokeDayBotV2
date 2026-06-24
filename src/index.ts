import { Client, Events, GatewayIntentBits } from "discord.js";

import { YouTubeStreamOpenError } from "./audio/player.js";
import { commandsByName } from "./commands/index.js";
import { config } from "./config.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded commands: ${[...commandsByName.keys()].join(", ")}`);
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandsByName.get(interaction.commandName);

  if (!command) {
    await interaction.reply({
      content: "Comando desconhecido.",
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Failed to execute /${interaction.commandName}:`, error);

    const response = {
      content:
        error instanceof YouTubeStreamOpenError
          ? "Nao consegui abrir o stream do YouTube. Tente novamente em alguns segundos."
          : "Erro ao executar o comando.",
      ephemeral: true,
    };

    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(response.content);
    } else if (interaction.replied) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  client.destroy();
  process.exit(0);
});

try {
  await client.login(config.discordToken);
} catch (error) {
  console.error("Failed to log in to Discord:", error);
  process.exit(1);
}
