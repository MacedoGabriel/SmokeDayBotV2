import {
  entersState,
  joinVoiceChannel,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import {
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type VoiceBasedChannel,
} from "discord.js";

const voiceConnectionTimeoutMs = 15_000;

type VoiceChannelResult =
  | {
      ok: true;
      channel: VoiceBasedChannel;
    }
  | {
      ok: false;
      message: string;
    };

export function getMemberVoiceChannel(
  interaction: ChatInputCommandInteraction,
): VoiceChannelResult {
  if (!interaction.inCachedGuild()) {
    return {
      ok: false,
      message: "Use este comando dentro de um servidor.",
    };
  }

  const voiceChannel = interaction.member.voice.channel;

  if (!voiceChannel) {
    return {
      ok: false,
      message: "Entre em um canal de voz primeiro.",
    };
  }

  if (voiceChannel.type !== ChannelType.GuildVoice) {
    return {
      ok: false,
      message: "Por enquanto eu so consigo entrar em canais de voz comuns.",
    };
  }

  const permissions = voiceChannel.permissionsFor(interaction.client.user);

  if (!permissions?.has(PermissionFlagsBits.Connect)) {
    return {
      ok: false,
      message: "Nao tenho permissao para conectar nesse canal de voz.",
    };
  }

  if (!permissions.has(PermissionFlagsBits.Speak)) {
    return {
      ok: false,
      message: "Nao tenho permissao para falar nesse canal de voz.",
    };
  }

  return {
    ok: true,
    channel: voiceChannel,
  };
}

export async function connectToVoiceChannel(
  voiceChannel: VoiceBasedChannel,
): Promise<VoiceConnection> {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  try {
    await entersState(
      connection,
      VoiceConnectionStatus.Ready,
      voiceConnectionTimeoutMs,
    );
  } catch (error) {
    connection.destroy();
    throw error;
  }

  return connection;
}
