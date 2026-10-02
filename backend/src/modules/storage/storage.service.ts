import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@taskeno/contracts';
import { AppError } from '../../common/errors';
import { storageLocalDir, env } from '../../config/env';

export type StoredObject = {
  key: string;
  sizeBytes: number;
  contentType: string;
};

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * Local disk driver.
 *
 * Files live outside the web root and are only ever served through an
 * authorized API route, never by path traversal. The `StorageDriver` interface
 * is the seam for moving to S3-compatible object storage (ArvanCloud, MinIO,
 * S3) without touching the rest of the application — only `STORAGE_DRIVER`
 * changes.
 */
class LocalDiskDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
    const target = path.resolve(this.root, normalized);
    if (!target.startsWith(path.resolve(this.root))) {
      throw new AppError(ERROR_CODES.FORBIDDEN_RESOURCE, { status: 403 });
    }
    return target;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

@Injectable()
export class StorageService {
  private readonly driver: StorageDriver;
  readonly maxBytes = env.UPLOAD_MAX_BYTES;

  constructor() {
    // Only the local driver ships today; an S3 driver registers the same way.
    this.driver = new LocalDiskDriver(storageLocalDir);
  }

  /** Builds a collision-free, non-guessable storage key. */
  buildKey(prefix: string, extension: string): string {
    const safeExtension = extension.replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase() || 'bin';
    return `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${safeExtension}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    if (body.byteLength > this.maxBytes) throw new AppError(ERROR_CODES.UPLOAD_TOO_LARGE, { status: 413 });
    await this.driver.put(key, body, contentType);
    return { key, sizeBytes: body.byteLength, contentType };
  }

  get(key: string): Promise<Buffer> {
    return this.driver.get(key);
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }
}

/** Allowed image types, checked by declared mime *and* magic bytes. */
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

/** Detects the real content type from the file header, never trusting the upload. */
export const detectImageMime = (buffer: Buffer): string | null => {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.toString('ascii', 4, 8) === 'ftyp' && buffer.toString('ascii', 8, 12).startsWith('avif')) return 'image/avif';
  return null;
};
