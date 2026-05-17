/**
 * PocketBase shares one HTTP client; concurrent requests can inherit the same
 * implicit `requestKey` and cancel each other. Spread this on each SDK call so
 * handlers and workers stay independent (see workers + scan polling routes).
 */
export const PB_NO_CANCEL = { requestKey: null } as const;
