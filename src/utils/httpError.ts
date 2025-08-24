export function httpError(status: number, message: string, details?: unknown) {
  const e = new Error(message) as any;
  e.status = status;
  if (details !== undefined) e.details = details;
  return e;
}