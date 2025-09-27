export interface VoiceChatWidgetProps {
    apiKey: string;
    officerEmail: string;
    appName: string;
    language?: string;
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    theme?: 'light' | 'dark' | 'auto';
    customStyles?: CustomStyles;
    onConversationStart?: (session: VoiceSession) => void;
    onConversationEnd?: (conversation: VoiceConversation) => void;
    onError?: (error: VoiceChatError) => void;
    debug?: boolean;
    logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
}

export interface CustomStyles {
    primaryColor?: string;
    secondaryColor?: string;
    borderRadius?: string;
    fontFamily?: string;
    fontSize?: string;
    buttonSize?: 'small' | 'medium' | 'large';
}

export interface VoiceSession {
    id: string;
    officerEmail: string;
    appName: string;
    language: string;
    startTime: Date;
    status: 'active' | 'ended' | 'failed';
    speechmaticsConfig?: SpeechmaticsConfig;
    webrtcConfig?: WebRTCConfig;
}

export interface VoiceConversation {
    id: string;
    sessionId: string;
    officerEmail: string;
    appName: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    language: string;
    status: 'processing' | 'completed' | 'failed';
    totalCost?: number;
    costBreakdown?: CostBreakdown;
    audioUrl?: string;
    transcriptUrl?: string;
    pdfReportUrl?: string;
    metadata?: Record<string, any>;
}

export interface SpeechmaticsConfig {
    url: string;
    language: string;
    enablePartials: boolean;
    punctuationPermitted: boolean;
    temporaryToken?: string;
}

export interface WebRTCConfig {
    iceServers: RTCIceServer[];
}

export interface CostBreakdown {
    speechmatics: number;
    openai: number;
    storage: number;
    email: number;
}

export interface VoiceChatError {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: Date;
}

export interface LanguageOption {
    code: string;
    name: string;
    nativeName: string;
    flag: string;
}

export interface WidgetState {
    isOpen: boolean;
    isRecording: boolean;
    isProcessing: boolean;
    isConnected: boolean;
    currentLanguage: string;
    transcript: string;
    partialTranscript: string;
    error: VoiceChatError | null;
    session: VoiceSession | null;
    conversation: VoiceConversation | null;
}

export interface AudioSettings {
    sampleRate: number;
    channels: number;
    bitRate: number;
    format: 'wav' | 'mp3' | 'webm';
}

export interface TranscriptionSettings {
    language: string;
    enablePartials: boolean;
    punctuationPermitted: boolean;
    confidenceThreshold: number;
}

export interface WidgetConfig {
    apiKey: string;
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    debug: boolean;
    logLevel: string;
}

export type WidgetPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type WidgetTheme = 'light' | 'dark' | 'auto';
export type WidgetSize = 'small' | 'medium' | 'large';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type RecordingStatus = 'idle' | 'recording' | 'processing' | 'error';
export type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'failed';