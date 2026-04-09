import app from "./app.ts";
import config from "./config/index.ts";
import { connectDB } from "./db.ts";

await connectDB();

app.listen(config.PORT, () => {
  console.log(`Server is running on http://localhost:${config.PORT} [${config.NODE_ENV}]`);
});
