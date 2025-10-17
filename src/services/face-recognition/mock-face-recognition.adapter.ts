import * as crypto from 'crypto';
import {
  FaceRecognitionProvider,
  FaceRecognitionResult,
  LivenessDetectionResult,
  FaceRecognitionError,
} from '../../types';

export interface MockFaceRecognitionConfig {
  successRate?: number;
  simulateDelay?: boolean;
  delayMs?: number;
  alwaysRecognizeUsers?: string[];
  simulateErrors?: boolean;
  errorRate?: number;
}

export class MockFaceRecognitionAdapter implements FaceRecognitionProvider {
  private enrolledFaces: Map<string, string> = new Map();
  private config: Required<MockFaceRecognitionConfig>;

  constructor(config: MockFaceRecognitionConfig = {}) {
    this.config = {
      successRate: config.successRate ?? 0.9,
      simulateDelay: config.simulateDelay ?? true,
      delayMs: config.delayMs ?? 500,
      alwaysRecognizeUsers: config.alwaysRecognizeUsers ?? [],
      simulateErrors: config.simulateErrors ?? false,
      errorRate: config.errorRate ?? 0.1,
    };
  }

  async recognizeFace(imageData: Buffer | string): Promise<FaceRecognitionResult> {
    if (this.config.simulateDelay) {
      await this.delay(this.config.delayMs);
    }

    if (this.config.simulateErrors && Math.random() < this.config.errorRate) {
      return this.randomError();
    }

    const imageHash = this.hashImageData(imageData);

    for (const [userId, faceId] of this.enrolledFaces.entries()) {
      if (faceId === imageHash || this.config.alwaysRecognizeUsers.includes(userId)) {
        const confidence = this.config.alwaysRecognizeUsers.includes(userId)
          ? 0.99
          : 0.75 + Math.random() * 0.24;

        return {
          recognized: true,
          user_id: userId,
          confidence,
          face_id: faceId,
        };
      }
    }

    if (Math.random() < this.config.successRate) {
      return {
        recognized: false,
        error: FaceRecognitionError.RECOGNITION_FAILED,
      };
    }

    return this.randomError();
  }

  async detectLiveness(imageData: Buffer | string): Promise<LivenessDetectionResult> {
    if (this.config.simulateDelay) {
      await this.delay(this.config.delayMs);
    }

    if (this.config.simulateErrors && Math.random() < this.config.errorRate) {
      return {
        is_live: false,
        error: FaceRecognitionError.LIVENESS_CHECK_FAILED,
      };
    }

    const isLive = Math.random() < this.config.successRate;
    const confidence = isLive ? 0.8 + Math.random() * 0.2 : Math.random() * 0.5;

    return {
      is_live: isLive,
      confidence,
    };
  }

  async enrollFace(
    userId: string,
    imageData: Buffer | string
  ): Promise<{ success: boolean; face_id?: string; error?: string }> {
    if (this.config.simulateDelay) {
      await this.delay(this.config.delayMs);
    }

    if (this.config.simulateErrors && Math.random() < this.config.errorRate) {
      return {
        success: false,
        error: FaceRecognitionError.ENROLLMENT_FAILED,
      };
    }

    const faceId = this.hashImageData(imageData);

    if (this.enrolledFaces.has(userId)) {
      this.enrolledFaces.set(userId, faceId);
      return {
        success: true,
        face_id: faceId,
      };
    }

    this.enrolledFaces.set(userId, faceId);

    return {
      success: true,
      face_id: faceId,
    };
  }

  async deleteFace(userId: string): Promise<{ success: boolean; error?: string }> {
    if (this.config.simulateDelay) {
      await this.delay(this.config.delayMs / 2);
    }

    if (!this.enrolledFaces.has(userId)) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    this.enrolledFaces.delete(userId);

    return {
      success: true,
    };
  }

  private hashImageData(imageData: Buffer | string): string {
    const data = typeof imageData === 'string' ? imageData : imageData.toString('base64');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private randomError(): FaceRecognitionResult {
    const errors = [
      FaceRecognitionError.NO_FACE_DETECTED,
      FaceRecognitionError.MULTIPLE_FACES_DETECTED,
      FaceRecognitionError.POOR_IMAGE_QUALITY,
      FaceRecognitionError.RECOGNITION_FAILED,
    ];

    const error = errors[Math.floor(Math.random() * errors.length)];

    return {
      recognized: false,
      error,
    };
  }

  getEnrolledUsers(): string[] {
    return Array.from(this.enrolledFaces.keys());
  }

  isUserEnrolled(userId: string): boolean {
    return this.enrolledFaces.has(userId);
  }

  clearEnrollments(): void {
    this.enrolledFaces.clear();
  }

  setConfig(config: Partial<MockFaceRecognitionConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}
