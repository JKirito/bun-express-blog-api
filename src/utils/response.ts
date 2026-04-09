import type { Response } from "express";

interface FieldError {
  field: string;
  message: string;
}

interface SuccessResponse {
  success: true;
  data: unknown;
}

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    errors?: FieldError[];
  };
}

export type ApiResponse = SuccessResponse | ErrorResponse;

export function sendSuccess(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function sendError(res: Response, message: string, status = 400, errors?: FieldError[]): void {
  const body: ErrorResponse = {
    success: false,
    error: { message },
  };

  if (errors) {
    body.error.errors = errors;
  }

  res.status(status).json(body);
}
