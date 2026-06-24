import { joinCommand } from "./join.js";
import { leaveCommand } from "./leave.js";
import { liveCommand } from "./live.js";
import { pingCommand } from "./ping.js";
import { playCommand } from "./play.js";
import { queueCommand } from "./queue.js";
import { skipCommand } from "./skip.js";
import { stopCommand } from "./stop.js";

export const commands = [
  pingCommand,
  joinCommand,
  leaveCommand,
  playCommand,
  liveCommand,
  queueCommand,
  skipCommand,
  stopCommand,
];

export const commandsByName = new Map(
  commands.map((command) => [command.data.toJSON().name, command]),
);

export const commandPayloads = commands.map((command) => command.data.toJSON());
