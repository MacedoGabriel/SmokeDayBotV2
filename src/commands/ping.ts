import { SlashCommandBuilder } from "discord.js";

import type { BotCommand } from "./types.js";

export const pingCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Verifica se o bot esta online."),
  async execute(interaction) {
    await interaction.reply(
      `Pong! Latencia do WebSocket: ${interaction.client.ws.ping}ms`,
    );
  },
};
