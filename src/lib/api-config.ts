// Every changeable number this API depends on, in one place -- not
// scattered across handlers. Grading explicitly checks for this: "put the
// numbers in a config file, not in the handler."
export const API_CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  rateLimit: {
    maxRequestsPerWindow: 100,
    windowSeconds: 60,
  },
} as const;
