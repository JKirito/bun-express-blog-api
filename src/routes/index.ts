import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Hello from Bun + Express!" });
});

router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

router.post("/echo", (req: Request, res: Response) => {
  res.json({ echo: req.body });
});

export default router;
