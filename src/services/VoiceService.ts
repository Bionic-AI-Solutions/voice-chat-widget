import { io, Socket } from 'socket.io-client';
import { VoiceSession, VoiceConversation, VoiceChatError } from '../types';
import { createError, log } from '../utils';

export interface VoiceServiceConfig {
    serverUrl: string;
    apiKey: string;
    debug?: boolean;
    logLevel?: string;
}

export class VoiceService {
    private socket: Socket | null = null;
    private config: VoiceServiceConfig;
    private isConnected = false;
    private currentSession: VoiceSession | null = null;
    private mediaStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private eventListeners: { [key: string]: Function[] } = {};

    constructor(config: VoiceServiceConfig) {
        this.config = config;
    }

    // Simple event emitter implementation
    on(event: string, listener: Function) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(listener);
    }

    off(event: string, listener: Function) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(l => l !== listener);
        }
    }

    emit(event: string, ...args: any[]) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(listener => listener(...args));
        }
    }

    removeListener(event: string, listener: Function) {
        this.off(event, listener);
    }

    /**
     * Connect to the voice server
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if (this.isConnected) {
                    resolve();
                    return;
                }

                log('Connecting to voice server...', this.config.debug);

                this.socket = io(this.config.serverUrl, {
                    transports: ['websocket'],
                    timeout: 10000,
                    forceNew: true,
                });

                this.socket.on('connect', () => {
                    log('Connected to voice server', this.config.debug);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.emit('connected');
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    log('Connection error:', error, this.config.debug);
                    this.emit('error', {
                        code: 'CONNECTION_ERROR',
                        message: 'Failed to connect to voice server',
                        details: error
                    });
                    reject(error);
                });

                this.socket.on('disconnect', (reason) => {
                    log('Disconnected from voice server:', reason, this.config.debug);
                    this.isConnected = false;
                    this.emit('disconnected', reason);
                    
                    if (reason === 'io server disconnect') {
                        // Server initiated disconnect, don't reconnect
                        return;
                    }
                    
                    this.handleReconnect();
                });

                this.socket.on('error', (error) => {
                    log('Socket error:', error, this.config.debug);
                    this.emit('error', {
                        code: 'SOCKET_ERROR',
                        message: 'Socket connection error',
                        details: error
                    });
                });

                // Set up message handlers
                this.setupMessageHandlers();

            } catch (error) {
                log('Error connecting to voice server:', error, this.config.debug);
                reject(error);
            }
        });
    }

    /**
     * Start a voice session
     */
    async startSession(officerEmail: string, appName: string, language: string = 'en'): Promise<void> {
        if (!this.isConnected) {
            throw createError('NOT_CONNECTED', 'Not connected to voice server');
        }

        if (this.currentSession) {
            throw createError('SESSION_ACTIVE', 'Session already active');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(createError('TIMEOUT', 'Session start timeout'));
            }, 10000);

            const onSessionStarted = (session: VoiceSession) => {
                clearTimeout(timeout);
                this.currentSession = session;
                this.emit('sessionStarted', session);
                resolve();
            };

            const onError = (error: VoiceChatError) => {
                clearTimeout(timeout);
                reject(error);
            };

            this.on('sessionStarted', onSessionStarted);
            this.on('error', onError);

            // Request microphone access
            this.requestMicrophoneAccess()
                .then(() => {
                    // Send session start request
                    this.socket?.emit('startSession', {
                        officerEmail,
                        appName,
                        language
                    });
                })
                .catch((error) => {
                    clearTimeout(timeout);
                    this.off('sessionStarted', onSessionStarted);
                    this.off('error', onError);
                    reject(error);
                });
        });
    }

    /**
     * End the current voice session
     */
    async endSession(): Promise<VoiceConversation | undefined> {
        if (!this.currentSession) {
            throw createError('NO_SESSION', 'No active session');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(createError('TIMEOUT', 'Session end timeout'));
            }, 5000);

            const onSessionEnded = (conversation: VoiceConversation) => {
                clearTimeout(timeout);
                this.currentSession = null;
                this.emit('sessionEnded', conversation);
                resolve(conversation);
            };

            const onError = (error: VoiceChatError) => {
                clearTimeout(timeout);
                reject(error);
            };

            this.on('sessionEnded', onSessionEnded);
            this.on('error', onError);

            this.socket?.emit('endSession', {
                sessionId: this.currentSession.id
            });
        });
    }

    /**
     * Request microphone access
     */
    private async requestMicrophoneAccess(): Promise<void> {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                },
            });

            this.setupAudioProcessing();
            log('Microphone access granted', this.config.debug);
        } catch (error) {
            log('Microphone access denied:', error, this.config.debug);
            throw createError('MICROPHONE_ACCESS_DENIED', 'Microphone access is required for voice chat');
        }
    }

    /**
     * Setup audio processing
     */
    private setupAudioProcessing(): void {
        if (!this.mediaStream) return;

        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Create a script processor for audio processing
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            this.processor.onaudioprocess = (event) => {
                if (this.currentSession && this.isConnected) {
                    const inputBuffer = event.inputBuffer;
                    const audioData = inputBuffer.getChannelData(0);
                    
                    // Convert Float32Array to ArrayBuffer
                    const audioBuffer = new ArrayBuffer(audioData.length * 4);
                    const view = new Float32Array(audioBuffer);
                    view.set(audioData);
                    
                    // Send audio data to server
                    this.socket?.emit('audioData', {
                        sessionId: this.currentSession.id,
                        audioChunk: {
                            data: Array.from(new Uint8Array(audioBuffer)),
                            timestamp: Date.now(),
                            sampleRate: 16000,
                            channels: 1
                        }
                    });
                }
            };

            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            log('Audio processing setup complete', this.config.debug);
        } catch (error) {
            log('Error setting up audio processing:', error, this.config.debug);
            throw createError('AUDIO_PROCESSING_ERROR', 'Failed to setup audio processing');
        }
    }

    /**
     * Setup message handlers
     */
    private setupMessageHandlers(): void {
        if (!this.socket) return;

        this.socket.on('partialTranscript', (data) => {
            this.emit('partialTranscript', data);
        });

        this.socket.on('finalTranscript', (data) => {
            this.emit('finalTranscript', data);
        });

        this.socket.on('sessionStarted', (data) => {
            this.emit('sessionStarted', data);
        });

        this.socket.on('sessionEnded', (data) => {
            this.emit('sessionEnded', data);
        });

        this.socket.on('error', (error) => {
            this.emit('error', error);
        });
    }

    /**
     * Handle reconnection
     */
    private handleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            log('Max reconnection attempts reached', this.config.debug);
            this.emit('error', {
                code: 'MAX_RECONNECT_ATTEMPTS',
                message: 'Maximum reconnection attempts reached'
            });
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`, this.config.debug);
        
        setTimeout(() => {
            this.connect().catch((error) => {
                log('Reconnection failed:', error, this.config.debug);
            });
        }, delay);
    }

    /**
     * Disconnect from the voice server
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        
        this.isConnected = false;
        this.currentSession = null;
        this.emit('disconnected');
    }

    /**
     * Get connection status
     */
    getConnectionStatus(): boolean {
        return this.isConnected;
    }

    /**
     * Get current session
     */
    getCurrentSession(): VoiceSession | null {
        return this.currentSession;
    }
}