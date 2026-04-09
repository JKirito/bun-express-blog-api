import express from "express";
import routes from "./routes/index.ts";
import postsRouter from "./routes/posts.ts";

const app = express();

app.use(express.json());
app.use(routes);
app.use("/posts", postsRouter);

export default app;
