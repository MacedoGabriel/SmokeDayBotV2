import { getVoiceConnection } from "@discordjs/voice";
import { SlashCommandBuilder } from "discord.js";

import { destroyPlaybackManager } from "../playback/manager.js";
import type { BotCommand } from "./types.js";

export const leaveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Sai do canal de voz."),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "Use este comando dentro de um servidor.",
        ephemeral: true,
      });
      return;
    }

    const connection = getVoiceConnection(interaction.guildId);

    if (!connection) {
      await interaction.reply({
        content: "Nao estou conectado a nenhum canal de voz neste servidor.",
        ephemeral: true,
      });
      return;
    }

    const managerDestroyed = destroyPlaybackManager(interaction.guildId);

    if (!managerDestroyed) {
      connection.destroy();
    }

    await interaction.reply("Sai do canal de voz.");
  },
};
