import { getVoiceConnection } from "@discordjs/voice";
import { SlashCommandBuilder } from "discord.js";

import { findPlaybackManager } from "../playback/manager.js";
import type { BotCommand } from "./types.js";

export const stopCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Para o audio atual sem sair do canal de voz."),
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
    const snapshot = manager?.getSnapshot();
    const queuedCount = snapshot?.queue.length ?? 0;
    const stopped = manager?.stop(true) ?? false;

    if (!stopped && queuedCount === 0) {
      await interaction.reply({
        content: "Nao ha nenhum audio tocando agora.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply(
      queuedCount > 0 ? "Audio parado e fila limpa." : "Audio parado.",
    );
  },
};
