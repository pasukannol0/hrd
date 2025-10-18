import { createHmac, randomBytes } from 'crypto';

export interface SignedUrlConfig {
  secretKey: string;
  defaultExpirationSeconds?: number;
}

export interface SignedUrlParams {
  resource: string;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
}

export interface SignedUrlResult {
  url: string;
  token: string;
  expires_at: Date;
}

export interface VerifySignedUrlResult {
  valid: boolean;
  expired: boolean;
  resource?: string;
  metadata?: Record<string, string>;
}

export class SignedUrlService {
  private secretKey: string;
  private defaultExpirationSeconds: number;

  constructor(config: SignedUrlConfig) {
    this.secretKey = config.secretKey;
    this.defaultExpirationSeconds = config.defaultExpirationSeconds || 3600;
  }

  generateSignedUrl(params: SignedUrlParams): SignedUrlResult {
    const expiresInSeconds = params.expiresInSeconds || this.defaultExpirationSeconds;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const nonce = randomBytes(16).toString('hex');

    const payload = {
      resource: params.resource,
      expires_at: expiresAt.toISOString(),
      nonce,
      metadata: params.metadata || {},
    };

    const payloadString = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadString).toString('base64url');

    const signature = this.generateSignature(payloadBase64);

    const token = `${payloadBase64}.${signature}`;

    return {
      url: `/api/downloads/${params.resource}?token=${encodeURIComponent(token)}`,
      token,
      expires_at: expiresAt,
    };
  }

  verifySignedUrl(token: string): VerifySignedUrlResult {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        return { valid: false, expired: false };
      }

      const [payloadBase64, signature] = parts;
      const expectedSignature = this.generateSignature(payloadBase64);

      if (signature !== expectedSignature) {
        return { valid: false, expired: false };
      }

      const payloadString = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
      const payload = JSON.parse(payloadString);

      const expiresAt = new Date(payload.expires_at);
      const now = new Date();

      if (now > expiresAt) {
        return {
          valid: false,
          expired: true,
          resource: payload.resource,
          metadata: payload.metadata,
        };
      }

      return {
        valid: true,
        expired: false,
        resource: payload.resource,
        metadata: payload.metadata,
      };
    } catch (error) {
      return { valid: false, expired: false };
    }
  }

  private generateSignature(payload: string): string {
    const hmac = createHmac('sha256', this.secretKey);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  generateDownloadToken(fileId: string, userId: string, expiresInSeconds?: number): string {
    const result = this.generateSignedUrl({
      resource: fileId,
      expiresInSeconds,
      metadata: { user_id: userId },
    });
    return result.token;
  }

  verifyDownloadToken(token: string, expectedUserId?: string): VerifySignedUrlResult {
    const result = this.verifySignedUrl(token);

    if (!result.valid) {
      return result;
    }

    if (expectedUserId && result.metadata?.user_id !== expectedUserId) {
      return { valid: false, expired: false };
    }

    return result;
  }
}
