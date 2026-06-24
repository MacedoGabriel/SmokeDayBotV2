import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ytDlpBinary = process.env.YT_DLP_BIN?.trim() || "yt-dlp";
const ytDlpCookiesFile = process.env.YT_DLP_COOKIES_FILE?.trim();
const youtubeVideoAudioFormat = "bestaudio[acodec=opus][ext=webm]/bestaudio";
const youtubeLiveAudioFormat = "bestaudio/best";
const resolveTimeoutMs = 45_000;
const maxBufferBytes = 1024 * 1024 * 4;

const youtubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export type YouTubeAudio = {
  title: string;
  pageUrl: string;
  streamUrl: string;
  extension: string;
  audioCodec: string;
  isLive: boolean;
  mode: YouTubeAudioMode;
};

export type YouTubeAudioMode = "video" | "live";

function parseYouTubeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }

    if (!youtubeHosts.has(url.hostname.toLowerCase())) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function readYtDlpError(error: unknown): string {
  if (error instanceof Error) {
    const maybeExecError = error as Error & {
      stderr?: string;
      stdout?: string;
    };

    return (
      maybeExecError.stderr?.trim() ||
      maybeExecError.stdout?.trim() ||
      error.message
    );
  }

  return String(error);
}

function buildYtDlpAuthArgs(): string[] {
  return ytDlpCookiesFile ? ["--cookies", ytDlpCookiesFile] : [];
}

function isYtDlpAuthChallenge(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("sign in to confirm") ||
    normalizedMessage.includes("not a bot") ||
    normalizedMessage.includes("--cookies-from-browser") ||
    normalizedMessage.includes("--cookies")
  );
}

export function isYouTubeUrl(value: string): boolean {
  return parseYouTubeUrl(value) !== undefined;
}

export function isWebmOpusAudio(audio: YouTubeAudio): boolean {
  return (
    audio.extension.toLowerCase() === "webm" &&
    audio.audioCodec.toLowerCase().includes("opus")
  );
}

function getAudioFormat(mode: YouTubeAudioMode): string {
  return mode === "live" ? youtubeLiveAudioFormat : youtubeVideoAudioFormat;
}

function parseYtDlpBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

export async function resolveYouTubeAudio(
  value: string,
  mode: YouTubeAudioMode = "video",
): Promise<YouTubeAudio> {
  const pageUrl = parseYouTubeUrl(value);

  if (!pageUrl) {
    throw new Error("Informe uma URL valida do YouTube.");
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      ytDlpBinary,
      [
        "--js-runtimes",
        "node",
        "--no-playlist",
        "--no-warnings",
        ...buildYtDlpAuthArgs(),
        "-f",
        getAudioFormat(mode),
        "--print",
        "title",
        "--print",
        "urls",
        "--print",
        "ext",
        "--print",
        "acodec",
        "--print",
        "is_live",
        pageUrl,
      ],
      {
        timeout: resolveTimeoutMs,
        maxBuffer: maxBufferBytes,
      },
    );

    if (stderr.trim()) {
      console.warn("yt-dlp:", stderr.trim());
    }

    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const [title, streamUrl, extension, audioCodec, isLive] = lines;

    if (!title || !streamUrl?.startsWith("http")) {
      throw new Error("Nao consegui obter o stream de audio do YouTube.");
    }

    return {
      title,
      pageUrl,
      streamUrl,
      extension: extension || "unknown",
      audioCodec: audioCodec || "unknown",
      isLive: parseYtDlpBoolean(isLive),
      mode,
    };
  } catch (error) {
    const ytDlpError = readYtDlpError(error);

    if (isYtDlpAuthChallenge(ytDlpError) && !ytDlpCookiesFile) {
      throw new Error(
        `Falha ao resolver audio do YouTube: o YouTube pediu autenticacao/cookies neste servidor. Configure YT_DLP_COOKIES_FILE no .env e reinicie o bot. Detalhes: ${ytDlpError}`,
      );
    }

    if (isYtDlpAuthChallenge(ytDlpError)) {
      throw new Error(
        `Falha ao resolver audio do YouTube: os cookies configurados em YT_DLP_COOKIES_FILE nao foram aceitos pelo YouTube. Gere um arquivo novo e reinicie o bot. Detalhes: ${ytDlpError}`,
      );
    }

    throw new Error(`Falha ao resolver audio do YouTube: ${ytDlpError}`);
  }
}
