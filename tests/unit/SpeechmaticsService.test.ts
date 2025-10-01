import { SpeechmaticsService } from '../../src/src/services/SpeechmaticsService';

describe('SpeechmaticsService', () => {
    let speechmaticsService: SpeechmaticsService;
    let mockConfig: any;

    beforeEach(() => {
        mockConfig = {
            language: 'en',
            enablePartials: true,
            punctuationPermitted: true,
            sampleRate: 44100,
            encoding: 'pcm_f32le' as const,
        };

        speechmaticsService = new SpeechmaticsService(mockConfig);
    });

    afterEach(() => {
        if (speechmaticsService) {
            speechmaticsService.disconnect();
        }
    });

    describe('constructor', () => {
        it('should create SpeechmaticsService instance', () => {
            expect(speechmaticsService).toBeDefined();
            expect(speechmaticsService.getStatus().connected).toBe(false);
            expect(speechmaticsService.getStatus().connecting).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('should return initial status', () => {
            const status = speechmaticsService.getStatus();
            expect(status).toEqual({
                connected: false,
                connecting: false,
                reconnectAttempts: 0,
                recognitionId: null,
                isRecognitionStarted: false,
            });
        });
    });

    describe('disconnect', () => {
        it('should disconnect without errors when not connected', () => {
            expect(() => {
                speechmaticsService.disconnect();
            }).not.toThrow();
        });
    });

    describe('sendAudio', () => {
        it('should not send audio when not connected', () => {
            const mockAudioData = new ArrayBuffer(1024);

            expect(() => {
                speechmaticsService.sendAudio(mockAudioData);
            }).not.toThrow();
        });
    });

    describe('endStream', () => {
        it('should not end stream when not connected', () => {
            expect(() => {
                speechmaticsService.endStream();
            }).not.toThrow();
        });
    });

    describe('event handling', () => {
        it('should emit connected events', (done) => {
            speechmaticsService.on('connected', () => {
                done();
            });

            speechmaticsService.emit('connected');
        });

        it('should emit error events', (done) => {
            const testError = new Error('Test error');

            speechmaticsService.on('error', (error) => {
                expect(error).toBe(testError);
                done();
            });

            speechmaticsService.emit('error', testError);
        });

        it('should emit transcript events', (done) => {
            const mockTranscript = {
                transcript: 'Hello world',
                confidence: 0.95,
                isPartial: false,
                timestamp: Date.now(),
            };

            speechmaticsService.on('finalTranscript', (transcript) => {
                expect(transcript).toEqual(mockTranscript);
                done();
            });

            speechmaticsService.emit('finalTranscript', mockTranscript);
        });
    });
});
