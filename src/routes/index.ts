import { Router, type Request, type Response } from "express";
import { sendSuccess } from "../utils/response.ts";
import { getRequestCounts } from "../middleware/requestCounter.ts";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  sendSuccess(res, { message: "Hello from Bun + Express!" });
});

router.get("/health", (_req: Request, res: Response) => {
  sendSuccess(res, { status: "ok" });
});

router.post("/echo", (req: Request, res: Response) => {
  sendSuccess(res, { echo: req.body });
});

router.get("/metrics", (_req: Request, res: Response) => {
  sendSuccess(res, getRequestCounts());
});

export default router;
