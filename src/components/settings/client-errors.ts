import { ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/i18n";

/** Server message when there is one, otherwise the generic copy for the error code. */
export function apiErrorText(err: unknown): string {
  if (err instanceof ApiClientError) return err.message || errorMessage(err.code);
  return errorMessage(undefined);
}
