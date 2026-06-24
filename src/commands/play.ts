import { SlashCommandBuilder } from "discord.js";

import {
  findLocalAudioFile,
  formatAudioFileList,
  listLocalAudioFiles,
} from "../audio/local-audio.js";
import { getPlaybackManager } from "../playback/manager.js";
import {
  connectToVoiceChannel,
  getMemberVoiceChannel,
} from "../voice/connection.js";
import { isYouTubeUrl } from "../youtube/youtube-audio.js";
import type { BotCommand } from "./types.js";

const maxListedFiles = 10;

export const playCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Toca um link do YouTube ou um arquivo local.")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Link do YouTube.")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("arquivo")
        .setDescription("Nome do arquivo em assets/audio.")
        .setRequired(false),
    ),
  async execute(interaction) {
    const youtubeUrl = interaction.options.getString("url")?.trim() ?? "";
    const requestedFile = interaction.options.getString("arquivo")?.trim() ?? "";

    if (youtubeUrl && requestedFile) {
      await interaction.reply({
        content: "Use apenas `url` ou `arquivo`, nao os dois ao mesmo tempo.",
        ephemeral: true,
      });
      return;
    }

    if (youtubeUrl && !isYouTubeUrl(youtubeUrl)) {
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

    if (youtubeUrl) {
      await interaction.deferReply();

      const connection = await connectToVoiceChannel(voiceChannelResult.channel);
      const manager = getPlaybackManager(voiceChannelResult.channel.guild.id);
      const result = await manager.playOrQueueYouTube(
        connection,
        youtubeUrl,
        interaction.user.id,
      );

      if (result.status === "queued") {
        await interaction.editReply(
          `Adicionado a fila (#${result.position}): \`${result.track.title}\`.`,
        );
        return;
      }

      const retrySuffix = result.attempts && result.attempts > 1
        ? " apos renovar o stream"
        : "";

      await interaction.editReply(
        `Tocando \`${result.track.title}\` em ${voiceChannelResult.channel}${retrySuffix}.`,
      );
      return;
    }

    const files = await listLocalAudioFiles();

    if (files.length === 0) {
      await interaction.reply({
        content: "Nao encontrei audios em `assets/audio`.",
        ephemeral: true,
      });
      return;
    }

    if (!requestedFile && files.length > 1) {
      await interaction.reply({
        content: `Escolha um arquivo: ${formatAudioFileList(files.slice(0, maxListedFiles))}`,
        ephemeral: true,
      });
      return;
    }

    const audioFile = requestedFile
      ? findLocalAudioFile(files, requestedFile)
      : files[0];

    if (!audioFile) {
      await interaction.reply({
        content: `Nao encontrei esse arquivo. Disponiveis: ${formatAudioFileList(files.slice(0, maxListedFiles))}`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const connection = await connectToVoiceChannel(voiceChannelResult.channel);
    const manager = getPlaybackManager(voiceChannelResult.channel.guild.id);
    const result = manager.playOrQueueLocal(
      connection,
      audioFile,
      interaction.user.id,
    );

    if (result.status === "queued") {
      await interaction.editReply(
        `Adicionado a fila (#${result.position}): \`${result.track.title}\`.`,
      );
      return;
    }

    await interaction.editReply(`Tocando \`${result.track.title}\` em ${voiceChannelResult.channel}.`);
  },
};
