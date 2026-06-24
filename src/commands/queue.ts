import { SlashCommandBuilder } from "discord.js";

import {
  findPlaybackManager,
  type PlaybackSnapshot,
  type PlaybackTrack,
} from "../playback/manager.js";
import type { BotCommand } from "./types.js";

const maxVisibleTracks = 10;
const maxTitleLength = 80;

function formatTitle(title: string): string {
  if (title.length <= maxTitleLength) {
    return title;
  }

  return `${title.slice(0, maxTitleLength - 3)}...`;
}

function formatRequestedBy(track: PlaybackTrack): string {
  return track.requestedBy ? ` - <@${track.requestedBy}>` : "";
}

function formatTrack(track: PlaybackTrack, index?: number): string {
  const prefix = index === undefined ? "" : `${index}. `;
  return `${prefix}\`${formatTitle(track.title)}\`${formatRequestedBy(track)}`;
}

function formatQueue(snapshot: PlaybackSnapshot): string {
  const lines: string[] = [];

  if (snapshot.currentTrack) {
    lines.push(`Agora: ${formatTrack(snapshot.currentTrack)}`);
  } else {
    lines.push("Agora: nada tocando.");
  }

  if (snapshot.queue.length === 0) {
    lines.push("Fila: vazia.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("Proximas:");

  for (const [index, track] of snapshot.queue
    .slice(0, maxVisibleTracks)
    .entries()) {
    lines.push(formatTrack(track, index + 1));
  }

  const hiddenCount = snapshot.queue.length - maxVisibleTracks;

  if (hiddenCount > 0) {
    lines.push(`...e mais ${hiddenCount} faixa(s).`);
  }

  return lines.join("\n");
}

export const queueCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Mostra a fila de reproducao."),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "Use este comando dentro de um servidor.",
        ephemeral: true,
      });
      return;
    }

    const manager = findPlaybackManager(interaction.guildId);

    if (!manager) {
      await interaction.reply("Agora: nada tocando.\nFila: vazia.");
      return;
    }

    await interaction.reply(formatQueue(manager.getSnapshot()));
  },
};
