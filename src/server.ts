import app from "./app.ts";
import { connectDB } from "./db.ts";

const port = process.env["PORT"] || 3000;

await connectDB();

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
