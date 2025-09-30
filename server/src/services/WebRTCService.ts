import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { WebRTCSignal } from '../types';

export class WebRTCService extends EventEmitter {
    private connections: Map<string, RTCPeerConnection> = new Map();
    private dataChannels: Map<string, RTCDataChannel> = new Map();
    private iceServers: RTCIceServer[];

    constructor() {
        super();
        this.iceServers = this.loadIceServers();
    }

    /**
     * Load ICE servers configuration
     */
    private loadIceServers(): RTCIceServer[] {
        const defaultServers: RTCIceServer[] = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ];

        // Add custom STUN/TURN servers from environment if available
        const customStunServers = process.env['STUN_SERVERS'];
        const customTurnServers = process.env['TURN_SERVERS'];

        if (customStunServers) {
            const stunUrls = customStunServers.split(',').map(url => ({ urls: url.trim() }));
            defaultServers.push(...stunUrls);
        }

        if (customTurnServers) {
            const turnUrls = customTurnServers.split(',').map(url => ({
                urls: url.trim(),
                username: process.env['TURN_USERNAME'] || '',
                credential: process.env['TURN_CREDENTIAL'] || '',
            }));
            defaultServers.push(...turnUrls);
        }

        return defaultServers;
    }

    /**
     * Create a new WebRTC connection for a session
     */
    async createConnection(sessionId: string): Promise<RTCPeerConnection> {
        try {
            // Create peer connection
            const peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers,
                iceCandidatePoolSize: 10,
            });

            // Set up event handlers
            this.setupConnectionHandlers(peerConnection, sessionId);

            // Create data channel for audio streaming
            const dataChannel = peerConnection.createDataChannel('audio', {
                ordered: true,
                maxRetransmits: 3,
            });

            this.setupDataChannelHandlers(dataChannel, sessionId);

            // Store connections
            this.connections.set(sessionId, peerConnection);
            this.dataChannels.set(sessionId, dataChannel);

            logger.info(`Created WebRTC connection for session: ${sessionId}`);
            this.emit('connectionCreated', { sessionId, peerConnection });

            return peerConnection;
        } catch (error) {
            logger.error(`Failed to create WebRTC connection for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Handle incoming WebRTC signal
     */
    async handleSignal(sessionId: string, signal: WebRTCSignal): Promise<void> {
        try {
            const peerConnection = this.connections.get(sessionId);
            if (!peerConnection) {
                throw new Error(`No WebRTC connection found for session: ${sessionId}`);
            }

            switch (signal.type) {
                case 'offer':
                    await this.handleOffer(peerConnection, signal.data);
                    break;
                case 'answer':
                    await this.handleAnswer(peerConnection, signal.data);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(peerConnection, signal.data);
                    break;
                default:
                    logger.warn(`Unknown signal type: ${signal.type}`);
            }
        } catch (error) {
            logger.error(`Error handling WebRTC signal for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Create and send offer
     */
    async createOffer(sessionId: string): Promise<RTCSessionDescriptionInit> {
        try {
            const peerConnection = this.connections.get(sessionId);
            if (!peerConnection) {
                throw new Error(`No WebRTC connection found for session: ${sessionId}`);
            }

            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false,
            });

            await peerConnection.setLocalDescription(offer);

            logger.debug(`Created offer for session: ${sessionId}`);
            this.emit('offerCreated', { sessionId, offer });

            return offer;
        } catch (error) {
            logger.error(`Failed to create offer for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Create and send answer
     */
    async createAnswer(sessionId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        try {
            const peerConnection = this.connections.get(sessionId);
            if (!peerConnection) {
                throw new Error(`No WebRTC connection found for session: ${sessionId}`);
            }

            await peerConnection.setRemoteDescription(offer);

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            logger.debug(`Created answer for session: ${sessionId}`);
            this.emit('answerCreated', { sessionId, answer });

            return answer;
        } catch (error) {
            logger.error(`Failed to create answer for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Send audio data through data channel
     */
    sendAudioData(sessionId: string, audioData: ArrayBuffer): void {
        try {
            const dataChannel = this.dataChannels.get(sessionId);
            if (!dataChannel || dataChannel.readyState !== 'open') {
                logger.warn(`Data channel not ready for session: ${sessionId}`);
                return;
            }

            dataChannel.send(audioData);
            logger.debug(`Sent audio data for session: ${sessionId} (${audioData.byteLength} bytes)`);
        } catch (error) {
            logger.error(`Error sending audio data for session ${sessionId}:`, error);
        }
    }

    /**
     * Close WebRTC connection
     */
    async closeConnection(sessionId: string): Promise<void> {
        try {
            const peerConnection = this.connections.get(sessionId);
            const dataChannel = this.dataChannels.get(sessionId);

            if (dataChannel) {
                dataChannel.close();
                this.dataChannels.delete(sessionId);
            }

            if (peerConnection) {
                peerConnection.close();
                this.connections.delete(sessionId);
            }

            logger.info(`Closed WebRTC connection for session: ${sessionId}`);
            this.emit('connectionClosed', { sessionId });
        } catch (error) {
            logger.error(`Error closing WebRTC connection for session ${sessionId}:`, error);
        }
    }

    /**
     * Setup peer connection event handlers
     */
    private setupConnectionHandlers(peerConnection: RTCPeerConnection, sessionId: string): void {
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                logger.debug(`ICE candidate for session ${sessionId}:`, event.candidate);
                this.emit('iceCandidate', {
                    sessionId,
                    candidate: event.candidate,
                });
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            const state = peerConnection.iceConnectionState;
            logger.debug(`ICE connection state for session ${sessionId}: ${state}`);
            this.emit('iceConnectionStateChange', { sessionId, state });

            if (state === 'failed') {
                logger.error(`ICE connection failed for session: ${sessionId}`);
                this.emit('connectionFailed', { sessionId });
            } else if (state === 'connected' || state === 'completed') {
                logger.info(`ICE connection established for session: ${sessionId}`);
                this.emit('connectionEstablished', { sessionId });
            }
        };

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            logger.debug(`Connection state for session ${sessionId}: ${state}`);
            this.emit('connectionStateChange', { sessionId, state });
        };

        peerConnection.ondatachannel = (event) => {
            const dataChannel = event.channel;
            logger.debug(`Data channel received for session ${sessionId}:`, dataChannel.label);
            this.setupDataChannelHandlers(dataChannel, sessionId);
        };

        peerConnection.ontrack = (event) => {
            logger.debug(`Track received for session ${sessionId}:`, event.track.kind);
            this.emit('trackReceived', { sessionId, track: event.track });
        };
    }

    /**
     * Setup data channel event handlers
     */
    private setupDataChannelHandlers(dataChannel: RTCDataChannel, sessionId: string): void {
        dataChannel.onopen = () => {
            logger.info(`Data channel opened for session: ${sessionId}`);
            this.emit('dataChannelOpened', { sessionId, dataChannel });
        };

        dataChannel.onclose = () => {
            logger.info(`Data channel closed for session: ${sessionId}`);
            this.emit('dataChannelClosed', { sessionId });
        };

        dataChannel.onerror = (error) => {
            logger.error(`Data channel error for session ${sessionId}:`, error);
            this.emit('dataChannelError', { sessionId, error });
        };

        dataChannel.onmessage = (event) => {
            logger.debug(`Data channel message received for session ${sessionId}:`, event.data);
            this.emit('dataChannelMessage', { sessionId, data: event.data });
        };
    }

    /**
     * Handle incoming offer
     */
    private async handleOffer(peerConnection: RTCPeerConnection, offer: RTCSessionDescriptionInit): Promise<void> {
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        this.emit('answerCreated', { answer });
    }

    /**
     * Handle incoming answer
     */
    private async handleAnswer(peerConnection: RTCPeerConnection, answer: RTCSessionDescriptionInit): Promise<void> {
        await peerConnection.setRemoteDescription(answer);
    }

    /**
     * Handle incoming ICE candidate
     */
    private async handleIceCandidate(peerConnection: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void> {
        await peerConnection.addIceCandidate(candidate);
    }

    /**
     * Get connection status
     */
    getConnectionStatus(sessionId: string): {
        connected: boolean;
        iceConnectionState: string;
        connectionState: string;
        dataChannelState: string;
    } | null {
        const peerConnection = this.connections.get(sessionId);
        const dataChannel = this.dataChannels.get(sessionId);

        if (!peerConnection) {
            return null;
        }

        return {
            connected: peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed',
            iceConnectionState: peerConnection.iceConnectionState,
            connectionState: peerConnection.connectionState,
            dataChannelState: dataChannel?.readyState || 'closed',
        };
    }

    /**
     * Get all active connections
     */
    getActiveConnections(): string[] {
        return Array.from(this.connections.keys());
    }

    /**
     * Get service status
     */
    getStatus(): {
        activeConnections: number;
        iceServers: number;
    } {
        return {
            activeConnections: this.connections.size,
            iceServers: this.iceServers.length,
        };
    }

    /**
     * Close all connections
     */
    async closeAllConnections(): Promise<void> {
        const sessionIds = Array.from(this.connections.keys());
        
        for (const sessionId of sessionIds) {
            await this.closeConnection(sessionId);
        }

        logger.info('Closed all WebRTC connections');
    }
}
