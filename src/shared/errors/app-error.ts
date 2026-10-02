export interface ErrorDetail {
  field: string;
  message: string;
}

export interface AppErrorProps {
  statusCode: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ErrorDetail[];

  constructor({ statusCode, code, message, details }: AppErrorProps) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
