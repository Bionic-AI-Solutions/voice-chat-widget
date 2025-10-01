import { EventEmitter } from 'events';

export interface WebRTCConfig {
    iceServers: RTCIceServer[];
    audioConstraints: MediaStreamConstraints;
    sampleRate: number;
    channels: number;
}

export interface AudioChunk {
    data: ArrayBuffer;
    timestamp: number;
    sequence: number;
    sampleRate: number;
    channels: number;
}

export class WebRTCService extends EventEmitter {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private audioWorkletNode: AudioWorkletNode | null = null;
    private isConnected = false;
    private isConnecting = false;
    private config: WebRTCConfig;
    private audioSequenceNumber = 0;
    private audioChunkSize = 4096; // 4KB chunks
    private audioChunkInterval: number | null = null;

    constructor(config: WebRTCConfig) {
        super();
        this.config = config;
    }

    /**
     * Initialize WebRTC connection
     */
    async initialize(): Promise<void> {
        if (this.isConnected || this.isConnecting) {
            return;
        }

        this.isConnecting = true;

        try {
            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.config.iceServers,
            });

            // Set up event handlers
            this.setupPeerConnectionHandlers();

            // Get user media
            await this.getUserMedia();

            // Set up audio processing
            await this.setupAudioProcessing();

            this.isConnected = true;
            this.isConnecting = false;

            this.emit('connected');
        } catch (error) {
            this.isConnecting = false;
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Start audio streaming
     */
    startStreaming(): void {
        if (!this.isConnected || !this.audioWorkletNode) {
            throw new Error('WebRTC not initialized');
        }

        // Start sending audio chunks
        this.audioChunkInterval = window.setInterval(() => {
            this.processAudioChunk();
        }, 100); // Send chunks every 100ms

        this.emit('streamingStarted');
    }

    /**
     * Stop audio streaming
     */
    stopStreaming(): void {
        if (this.audioChunkInterval) {
            clearInterval(this.audioChunkInterval);
            this.audioChunkInterval = null;
        }

        this.emit('streamingStopped');
    }

    /**
     * Disconnect WebRTC
     */
    disconnect(): void {
        this.stopStreaming();

        if (this.audioWorkletNode) {
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.isConnected = false;
        this.emit('disconnected');
    }

    /**
     * Get user media
     */
    private async getUserMedia(): Promise<void> {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: this.config.sampleRate,
                    channelCount: this.config.channels,
                },
            });

            // Add audio track to peer connection
            if (this.peerConnection) {
                this.localStream.getAudioTracks().forEach(track => {
                    this.peerConnection!.addTrack(track, this.localStream!);
                });
            }

            this.emit('mediaStreamReady', this.localStream);
        } catch (error) {
            throw new Error(`Failed to get user media: ${error}`);
        }
    }

    /**
     * Set up audio processing
     */
    private async setupAudioProcessing(): Promise<void> {
        if (!this.localStream) {
            throw new Error('No media stream available');
        }

        try {
            // Create audio context
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            this.audioContext = new AudioContext({
                sampleRate: this.config.sampleRate,
            });

            // Create media stream source
            const source = this.audioContext.createMediaStreamSource(this.localStream);

            // Create audio worklet for processing
            await this.audioContext.audioWorklet.addModule('/audio-processor.js');
            this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

            // Set up audio worklet message handler
            this.audioWorkletNode.port.onmessage = (event) => {
                const audioData = event.data;
                this.processAudioData(audioData);
            };

            // Connect audio nodes
            source.connect(this.audioWorkletNode);
            this.audioWorkletNode.connect(this.audioContext.destination);

        } catch (error) {
            // Fallback to manual audio processing if worklet is not available
            console.warn('Audio worklet not available, using fallback processing');
            this.setupFallbackAudioProcessing();
        }
    }

    /**
     * Fallback audio processing without worklet
     */
    private setupFallbackAudioProcessing(): void {
        if (!this.localStream || !this.audioContext) {
            return;
        }

        const source = this.audioContext.createMediaStreamSource(this.localStream);
        const processor = this.audioContext.createScriptProcessor(this.audioChunkSize, 1, 1);

        processor.onaudioprocess = (event) => {
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);

            // Convert Float32Array to ArrayBuffer
            const audioData = new ArrayBuffer(inputData.length * 4);
            const view = new Float32Array(audioData);
            view.set(inputData);

            this.processAudioData(audioData);
        };

        source.connect(processor);
        processor.connect(this.audioContext.destination);
    }

    /**
     * Process audio data
     */
    private processAudioData(audioData: ArrayBuffer): void {
        const audioChunk: AudioChunk = {
            data: audioData,
            timestamp: Date.now(),
            sequence: this.audioSequenceNumber++,
            sampleRate: this.config.sampleRate,
            channels: this.config.channels,
        };

        this.emit('audioChunk', audioChunk);
    }

    /**
     * Process audio chunk for streaming
     */
    private processAudioChunk(): void {
        // This method is called by the interval timer
        // The actual audio processing happens in processAudioData
    }

    /**
     * Set up peer connection event handlers
     */
    private setupPeerConnectionHandlers(): void {
        if (!this.peerConnection) {
            return;
        }

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.emit('iceCandidate', event.candidate);
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection?.connectionState;
            this.emit('connectionStateChange', state);

            if (state === 'connected') {
                this.emit('peerConnected');
            } else if (state === 'disconnected' || state === 'failed') {
                this.emit('peerDisconnected');
            }
        };

        this.peerConnection.ontrack = (event) => {
            this.emit('remoteTrack', event.track);
        };
    }

    /**
     * Create offer for WebRTC connection
     */
    async createOffer(): Promise<RTCSessionDescriptionInit> {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        return offer;
    }

    /**
     * Create answer for WebRTC connection
     */
    async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        return answer;
    }

    /**
     * Set remote description
     */
    async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        await this.peerConnection.setRemoteDescription(description);
    }

    /**
     * Add ICE candidate
     */
    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        await this.peerConnection.addIceCandidate(candidate);
    }

    /**
     * Get connection status
     */
    getStatus(): {
        connected: boolean;
        connecting: boolean;
        connectionState: string | undefined;
        iceConnectionState: string | undefined;
    } {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            connectionState: this.peerConnection?.connectionState,
            iceConnectionState: this.peerConnection?.iceConnectionState,
        };
    }
}
