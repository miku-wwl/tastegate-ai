import { z } from "zod";
import { assertServer, QlooBoundaryError } from "./boundary-error";

export const HACKATHON_ORIGIN = "https://hackathon.api.qloo.com";
const configSchema = z.strictObject({
  mode: z.enum(["fixture", "live"]),
  timeout: z.string().regex(/^[1-9][0-9]{0,3}$/).transform(Number).pipe(z.number().int().max(4_000)),
});

export class QlooServerConfig {
  readonly baseUrl = HACKATHON_ORIGIN;
  #key: string | null;
  private constructor(readonly mode: "fixture" | "live", readonly requestTimeoutMs: number, key: string | null) {
    this.#key = key; Object.freeze(this);
  }
  static load(env: Readonly<Record<string, string | undefined>> = process.env): QlooServerConfig {
    assertServer();
    // Exact string comparison rejects credentials, suffix hosts, paths, ports and redirects.
    if ((env.QLOO_BASE_URL ?? HACKATHON_ORIGIN) !== HACKATHON_ORIGIN)
      throw new QlooBoundaryError("INVALID_BASE_URL");
    const parsed = configSchema.safeParse({ mode: env.QLOO_MODE ?? "fixture", timeout: env.QLOO_REQUEST_TIMEOUT_MS ?? "4000" });
    if (!parsed.success) throw new QlooBoundaryError("INVALID_CONFIG");
    let key: string | null = null;
    if (parsed.data.mode === "live") {
      const value = env.QLOO_API_KEY;
      if (!value?.trim()) throw new QlooBoundaryError("AUTH_REQUIRED");
      // Header safety only, not an invented Qloo key format or authentication assertion.
      if (value.length > 4096 || /[^\x21-\x7e]/.test(value)) throw new QlooBoundaryError("INVALID_CONFIG");
      key = value;
    }
    return new QlooServerConfig(parsed.data.mode, parsed.data.timeout, key);
  }
  credentialHeaders(): Readonly<Record<string, string>> {
    assertServer();
    if (!this.#key || this.mode !== "live") throw new QlooBoundaryError("AUTH_REQUIRED");
    return Object.freeze({ "X-Api-Key": this.#key });
  }
}
