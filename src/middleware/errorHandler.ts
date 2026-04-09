import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { sendError } from "../utils/response.ts";
import { AppError } from "../errors/index.ts";

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, "Not found", 404);
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Custom application errors (NotFoundError, ConflictError, BadRequestError, etc.)
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  // Mongoose CastError -- invalid ObjectId format
  if (err instanceof mongoose.Error.CastError) {
    sendError(res, `Invalid ${err.path}: ${err.value}`, 400);
    return;
  }

  // Mongoose ValidationError -- schema-level validation failure
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.entries(err.errors).map(([field, detail]) => ({
      field,
      message: detail.message,
    }));
    sendError(res, "Validation failed", 400, errors);
    return;
  }

  // express.json() SyntaxError -- malformed JSON body
  if ("type" in err && (err as Record<string, unknown>).type === "entity.parse.failed") {
    sendError(res, "Malformed JSON in request body", 400);
    return;
  }

  // Everything else -- unexpected server error
  console.error("Unhandled error:", err);
  sendError(res, "Internal server error", 500);
}
