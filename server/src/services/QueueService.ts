import Bull from 'bull';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface QueueConfig {
    redis: string | {
        host: string;
        port: number;
        password?: string;
        db?: number;
        maxRetriesPerRequest: number;
        retryDelayOnFailover: number;
        enableReadyCheck: boolean;
        lazyConnect: boolean;
    };
    defaultJobOptions: {
        removeOnComplete: number;
        removeOnFail: number;
        attempts: number;
        backoff: {
            type: 'exponential';
            delay: number;
        };
    };
}

export interface JobData {
    sessionId: string;
    conversationId?: string;
    audioUrl?: string;
    transcript?: string;
    metadata?: Record<string, any>;
    priority?: number;
    delay?: number;
}

export interface QueueJob extends Bull.Job<JobData> {
    data: JobData;
}

export class QueueService extends EventEmitter {
    private redis: Redis;
    private queues: Map<string, Bull.Queue> = new Map();
    private workers: Map<string, Bull.Worker> = new Map();
    private config: QueueConfig;
    private isInitialized = false;

    // Queue names
    public static readonly AUDIO_QUEUE = 'audio-processing';
    public static readonly SUMMARY_QUEUE = 'summary-generation';
    public static readonly PDF_QUEUE = 'pdf-creation';
    public static readonly EMAIL_QUEUE = 'email-delivery';

    constructor() {
        super();
        this.config = this.loadConfig();
    }

    /**
     * Load configuration from environment variables
     */
    private loadConfig(): QueueConfig {
        // Parse REDIS_URL if available, otherwise use individual components
        let redisConfig: any = {};
        
        if (process.env['REDIS_URL']) {
            // Use REDIS_URL directly
            redisConfig = process.env['REDIS_URL'];
        } else {
            // Use individual components
            redisConfig = {
                host: process.env['REDIS_HOST'] || 'localhost',
                port: parseInt(process.env['REDIS_PORT'] || '6379'),
                password: process.env['REDIS_PASSWORD'],
                db: parseInt(process.env['REDIS_DB'] || '0'),
                maxRetriesPerRequest: parseInt(process.env['REDIS_MAX_RETRIES'] || '3'),
                retryDelayOnFailover: 100,
                enableReadyCheck: true,
                lazyConnect: true,
            };
        }

        return {
            redis: redisConfig,
            defaultJobOptions: {
                removeOnComplete: 10,
                removeOnFail: 5,
                attempts: parseInt(process.env['WORKER_RETRY_ATTEMPTS'] || '3'),
                backoff: {
                    type: 'exponential',
                    delay: parseInt(process.env['WORKER_RETRY_DELAY'] || '5000'),
                },
            },
        };
    }

    /**
     * Initialize Redis connection and queues
     */
    async initialize(): Promise<void> {
        try {
            if (this.isInitialized) {
                return;
            }

            // Create Redis connection
            if (typeof this.config.redis === 'string') {
                // Use REDIS_URL directly
                this.redis = new Redis(this.config.redis);
            } else {
                // Use individual components
                this.redis = new Redis({
                    host: this.config.redis.host,
                    port: this.config.redis.port,
                    password: this.config.redis.password,
                    db: this.config.redis.db,
                    maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
                    retryDelayOnFailover: this.config.redis.retryDelayOnFailover,
                    enableReadyCheck: this.config.redis.enableReadyCheck,
                    lazyConnect: this.config.redis.lazyConnect,
                });
            }

            // Set up Redis event handlers
            this.redis.on('connect', () => {
                logger.info('Redis connected');
            });

            this.redis.on('ready', () => {
                logger.info('Redis ready');
            });

            this.redis.on('error', (error) => {
                logger.error('Redis error:', error);
                this.emit('error', error);
            });

            this.redis.on('close', () => {
                logger.warn('Redis connection closed');
            });

            // Initialize queues
            await this.initializeQueues();

            this.isInitialized = true;
            logger.info('QueueService initialized successfully');
            this.emit('initialized');
        } catch (error) {
            logger.error('Failed to initialize QueueService:', error);
            throw error;
        }
    }

    /**
     * Initialize all queues
     */
    private async initializeQueues(): Promise<void> {
        const queueNames = [
            QueueService.AUDIO_QUEUE,
            QueueService.SUMMARY_QUEUE,
            QueueService.PDF_QUEUE,
            QueueService.EMAIL_QUEUE,
        ];

        for (const queueName of queueNames) {
            await this.createQueue(queueName);
        }
    }

    /**
     * Create a new queue
     */
    private async createQueue(queueName: string): Promise<Bull.Queue> {
        const queueOptions: Bull.QueueOptions = {
            redis: this.config.redis,
            defaultJobOptions: this.config.defaultJobOptions,
        };

        const queue = new Bull(queueName, queueOptions);

        // Set up queue event handlers
        queue.on('error', (error) => {
            logger.error(`Queue ${queueName} error:`, error);
            this.emit('queueError', { queueName, error });
        });

        queue.on('waiting', (jobId) => {
            logger.debug(`Job ${jobId} waiting in queue ${queueName}`);
        });

        queue.on('active', (job) => {
            logger.debug(`Job ${job.id} active in queue ${queueName}`);
            this.emit('jobActive', { queueName, job });
        });

        queue.on('completed', (job, result) => {
            logger.info(`Job ${job.id} completed in queue ${queueName}`);
            this.emit('jobCompleted', { queueName, job, result });
        });

        queue.on('failed', (job, error) => {
            logger.error(`Job ${job.id} failed in queue ${queueName}:`, error);
            this.emit('jobFailed', { queueName, job, error });
        });

        queue.on('stalled', (job) => {
            logger.warn(`Job ${job.id} stalled in queue ${queueName}`);
            this.emit('jobStalled', { queueName, job });
        });

        this.queues.set(queueName, queue);
        logger.info(`Created queue: ${queueName}`);
        return queue;
    }

    /**
     * Add a job to a queue
     */
    async addJob(queueName: string, jobData: JobData, options?: any): Promise<QueueJob> {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const jobOptions = {
            ...this.config.defaultJobOptions,
            ...options,
            priority: jobData.priority || 0,
            delay: jobData.delay || 0,
        };

        const job = await queue.add(jobData, jobOptions);
        logger.info(`Added job ${job.id} to queue ${queueName}`);
        return job as QueueJob;
    }

    /**
     * Add audio processing job
     */
    async addAudioJob(sessionId: string, audioUrl: string, metadata?: Record<string, any>): Promise<QueueJob> {
        return this.addJob(QueueService.AUDIO_QUEUE, {
            sessionId,
            audioUrl,
            metadata,
        });
    }

    /**
     * Add summary generation job
     */
    async addSummaryJob(sessionId: string, transcript: string, metadata?: Record<string, any>): Promise<QueueJob> {
        return this.addJob(QueueService.SUMMARY_QUEUE, {
            sessionId,
            transcript,
            metadata,
        });
    }

    /**
     * Add PDF creation job
     */
    async addPdfJob(sessionId: string, conversationId: string, metadata?: Record<string, any>): Promise<QueueJob> {
        return this.addJob(QueueService.PDF_QUEUE, {
            sessionId,
            conversationId,
            metadata,
        });
    }

    /**
     * Add email delivery job
     */
    async addEmailJob(sessionId: string, conversationId: string, metadata?: Record<string, any>): Promise<QueueJob> {
        return this.addJob(QueueService.EMAIL_QUEUE, {
            sessionId,
            conversationId,
            metadata,
        });
    }

    /**
     * Get queue statistics
     */
    async getQueueStats(queueName: string): Promise<any> {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getCompleted(),
            queue.getFailed(),
            queue.getDelayed(),
        ]);

        return {
            queueName,
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            delayed: delayed.length,
        };
    }

    /**
     * Get all queue statistics
     */
    async getAllQueueStats(): Promise<any[]> {
        const stats = [];
        for (const queueName of this.queues.keys()) {
            stats.push(await this.getQueueStats(queueName));
        }
        return stats;
    }

    /**
     * Get job by ID
     */
    async getJob(queueName: string, jobId: string): Promise<QueueJob | null> {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const job = await queue.getJob(jobId);
        return job as QueueJob | null;
    }

    /**
     * Cancel a job
     */
    async cancelJob(queueName: string, jobId: string): Promise<boolean> {
        const job = await this.getJob(queueName, jobId);
        if (!job) {
            return false;
        }

        await job.remove();
        logger.info(`Cancelled job ${jobId} in queue ${queueName}`);
        return true;
    }

    /**
     * Retry a failed job
     */
    async retryJob(queueName: string, jobId: string): Promise<boolean> {
        const job = await this.getJob(queueName, jobId);
        if (!job) {
            return false;
        }

        await job.retry();
        logger.info(`Retrying job ${jobId} in queue ${queueName}`);
        return true;
    }

    /**
     * Clean up old jobs
     */
    async cleanQueue(queueName: string, grace: number = 24 * 60 * 60 * 1000): Promise<void> {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        await queue.clean(grace, 'completed');
        await queue.clean(grace, 'failed');
        logger.info(`Cleaned queue ${queueName}`);
    }

    /**
     * Pause a queue
     */
    async pauseQueue(queueName: string): Promise<void> {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        await queue.pause();
        logger.info(`Paused queue ${queueName}`);
    }

    /**
     * Resume a queue
     */
    async resumeQueue(queueName: string): Promise<void> {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        await queue.resume();
        logger.info(`Resumed queue ${queueName}`);
    }

    /**
     * Get Redis connection status
     */
    getRedisStatus(): { connected: boolean; status: string } {
        return {
            connected: this.redis?.status === 'ready',
            status: this.redis?.status || 'disconnected',
        };
    }

    /**
     * Get service status
     */
    getStatus(): { initialized: boolean; queues: number; redis: { connected: boolean; status: string } } {
        return {
            initialized: this.isInitialized,
            queues: this.queues.size,
            redis: this.getRedisStatus(),
        };
    }

    /**
     * Close all connections
     */
    async close(): Promise<void> {
        try {
            // Close all workers
            for (const [name, worker] of this.workers.entries()) {
                await worker.close();
                logger.info(`Closed worker: ${name}`);
            }
            this.workers.clear();

            // Close all queues
            for (const [name, queue] of this.queues.entries()) {
                await queue.close();
                logger.info(`Closed queue: ${name}`);
            }
            this.queues.clear();

            // Close Redis connection
            if (this.redis) {
                await this.redis.quit();
                logger.info('Closed Redis connection');
            }

            this.isInitialized = false;
            logger.info('QueueService closed');
        } catch (error) {
            logger.error('Error closing QueueService:', error);
            throw error;
        }
    }
}