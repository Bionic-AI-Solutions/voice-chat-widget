import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { SpeechmaticsConfig, TranscriptData, AudioChunk } from '../types';

// Speechmatics WebSocket message types based on official documentation
interface StartRecognitionMessage {
    message: 'StartRecognition';
    audio_format: {
        type: 'raw' | 'file';
        encoding?: 'pcm_f32le' | 'pcm_s16le' | 'mulaw';
        sample_rate?: number;
    };
    transcription_config: {
        language: string;
        enable_partials?: boolean;
        punctuation_overrides?: {
            permitted_marks?: string[];
            sensitivity?: number;
        };
        max_delay?: number;
        max_delay_mode?: 'flexible' | 'fixed';
        operating_point?: 'standard' | 'enhanced';
        diarization?: 'none' | 'speaker';
        speaker_diarization_config?: {
            max_speakers?: number;
            prefer_current_speaker?: boolean;
            speaker_sensitivity?: number;
        };
    };
}

interface EndOfStreamMessage {
    message: 'EndOfStream';
    last_seq_no: number;
}

interface SetRecognitionConfigMessage {
    message: 'SetRecognitionConfig';
    max_delay?: number;
    max_delay_mode?: 'flexible' | 'fixed';
    enable_partials?: boolean;
}

// Response message types
interface RecognitionStartedMessage {
    message: 'RecognitionStarted';
    id: string;
}

interface AudioAddedMessage {
    message: 'AudioAdded';
    seq_no: number;
}

interface AddTranscriptMessage {
    message: 'AddTranscript';
    transcript: {
        alternatives: Array<{
            content: string;
            confidence: number;
            language: string;
            start_time: number;
            end_time: number;
        }>;
        is_partial: boolean;
        start_time: number;
        end_time: number;
    };
}

interface AddPartialTranscriptMessage {
    message: 'AddPartialTranscript';
    transcript: {
        alternatives: Array<{
            content: string;
            confidence: number;
            language: string;
            start_time: number;
            end_time: number;
        }>;
        is_partial: boolean;
        start_time: number;
        end_time: number;
    };
}

interface EndOfTranscriptMessage {
    message: 'EndOfTranscript';
}

interface ErrorMessage {
    message: 'Error';
    type: string;
    reason: string;
    code?: number;
    seq_no?: number;
}

interface InfoMessage {
    message: 'Info';
    type: string;
    reason: string;
    code?: number;
    seq_no?: number;
}

export class SpeechmaticsService extends EventEmitter {
    private config: SpeechmaticsConfig;
    private sessionId: string;
    private ws: WebSocket | null = null;
    private isConnected = false;
    private isConnecting = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private lastHeartbeat = 0;
    private audioSequenceNumber = 0;
    private recognitionId: string | null = null;
    private isRecognitionStarted = false;

    constructor(config: SpeechmaticsConfig, sessionId: string) {
        super();
        this.config = config;
        this.sessionId = sessionId;
    }

    /**
     * Connect to Speechmatics WebSocket API
     */
    async connect(): Promise<void> {
        if (this.isConnected || this.isConnecting) {
            return;
        }

        this.isConnecting = true;

        try {
            const apiKey = process.env['SPEECHMATICS_API_KEY'];
            if (!apiKey) {
                throw new Error('Speechmatics API key not configured');
            }

            // Use the correct WebSocket URL format from documentation
            const wsUrl = 'wss://eu2.rt.speechmatics.com/v2/';
            
            // Create WebSocket connection with proper headers
            this.ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'VoiceChatWidget/1.0.0',
                },
            });

            // Set up event handlers
            this.setupWebSocketHandlers();

            // Wait for connection
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.ws!.once('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.ws!.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });

            // Send configuration
            await this.sendConfiguration();

            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;

            // Start heartbeat
            this.startHeartbeat();

            logger.info(`Connected to Speechmatics for session: ${this.sessionId}`);
            this.emit('connected');

        } catch (error) {
            this.isConnecting = false;
            logger.error(`Failed to connect to Speechmatics: ${error}`);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Disconnect from Speechmatics
     */
    disconnect(): void {
        if (!this.isConnected) {
            return;
        }

        this.isConnected = false;

        // Stop heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        logger.info(`Disconnected from Speechmatics for session: ${this.sessionId}`);
        this.emit('disconnected');
    }

    /**
     * Send audio data to Speechmatics
     */
    sendAudio(audioChunk: AudioChunk): void {
        if (!this.isConnected || !this.ws || !this.isRecognitionStarted) {
            logger.warn('Cannot send audio: not connected to Speechmatics or recognition not started');
            return;
        }

        try {
            // Increment sequence number for this audio chunk
            this.audioSequenceNumber++;
            
            // Convert audio data to the expected format
            const audioData = this.convertAudioData(audioChunk);
            
            // Send as binary data (AddAudio message)
            this.ws.send(audioData);
            
            logger.debug(`Sent audio chunk to Speechmatics: ${audioData.length} bytes, seq: ${this.audioSequenceNumber}`);
        } catch (error) {
            logger.error('Error sending audio to Speechmatics:', error);
            this.emit('error', error);
        }
    }

    /**
     * Send end of stream signal
     */
    endStream(): void {
        if (!this.isConnected || !this.ws || !this.isRecognitionStarted) {
            return;
        }

        try {
            // Send end of stream message with sequence number
            const endMessage: EndOfStreamMessage = {
                message: 'EndOfStream',
                last_seq_no: this.audioSequenceNumber,
            };

            this.ws.send(JSON.stringify(endMessage));
            logger.info('Sent EndOfStream to Speechmatics', { last_seq_no: this.audioSequenceNumber });
        } catch (error) {
            logger.error('Error sending end of stream:', error);
            this.emit('error', error);
        }
    }

    /**
     * Setup WebSocket event handlers
     */
    private setupWebSocketHandlers(): void {
        if (!this.ws) {
            return;
        }

        this.ws.on('open', () => {
            logger.debug('Speechmatics WebSocket opened');
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                logger.error('Error parsing Speechmatics message:', error);
            }
        });

        this.ws.on('error', (error) => {
            logger.error('Speechmatics WebSocket error:', error);
            this.emit('error', error);
        });

        this.ws.on('close', (code, reason) => {
            logger.warn(`Speechmatics WebSocket closed: ${code} ${reason}`);
            this.isConnected = false;
            this.emit('disconnected');
            
            // Attempt to reconnect if not intentionally closed
            if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.attemptReconnect();
            }
        });

        this.ws.on('ping', () => {
            this.lastHeartbeat = Date.now();
            if (this.ws) {
                this.ws.pong();
            }
        });
    }

    /**
     * Handle incoming messages from Speechmatics
     */
    private handleMessage(message: any): void {
        try {
            switch (message.message) {
                case 'RecognitionStarted':
                    this.handleRecognitionStarted(message as RecognitionStartedMessage);
                    break;

                case 'AudioAdded':
                    this.handleAudioAdded(message as AudioAddedMessage);
                    break;

                case 'AddTranscript':
                    this.handleTranscript(message as AddTranscriptMessage);
                    break;

                case 'AddPartialTranscript':
                    this.handlePartialTranscript(message as AddPartialTranscriptMessage);
                    break;

                case 'EndOfTranscript':
                    this.handleEndOfTranscript(message as EndOfTranscriptMessage);
                    break;

                case 'Error':
                    this.handleError(message as ErrorMessage);
                    break;

                case 'Info':
                    this.handleInfo(message as InfoMessage);
                    break;

                default:
                    logger.debug('Unknown Speechmatics message type:', message.message);
            }
        } catch (error) {
            logger.error('Error handling Speechmatics message:', error);
        }
    }

    /**
     * Handle recognition started
     */
    private handleRecognitionStarted(message: RecognitionStartedMessage): void {
        this.recognitionId = message.id;
        this.isRecognitionStarted = true;
        logger.info('Speechmatics recognition started', { id: message.id });
        this.emit('recognitionStarted', message);
    }

    /**
     * Handle audio added confirmation
     */
    private handleAudioAdded(message: AudioAddedMessage): void {
        logger.debug('Audio chunk confirmed by Speechmatics', { seq_no: message.seq_no });
        this.emit('audioAdded', message);
    }

    /**
     * Handle final transcript
     */
    private handleTranscript(message: AddTranscriptMessage): void {
        const transcriptData: TranscriptData = {
            transcript: message.transcript.alternatives[0]?.content || '',
            confidence: message.transcript.alternatives[0]?.confidence || 0,
            isPartial: false,
            timestamp: Date.now(),
            startTime: message.transcript.start_time,
            endTime: message.transcript.end_time,
        };

        logger.debug(`Final transcript: ${transcriptData.transcript}`);
        this.emit('finalTranscript', transcriptData);
    }

    /**
     * Handle partial transcript
     */
    private handlePartialTranscript(message: AddPartialTranscriptMessage): void {
        const transcriptData: TranscriptData = {
            transcript: message.transcript.alternatives[0]?.content || '',
            confidence: message.transcript.alternatives[0]?.confidence || 0,
            isPartial: true,
            timestamp: Date.now(),
            startTime: message.transcript.start_time,
            endTime: message.transcript.end_time,
        };

        logger.debug(`Partial transcript: ${transcriptData.transcript}`);
        this.emit('partialTranscript', transcriptData);
    }

    /**
     * Handle end of transcript
     */
    private handleEndOfTranscript(message: EndOfTranscriptMessage): void {
        logger.info('Speechmatics end of transcript');
        this.emit('endOfTranscript', message);
    }

    /**
     * Handle error messages
     */
    private handleError(message: ErrorMessage): void {
        logger.error('Speechmatics error:', message);
        const error = new Error(`Speechmatics Error [${message.type}]: ${message.reason}`);
        (error as any).code = message.code;
        (error as any).type = message.type;
        this.emit('error', error);
    }

    /**
     * Handle info messages
     */
    private handleInfo(message: InfoMessage): void {
        logger.info('Speechmatics info:', message);
        this.emit('info', message);
    }

    /**
     * Send configuration to Speechmatics
     */
    private async sendConfiguration(): Promise<void> {
        if (!this.ws) {
            throw new Error('WebSocket not connected');
        }

        const config: StartRecognitionMessage = {
            message: 'StartRecognition',
            audio_format: {
                type: 'raw',
                encoding: this.config.encoding as 'pcm_f32le' | 'pcm_s16le' | 'mulaw',
                sample_rate: this.config.sampleRate,
            },
            transcription_config: {
                language: this.config.language,
                enable_partials: this.config.enablePartials,
                punctuation_overrides: {
                    permitted_marks: this.config.punctuationPermitted ? ['.', '?', '!', ',', ';', ':'] : ['all'],
                    sensitivity: 0.5,
                },
                max_delay: 4,
                max_delay_mode: 'flexible',
                operating_point: 'standard',
                diarization: 'none',
            },
        };

        this.ws.send(JSON.stringify(config));
        logger.debug('Sent StartRecognition configuration to Speechmatics', config);
    }

    /**
     * Convert audio chunk to the expected format
     */
    private convertAudioData(audioChunk: AudioChunk): Buffer {
        // Convert ArrayBuffer to Buffer
        const buffer = Buffer.from(audioChunk.data);
        
        // Apply any necessary audio processing here
        // For now, we'll just return the buffer as-is
        
        return buffer;
    }

    /**
     * Start heartbeat to keep connection alive
     */
    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.ws) {
                const now = Date.now();
                
                // Send ping if no heartbeat received in 30 seconds
                if (now - this.lastHeartbeat > 30000) {
                    this.ws.ping();
                }
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Attempt to reconnect to Speechmatics
     */
    private async attemptReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnection attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        logger.info(`Attempting to reconnect to Speechmatics (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                logger.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
            }
        }, delay);
    }

    /**
     * Get connection status
     */
    getStatus(): {
        connected: boolean;
        connecting: boolean;
        reconnectAttempts: number;
        sessionId: string;
    } {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            sessionId: this.sessionId,
        };
    }
}
