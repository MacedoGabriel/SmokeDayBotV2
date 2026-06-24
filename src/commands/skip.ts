import { getVoiceConnection } from "@discordjs/voice";
import { SlashCommandBuilder } from "discord.js";

import { findPlaybackManager } from "../playback/manager.js";
import type { BotCommand } from "./types.js";

export const skipCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Pula para a proxima faixa da fila."),
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

    const manager = findPlaybackManager(interaction.guildId);

    if (!manager) {
      await interaction.reply({
        content: "Nao ha nenhum audio tocando agora.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const result = await manager.skip();

    if (result.nextTrack) {
      await interaction.editReply(`Pulando. Tocando \`${result.nextTrack.title}\`.`);
      return;
    }

    if (result.skipped) {
      await interaction.editReply("Audio pulado. Fila vazia.");
      return;
    }

    await interaction.editReply("Nao ha nenhum audio tocando agora.");
  },
};
