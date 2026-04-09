import express from "express";
import routes from "./routes/index.ts";
import postsRouter from "./routes/posts.ts";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.ts";
import { rateLimiter } from "./middleware/rateLimiter.ts";
import { requestCounter } from "./middleware/requestCounter.ts";

const app = express();

app.use(express.json());
app.use(rateLimiter);
app.use(requestCounter);
app.use(routes);
app.use("/posts", postsRouter);

// 404 catch-all -- must be after all route registrations
app.use(notFoundHandler);

// Global error handler -- must be last middleware (4-arg signature)
app.use(errorHandler);

export default app;
