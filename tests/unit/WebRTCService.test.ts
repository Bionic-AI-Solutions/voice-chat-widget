import { WebRTCService } from '../../src/src/services/WebRTCService';

describe('WebRTCService', () => {
    let webRTCService: WebRTCService;
    let mockConfig: any;

    beforeEach(() => {
        mockConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
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

        webRTCService = new WebRTCService(mockConfig);
    });

    afterEach(() => {
        if (webRTCService) {
            webRTCService.disconnect();
        }
    });

    describe('constructor', () => {
        it('should create WebRTCService instance', () => {
            expect(webRTCService).toBeDefined();
            expect(webRTCService.getStatus().connected).toBe(false);
            expect(webRTCService.getStatus().connecting).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('should return initial status', () => {
            const status = webRTCService.getStatus();
            expect(status).toEqual({
                connected: false,
                connecting: false,
                connectionState: undefined,
                iceConnectionState: undefined,
            });
        });
    });

    describe('disconnect', () => {
        it('should disconnect without errors when not connected', () => {
            expect(() => {
                webRTCService.disconnect();
            }).not.toThrow();
        });
    });

    describe('event handling', () => {
        it('should emit events', (done) => {
            webRTCService.on('connected', () => {
                done();
            });

            // Simulate connection event
            webRTCService.emit('connected');
        });

        it('should emit error events', (done) => {
            const testError = new Error('Test error');
            
            webRTCService.on('error', (error) => {
                expect(error).toBe(testError);
                done();
            });

            webRTCService.emit('error', testError);
        });
    });
});
