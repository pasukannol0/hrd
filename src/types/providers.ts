export interface FaceRecognitionResult {
  recognized: boolean;
  user_id?: string;
  confidence?: number;
  face_id?: string;
  error?: string;
}

export interface LivenessDetectionResult {
  is_live: boolean;
  confidence?: number;
  error?: string;
}

export interface FaceRecognitionProvider {
  recognizeFace(imageData: Buffer | string): Promise<FaceRecognitionResult>;
  detectLiveness(imageData: Buffer | string): Promise<LivenessDetectionResult>;
  enrollFace(userId: string, imageData: Buffer | string): Promise<{ success: boolean; face_id?: string; error?: string }>;
  deleteFace(userId: string): Promise<{ success: boolean; error?: string }>;
}

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export enum FaceRecognitionError {
  NO_FACE_DETECTED = 'NO_FACE_DETECTED',
  MULTIPLE_FACES_DETECTED = 'MULTIPLE_FACES_DETECTED',
  POOR_IMAGE_QUALITY = 'POOR_IMAGE_QUALITY',
  LIVENESS_CHECK_FAILED = 'LIVENESS_CHECK_FAILED',
  RECOGNITION_FAILED = 'RECOGNITION_FAILED',
  ENROLLMENT_FAILED = 'ENROLLMENT_FAILED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  TIMEOUT = 'TIMEOUT',
}
