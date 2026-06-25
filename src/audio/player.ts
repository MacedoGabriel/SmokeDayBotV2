import {
  createAudioResource,
  StreamType,
  type AudioResource,
} from "@discordjs/voice";
import { Readable } from "node:stream";

import type { LocalAudioFile } from "./local-audio.js";
import { isWebmOpusAudio, type YouTubeAudio } from "../youtube/youtube-audio.js";

export type AudioResourceMetadata = {
  name: string;
  path: string;
  source: "local" | "youtube" | "live";
  durationSeconds?: number;
};

export class YouTubeStreamOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeStreamOpenError";
  }
}

export function createLocalAudioResource(
  audioFile: LocalAudioFile,
): AudioResource<AudioResourceMetadata> {
  return createAudioResource(audioFile.path, {
    metadata: {
      name: audioFile.name,
      path: audioFile.path,
      source: "local",
    },
  });
}

export async function createYouTubeAudioResource(
  audio: YouTubeAudio,
): Promise<AudioResource<AudioResourceMetadata>> {
  const metadata: AudioResourceMetadata = {
    name: audio.title,
    path: audio.pageUrl,
    source: audio.mode === "live" ? "live" : "youtube",
    durationSeconds: audio.durationSeconds,
  };

  if (isWebmOpusAudio(audio)) {
    const response = await fetch(audio.streamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok || !response.body) {
      throw new YouTubeStreamOpenError(
        `Falha ao abrir stream do YouTube: HTTP ${response.status}`,
      );
    }

    const stream = Readable.fromWeb(
      response.body as Parameters<typeof Readable.fromWeb>[0],
    );

    return createAudioResource(stream, {
      inputType: StreamType.WebmOpus,
      metadata,
    });
  }

  const response = await fetch(audio.streamUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new YouTubeStreamOpenError(
      `Falha ao abrir stream do YouTube: HTTP ${response.status}`,
    );
  }

  await response.body?.cancel();

  return createAudioResource(audio.streamUrl, {
    metadata,
  });
}
