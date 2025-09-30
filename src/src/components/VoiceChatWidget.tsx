import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, X, Mic, MicOff, Settings, Globe } from 'lucide-react';
import { VoiceChatWidgetProps, WidgetState, LanguageOption, VoiceChatError } from '../types';
import { cn, getPositionClasses, createError, log } from '../utils';
import { LanguageSelector } from './LanguageSelector';
import { VoiceControls } from './VoiceControls';
import { TranscriptDisplay } from './TranscriptDisplay';
import { StatusIndicator } from './StatusIndicator';
import { ErrorDisplay } from './ErrorDisplay';
import { WebRTCService, WebRTCConfig } from '../services/WebRTCService';
import { SpeechmaticsService, SpeechmaticsConfig } from '../services/SpeechmaticsService';
import '../styles/index.css';

const SUPPORTED_LANGUAGES: LanguageOption[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
];

export const VoiceChatWidget: React.FC<VoiceChatWidgetProps> = ({
    apiKey,
    officerEmail,
    appName,
    language = 'en',
    position = 'bottom-right',
    theme = 'light',
    customStyles = {},
    onConversationStart,
    onConversationEnd,
    onError,
    debug = false,
    logLevel = 'info',
}) => {
    const [widgetState, setWidgetState] = useState<WidgetState>({
        isOpen: false,
        isRecording: false,
        isProcessing: false,
        isConnected: false,
        currentLanguage: language,
        transcript: '',
        partialTranscript: '',
        error: null,
        session: null,
        conversation: null,
    });

    const [showSettings, setShowSettings] = useState(false);
    const widgetRef = useRef<HTMLDivElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const webRTCServiceRef = useRef<WebRTCService | null>(null);
    const speechmaticsServiceRef = useRef<SpeechmaticsService | null>(null);

    // Initialize widget
    useEffect(() => {
        if (debug) {
            log(logLevel, 'VoiceChatWidget initialized', {
                apiKey: apiKey.substring(0, 8) + '...',
                officerEmail,
                appName,
                language,
                position,
                theme,
            });
        }

        // Validate required props
        if (!apiKey || !officerEmail || !appName) {
            const error = createError(
                'INVALID_PROPS',
                'Missing required props: apiKey, officerEmail, or appName'
            );
            setWidgetState(prev => ({ ...prev, error }));
            onError?.(error);
            return;
        }

        // Check browser compatibility
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const error = createError(
                'BROWSER_NOT_SUPPORTED',
                'This browser does not support WebRTC or microphone access'
            );
            setWidgetState(prev => ({ ...prev, error }));
            onError?.(error);
            return;
        }

        // Initialize audio context
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContext();
        } catch (error) {
            log('warn', 'Failed to initialize audio context', error);
        }

        // Cleanup function
        return () => {
            if (webRTCServiceRef.current) {
                webRTCServiceRef.current.disconnect();
            }
            if (speechmaticsServiceRef.current) {
                speechmaticsServiceRef.current.disconnect();
            }
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [apiKey, officerEmail, appName, language, position, theme, debug, logLevel, onError]);

    // Handle widget toggle
    const toggleWidget = useCallback(() => {
        setWidgetState(prev => ({
            ...prev,
            isOpen: !prev.isOpen,
            error: null,
        }));
    }, []);

    // Handle language change
    const handleLanguageChange = useCallback((newLanguage: string) => {
        setWidgetState(prev => ({
            ...prev,
            currentLanguage: newLanguage,
        }));
    }, []);

    // Handle conversation start
    const handleStartConversation = useCallback(async () => {
        try {
            setWidgetState(prev => ({
                ...prev,
                isProcessing: true,
                error: null,
            }));

            // Initialize WebRTC service
            const webRTCConfig: WebRTCConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
                audioConstraints: {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 44100,
                        channelCount: 1,
                    },
                },
                sampleRate: 44100,
                channels: 1,
            };

            const webRTCService = new WebRTCService(webRTCConfig);
            webRTCServiceRef.current = webRTCService;

            // Set up WebRTC event handlers
            webRTCService.on('connected', () => {
                if (debug) {
                    log(logLevel, 'WebRTC connected');
                }
            });

            webRTCService.on('audioChunk', (audioChunk) => {
                // Send audio to Speechmatics
                if (speechmaticsServiceRef.current) {
                    speechmaticsServiceRef.current.sendAudio(audioChunk.data);
                }
            });

            webRTCService.on('error', (error) => {
                const voiceError = createError(
                    'WEBRTC_ERROR',
                    'WebRTC connection error',
                    { originalError: error }
                );
                setWidgetState(prev => ({ ...prev, error: voiceError }));
                onError?.(voiceError);
            });

            // Initialize Speechmatics service
            const speechmaticsConfig: SpeechmaticsConfig = {
                language: widgetState.currentLanguage,
                enablePartials: true,
                punctuationPermitted: true,
                sampleRate: 44100,
                encoding: 'pcm_f32le',
            };

            const speechmaticsService = new SpeechmaticsService(speechmaticsConfig);
            speechmaticsServiceRef.current = speechmaticsService;

            // Set up Speechmatics event handlers
            speechmaticsService.on('connected', () => {
                if (debug) {
                    log(logLevel, 'Speechmatics connected');
                }
            });

            speechmaticsService.on('recognitionStarted', () => {
                if (debug) {
                    log(logLevel, 'Speechmatics recognition started');
                }
            });

            speechmaticsService.on('partialTranscript', (transcriptData) => {
                setWidgetState(prev => ({
                    ...prev,
                    partialTranscript: transcriptData.transcript,
                }));
            });

            speechmaticsService.on('finalTranscript', (transcriptData) => {
                setWidgetState(prev => ({
                    ...prev,
                    transcript: prev.transcript + ' ' + transcriptData.transcript,
                    partialTranscript: '',
                }));
            });

            speechmaticsService.on('error', (error) => {
                const voiceError = createError(
                    'SPEECHMATICS_ERROR',
                    'Speechmatics error',
                    { originalError: error }
                );
                setWidgetState(prev => ({ ...prev, error: voiceError }));
                onError?.(voiceError);
            });

            // Connect to services
            await webRTCService.initialize();
            await speechmaticsService.connect(apiKey);

            // Start streaming
            webRTCService.startStreaming();

            // Create session
            const session = {
                id: Math.random().toString(36).substr(2, 9),
                officerEmail,
                appName,
                language: widgetState.currentLanguage,
                startTime: new Date(),
                status: 'active' as const,
            };

            setWidgetState(prev => ({
                ...prev,
                session,
                isRecording: true,
                isProcessing: false,
                isConnected: true,
            }));

            onConversationStart?.(session);

            if (debug) {
                log(logLevel, 'Conversation started with WebRTC and Speechmatics', session);
            }
        } catch (error) {
            const voiceError = createError(
                'CONVERSATION_START_FAILED',
                'Failed to start conversation',
                { originalError: error }
            );
            setWidgetState(prev => ({
                ...prev,
                error: voiceError,
                isProcessing: false,
            }));
            onError?.(voiceError);
        }
    }, [apiKey, officerEmail, appName, widgetState.currentLanguage, onConversationStart, onError, debug, logLevel]);

    // Handle conversation end
    const handleEndConversation = useCallback(async () => {
        try {
            setWidgetState(prev => ({
                ...prev,
                isProcessing: true,
            }));

            // Stop WebRTC streaming
            if (webRTCServiceRef.current) {
                webRTCServiceRef.current.stopStreaming();
                webRTCServiceRef.current.disconnect();
                webRTCServiceRef.current = null;
            }

            // End Speechmatics stream and disconnect
            if (speechmaticsServiceRef.current) {
                speechmaticsServiceRef.current.endStream();
                speechmaticsServiceRef.current.disconnect();
                speechmaticsServiceRef.current = null;
            }

            // Stop media stream
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                mediaStreamRef.current = null;
            }

            // Create conversation record
            const conversation = {
                id: Math.random().toString(36).substr(2, 9),
                sessionId: widgetState.session?.id || '',
                officerEmail,
                appName,
                startTime: widgetState.session?.startTime || new Date(),
                endTime: new Date(),
                duration: widgetState.session ?
                    Math.floor((new Date().getTime() - widgetState.session.startTime.getTime()) / 1000) : 0,
                language: widgetState.currentLanguage,
                status: 'processing' as const,
                transcript: widgetState.transcript,
            };

            setWidgetState(prev => ({
                ...prev,
                conversation,
                isRecording: false,
                isProcessing: false,
                isConnected: false,
                session: null,
                transcript: '',
                partialTranscript: '',
            }));

            onConversationEnd?.(conversation);

            if (debug) {
                log(logLevel, 'Conversation ended with transcript', conversation);
            }
        } catch (error) {
            const voiceError = createError(
                'CONVERSATION_END_FAILED',
                'Failed to end conversation',
                { originalError: error }
            );
            setWidgetState(prev => ({
                ...prev,
                error: voiceError,
                isProcessing: false,
            }));
            onError?.(voiceError);
        }
    }, [officerEmail, appName, widgetState.session, widgetState.currentLanguage, widgetState.transcript, onConversationEnd, onError, debug, logLevel]);

    // Handle error dismissal
    const handleDismissError = useCallback(() => {
        setWidgetState(prev => ({
            ...prev,
            error: null,
        }));
    }, []);

    // Get position classes
    const positionClasses = getPositionClasses(position);

    // Get current language info
    const currentLanguageInfo = SUPPORTED_LANGUAGES.find(lang => lang.code === widgetState.currentLanguage);

    return (
        <div
            ref={widgetRef}
            className={cn(
                'voice-widget-container',
                positionClasses,
                theme === 'dark' && 'dark'
            )}
            style={customStyles}
        >
            {/* Main Widget Button */}
            <motion.button
                className={cn(
                    'voice-widget-button',
                    widgetState.isRecording && 'voice-widget-animate-pulse',
                    widgetState.isProcessing && 'voice-widget-animate-spin'
                )}
                onClick={toggleWidget}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label={widgetState.isOpen ? 'Close voice chat' : 'Open voice chat'}
                disabled={widgetState.isProcessing}
            >
                {widgetState.isProcessing ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : widgetState.isRecording ? (
                    <Mic className="w-6 h-6" />
                ) : (
                    <Phone className="w-6 h-6" />
                )}

                {/* Recording indicator */}
                {widgetState.isRecording && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping" />
                )}
            </motion.button>

            {/* Widget Panel */}
            <AnimatePresence>
                {widgetState.isOpen && (
                    <motion.div
                        className="voice-widget-panel"
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                        {/* Header */}
                        <div className="voice-widget-header">
                            <div className="flex items-center space-x-2">
                                <Phone className="w-5 h-5" />
                                <span className="font-semibold">Voice Chat</span>
                                {currentLanguageInfo && (
                                    <span className="text-sm opacity-90">
                                        {currentLanguageInfo.flag} {currentLanguageInfo.nativeName}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className="p-1 hover:bg-primary-700 rounded transition-colors"
                                    aria-label="Settings"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={toggleWidget}
                                    className="p-1 hover:bg-primary-700 rounded transition-colors"
                                    aria-label="Close"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="voice-widget-content">
                            {/* Settings Panel */}
                            {showSettings && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-4 p-3 bg-gray-50 rounded-lg"
                                >
                                    <LanguageSelector
                                        languages={SUPPORTED_LANGUAGES}
                                        currentLanguage={widgetState.currentLanguage}
                                        onLanguageChange={handleLanguageChange}
                                    />
                                </motion.div>
                            )}

                            {/* Status Indicator */}
                            <StatusIndicator
                                isConnected={widgetState.isConnected}
                                isRecording={widgetState.isRecording}
                                isProcessing={widgetState.isProcessing}
                                language={widgetState.currentLanguage}
                            />

                            {/* Error Display */}
                            {widgetState.error && (
                                <ErrorDisplay
                                    error={widgetState.error}
                                    onDismiss={handleDismissError}
                                />
                            )}

                            {/* Transcript Display */}
                            {(widgetState.transcript || widgetState.partialTranscript) && (
                                <TranscriptDisplay
                                    transcript={widgetState.transcript}
                                    partialTranscript={widgetState.partialTranscript}
                                    language={widgetState.currentLanguage}
                                />
                            )}

                            {/* Voice Controls */}
                            <VoiceControls
                                isRecording={widgetState.isRecording}
                                isProcessing={widgetState.isProcessing}
                                isConnected={widgetState.isConnected}
                                onStart={handleStartConversation}
                                onEnd={handleEndConversation}
                                disabled={widgetState.isProcessing}
                            />
                        </div>

                        {/* Footer */}
                        <div className="voice-widget-footer">
                            <div className="text-xs text-gray-500 text-center">
                                Powered by Voice Chat Widget
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};