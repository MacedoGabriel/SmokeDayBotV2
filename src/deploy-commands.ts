import { REST, Routes } from "discord.js";

import { commandPayloads } from "./commands/index.js";
import { config, requireEnv } from "./config.js";

const clientId = config.clientId || requireEnv("CLIENT_ID");

const rest = new REST({ version: "10" }).setToken(config.discordToken);

try {
  if (config.commandDeployScope === "global") {
    console.log(`Deploying ${commandPayloads.length} global command(s)...`);

    await rest.put(Routes.applicationCommands(clientId), {
      body: commandPayloads,
    });

    console.log("Global commands deployed successfully.");
  } else {
    if (config.guildIds.length === 0) {
      throw new Error(
        "Set GUILD_IDS with one or more guild IDs, or set COMMAND_DEPLOY_SCOPE=global.",
      );
    }

    for (const guildId of config.guildIds) {
      console.log(
        `Deploying ${commandPayloads.length} command(s) to guild ${guildId}...`,
      );

      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandPayloads,
      });
    }

    console.log("Guild commands deployed successfully.");
  }
} catch (error) {
  console.error("Failed to deploy commands:", error);
  process.exit(1);
}
