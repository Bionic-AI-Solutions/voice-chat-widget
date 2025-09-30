// Test setup file for Jest
import '@testing-library/jest-dom';

// Mock WebSocket for tests
const mockWebSocket = {
    close: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
    readyState: 1,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
};

// Mock MediaDevices for tests
Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    value: {
        getUserMedia: jest.fn().mockResolvedValue({
            getTracks: () => [
                {
                    kind: 'audio',
                    stop: jest.fn(),
                },
            ],
        }),
    },
});

// Mock AudioContext for tests
const mockAudioContext = {
    createMediaStreamSource: jest.fn().mockReturnValue({
        connect: jest.fn(),
    }),
    createScriptProcessor: jest.fn().mockReturnValue({
        connect: jest.fn(),
        disconnect: jest.fn(),
        onaudioprocess: null,
    }),
    close: jest.fn(),
    destination: {},
};

Object.defineProperty(window, 'AudioContext', {
    writable: true,
    value: jest.fn().mockImplementation(() => mockAudioContext),
});

Object.defineProperty(window, 'webkitAudioContext', {
    writable: true,
    value: jest.fn().mockImplementation(() => mockAudioContext),
});

// Mock WebSocket for tests
Object.defineProperty(global, 'WebSocket', {
    writable: true,
    value: jest.fn().mockImplementation(() => mockWebSocket),
});

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(() => {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
});

// Global test timeout
jest.setTimeout(30000);

// Mock environment variables
process.env.SPEECHMATICS_API_KEY = 'test-api-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.NODE_ENV = 'test';
process.env.APP_PORT = '3001';
process.env.APP_HOST = '0.0.0.0';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.LOG_LEVEL = 'error';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ACCESS_KEY = 'minioadmin';
process.env.MINIO_SECRET_KEY = 'minioadmin123';
