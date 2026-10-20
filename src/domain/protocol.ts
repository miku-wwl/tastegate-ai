// Constants shared by the server and the browser. This module imports NOTHING, so the client bundle can use it without
// pulling in schemas, node:crypto or any server code.
export const LIVE_ACK = "RUN_LIVE_QLOO_REQUESTS" as const;
export const MAX_REQUEST_BYTES = 24_576;
export const CUSTOM_SCENARIO_ID = "custom-input" as const;
export const REQUEST_SOURCES = ["fixture", "recorded", "live"] as const;
export type RequestSource = typeof REQUEST_SOURCES[number];
// Input limits that the form enforces up front and the server enforces again.
export const MAX_IMPORT_BYTES = 16_384;
