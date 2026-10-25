import app from "./app";
import { resolvePort } from "./port";

const PORT = resolvePort();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
