import * as crypto from 'crypto';
import { QrToken, QrTokenValidation } from '../types';

export interface QrTokenGeneratorConfig {
  secretKey: string;
  minTtlSeconds?: number;
  maxTtlSeconds?: number;
  defaultTtlSeconds?: number;
}

export class QrTokenGeneratorService {
  private secretKey: string;
  private minTtlSeconds: number;
  private maxTtlSeconds: number;
  private defaultTtlSeconds: number;

  constructor(config: QrTokenGeneratorConfig) {
    this.secretKey = config.secretKey;
    this.minTtlSeconds = config.minTtlSeconds || 30;
    this.maxTtlSeconds = config.maxTtlSeconds || 60;
    this.defaultTtlSeconds = config.defaultTtlSeconds || 45;
  }

  generateToken(
    officeId?: string,
    userId?: string,
    ttlSeconds?: number
  ): QrToken {
    const ttl = this.validateTtl(ttlSeconds);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const timestamp = Math.floor(expiresAt.getTime() / 1000);

    const payload = {
      exp: timestamp,
      office_id: officeId,
      user_id: userId,
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    const dataToSign = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(dataToSign);
    const signature = hmac.digest('hex');

    const token = Buffer.from(
      JSON.stringify({
        ...payload,
        sig: signature,
      })
    ).toString('base64url');

    return {
      token,
      expires_at: expiresAt,
      office_id: officeId,
      user_id: userId,
    };
  }

  validateToken(token: string): QrTokenValidation {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const payload = JSON.parse(decoded);

      if (!payload.sig || !payload.exp || !payload.nonce) {
        return {
          valid: false,
          expired: false,
        };
      }

      const { sig, ...dataToVerify } = payload;
      const dataToSign = JSON.stringify(dataToVerify);
      
      const hmac = crypto.createHmac('sha256', this.secretKey);
      hmac.update(dataToSign);
      const expectedSignature = hmac.digest('hex');

      if (sig !== expectedSignature) {
        return {
          valid: false,
          expired: false,
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const expired = now > payload.exp;

      if (expired) {
        return {
          valid: false,
          expired: true,
          office_id: payload.office_id,
          user_id: payload.user_id,
        };
      }

      return {
        valid: true,
        expired: false,
        office_id: payload.office_id,
        user_id: payload.user_id,
      };
    } catch (error) {
      return {
        valid: false,
        expired: false,
      };
    }
  }

  generateDynamicToken(
    officeId?: string,
    userId?: string
  ): QrToken {
    const ttl = this.getRandomTtl();
    return this.generateToken(officeId, userId, ttl);
  }

  private validateTtl(ttl?: number): number {
    if (ttl === undefined) {
      return this.defaultTtlSeconds;
    }

    if (ttl < this.minTtlSeconds) {
      return this.minTtlSeconds;
    }

    if (ttl > this.maxTtlSeconds) {
      return this.maxTtlSeconds;
    }

    return ttl;
  }

  private getRandomTtl(): number {
    return Math.floor(
      Math.random() * (this.maxTtlSeconds - this.minTtlSeconds + 1) + 
      this.minTtlSeconds
    );
  }

  getTokenExpirationTime(token: string): Date | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const payload = JSON.parse(decoded);

      if (!payload.exp) {
        return null;
      }

      return new Date(payload.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  getRemainingTtl(token: string): number | null {
    const expirationTime = this.getTokenExpirationTime(token);

    if (!expirationTime) {
      return null;
    }

    const remainingMs = expirationTime.getTime() - Date.now();
    const remainingSeconds = Math.floor(remainingMs / 1000);

    return Math.max(0, remainingSeconds);
  }
}
