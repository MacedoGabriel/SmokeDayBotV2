import { SlashCommandBuilder } from "discord.js";

import {
  connectToVoiceChannel,
  getMemberVoiceChannel,
} from "../voice/connection.js";
import { getPlaybackManager } from "../playback/manager.js";
import { isYouTubeUrl } from "../youtube/youtube-audio.js";
import type { BotCommand } from "./types.js";

export const liveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("live")
    .setDescription("Toca uma live do YouTube.")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Link da live do YouTube.")
        .setRequired(true),
    ),
  async execute(interaction) {
    const youtubeUrl = interaction.options.getString("url", true).trim();

    if (!isYouTubeUrl(youtubeUrl)) {
      await interaction.reply({
        content: "Informe uma URL valida do YouTube.",
        ephemeral: true,
      });
      return;
    }

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
    const manager = getPlaybackManager(voiceChannelResult.channel.guild.id);
    const result = await manager.playNowYouTube(
      connection,
      youtubeUrl,
      "live",
      interaction.user.id,
    );
    const retrySuffix = result.attempts && result.attempts > 1
      ? " apos renovar o stream"
      : "";

    await interaction.editReply(
      `Transmitindo \`${result.track.title}\` em ${voiceChannelResult.channel}${retrySuffix}.`,
    );
  },
};
