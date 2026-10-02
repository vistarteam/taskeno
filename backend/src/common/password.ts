import { Injectable } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/**
 * Password hashing.
 *
 * Argon2id with explicit cost parameters: memory-hard, resistant to GPU
 * cracking, and the current OWASP recommendation. Parameters live in one place
 * so they can be raised over time; `verify` also returns the params it used so
 * a future rehash-on-login migration is straightforward.
 */
@Injectable()
export class PasswordService {
  private readonly options = {
    // 19 MiB, 2 iterations, 1 degree of parallelism — OWASP minimum profile.
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    algorithm: 2 as const, // Argon2id
  };

  async hash(plain: string): Promise<string> {
    return argonHash(plain, this.options);
  }

  async verify(hashValue: string, plain: string): Promise<boolean> {
    try {
      return await argonVerify(hashValue, plain);
    } catch {
      return false;
    }
  }
}
