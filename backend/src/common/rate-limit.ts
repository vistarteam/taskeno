import { Injectable } from '@nestjs/common';
import { AppError, ERROR_CODES } from './errors';

type Bucket = { hits: number[]; };

/**
 * Sliding window rate limiter.
 *
 * Kept in-process for the MVP: a single API process is the only writer, and
 * the limits protect against credential stuffing and accidental retry storms.
 * When we run more than one instance this moves to a shared store (or to the
 * `jobs`-style table approach) behind the same interface.
 */
@Injectable()
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxKeys = 20_000;

  consume(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);

    if (bucket.hits.length >= limit) {
      this.buckets.set(key, bucket);
      throw new AppError(ERROR_CODES.RATE_LIMITED, {
        status: 429,
        details: { retryAfterSeconds: Math.ceil((windowMs - (now - bucket.hits[0])) / 1000) },
      });
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);

    if (this.buckets.size > this.maxKeys) this.evictExpired(now);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private evictExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      const alive = bucket.hits.filter((timestamp) => now - timestamp < 60 * 60 * 1000);
      if (alive.length === 0) this.buckets.delete(key);
      else bucket.hits = alive;
    }
  }
}
