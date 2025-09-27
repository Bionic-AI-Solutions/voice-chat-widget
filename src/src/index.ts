export { VoiceChatWidget } from './components/VoiceChatWidget';
export { LanguageSelector } from './components/LanguageSelector';
export { VoiceControls } from './components/VoiceControls';
export { TranscriptDisplay } from './components/TranscriptDisplay';
export { StatusIndicator } from './components/StatusIndicator';
export { ErrorDisplay } from './components/ErrorDisplay';

export type {
    VoiceChatWidgetProps,
    CustomStyles,
    VoiceSession,
    VoiceConversation,
    SpeechmaticsConfig,
    WebRTCConfig,
    CostBreakdown,
    VoiceChatError,
    LanguageOption,
    WidgetState,
    AudioSettings,
    TranscriptionSettings,
    WidgetConfig,
    WidgetPosition,
    WidgetTheme,
    WidgetSize,
    ConnectionStatus,
    RecordingStatus,
    ProcessingStatus,
} from './types';

export {
    cn,
    formatDuration,
    formatFileSize,
    formatCost,
    generateId,
    debounce,
    throttle,
    isValidEmail,
    isValidApiKey,
    getPositionClasses,
    getThemeClasses,
    createError,
    log,
    retry,
    sleep,
    isMobile,
    isTouchDevice,
    getBrowserInfo,
    supportsWebRTC,
    supportsWebSocket,
    getAudioContext,
} from './utils';