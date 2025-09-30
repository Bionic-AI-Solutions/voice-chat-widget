export interface AudioChunk {
    data: ArrayBuffer;
    timestamp: number;
    sampleRate: number;
    channels: number;
    duration: number;
}

export interface Session {
    id: string;
    officerEmail: string;
    appName: string;
    language: string;
    clientId: string;
    startTime: Date;
    endTime?: Date;
    status: 'active' | 'ended' | 'processing';
    transcript?: string;
    audioUrl?: string;
    conversationId?: string;
}

export interface Conversation {
    id: string;
    sessionId: string;
    officerEmail: string;
    appName: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    language: string;
    status: 'processing' | 'completed' | 'failed';
    transcript?: string;
    summary?: string;
    audioUrl?: string;
    pdfUrl?: string;
    emailSent?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface SessionStartData {
    officerEmail: string;
    appName: string;
    language?: string;
    clientId: string;
}

export interface SpeechmaticsConfig {
    language: string;
    enablePartials: boolean;
    punctuationPermitted: boolean;
    sampleRate: number;
    encoding: string;
}

export interface TranscriptData {
    transcript: string;
    confidence: number;
    isPartial: boolean;
    timestamp: number;
}

export interface WebRTCSignal {
    type: 'offer' | 'answer' | 'ice-candidate';
    data: any;
    sessionId: string;
}

export interface QueueJobData {
    sessionId: string;
    conversationId?: string;
    audioUrl?: string;
    transcript?: string;
    metadata?: Record<string, any>;
    priority?: number;
    delay?: number;
}

export interface WorkerConfig {
    concurrency: number;
    maxJobs: number;
    retryAttempts: number;
    retryDelay: number;
    healthCheckInterval: number;
    jobTimeout: number;
}

export interface MinIOConfig {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    bucket: string;
    useSSL: boolean;
    region: string;
}

export interface SupabaseConfig {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    jwtSecret: string;
}

export interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
}

export interface OpenAIConfig {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
    timeout: number;
}

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
    enableReadyCheck: boolean;
    lazyConnect: boolean;
}

export interface ServerConfig {
    port: number;
    host: string;
    nodeEnv: string;
    corsOrigin: string[];
    logLevel: string;
    logFormat: string;
    logFileEnabled: boolean;
    logFilePath: string;
    logMaxFiles: number;
    logMaxSize: string;
}

export interface HealthCheckResponse {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    uptime: number;
    version: string;
    services: {
        redis: { connected: boolean; status: string };
        supabase: { connected: boolean; status: string };
        minio: { connected: boolean; status: string };
        workers: { active: number; total: number };
    };
}

export interface ErrorResponse {
    error: string;
    message: string;
    code?: string;
    details?: any;
    timestamp: string;
}

export interface SuccessResponse<T = any> {
    success: true;
    data: T;
    message?: string;
    timestamp: string;
}

export interface PaginatedResponse<T = any> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export interface ApiResponse<T = any> extends SuccessResponse<T> {
    pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}
