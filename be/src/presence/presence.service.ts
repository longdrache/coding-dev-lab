import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

const ONLINE_TTL_MS = 45_000;
const CLEANUP_INTERVAL_MS = 30_000;

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, number>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  onModuleInit() {
    this.cleanupTimer = setInterval(() => this.purge(), CLEANUP_INTERVAL_MS);
    // Don't keep the process alive just for cleanup in serverless/test envs.
    if (typeof (this.cleanupTimer as any)?.unref === 'function') {
      (this.cleanupTimer as any).unref();
    }
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  heartbeat(sessionId: string): number {
    this.sessions.set(sessionId, Date.now());
    return this.purge();
  }

  leave(sessionId: string): number {
    this.sessions.delete(sessionId);
    return this.purge();
  }

  count(): number {
    return this.purge();
  }

  private purge(): number {
    const now = Date.now();
    for (const [id, lastSeen] of this.sessions) {
      if (now - lastSeen > ONLINE_TTL_MS) this.sessions.delete(id);
    }
    return this.sessions.size;
  }
}
