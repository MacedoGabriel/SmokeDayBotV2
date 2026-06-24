import { SlashCommandBuilder } from "discord.js";

import {
  connectToVoiceChannel,
  getMemberVoiceChannel,
} from "../voice/connection.js";
import { getPlaybackManager } from "../playback/manager.js";
import type { BotCommand } from "./types.js";

export const joinCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Entra no seu canal de voz."),
  async execute(interaction) {
    const voiceChannelResult = getMemberVoiceChannel(interaction);

    if (!voiceChannelResult.ok) {
      await interaction.reply({
        content: voiceChannelResult.message,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const connection = await connectToVoiceChannel(voiceChannelResult.channel);
    getPlaybackManager(voiceChannelResult.channel.guild.id).setConnection(connection);

    await interaction.editReply(`Entrei em ${voiceChannelResult.channel}.`);
  },
};
