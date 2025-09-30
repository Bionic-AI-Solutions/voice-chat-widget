import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { Session, Conversation, SessionStartData } from '../types';

export class SessionManager extends EventEmitter {
    private sessions: Map<string, Session> = new Map();
    private conversations: Map<string, Conversation> = new Map();
    private clientSessions: Map<string, string[]> = new Map();

    constructor() {
        super();
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    private setupEventHandlers(): void {
        // Clean up expired sessions every 5 minutes
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 5 * 60 * 1000);
    }

    /**
     * Start a new session
     */
    async startSession(data: SessionStartData): Promise<Session> {
        try {
            const session: Session = {
                id: uuidv4(),
                officerEmail: data.officerEmail,
                appName: data.appName,
                language: data.language || 'en',
                clientId: data.clientId,
                startTime: new Date(),
                status: 'active',
            };

            this.sessions.set(session.id, session);

            // Track client sessions
            if (!this.clientSessions.has(data.clientId)) {
                this.clientSessions.set(data.clientId, []);
            }
            this.clientSessions.get(data.clientId)!.push(session.id);

            logger.info(`Session started: ${session.id} for ${data.officerEmail}`);
            this.emit('sessionStarted', session);

            return session;
        } catch (error) {
            logger.error('Error starting session:', error);
            throw error;
        }
    }

    /**
     * End a session and create conversation record
     */
    async endSession(sessionId: string): Promise<Conversation> {
        try {
            const session = this.sessions.get(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            // Update session
            session.endTime = new Date();
            session.status = 'ended';
            this.sessions.set(sessionId, session);

            // Create conversation record
            const conversation: Conversation = {
                id: uuidv4(),
                sessionId: session.id,
                officerEmail: session.officerEmail,
                appName: session.appName,
                startTime: session.startTime,
                endTime: session.endTime,
                duration: Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000),
                language: session.language,
                status: 'processing',
                transcript: session.transcript,
                audioUrl: session.audioUrl,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            this.conversations.set(conversation.id, conversation);

            // Remove from client sessions
            const clientSessions = this.clientSessions.get(session.clientId);
            if (clientSessions) {
                const index = clientSessions.indexOf(sessionId);
                if (index > -1) {
                    clientSessions.splice(index, 1);
                }
                if (clientSessions.length === 0) {
                    this.clientSessions.delete(session.clientId);
                }
            }

            logger.info(`Session ended: ${sessionId}, conversation created: ${conversation.id}`);
            this.emit('sessionEnded', session);
            this.emit('conversationCreated', conversation);

            return conversation;
        } catch (error) {
            logger.error('Error ending session:', error);
            throw error;
        }
    }

    /**
     * Get session by ID
     */
    getSession(sessionId: string): Session | null {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Get conversation by ID
     */
    getConversation(conversationId: string): Conversation | null {
        return this.conversations.get(conversationId) || null;
    }

    /**
     * Get conversation by session ID
     */
    getConversationBySessionId(sessionId: string): Conversation | null {
        for (const conversation of this.conversations.values()) {
            if (conversation.sessionId === sessionId) {
                return conversation;
            }
        }
        return null;
    }

    /**
     * Get all sessions
     */
    getAllSessions(): Session[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Get all conversations
     */
    getAllConversations(): Conversation[] {
        return Array.from(this.conversations.values());
    }

    /**
     * Get sessions by client ID
     */
    getSessionsByClientId(clientId: string): Session[] {
        const sessionIds = this.clientSessions.get(clientId) || [];
        return sessionIds.map(id => this.sessions.get(id)).filter(Boolean) as Session[];
    }

    /**
     * Get active sessions
     */
    getActiveSessions(): Session[] {
        return Array.from(this.sessions.values()).filter(session => session.status === 'active');
    }

    /**
     * Get sessions by officer email
     */
    getSessionsByOfficerEmail(officerEmail: string): Session[] {
        return Array.from(this.sessions.values()).filter(session => session.officerEmail === officerEmail);
    }

    /**
     * Get conversations by officer email
     */
    getConversationsByOfficerEmail(officerEmail: string): Conversation[] {
        return Array.from(this.conversations.values()).filter(conversation => conversation.officerEmail === officerEmail);
    }

    /**
     * Update session transcript
     */
    updateSessionTranscript(sessionId: string, transcript: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }

        session.transcript = transcript;
        this.sessions.set(sessionId, session);
        
        logger.debug(`Updated transcript for session: ${sessionId}`);
        this.emit('transcriptUpdated', { sessionId, transcript });
        
        return true;
    }

    /**
     * Update session audio URL
     */
    updateSessionAudioUrl(sessionId: string, audioUrl: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }

        session.audioUrl = audioUrl;
        this.sessions.set(sessionId, session);
        
        logger.debug(`Updated audio URL for session: ${sessionId}`);
        this.emit('audioUrlUpdated', { sessionId, audioUrl });
        
        return true;
    }

    /**
     * Update conversation status
     */
    updateConversationStatus(conversationId: string, status: Conversation['status']): boolean {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) {
            return false;
        }

        conversation.status = status;
        conversation.updatedAt = new Date();
        this.conversations.set(conversationId, conversation);
        
        logger.debug(`Updated conversation status: ${conversationId} -> ${status}`);
        this.emit('conversationStatusUpdated', { conversationId, status });
        
        return true;
    }

    /**
     * Update conversation with processing results
     */
    updateConversationResults(conversationId: string, results: Partial<Conversation>): boolean {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) {
            return false;
        }

        Object.assign(conversation, results);
        conversation.updatedAt = new Date();
        this.conversations.set(conversationId, conversation);
        
        logger.debug(`Updated conversation results: ${conversationId}`);
        this.emit('conversationResultsUpdated', { conversationId, results });
        
        return true;
    }

    /**
     * Get session statistics
     */
    getSessionStats(): {
        total: number;
        active: number;
        ended: number;
        processing: number;
        byLanguage: Record<string, number>;
        byApp: Record<string, number>;
    } {
        const sessions = Array.from(this.sessions.values());
        const conversations = Array.from(this.conversations.values());

        const stats = {
            total: sessions.length,
            active: sessions.filter(s => s.status === 'active').length,
            ended: sessions.filter(s => s.status === 'ended').length,
            processing: conversations.filter(c => c.status === 'processing').length,
            byLanguage: {} as Record<string, number>,
            byApp: {} as Record<string, number>,
        };

        // Count by language
        sessions.forEach(session => {
            stats.byLanguage[session.language] = (stats.byLanguage[session.language] || 0) + 1;
        });

        // Count by app
        sessions.forEach(session => {
            stats.byApp[session.appName] = (stats.byApp[session.appName] || 0) + 1;
        });

        return stats;
    }

    /**
     * Clean up expired sessions (older than 24 hours)
     */
    private cleanupExpiredSessions(): void {
        const now = new Date();
        const expiredTime = 24 * 60 * 60 * 1000; // 24 hours

        const expiredSessions: string[] = [];
        
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.status === 'ended' && session.endTime) {
                const timeSinceEnd = now.getTime() - session.endTime.getTime();
                if (timeSinceEnd > expiredTime) {
                    expiredSessions.push(sessionId);
                }
            }
        }

        // Remove expired sessions
        expiredSessions.forEach(sessionId => {
            this.sessions.delete(sessionId);
            logger.debug(`Cleaned up expired session: ${sessionId}`);
        });

        if (expiredSessions.length > 0) {
            logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
        }
    }

    /**
     * Get service status
     */
    getStatus(): {
        sessions: number;
        conversations: number;
        activeClients: number;
        uptime: number;
    } {
        return {
            sessions: this.sessions.size,
            conversations: this.conversations.size,
            activeClients: this.clientSessions.size,
            uptime: process.uptime(),
        };
    }

    /**
     * Clear all data (for testing)
     */
    clear(): void {
        this.sessions.clear();
        this.conversations.clear();
        this.clientSessions.clear();
        logger.info('SessionManager cleared');
    }
}
