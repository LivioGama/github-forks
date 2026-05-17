type PocketBaseValidationError = {
  data?: { data?: Record<string, { message?: string }> };
};

// PocketBase throws ClientResponseError with a generic `.message`
// ("Failed to create record.") and the actionable field-level detail buried
// in `.data.data`. Surface those field errors so failures are diagnosable.
const pocketBaseFieldErrors = (error: unknown): string | null => {
  const fields = (error as PocketBaseValidationError)?.data?.data;
  if (!fields || typeof fields !== "object") return null;

  const parts = Object.entries(fields)
    .map(([field, detail]) => `${field}: ${detail?.message ?? "invalid"}`)
    .filter(Boolean);

  return parts.length > 0 ? parts.join("; ") : null;
};

export const errorMessage = (error: unknown, fallback = "Unknown error"): string => {
  if (!(error instanceof Error)) return fallback;

  const fieldErrors = pocketBaseFieldErrors(error);
  return fieldErrors ? `${error.message} (${fieldErrors})` : error.message;
};
