import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { SessionManager } from './services/SessionManager';
import { SpeechmaticsService } from './services/SpeechmaticsService';
import { WebRTCService } from './services/WebRTCService';
import { QueueService } from './services/QueueService';
import { WorkerManager } from './workers/WorkerManager';
import { SupabaseService } from './services/SupabaseService';
import { WebhookService } from './services/WebhookService';
import { SystemInitializer } from './services/SystemInitializer';
import { AudioChunk } from './types';
import path from 'path';

// Load environment variables
dotenv.config({ path: '../.env' });

class VoiceChatServer {
    private app: express.Application;
    private server: any;
    private io: SocketIOServer;
    private sessionManager: SessionManager;
    private webrtcService: WebRTCService;
    private speechmaticsServices: Map<string, SpeechmaticsService> = new Map();
    private queueService: QueueService;
    private workerManager: WorkerManager;
    private supabaseService: SupabaseService;
    private webhookService: WebhookService;
    private systemInitializer: SystemInitializer;

    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: process.env['CORS_ORIGIN']?.split(',') || ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });

        this.sessionManager = new SessionManager();
        this.webrtcService = new WebRTCService();
        this.queueService = new QueueService();
        this.workerManager = new WorkerManager(this.queueService);
        this.supabaseService = new SupabaseService();
        this.webhookService = new WebhookService(this.supabaseService);
        
        // Initialize system initializer
        this.systemInitializer = new SystemInitializer({
            supabase: {
                url: process.env['SUPABASE_URL'] || '',
                serviceKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] || '',
                projectId: process.env['SUPABASE_PROJECT_ID'] || ''
            },
            minio: {
                endPoint: process.env['MINIO_ENDPOINT'] || 'localhost',
                port: parseInt(process.env['MINIO_PORT'] || '9000'),
                useSSL: process.env['MINIO_USE_SSL'] === 'true',
                accessKey: process.env['MINIO_ACCESS_KEY'] || '',
                secretKey: process.env['MINIO_SECRET_KEY'] || '',
                region: process.env['MINIO_REGION'] || 'us-east-1'
            },
            paths: {
                migrations: path.join(__dirname, '../../supabase/migrations'),
                functions: path.join(__dirname, '../../supabase/functions')
            }
        });

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.setupEventHandlers();
        this.setupGlobalIO();
    }

    /**
     * Setup middleware
     */
    private setupMiddleware(): void {
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env['CORS_ORIGIN']?.split(',') || ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
            credentials: true,
        }));
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    }

    /**
     * Setup routes
     */
    private setupRoutes(): void {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env['npm_package_version'] || '1.0.0'
            });
        });

        // System status endpoint
        this.app.get('/api/system/status', async (req, res) => {
            try {
                const status = await this.systemInitializer.getSystemStatus();
                res.json({
                    ...status,
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime()
                });
            } catch (error) {
                logger.error('Error fetching system status:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // System initialization endpoint
        this.app.post('/api/system/initialize', async (req, res) => {
            try {
                const result = await this.systemInitializer.initialize();
                res.json({
                    success: result,
                    message: result ? 'System initialized successfully' : 'System initialization failed',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error initializing system:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API routes
        this.app.get('/api/sessions', (req, res) => {
            try {
                const sessions = this.sessionManager.getAllSessions();
                return res.json({ sessions });
            } catch (error) {
                logger.error('Error fetching sessions:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.get('/api/sessions/:sessionId', (req, res) => {
            try {
                const { sessionId } = req.params;
                const session = this.sessionManager.getSession(sessionId);
                if (!session) {
                    return res.status(404).json({ error: 'Session not found' });
                }
                return res.json({ session });
            } catch (error) {
                logger.error('Error fetching session:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.delete('/api/sessions/:sessionId', (req, res) => {
            try {
                const { sessionId } = req.params;
                const success = this.sessionManager.endSession(sessionId);
                if (!success) {
                    return res.status(404).json({ error: 'Session not found' });
                }
                return res.json({ message: 'Session ended successfully' });
            } catch (error) {
                logger.error('Error ending session:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Webhook routes for Supabase database changes
        this.app.post('/webhooks/supabase', (req, res) => {
            this.webhookService.handleSupabaseWebhook(req, res);
        });

        // Task management routes
        this.app.post('/api/tasks/:taskId/cancel', async (req, res) => {
            try {
                const { taskId } = req.params;
                await this.supabaseService.cancelTask(taskId);
                res.json({ message: 'Task cancelled successfully' });
            } catch (error) {
                logger.error('Error cancelling task:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.post('/api/tasks/:taskId/retry', async (req, res) => {
            try {
                const { taskId } = req.params;
                await this.supabaseService.retryTask(taskId);
                res.json({ message: 'Task retry initiated successfully' });
            } catch (error) {
                logger.error('Error retrying task:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Real-time subscription routes
        this.app.get('/api/conversations/:conversationId', async (req, res) => {
            try {
                const { conversationId } = req.params;
                const conversation = await this.supabaseService.getConversationWithTasks(conversationId);
                res.json({ conversation });
            } catch (error) {
                logger.error('Error fetching conversation:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }

    /**
     * Setup Socket.IO handlers
     */
    private setupSocketHandlers(): void {
        this.io.on('connection', (socket) => {
            logger.info(`Client connected: ${socket.id}`);

            // Handle session start
            socket.on('startSession', async (data) => {
                try {
                    const { officerEmail, appName, language = 'en' } = data;

                    if (!officerEmail || !appName) {
                        socket.emit('error', { message: 'Missing required fields: officerEmail and appName' });
                        return;
                    }

                    const session = await this.sessionManager.startSession({
                        officer_email: officerEmail,
                        app_name: appName,
                        language,
                        client_id: socket.id
                    });

                    // Create Speechmatics service for this session
                    const speechmaticsService = new SpeechmaticsService({
                        language,
                        enablePartials: true,
                        punctuationPermitted: true,
                        sampleRate: 16000,
                        encoding: 'pcm_f32le'
                    }, session.id);

                    this.speechmaticsServices.set(session.id, speechmaticsService);

                    // Connect to Speechmatics
                    await speechmaticsService.connect();

                    // Setup Speechmatics event handlers
                    speechmaticsService.on('partialTranscript', (data) => {
                        socket.emit('partialTranscript', data);
                    });

                    speechmaticsService.on('finalTranscript', (data) => {
                        socket.emit('finalTranscript', data);
                    });

                    speechmaticsService.on('error', (error) => {
                        logger.error('Speechmatics error:', error);
                        socket.emit('error', { message: 'Transcription service error' });
                    });

                    socket.emit('sessionStarted', session);
                    logger.info(`Session started: ${session.id} for ${officerEmail}`);

                } catch (error) {
                    logger.error('Error starting session:', error);
                    socket.emit('error', { message: 'Failed to start session' });
                }
            });

            // Handle audio data
            socket.on('audioData', (data) => {
                try {
                    const { sessionId, audioChunk } = data;

                    if (!sessionId || !audioChunk) {
                        socket.emit('error', { message: 'Missing sessionId or audioChunk' });
                        return;
                    }

                    const speechmaticsService = this.speechmaticsServices.get(sessionId);
                    if (speechmaticsService) {
                        speechmaticsService.sendAudio(audioChunk);
                    } else {
                        socket.emit('error', { message: 'Session not found or transcription service not available' });
                    }
                } catch (error) {
                    logger.error('Error processing audio data:', error);
                    socket.emit('error', { message: 'Failed to process audio data' });
                }
            });

            // Handle session end
            socket.on('endSession', async (data) => {
                try {
                    const { sessionId } = data;

                    if (!sessionId) {
                        socket.emit('error', { message: 'Missing sessionId' });
                        return;
                    }

                    const conversation = await this.sessionManager.endSession(sessionId);

                    // Clean up Speechmatics service
                    const speechmaticsService = this.speechmaticsServices.get(sessionId);
                    if (speechmaticsService) {
                        speechmaticsService.disconnect();
                        this.speechmaticsServices.delete(sessionId);
                    }

                    // Create jobs for post-processing
                    if (conversation) {
                        // Add audio processing job
                        if (conversation.audio_url) {
                            await this.queueService.addJob(QueueService.AUDIO_QUEUE, {
                                sessionId: conversation.session_id,
                                conversationId: conversation.id,
                                audioUrl: conversation.audio_url,
                                metadata: {
                                    officerEmail: conversation.officer_email,
                                    appName: conversation.app_name,
                                    language: conversation.language,
                                    duration: conversation.duration
                                }
                            });
                        }

                        // Add summary generation job (depends on audio processing)
                        await this.queueService.addJob(QueueService.SUMMARY_QUEUE, {
                            sessionId: conversation.session_id,
                            conversationId: conversation.id,
                            metadata: {
                                officerEmail: conversation.officer_email,
                                appName: conversation.app_name,
                                language: conversation.language
                            }
                        }, {
                            delay: 30000 // Wait 30 seconds for audio processing to complete
                        });

                        logger.info(`Created processing jobs for conversation: ${conversation.id}`);
                    }

                    socket.emit('sessionEnded', conversation);
                    logger.info(`Session ended: ${sessionId}`);

                } catch (error) {
                    logger.error('Error ending session:', error);
                    socket.emit('error', { message: 'Failed to end session' });
                }
            });

            // Handle WebRTC signaling
            socket.on('webrtc-signal', async (data) => {
                try {
                    const { sessionId, signal } = data;

                    if (!sessionId || !signal) {
                        socket.emit('error', { message: 'Missing sessionId or signal' });
                        return;
                    }

                    // Handle WebRTC signaling through the service
                    await this.webrtcService.handleSignal(sessionId, signal);

                    // Forward the signal to other clients if needed
                    socket.to(sessionId).emit('webrtc-signal', { sessionId, signal });

                } catch (error) {
                    logger.error('Error handling WebRTC signal:', error);
                    socket.emit('error', { message: 'Failed to handle WebRTC signal' });
                }
            });

            // Handle WebRTC connection creation
            socket.on('create-webrtc-connection', async (data) => {
                try {
                    const { sessionId } = data;

                    if (!sessionId) {
                        socket.emit('error', { message: 'Missing sessionId' });
                        return;
                    }

                    // Create WebRTC connection
                    const peerConnection = await this.webrtcService.createConnection(sessionId);

                    // Set up event handlers for this connection
                    this.webrtcService.on('iceCandidate', ({ sessionId: connSessionId, candidate }) => {
                        if (connSessionId === sessionId) {
                            socket.emit('ice-candidate', { sessionId, candidate });
                        }
                    });

                    this.webrtcService.on('connectionEstablished', ({ sessionId: connSessionId }) => {
                        if (connSessionId === sessionId) {
                            socket.emit('webrtc-connected', { sessionId });
                        }
                    });

                    this.webrtcService.on('dataChannelMessage', ({ sessionId: connSessionId, data }) => {
                        if (connSessionId === sessionId) {
                            // Handle incoming audio data from WebRTC
                            const speechmaticsService = this.speechmaticsServices.get(sessionId);
                            if (speechmaticsService) {
                                // Convert data to AudioChunk format
                                const audioChunk: AudioChunk = {
                                    data: Buffer.from(data),
                                    timestamp: Date.now(),
                                    sequence: 0, // This should be managed properly
                                };
                                speechmaticsService.sendAudio(audioChunk);
                            }
                        }
                    });

                    socket.emit('webrtc-connection-created', { sessionId });

                } catch (error) {
                    logger.error('Error creating WebRTC connection:', error);
                    socket.emit('error', { message: 'Failed to create WebRTC connection' });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                logger.info(`Client disconnected: ${socket.id}`);

                // Clean up any active sessions for this client
                const sessions = this.sessionManager.getSessionsByClientId(socket.id);
                sessions.forEach(async (session) => {
                    try {
                        await this.sessionManager.endSession(session.id);

                        // Clean up Speechmatics service
                        const speechmaticsService = this.speechmaticsServices.get(session.id);
                        if (speechmaticsService) {
                            speechmaticsService.disconnect();
                            this.speechmaticsServices.delete(session.id);
                        }

                        // Clean up WebRTC connection
                        await this.webrtcService.closeConnection(session.id);
                    } catch (error) {
                        logger.error('Error cleaning up session on disconnect:', error);
                    }
                });
            });
        });
    }

    /**
     * Setup event handlers
     */
    private setupEventHandlers(): void {
        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received, shutting down gracefully');
            this.shutdown();
        });

        process.on('SIGINT', () => {
            logger.info('SIGINT received, shutting down gracefully');
            this.shutdown();
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            this.shutdown();
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.shutdown();
        });
    }

    /**
     * Setup global IO instance for real-time updates
     */
    private setupGlobalIO(): void {
        // Make io instance globally available for Supabase service
        (global as any).io = this.io;
        logger.info('Global IO instance set up for real-time updates');
    }

    /**
     * Start the server
     */
    public async start(): Promise<void> {
        try {
            // Initialize system (database, MinIO, edge functions)
            logger.info('🚀 Starting system initialization...');
            const systemInitialized = await this.systemInitializer.initialize();
            
            if (!systemInitialized) {
                logger.error('❌ System initialization failed, but continuing with startup...');
            } else {
                logger.info('✅ System initialization completed successfully');
            }

            // Perform health check
            const healthCheck = await this.systemInitializer.performHealthCheck();
            if (!healthCheck) {
                logger.warn('⚠️ Some system components are unhealthy, but continuing with startup...');
            }

            // Initialize queue service
            await this.queueService.initialize();
            logger.info('Queue service initialized');

            // Initialize worker manager (optional for now)
            try {
                await this.workerManager.initialize();
                logger.info('Worker manager initialized');
            } catch (error) {
                logger.warn('Worker manager initialization failed, continuing without workers:', (error as Error).message);
            }

            const port = process.env['APP_PORT'] || 3001;
            const host = process.env['APP_HOST'] || '0.0.0.0';

            this.server.listen(port, host, () => {
                logger.info(`Voice Chat Server running on ${host}:${port}`);
                logger.info(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
                logger.info(`CORS Origins: ${process.env['CORS_ORIGIN'] || 'default'}`);
            });
        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    /**
     * Shutdown the server gracefully
     */
    private async shutdown(): Promise<void> {
        logger.info('Shutting down server...');

        try {
            // Stop worker manager
            await this.workerManager.shutdown();
            logger.info('Worker manager stopped');

            // Close queue service
            await this.queueService.shutdown();
            logger.info('Queue service stopped');

            // Close all Speechmatics connections
            this.speechmaticsServices.forEach((service) => {
                service.disconnect();
            });
            this.speechmaticsServices.clear();

            // Close all WebRTC connections
            await this.webrtcService.closeAllConnections();
            logger.info('All WebRTC connections closed');

            // Cleanup Supabase service
            this.supabaseService.cleanup();
            logger.info('Supabase service cleaned up');

            // Close Socket.IO server
            this.io.close(() => {
                logger.info('Socket.IO server closed');
            });

            // Close HTTP server
            this.server.close(() => {
                logger.info('HTTP server closed');
                process.exit(0);
            });
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Start the server
const server = new VoiceChatServer();
server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
});
