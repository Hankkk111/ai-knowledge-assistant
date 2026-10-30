import app from "./app";
import { pool } from "./db/client";
import { describeListenError, resolvePort } from "./port";
import { createShutdownHandler } from "./shutdown";

const PORT = resolvePort();
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  const hint = describeListenError(err, PORT);
  if (!hint) throw err;
  console.error(hint);
  process.exit(1);
});

const shutdown = createShutdownHandler({ server, pool });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
