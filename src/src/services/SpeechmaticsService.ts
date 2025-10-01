import { EventEmitter } from 'events';

export interface SpeechmaticsConfig {
    language: string;
    enablePartials: boolean;
    punctuationPermitted: boolean;
    sampleRate: number;
    encoding: 'pcm_f32le' | 'pcm_s16le' | 'mulaw';
}

export interface TranscriptData {
    transcript: string;
    confidence: number;
    isPartial: boolean;
    timestamp: number;
    startTime?: number;
    endTime?: number;
}

export class SpeechmaticsService extends EventEmitter {
    private ws: WebSocket | null = null;
    private config: SpeechmaticsConfig;
    private isConnected = false;
    private isConnecting = false;
    private audioSequenceNumber = 0;
    private recognitionId: string | null = null;
    private isRecognitionStarted = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;

    constructor(config: SpeechmaticsConfig) {
        super();
        this.config = config;
    }

    /**
     * Connect to Speechmatics WebSocket API
     */
    async connect(apiKey: string): Promise<void> {
        if (this.isConnected || this.isConnecting) {
            return;
        }

        this.isConnecting = true;

        try {
            // Use temporary key for browser-based transcription
            const tempKey = await this.getTemporaryKey(apiKey);

            // Create WebSocket connection with temporary key
            const wsUrl = `wss://eu2.rt.speechmatics.com/v2?jwt=${tempKey}`;
            this.ws = new WebSocket(wsUrl);

            // Set up event handlers
            this.setupWebSocketHandlers();

            // Wait for connection
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.ws!.onopen = () => {
                    clearTimeout(timeout);
                    resolve();
                };

                this.ws!.onerror = (error) => {
                    clearTimeout(timeout);
                    reject(error);
                };
            });

            // Send configuration
            await this.sendConfiguration();

            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;

            this.emit('connected');
        } catch (error) {
            this.isConnecting = false;
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

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.emit('disconnected');
    }

    /**
     * Send audio data to Speechmatics
     */
    sendAudio(audioData: ArrayBuffer): void {
        if (!this.isConnected || !this.ws || !this.isRecognitionStarted) {
            console.warn('Cannot send audio: not connected to Speechmatics or recognition not started');
            return;
        }

        try {
            // Increment sequence number
            this.audioSequenceNumber++;

            // Send as binary data (AddAudio message)
            this.ws.send(audioData);

            console.debug(`Sent audio chunk to Speechmatics: ${audioData.byteLength} bytes, seq: ${this.audioSequenceNumber}`);
        } catch (error) {
            console.error('Error sending audio to Speechmatics:', error);
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
            const endMessage = {
                message: 'EndOfStream',
                last_seq_no: this.audioSequenceNumber,
            };

            this.ws.send(JSON.stringify(endMessage));
            console.info('Sent EndOfStream to Speechmatics', { last_seq_no: this.audioSequenceNumber });
        } catch (error) {
            console.error('Error sending end of stream:', error);
            this.emit('error', error);
        }
    }

    /**
     * Get temporary key for browser-based transcription
     */
    private async getTemporaryKey(apiKey: string): Promise<string> {
        try {
            const response = await fetch('https://asr.api.speechmatics.com/v2/auth/temporary', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    expires_in: 3600, // 1 hour
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to get temporary key: ${response.statusText}`);
            }

            const data = await response.json();
            return data.temporary_key;
        } catch (error) {
            console.error('Error getting temporary key:', error);
            throw error;
        }
    }

    /**
     * Set up WebSocket event handlers
     */
    private setupWebSocketHandlers(): void {
        if (!this.ws) {
            return;
        }

        this.ws.onopen = () => {
            console.debug('Speechmatics WebSocket opened');
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Error parsing Speechmatics message:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('Speechmatics WebSocket error:', error);
            this.emit('error', error);
        };

        this.ws.onclose = (event) => {
            console.warn(`Speechmatics WebSocket closed: ${event.code} ${event.reason}`);
            this.isConnected = false;
            this.emit('disconnected');

            // Attempt to reconnect if not intentionally closed
            if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.attemptReconnect();
            }
        };
    }

    /**
     * Handle incoming messages from Speechmatics
     */
    private handleMessage(message: any): void {
        try {
            switch (message.message) {
                case 'RecognitionStarted':
                    this.handleRecognitionStarted(message);
                    break;

                case 'AudioAdded':
                    this.handleAudioAdded(message);
                    break;

                case 'AddTranscript':
                    this.handleTranscript(message);
                    break;

                case 'AddPartialTranscript':
                    this.handlePartialTranscript(message);
                    break;

                case 'EndOfTranscript':
                    this.handleEndOfTranscript(message);
                    break;

                case 'Error':
                    this.handleError(message);
                    break;

                case 'Info':
                    this.handleInfo(message);
                    break;

                default:
                    console.debug('Unknown Speechmatics message type:', message.message);
            }
        } catch (error) {
            console.error('Error handling Speechmatics message:', error);
        }
    }

    /**
     * Handle recognition started
     */
    private handleRecognitionStarted(message: any): void {
        this.recognitionId = message.id;
        this.isRecognitionStarted = true;
        console.info('Speechmatics recognition started', { id: message.id });
        this.emit('recognitionStarted', message);
    }

    /**
     * Handle audio added confirmation
     */
    private handleAudioAdded(message: any): void {
        console.debug('Audio chunk confirmed by Speechmatics', { seq_no: message.seq_no });
        this.emit('audioAdded', message);
    }

    /**
     * Handle final transcript
     */
    private handleTranscript(message: any): void {
        const transcriptData: TranscriptData = {
            transcript: message.transcript.alternatives[0]?.content || '',
            confidence: message.transcript.alternatives[0]?.confidence || 0,
            isPartial: false,
            timestamp: Date.now(),
            startTime: message.transcript.start_time,
            endTime: message.transcript.end_time,
        };

        console.debug(`Final transcript: ${transcriptData.transcript}`);
        this.emit('finalTranscript', transcriptData);
    }

    /**
     * Handle partial transcript
     */
    private handlePartialTranscript(message: any): void {
        const transcriptData: TranscriptData = {
            transcript: message.transcript.alternatives[0]?.content || '',
            confidence: message.transcript.alternatives[0]?.confidence || 0,
            isPartial: true,
            timestamp: Date.now(),
            startTime: message.transcript.start_time,
            endTime: message.transcript.end_time,
        };

        console.debug(`Partial transcript: ${transcriptData.transcript}`);
        this.emit('partialTranscript', transcriptData);
    }

    /**
     * Handle end of transcript
     */
    private handleEndOfTranscript(message: any): void {
        console.info('Speechmatics end of transcript');
        this.emit('endOfTranscript', message);
    }

    /**
     * Handle error messages
     */
    private handleError(message: any): void {
        console.error('Speechmatics error:', message);
        const error = new Error(`Speechmatics Error [${message.type}]: ${message.reason}`);
        (error as any).code = message.code;
        (error as any).type = message.type;
        this.emit('error', error);
    }

    /**
     * Handle info messages
     */
    private handleInfo(message: any): void {
        console.info('Speechmatics info:', message);
        this.emit('info', message);
    }

    /**
     * Send configuration to Speechmatics
     */
    private async sendConfiguration(): Promise<void> {
        if (!this.ws) {
            throw new Error('WebSocket not connected');
        }

        const config = {
            message: 'StartRecognition',
            audio_format: {
                type: 'raw',
                encoding: this.config.encoding,
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
        console.debug('Sent StartRecognition configuration to Speechmatics', config);
    }

    /**
     * Attempt to reconnect to Speechmatics
     */
    private async attemptReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.info(`Attempting to reconnect to Speechmatics (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

        setTimeout(async () => {
            try {
                // Note: We need the API key to reconnect, but it's not stored
                // This is a limitation of the current implementation
                console.warn('Reconnection not implemented - need API key');
            } catch (error) {
                console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
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
        recognitionId: string | null;
        isRecognitionStarted: boolean;
    } {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            recognitionId: this.recognitionId,
            isRecognitionStarted: this.isRecognitionStarted,
        };
    }
}
