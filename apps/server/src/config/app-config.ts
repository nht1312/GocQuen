import { Injectable, Logger } from '@nestjs/common';

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Environment configuration. Anything optional degrades gracefully: without a
 * database the café keeps state in memory, without an SFU the café runs with
 * voice reported as unavailable (SPEC 16.2 — a voice failure must not stop
 * someone using the café).
 */
@Injectable()
export class AppConfig {
  private readonly logger = new Logger(AppConfig.name);

  readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  readonly isProduction = this.nodeEnv === 'production';
  readonly port = int(process.env.PORT, 4000);
  /**
   * Allowed browser origins.
   *
   * Trailing slashes are stripped. A browser's `Origin` header never has one,
   * so `https://example.com/` in this list would match nothing and every
   * request would be refused with no hint as to why — a failure that looks
   * exactly like the server being down.
   */
  private readonly configuredOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  /**
   * Production uses the configured allow-list verbatim. Development also
   * accepts any localhost port, so running the web app on a spare port does
   * not look like the server being down.
   */
  readonly corsOrigins:
    | string[]
    | ((origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void) =
    this.isProduction
      ? this.configuredOrigins
      : (origin, callback) => {
          const allowed =
            !origin ||
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
            this.configuredOrigins.includes(origin);
          callback(null, allowed);
        };

  readonly sessionSecret = process.env.SESSION_SECRET ?? 'dev-only-insecure-secret-change-me';
  readonly sessionTtlSeconds = int(process.env.SESSION_TTL_SECONDS, 86_400);

  readonly instanceCapacity = int(process.env.INSTANCE_CAPACITY, 25);
  readonly disconnectGraceSeconds = int(process.env.DISCONNECT_GRACE_SECONDS, 20);

  readonly databaseUrl = process.env.DATABASE_URL?.trim() || null;


  /**
   * TLS settings for the database connection.
   *
   * Managed Postgres (Render, Neon, Supabase, RDS) terminates TLS with a
   * certificate chain Node does not trust out of the box, so verification has
   * to be relaxed for those. That is a real trade-off, so it is opt-in rather
   * than the default:
   *
   *   DATABASE_SSL=require   encrypt, do not verify the certificate (managed
   *                          providers; the usual setting)
   *   DATABASE_SSL=strict    encrypt and verify against the system CA store
   *   unset / false          no TLS (local Postgres, or a provider's internal
   *                          network where traffic never leaves the VPC)
   */
  readonly databaseSsl: { rejectUnauthorized: boolean } | null = (() => {
    const mode = process.env.DATABASE_SSL?.trim().toLowerCase();
    if (!mode || mode === 'false' || mode === 'disable' || mode === 'off') return null;
    if (mode === 'strict' || mode === 'verify') return { rejectUnauthorized: true };
    return { rejectUnauthorized: false };
  })();

  readonly livekitUrl = process.env.LIVEKIT_URL?.trim() || null;
  readonly livekitApiKey = process.env.LIVEKIT_API_KEY?.trim() || null;
  readonly livekitApiSecret = process.env.LIVEKIT_API_SECRET?.trim() || null;
  readonly voiceTokenTtlSeconds = int(process.env.VOICE_TOKEN_TTL_SECONDS, 600);

  get voiceAvailable(): boolean {
    return Boolean(this.livekitUrl && this.livekitApiKey && this.livekitApiSecret);
  }

  validate(): void {
    if (this.isProduction && this.sessionSecret.startsWith('dev-only')) {
      throw new Error('SESSION_SECRET must be set to a strong secret in production');
    }
    // In production the list is used verbatim, so a wrong entry means every
    // browser is refused while the server still looks perfectly healthy.
    // Print what is actually in force so the deploy log can be checked.
    if (this.isProduction) {
      this.logger.log(`CORS allow-list: ${this.configuredOrigins.join(', ') || '(empty)'}`);
      if (this.configuredOrigins.some((origin) => origin.includes('localhost'))) {
        this.logger.warn(
          'CORS_ORIGINS still allows localhost in production — set it to the deployed web origin',
        );
      }
    }
    if (!this.voiceAvailable) {
      this.logger.warn('No SFU configured (LIVEKIT_*) — group voice will report as unavailable');
    }
    if (!this.databaseUrl) {
      this.logger.warn('No DATABASE_URL — using the in-memory store, data is lost on restart');
    }
  }
}
