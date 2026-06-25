import {
  createAudioResource,
  StreamType,
  type AudioResource,
} from "@discordjs/voice";
import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { PassThrough, Readable } from "node:stream";

import type { LocalAudioFile } from "./local-audio.js";
import { isWebmOpusAudio, type YouTubeAudio } from "../youtube/youtube-audio.js";

const ffmpegBinary = process.env.FFMPEG_BIN?.trim() || "ffmpeg";
const ffmpegOpenTimeoutMs = 15_000;
const ffmpegLogTailMaxLength = 4_000;

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

function getFfmpegReconnectArgs(): string[] {
  return [
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-reconnect_on_network_error",
    "1",
    "-reconnect_on_http_error",
    "4xx,5xx",
  ];
}

function getFfmpegOutputArgs(audio: YouTubeAudio): {
  args: string[];
  inputType: StreamType;
} {
  if (isWebmOpusAudio(audio)) {
    return {
      args: ["-vn", "-c:a", "copy", "-f", "webm", "pipe:1"],
      inputType: StreamType.WebmOpus,
    };
  }

  return {
    args: ["-vn", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"],
    inputType: StreamType.Raw,
  };
}

function buildFfmpegYouTubeArgs(audio: YouTubeAudio): {
  args: string[];
  inputType: StreamType;
} {
  const output = getFfmpegOutputArgs(audio);

  return {
    args: [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-nostdin",
      ...getFfmpegReconnectArgs(),
      "-user_agent",
      "Mozilla/5.0",
      "-i",
      audio.streamUrl,
      ...output.args,
    ],
    inputType: output.inputType,
  };
}

async function waitForFfmpegOutput(
  ffmpeg: ChildProcessWithoutNullStreams,
  output: PassThrough,
  title: string,
  readStderr: () => string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      rejectOnce(
        `FFmpeg demorou para abrir o stream do YouTube: ${title}. ${readStderr()}`,
      );
    }, ffmpegOpenTimeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      ffmpeg.off("error", onError);
      ffmpeg.off("close", onClose);
      ffmpeg.stdout.off("data", onFirstChunk);
    };

    const rejectOnce = (message: string) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      output.destroy();

      if (!ffmpeg.killed) {
        ffmpeg.kill("SIGTERM");
      }

      reject(new YouTubeStreamOpenError(message.trim()));
    };

    const onError = (error: Error) => {
      rejectOnce(`Falha ao iniciar FFmpeg para YouTube: ${error.message}`);
    };

    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      rejectOnce(
        `FFmpeg encerrou antes de produzir audio para ${title} ` +
        `(code ${code ?? "null"}, signal ${signal ?? "none"}). ${readStderr()}`,
      );
    };

    const onFirstChunk = (chunk: Buffer) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      output.write(chunk);
      ffmpeg.stdout.pipe(output);
      resolve();
    };

    ffmpeg.once("error", onError);
    ffmpeg.once("close", onClose);
    ffmpeg.stdout.once("data", onFirstChunk);
  });
}

async function createFfmpegYouTubeAudioResource(
  audio: YouTubeAudio,
  metadata: AudioResourceMetadata,
): Promise<AudioResource<AudioResourceMetadata>> {
  const { args, inputType } = buildFfmpegYouTubeArgs(audio);
  const ffmpeg = spawn(ffmpegBinary, args, {
    windowsHide: true,
  });
  const output = new PassThrough();
  let stderr = "";
  let stdoutEnded = false;

  ffmpeg.stdin.destroy();
  ffmpeg.stderr.setEncoding("utf8");
  ffmpeg.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-ffmpegLogTailMaxLength);
  });
  ffmpeg.stdout.once("end", () => {
    stdoutEnded = true;
  });
  ffmpeg.once("close", (code, signal) => {
    if ((code ?? 0) !== 0 && signal !== "SIGTERM") {
      console.warn(
        `FFmpeg YouTube stream exited for ${audio.title} ` +
        `(code ${code}, signal ${signal ?? "none"}): ${stderr.trim()}`,
      );
    }
  });
  output.once("close", () => {
    if (!stdoutEnded && !ffmpeg.killed) {
      ffmpeg.kill("SIGTERM");
    }
  });
  output.once("error", () => {
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGTERM");
    }
  });

  await waitForFfmpegOutput(ffmpeg, output, audio.title, () => stderr);

  return createAudioResource(output, {
    inputType,
    metadata,
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

  if (audio.mode === "video") {
    return createFfmpegYouTubeAudioResource(audio, metadata);
  }

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
