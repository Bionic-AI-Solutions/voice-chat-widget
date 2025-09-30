import { SessionManager } from '../../server/src/services/SessionManager';
import { SessionStartData } from '../../server/src/types';

describe('SessionManager', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
        sessionManager = new SessionManager();
    });

    afterEach(() => {
        sessionManager.clear();
    });

    describe('startSession', () => {
        it('should create a new session with valid data', async () => {
            const sessionData: SessionStartData = {
                officerEmail: 'test@example.com',
                appName: 'test-app',
                language: 'en',
                clientId: 'client-123',
            };

            const session = await sessionManager.startSession(sessionData);

            expect(session).toBeDefined();
            expect(session.id).toBeDefined();
            expect(session.officerEmail).toBe(sessionData.officerEmail);
            expect(session.appName).toBe(sessionData.appName);
            expect(session.language).toBe(sessionData.language);
            expect(session.clientId).toBe(sessionData.clientId);
            expect(session.status).toBe('active');
            expect(session.startTime).toBeInstanceOf(Date);
        });

        it('should use default language when not provided', async () => {
            const sessionData: SessionStartData = {
                officerEmail: 'test@example.com',
                appName: 'test-app',
                clientId: 'client-123',
            };

            const session = await sessionManager.startSession(sessionData);

            expect(session.language).toBe('en');
        });

        it('should track client sessions', async () => {
            const sessionData: SessionStartData = {
                officerEmail: 'test@example.com',
                appName: 'test-app',
                clientId: 'client-123',
            };

            await sessionManager.startSession(sessionData);
            const clientSessions = sessionManager.getSessionsByClientId('client-123');

            expect(clientSessions).toHaveLength(1);
            expect(clientSessions[0].clientId).toBe('client-123');
        });
    });

    describe('endSession', () => {
        it('should end a session and create conversation', async () => {
            const sessionData: SessionStartData = {
                officerEmail: 'test@example.com',
                appName: 'test-app',
                clientId: 'client-123',
            };

            const session = await sessionManager.startSession(sessionData);
            const conversation = await sessionManager.endSession(session.id);

            expect(conversation).toBeDefined();
            expect(conversation.sessionId).toBe(session.id);
            expect(conversation.officerEmail).toBe(session.officerEmail);
            expect(conversation.appName).toBe(session.appName);
            expect(conversation.status).toBe('processing');
            expect(conversation.startTime).toEqual(session.startTime);
            expect(conversation.endTime).toBeInstanceOf(Date);
            expect(conversation.duration).toBeGreaterThanOrEqual(0);
        });

        it('should throw error for non-existent session', async () => {
            await expect(sessionManager.endSession('non-existent')).rejects.toThrow('Session non-existent not found');
        });
    });

    describe('getSession', () => {
        it('should return session by ID', async () => {
            const sessionData: SessionStartData = {
                officerEmail: 'test@example.com',
                appName: 'test-app',
                clientId: 'client-123',
            };

            const session = await sessionManager.startSession(sessionData);
            const retrievedSession = sessionManager.getSession(session.id);

            expect(retrievedSession).toEqual(session);
        });

        it('should return null for non-existent session', () => {
            const session = sessionManager.getSession('non-existent');
            expect(session).toBeNull();
        });
    });

    describe('getAllSessions', () => {
        it('should return all sessions', async () => {
            const sessionData1: SessionStartData = {
                officerEmail: 'test1@example.com',
                appName: 'test-app',
                clientId: 'client-1',
            };

            const sessionData2: SessionStartData = {
                officerEmail: 'test2@example.com',
                appName: 'test-app',
                clientId: 'client-2',
            };

            await sessionManager.startSession(sessionData1);
            await sessionManager.startSession(sessionData2);

            const allSessions = sessionManager.getAllSessions();
            expect(allSessions).toHaveLength(2);
        });
    });

    describe('updateSessionTranscript', () => {
        it('should update session transcript', async () => {
            const sessionData: SessionStartData = {
                officerEmail: 'test@example.com',
                appName: 'test-app',
                clientId: 'client-123',
            };

            const session = await sessionManager.startSession(sessionData);
            const success = sessionManager.updateSessionTranscript(session.id, 'Hello world');

            expect(success).toBe(true);
            
            const updatedSession = sessionManager.getSession(session.id);
            expect(updatedSession?.transcript).toBe('Hello world');
        });

        it('should return false for non-existent session', () => {
            const success = sessionManager.updateSessionTranscript('non-existent', 'Hello world');
            expect(success).toBe(false);
        });
    });

    describe('getSessionStats', () => {
        it('should return correct statistics', async () => {
            const sessionData1: SessionStartData = {
                officerEmail: 'test1@example.com',
                appName: 'app1',
                clientId: 'client-1',
                language: 'en',
            };

            const sessionData2: SessionStartData = {
                officerEmail: 'test2@example.com',
                appName: 'app2',
                clientId: 'client-2',
                language: 'es',
            };

            await sessionManager.startSession(sessionData1);
            await sessionManager.startSession(sessionData2);

            const stats = sessionManager.getSessionStats();

            expect(stats.total).toBe(2);
            expect(stats.active).toBe(2);
            expect(stats.ended).toBe(0);
            expect(stats.byLanguage.en).toBe(1);
            expect(stats.byLanguage.es).toBe(1);
            expect(stats.byApp.app1).toBe(1);
            expect(stats.byApp.app2).toBe(1);
        });
    });
});
