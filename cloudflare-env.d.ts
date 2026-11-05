declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PSK_SYNC_KEY?: string;
    PSK_SERVICE_SYNC_KEY?: string;
  }
}
