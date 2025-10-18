import * as crypto from 'crypto';

export interface SignatureServiceConfig {
  secretKey: string;
  algorithm?: string;
}

export class SignatureService {
  private secretKey: string;
  private algorithm: string;

  constructor(config: SignatureServiceConfig) {
    this.secretKey = config.secretKey;
    this.algorithm = config.algorithm ?? 'sha256';
  }

  signAttendanceData(data: {
    user_id: string;
    device_id: string;
    office_id: string;
    timestamp: Date;
    location: { latitude: number; longitude: number };
    integrity_verdict: any;
  }): string {
    const payload = {
      user_id: data.user_id,
      device_id: data.device_id,
      office_id: data.office_id,
      timestamp: data.timestamp.toISOString(),
      location: {
        latitude: data.location.latitude,
        longitude: data.location.longitude,
      },
      integrity_score: data.integrity_verdict.overall_score,
    };

    const payloadString = JSON.stringify(payload);
    
    const hmac = crypto.createHmac(this.algorithm, this.secretKey);
    hmac.update(payloadString);
    
    return hmac.digest('hex');
  }

  verifySignature(signature: string, data: any): boolean {
    try {
      const expectedSignature = this.signAttendanceData(data);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  signData(data: any): string {
    const payloadString = typeof data === 'string' ? data : JSON.stringify(data);
    
    const hmac = crypto.createHmac(this.algorithm, this.secretKey);
    hmac.update(payloadString);
    
    return hmac.digest('hex');
  }

  verifyDataSignature(signature: string, data: any): boolean {
    try {
      const expectedSignature = this.signData(data);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Data signature verification error:', error);
      return false;
    }
  }
}
