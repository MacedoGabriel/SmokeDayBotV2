import "dotenv/config";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Create a .env file from .env.example and fill it in.`,
    );
  }

  return value;
}

function optionalEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function parseGuildIds(): string[] {
  const rawGuildIds = [optionalEnv("GUILD_IDS"), optionalEnv("GUILD_ID")]
    .filter(Boolean)
    .join(",");

  const guildIds = rawGuildIds
    .split(",")
    .map((guildId) => guildId.trim())
    .filter(Boolean);

  return [...new Set(guildIds)];
}

function parseCommandDeployScope(): "guild" | "global" {
  const scope = optionalEnv("COMMAND_DEPLOY_SCOPE").toLowerCase();

  if (!scope || scope === "guild") {
    return "guild";
  }

  if (scope === "global") {
    return "global";
  }

  throw new Error(
    "Invalid COMMAND_DEPLOY_SCOPE. Use either 'guild' or 'global'.",
  );
}

export const config = {
  discordToken: requireEnv("DISCORD_TOKEN"),
  clientId: optionalEnv("CLIENT_ID"),
  guildId: optionalEnv("GUILD_ID"),
  guildIds: parseGuildIds(),
  commandDeployScope: parseCommandDeployScope(),
};
