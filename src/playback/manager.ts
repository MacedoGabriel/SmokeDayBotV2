import {
  AudioPlayerStatus,
  createAudioPlayer,
  NoSubscriberBehavior,
  type AudioPlayer,
  type AudioPlayerState,
  type VoiceConnection,
} from "@discordjs/voice";
import { randomUUID } from "node:crypto";

import type { LocalAudioFile } from "../audio/local-audio.js";
import {
  type AudioResourceMetadata,
  createLocalAudioResource,
  createYouTubeAudioResource,
  YouTubeStreamOpenError,
} from "../audio/player.js";
import {
  resolveYouTubeAudio,
  type YouTubeAudio,
  type YouTubeAudioMode,
} from "../youtube/youtube-audio.js";

const maxPlayAttempts = 2;
const maxUnexpectedIdleRetries = 1;
const unexpectedIdleMinDurationMs = 60_000;
const unexpectedIdlePlaybackLimitMs = 30_000;

type PlaybackStats = {
  playbackDurationMs?: number;
  expectedDurationMs?: number;
};

function getPlaybackStats(state: AudioPlayerState): PlaybackStats {
  if (!("resource" in state)) {
    return {};
  }

  const resource = state.resource as {
    playbackDuration?: number;
    metadata?: AudioResourceMetadata;
  };

  return {
    playbackDurationMs: resource.playbackDuration,
    expectedDurationMs: resource.metadata?.durationSeconds
      ? resource.metadata.durationSeconds * 1000
      : undefined,
  };
}

function formatDurationMs(value: number | undefined): string {
  if (value === undefined) {
    return "unknown";
  }

  return `${Math.round(value / 1000)}s`;
}

export type PlaybackTrackSource = "local" | "youtube" | "live";

export type PlaybackTrack = {
  id: string;
  source: PlaybackTrackSource;
  title: string;
  requestedBy?: string;
  url?: string;
  fileName?: string;
  filePath?: string;
};

export type PlayNowResult = {
  status: "playing";
  track: PlaybackTrack;
  attempts?: number;
};

export type QueueResult = {
  status: "queued";
  track: PlaybackTrack;
  position: number;
};

export type PlayOrQueueResult = PlayNowResult | QueueResult;

export type SkipResult = {
  skipped: boolean;
  nextTrack?: PlaybackTrack;
};

export type PlaybackSnapshot = {
  guildId: string;
  status: AudioPlayerStatus;
  currentTrack?: PlaybackTrack;
  queue: PlaybackTrack[];
};

export class PlaybackManager {
  private readonly player: AudioPlayer;
  private connection?: VoiceConnection;
  private currentTrack?: PlaybackTrack;
  private readonly queue: PlaybackTrack[] = [];
  private readonly unexpectedIdleRetries = new Map<string, number>();
  private isAdvancing = false;

  constructor(private readonly guildId: string) {
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Stop,
      },
    });

    this.player.on(AudioPlayerStatus.Idle, (oldState) => {
      const finishedTrack = this.currentTrack;
      const stats = getPlaybackStats(oldState);

      if (finishedTrack) {
        console.log(
          `Audio player idle for guild ${this.guildId}: ${finishedTrack.title} ` +
          `(played ${formatDurationMs(stats.playbackDurationMs)} of ${formatDurationMs(stats.expectedDurationMs)})`,
        );
      } else {
        console.log(`Audio player idle for guild ${this.guildId}`);
      }

      if (finishedTrack && this.shouldRetryUnexpectedIdle(finishedTrack, stats)) {
        void this.retryTrackAfterUnexpectedIdle(finishedTrack, stats);
        return;
      }

      if (finishedTrack) {
        this.unexpectedIdleRetries.delete(finishedTrack.id);
      }

      this.currentTrack = undefined;
      void this.playNextFromQueue();
    });

    this.player.on("error", (error) => {
      console.error(`Audio player error for guild ${this.guildId}:`, error);
      this.currentTrack = undefined;
      void this.playNextFromQueue();
    });
  }

  setConnection(connection: VoiceConnection): void {
    this.connection = connection;
    this.connection.subscribe(this.player);
  }

  playOrQueueLocal(
    connection: VoiceConnection,
    audioFile: LocalAudioFile,
    requestedBy?: string,
  ): PlayOrQueueResult {
    this.setConnection(connection);

    const track = this.createLocalTrack(audioFile, requestedBy);

    if (this.isBusy()) {
      return {
        status: "queued",
        track,
        position: this.enqueue(track),
      };
    }

    this.playLocalTrack(track);

    return {
      status: "playing",
      track,
    };
  }

  async playOrQueueYouTube(
    connection: VoiceConnection,
    pageUrl: string,
    requestedBy?: string,
  ): Promise<PlayOrQueueResult> {
    this.setConnection(connection);

    const track = this.createYouTubeTrack(pageUrl, "video", requestedBy);

    if (this.isBusy()) {
      return {
        status: "queued",
        track,
        position: this.enqueue(track),
      };
    }

    const result = await this.playYouTubeTrack(track, "video");

    return {
      status: "playing",
      track: result.track,
      attempts: result.attempts,
    };
  }

  async playNowYouTube(
    connection: VoiceConnection,
    pageUrl: string,
    mode: YouTubeAudioMode = "video",
    requestedBy?: string,
  ): Promise<PlayNowResult> {
    this.setConnection(connection);

    const track = this.createYouTubeTrack(pageUrl, mode, requestedBy);
    const result = await this.playYouTubeTrack(track, mode);

    return {
      status: "playing",
      track: result.track,
      attempts: result.attempts,
    };
  }

  async skip(): Promise<SkipResult> {
    const skipped = this.isBusy();

    if (this.queue.length === 0) {
      this.currentTrack = undefined;
      this.player.stop(true);

      return {
        skipped,
      };
    }

    const nextTrack = await this.playNextFromQueue();

    return {
      skipped,
      nextTrack,
    };
  }

  stop(clearQueue = true): boolean {
    const wasPlaying = this.isBusy();

    if (this.currentTrack) {
      this.unexpectedIdleRetries.delete(this.currentTrack.id);
    }

    this.currentTrack = undefined;

    if (clearQueue) {
      this.clearQueue();
    }

    this.player.stop(true);

    return wasPlaying;
  }

  destroy(): void {
    this.clearQueue();
    this.unexpectedIdleRetries.clear();
    this.stop(false);

    if (!this.connection) {
      return;
    }

    try {
      this.connection.destroy();
    } catch (error) {
      console.warn(`Voice connection already destroyed for guild ${this.guildId}:`, error);
    } finally {
      this.connection = undefined;
    }
  }

  enqueue(track: PlaybackTrack): number {
    this.queue.push(track);
    return this.queue.length;
  }

  clearQueue(): void {
    this.queue.length = 0;
  }

  getSnapshot(): PlaybackSnapshot {
    return {
      guildId: this.guildId,
      status: this.player.state.status,
      currentTrack: this.currentTrack,
      queue: [...this.queue],
    };
  }

  private isBusy(): boolean {
    return (
      this.isAdvancing ||
      this.currentTrack !== undefined ||
      this.player.state.status !== AudioPlayerStatus.Idle
    );
  }

  private createLocalTrack(
    audioFile: LocalAudioFile,
    requestedBy?: string,
  ): PlaybackTrack {
    return {
      id: randomUUID(),
      source: "local",
      title: audioFile.name,
      requestedBy,
      fileName: audioFile.name,
      filePath: audioFile.path,
    };
  }

  private createYouTubeTrack(
    pageUrl: string,
    mode: YouTubeAudioMode,
    requestedBy?: string,
  ): PlaybackTrack {
    return {
      id: randomUUID(),
      source: mode === "live" ? "live" : "youtube",
      title: mode === "live" ? "Live do YouTube" : "Video do YouTube",
      requestedBy,
      url: pageUrl,
    };
  }

  private playLocalTrack(track: PlaybackTrack): PlaybackTrack {
    if (!track.fileName || !track.filePath) {
      throw new Error("Faixa local invalida.");
    }

    const resource = createLocalAudioResource({
      name: track.fileName,
      path: track.filePath,
    });

    this.currentTrack = track;
    this.player.play(resource);

    return track;
  }

  private async playYouTubeTrack(
    track: PlaybackTrack,
    mode: YouTubeAudioMode,
  ): Promise<{ track: PlaybackTrack; audio: YouTubeAudio; attempts: number }> {
    if (!track.url) {
      throw new Error("Faixa do YouTube invalida.");
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxPlayAttempts; attempt += 1) {
      const audio = await resolveYouTubeAudio(track.url, mode);

      try {
        const resource = await createYouTubeAudioResource(audio);
        const resolvedTrack: PlaybackTrack = {
          ...track,
          source: mode === "live" ? "live" : "youtube",
          title: audio.title,
          url: audio.pageUrl,
        };

        this.currentTrack = resolvedTrack;
        this.player.play(resource);

        if (attempt > 1) {
          console.log(
            `YouTube ${mode} stream succeeded after retry: ${audio.title} (${attempt} attempts)`,
          );
        }

        return {
          track: resolvedTrack,
          audio,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error;

        if (error instanceof YouTubeStreamOpenError && attempt < maxPlayAttempts) {
          console.warn(
            `YouTube stream open failed on attempt ${attempt}; resolving a fresh stream URL...`,
            error.message,
          );
          continue;
        }

        throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Falha ao tocar audio do YouTube.");
  }

  private async playTrack(track: PlaybackTrack): Promise<PlaybackTrack> {
    if (track.source === "local") {
      return this.playLocalTrack(track);
    }

    const result = await this.playYouTubeTrack(
      track,
      track.source === "live" ? "live" : "video",
    );

    return result.track;
  }

  private shouldRetryUnexpectedIdle(
    track: PlaybackTrack,
    stats: PlaybackStats,
  ): boolean {
    if (track.source !== "youtube" || !this.connection) {
      return false;
    }

    if (
      !stats.playbackDurationMs ||
      !stats.expectedDurationMs ||
      stats.expectedDurationMs < unexpectedIdleMinDurationMs
    ) {
      return false;
    }

    const retryCount = this.unexpectedIdleRetries.get(track.id) ?? 0;

    if (retryCount >= maxUnexpectedIdleRetries) {
      return false;
    }

    const earlyPlaybackLimitMs = Math.min(
      unexpectedIdlePlaybackLimitMs,
      stats.expectedDurationMs * 0.25,
    );

    return stats.playbackDurationMs < earlyPlaybackLimitMs;
  }

  private async retryTrackAfterUnexpectedIdle(
    track: PlaybackTrack,
    stats: PlaybackStats,
  ): Promise<void> {
    const retryCount = (this.unexpectedIdleRetries.get(track.id) ?? 0) + 1;
    this.unexpectedIdleRetries.set(track.id, retryCount);

    console.warn(
      `YouTube stream ended early for guild ${this.guildId}: ${track.title} ` +
      `(played ${formatDurationMs(stats.playbackDurationMs)} of ${formatDurationMs(stats.expectedDurationMs)}). ` +
      `Refreshing stream (${retryCount}/${maxUnexpectedIdleRetries})...`,
    );

    this.currentTrack = undefined;
    this.isAdvancing = true;

    let shouldAdvanceQueue = false;

    try {
      const restartedTrack = await this.playTrack(track);
      console.log(
        `Restarted YouTube track for guild ${this.guildId}: ${restartedTrack.title}`,
      );
    } catch (error) {
      console.error(
        `Failed to restart early-ended YouTube track for guild ${this.guildId}:`,
        error,
      );
      this.currentTrack = undefined;
      this.unexpectedIdleRetries.delete(track.id);
      shouldAdvanceQueue = true;
    } finally {
      this.isAdvancing = false;
    }

    if (shouldAdvanceQueue) {
      void this.playNextFromQueue();
    }
  }

  private async playNextFromQueue(): Promise<PlaybackTrack | undefined> {
    if (this.isAdvancing || !this.connection) {
      return undefined;
    }

    this.isAdvancing = true;

    try {
      while (this.queue.length > 0) {
        const nextTrack = this.queue.shift();

        if (!nextTrack) {
          return undefined;
        }

        try {
          const startedTrack = await this.playTrack(nextTrack);
          console.log(`Started queued track for guild ${this.guildId}: ${startedTrack.title}`);
          return startedTrack;
        } catch (error) {
          console.error(`Failed to start queued track for guild ${this.guildId}:`, error);
          this.currentTrack = undefined;
        }
      }

      return undefined;
    } finally {
      this.isAdvancing = false;
    }
  }
}

const managers = new Map<string, PlaybackManager>();

export function getPlaybackManager(guildId: string): PlaybackManager {
  const existingManager = managers.get(guildId);

  if (existingManager) {
    return existingManager;
  }

  const manager = new PlaybackManager(guildId);
  managers.set(guildId, manager);

  return manager;
}

export function findPlaybackManager(guildId: string): PlaybackManager | undefined {
  return managers.get(guildId);
}

export function destroyPlaybackManager(guildId: string): boolean {
  const manager = managers.get(guildId);

  if (!manager) {
    return false;
  }

  manager.destroy();
  managers.delete(guildId);

  return true;
}
