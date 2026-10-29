import app from "./app";
import { describeListenError, resolvePort } from "./port";

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
