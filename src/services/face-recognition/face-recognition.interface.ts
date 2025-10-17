import {
  FaceRecognitionProvider,
  FaceRecognitionResult,
  LivenessDetectionResult,
} from '../../types';

export interface FaceRecognitionServiceConfig {
  provider: FaceRecognitionProvider;
  enableLivenessCheck?: boolean;
  confidenceThreshold?: number;
  timeout?: number;
}

export class FaceRecognitionService {
  private provider: FaceRecognitionProvider;
  private enableLivenessCheck: boolean;
  private confidenceThreshold: number;
  private timeout: number;

  constructor(config: FaceRecognitionServiceConfig) {
    this.provider = config.provider;
    this.enableLivenessCheck = config.enableLivenessCheck ?? true;
    this.confidenceThreshold = config.confidenceThreshold ?? 0.8;
    this.timeout = config.timeout ?? 10000;
  }

  async recognizeFace(imageData: Buffer | string): Promise<FaceRecognitionResult> {
    try {
      const result = await this.withTimeout(
        this.provider.recognizeFace(imageData),
        this.timeout
      );

      if (!result.recognized) {
        return result;
      }

      if (result.confidence !== undefined && result.confidence < this.confidenceThreshold) {
        return {
          recognized: false,
          error: 'Confidence below threshold',
        };
      }

      return result;
    } catch (error) {
      return {
        recognized: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async detectLiveness(imageData: Buffer | string): Promise<LivenessDetectionResult> {
    if (!this.enableLivenessCheck) {
      return {
        is_live: true,
        confidence: 1.0,
      };
    }

    try {
      const result = await this.withTimeout(
        this.provider.detectLiveness(imageData),
        this.timeout
      );

      return result;
    } catch (error) {
      return {
        is_live: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async recognizeWithLiveness(
    imageData: Buffer | string
  ): Promise<FaceRecognitionResult & { liveness?: LivenessDetectionResult }> {
    if (this.enableLivenessCheck) {
      const livenessResult = await this.detectLiveness(imageData);

      if (!livenessResult.is_live) {
        return {
          recognized: false,
          error: 'Liveness check failed',
          liveness: livenessResult,
        };
      }

      const recognitionResult = await this.recognizeFace(imageData);

      return {
        ...recognitionResult,
        liveness: livenessResult,
      };
    } else {
      return this.recognizeFace(imageData);
    }
  }

  async enrollFace(
    userId: string,
    imageData: Buffer | string
  ): Promise<{ success: boolean; face_id?: string; error?: string }> {
    try {
      if (this.enableLivenessCheck) {
        const livenessResult = await this.detectLiveness(imageData);

        if (!livenessResult.is_live) {
          return {
            success: false,
            error: 'Liveness check failed during enrollment',
          };
        }
      }

      const result = await this.withTimeout(
        this.provider.enrollFace(userId, imageData),
        this.timeout
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deleteFace(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.withTimeout(
        this.provider.deleteFace(userId),
        this.timeout
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      ),
    ]);
  }

  setProvider(provider: FaceRecognitionProvider): void {
    this.provider = provider;
  }

  getProvider(): FaceRecognitionProvider {
    return this.provider;
  }
}
