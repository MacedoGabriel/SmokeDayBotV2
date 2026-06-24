import { readdir } from "node:fs/promises";
import path from "node:path";

const audioDirectory = path.join(process.cwd(), "assets", "audio");
const supportedExtensions = new Set([".mp3", ".m4a", ".mp4a", ".mp4", ".wav", ".ogg"]);

export type LocalAudioFile = {
  name: string;
  path: string;
};

async function walkAudioDirectory(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkAudioDirectory(entryPath)));
      continue;
    }

    if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizeAudioName(value: string): string {
  return value.trim().replaceAll("\\", "/").toLowerCase();
}

export async function listLocalAudioFiles(): Promise<LocalAudioFile[]> {
  try {
    const files = await walkAudioDirectory(audioDirectory);

    return files
      .map((filePath) => ({
        name: path.relative(audioDirectory, filePath).replaceAll("\\", "/"),
        path: filePath,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export function formatAudioFileList(files: LocalAudioFile[]): string {
  return files.map((file) => `\`${file.name}\``).join(", ");
}

export function findLocalAudioFile(
  files: LocalAudioFile[],
  query: string,
): LocalAudioFile | undefined {
  const normalizedQuery = normalizeAudioName(query);

  return files.find((file) => {
    const normalizedName = normalizeAudioName(file.name);
    const normalizedBaseName = normalizeAudioName(path.basename(file.name));
    const normalizedNameWithoutExtension = normalizeAudioName(
      file.name.slice(0, -path.extname(file.name).length),
    );

    return (
      normalizedName === normalizedQuery ||
      normalizedBaseName === normalizedQuery ||
      normalizedNameWithoutExtension === normalizedQuery
    );
  });
}
