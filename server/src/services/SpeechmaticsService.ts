import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { SpeechmaticsConfig, TranscriptData, AudioChunk } from '../types';

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

            const wsUrl = `wss://eu2.rt.speechmatics.com/v2/${this.sessionId}`;
            
            // Create WebSocket connection
            this.ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
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
        if (!this.isConnected || !this.ws) {
            logger.warn('Cannot send audio: not connected to Speechmatics');
            return;
        }

        try {
            // Convert audio data to the expected format
            const audioData = this.convertAudioData(audioChunk);
            
            // Send as binary data
            this.ws.send(audioData);
            
            logger.debug(`Sent audio chunk to Speechmatics: ${audioData.length} bytes`);
        } catch (error) {
            logger.error('Error sending audio to Speechmatics:', error);
            this.emit('error', error);
        }
    }

    /**
     * Send end of stream signal
     */
    endStream(): void {
        if (!this.isConnected || !this.ws) {
            return;
        }

        try {
            // Send end of stream message
            const endMessage = {
                type: 'EndOfStream',
            };

            this.ws.send(JSON.stringify(endMessage));
            logger.info('Sent end of stream to Speechmatics');
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
            switch (message.type) {
                case 'RecognitionStarted':
                    logger.debug('Speechmatics recognition started');
                    this.emit('recognitionStarted', message);
                    break;

                case 'AddTranscript':
                    this.handleTranscript(message);
                    break;

                case 'AddPartialTranscript':
                    this.handlePartialTranscript(message);
                    break;

                case 'EndOfTranscript':
                    logger.debug('Speechmatics end of transcript');
                    this.emit('endOfTranscript', message);
                    break;

                case 'Error':
                    logger.error('Speechmatics error:', message);
                    this.emit('error', new Error(message.error));
                    break;

                default:
                    logger.debug('Unknown Speechmatics message type:', message.type);
            }
        } catch (error) {
            logger.error('Error handling Speechmatics message:', error);
        }
    }

    /**
     * Handle final transcript
     */
    private handleTranscript(message: any): void {
        const transcriptData: TranscriptData = {
            transcript: message.alternatives[0]?.content || '',
            confidence: message.alternatives[0]?.confidence || 0,
            isPartial: false,
            timestamp: Date.now(),
        };

        logger.debug(`Final transcript: ${transcriptData.transcript}`);
        this.emit('finalTranscript', transcriptData);
    }

    /**
     * Handle partial transcript
     */
    private handlePartialTranscript(message: any): void {
        const transcriptData: TranscriptData = {
            transcript: message.alternatives[0]?.content || '',
            confidence: message.alternatives[0]?.confidence || 0,
            isPartial: true,
            timestamp: Date.now(),
        };

        logger.debug(`Partial transcript: ${transcriptData.transcript}`);
        this.emit('partialTranscript', transcriptData);
    }

    /**
     * Send configuration to Speechmatics
     */
    private async sendConfiguration(): Promise<void> {
        if (!this.ws) {
            throw new Error('WebSocket not connected');
        }

        const config = {
            type: 'StartRecognition',
            audio_format: {
                type: 'raw',
                encoding: this.config.encoding,
                sample_rate: this.config.sampleRate,
            },
            transcription_config: {
                language: this.config.language,
                enable_partials: this.config.enablePartials,
                punctuation_overrides: {
                    permitted_marks: this.config.punctuationPermitted ? ['.', '?', '!', ',', ';', ':'] : [],
                },
            },
        };

        this.ws.send(JSON.stringify(config));
        logger.debug('Sent configuration to Speechmatics');
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
