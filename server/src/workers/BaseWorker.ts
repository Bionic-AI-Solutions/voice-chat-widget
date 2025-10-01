import Bull from 'bull';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { QueueService, JobData, QueueJob } from '../services/QueueService';

export interface WorkerConfig {
    concurrency: number;
    maxJobs: number;
    retryAttempts: number;
    retryDelay: number;
    jobTimeout: number;
    healthCheckInterval: number;
}

export interface WorkerStatus {
    name: string;
    isRunning: boolean;
    isHealthy: boolean;
    processedJobs: number;
    failedJobs: number;
    activeJobs: number;
    lastHealthCheck: Date;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
}

export abstract class BaseWorker extends EventEmitter {
    protected worker: Bull.Worker | null = null;
    protected config: WorkerConfig;
    protected isRunning = false;
    protected isHealthy = true;
    protected processedJobs = 0;
    protected failedJobs = 0;
    protected activeJobs = 0;
    protected startTime = 0;
    protected lastHealthCheck = new Date();
    protected healthCheckInterval: NodeJS.Timeout | null = null;
    protected queueService: QueueService;

    constructor(
        protected queueName: string,
        protected workerName: string,
        queueService: QueueService,
        config?: Partial<WorkerConfig>
    ) {
        super();
        this.queueService = queueService;
        this.config = {
            concurrency: parseInt(process.env['WORKER_CONCURRENCY'] || '5'),
            maxJobs: parseInt(process.env['WORKER_MAX_JOBS'] || '100'),
            retryAttempts: parseInt(process.env['WORKER_RETRY_ATTEMPTS'] || '3'),
            retryDelay: parseInt(process.env['WORKER_RETRY_DELAY'] || '5000'),
            jobTimeout: parseInt(process.env['WORKER_JOB_TIMEOUT'] || '300000'),
            healthCheckInterval: parseInt(process.env['WORKER_HEALTH_CHECK_INTERVAL'] || '30000'),
            ...config,
        };
    }

    /**
     * Start the worker
     */
    async start(): Promise<void> {
        try {
            if (this.isRunning) {
                logger.warn(`Worker ${this.workerName} is already running`);
                return;
            }

            this.worker = new Bull.Worker(
                this.queueName,
                async (job: Bull.Job<JobData>) => {
                    return this.processJob(job as QueueJob);
                },
                {
                    concurrency: this.config.concurrency,
                    limiter: {
                        max: this.config.maxJobs,
                        duration: 60000, // 1 minute
                    },
                }
            );

            // Set up worker event handlers
            this.setupEventHandlers();

            // Start health check
            this.startHealthCheck();

            this.isRunning = true;
            this.startTime = Date.now();
            this.isHealthy = true;

            logger.info(`Started worker: ${this.workerName} for queue: ${this.queueName}`);
            this.emit('started', { workerName: this.workerName, queueName: this.queueName });
        } catch (error) {
            logger.error(`Failed to start worker ${this.workerName}:`, error);
            throw error;
        }
    }

    /**
     * Stop the worker
     */
    async stop(): Promise<void> {
        try {
            if (!this.isRunning) {
                logger.warn(`Worker ${this.workerName} is not running`);
                return;
            }

            // Stop health check
            this.stopHealthCheck();

            // Close worker
            if (this.worker) {
                await this.worker.close();
                this.worker = null;
            }

            this.isRunning = false;
            this.isHealthy = false;

            logger.info(`Stopped worker: ${this.workerName}`);
            this.emit('stopped', { workerName: this.workerName, queueName: this.queueName });
        } catch (error) {
            logger.error(`Failed to stop worker ${this.workerName}:`, error);
            throw error;
        }
    }

    /**
     * Restart the worker
     */
    async restart(): Promise<void> {
        try {
            logger.info(`Restarting worker: ${this.workerName}`);
            await this.stop();
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            await this.start();
        } catch (error) {
            logger.error(`Failed to restart worker ${this.workerName}:`, error);
            throw error;
        }
    }

    /**
     * Set up worker event handlers
     */
    private setupEventHandlers(): void {
        if (!this.worker) return;

        this.worker.on('ready', () => {
            logger.info(`Worker ${this.workerName} ready`);
            this.emit('ready', { workerName: this.workerName });
        });

        this.worker.on('error', (error) => {
            logger.error(`Worker ${this.workerName} error:`, error);
            this.isHealthy = false;
            this.emit('error', { workerName: this.workerName, error });
        });

        this.worker.on('failed', (job, error) => {
            this.failedJobs++;
            logger.error(`Job ${job.id} failed in worker ${this.workerName}:`, error);
            this.emit('jobFailed', { workerName: this.workerName, job, error });
        });

        this.worker.on('completed', (job, result) => {
            this.processedJobs++;
            logger.info(`Job ${job.id} completed in worker ${this.workerName}`);
            this.emit('jobCompleted', { workerName: this.workerName, job, result });
        });

        this.worker.on('active', (job) => {
            this.activeJobs++;
            logger.debug(`Job ${job.id} active in worker ${this.workerName}`);
            this.emit('jobActive', { workerName: this.workerName, job });
        });

        this.worker.on('stalled', (job) => {
            logger.warn(`Job ${job.id} stalled in worker ${this.workerName}`);
            this.emit('jobStalled', { workerName: this.workerName, job });
        });
    }

    /**
     * Start health check
     */
    private startHealthCheck(): void {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheckInterval);
    }

    /**
     * Stop health check
     */
    private stopHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Perform health check
     */
    private performHealthCheck(): void {
        try {
            const memoryUsage = process.memoryUsage();
            const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;

            // Check memory usage
            if (memoryUsageMB > 500) { // 500MB threshold
                logger.warn(`Worker ${this.workerName} high memory usage: ${memoryUsageMB.toFixed(2)}MB`);
                this.isHealthy = false;
            } else {
                this.isHealthy = true;
            }

            // Check if worker is still running
            if (!this.worker || !this.isRunning) {
                this.isHealthy = false;
            }

            this.lastHealthCheck = new Date();

            this.emit('healthCheck', {
                workerName: this.workerName,
                isHealthy: this.isHealthy,
                memoryUsage,
                uptime: Date.now() - this.startTime,
            });
        } catch (error) {
            logger.error(`Health check failed for worker ${this.workerName}:`, error);
            this.isHealthy = false;
        }
    }

    /**
     * Process a job - to be implemented by subclasses
     */
    protected abstract processJob(job: QueueJob): Promise<any>;

    /**
     * Get worker status
     */
    getStatus(): WorkerStatus {
        return {
            name: this.workerName,
            isRunning: this.isRunning,
            isHealthy: this.isHealthy,
            processedJobs: this.processedJobs,
            failedJobs: this.failedJobs,
            activeJobs: this.activeJobs,
            lastHealthCheck: this.lastHealthCheck,
            uptime: this.isRunning ? Date.now() - this.startTime : 0,
            memoryUsage: process.memoryUsage(),
        };
    }

    /**
     * Get worker configuration
     */
    getConfig(): WorkerConfig {
        return { ...this.config };
    }

    /**
     * Update worker configuration
     */
    updateConfig(newConfig: Partial<WorkerConfig>): void {
        this.config = { ...this.config, ...newConfig };
        logger.info(`Updated configuration for worker ${this.workerName}:`, newConfig);
    }

    /**
     * Check if worker is healthy
     */
    isWorkerHealthy(): boolean {
        return this.isHealthy && this.isRunning;
    }

    /**
     * Get worker name
     */
    getWorkerName(): string {
        return this.workerName;
    }

    /**
     * Get queue name
     */
    getQueueName(): string {
        return this.queueName;
    }
}