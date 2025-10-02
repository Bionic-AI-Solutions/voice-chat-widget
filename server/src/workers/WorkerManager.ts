import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { QueueService } from '../services/QueueService';
import { BaseWorker, WorkerStatus } from './BaseWorker';
import { AudioWorker } from './AudioWorker';
import { SummaryWorker } from './SummaryWorker';
import { PdfWorker } from './PdfWorker';
import { EmailWorker } from './EmailWorker';

export interface WorkerPoolConfig {
    maxWorkers: number;
    healthCheckInterval: number;
    autoRestart: boolean;
    restartDelay: number;
    maxRestartAttempts: number;
}

export interface WorkerPoolStatus {
    totalWorkers: number;
    runningWorkers: number;
    healthyWorkers: number;
    workers: WorkerStatus[];
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
}

export class WorkerManager extends EventEmitter {
    private workers: Map<string, BaseWorker> = new Map();
    private config: WorkerPoolConfig;
    private isInitialized = false;
    private startTime = 0;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private restartAttempts: Map<string, number> = new Map();

    constructor(
        private queueService: QueueService,
        config?: Partial<WorkerPoolConfig>
    ) {
        super();
        this.config = {
            maxWorkers: parseInt(process.env['WORKER_POOL_MAX_WORKERS'] || '10'),
            healthCheckInterval: parseInt(process.env['WORKER_POOL_HEALTH_CHECK_INTERVAL'] || '30000'),
            autoRestart: process.env['WORKER_POOL_AUTO_RESTART'] === 'true',
            restartDelay: parseInt(process.env['WORKER_POOL_RESTART_DELAY'] || '5000'),
            maxRestartAttempts: parseInt(process.env['WORKER_POOL_MAX_RESTART_ATTEMPTS'] || '3'),
            ...config,
        };
    }

    /**
     * Initialize the worker manager
     */
    async initialize(): Promise<void> {
        try {
            if (this.isInitialized) {
                return;
            }

            // Register worker types
            this.registerWorkerTypes();

            this.isInitialized = true;
            this.startTime = Date.now();
            logger.info('WorkerManager initialized successfully');
            this.emit('initialized');
        } catch (error) {
            logger.error('Failed to initialize WorkerManager:', error);
            throw error;
        }
    }

    /**
     * Register worker types
     */
    private registerWorkerTypes(): void {
        // Audio processing worker
        const audioWorker = new AudioWorker(this.queueService);
        this.workers.set('audio-worker', audioWorker);

        // Summary generation worker
        const summaryWorker = new SummaryWorker(this.queueService);
        this.workers.set('summary-worker', summaryWorker);

        // PDF creation worker
        const pdfWorker = new PdfWorker(this.queueService);
        this.workers.set('pdf-worker', pdfWorker);

        // Email delivery worker
        const emailWorker = new EmailWorker(this.queueService);
        this.workers.set('email-worker', emailWorker);

        logger.info(`Registered ${this.workers.size} worker types`);
    }

    /**
     * Start all workers
     */
    async startAllWorkers(): Promise<void> {
        try {
            logger.info('Starting all workers...');

            const startPromises = Array.from(this.workers.values()).map(worker => {
                return this.startWorker(worker);
            });

            await Promise.all(startPromises);

            // Start health check
            this.startHealthCheck();

            logger.info(`Started ${this.workers.size} workers successfully`);
            this.emit('allWorkersStarted', { count: this.workers.size });
        } catch (error) {
            logger.error('Failed to start all workers:', error);
            throw error;
        }
    }

    /**
     * Stop all workers
     */
    async stopAllWorkers(): Promise<void> {
        try {
            logger.info('Stopping all workers...');

            const stopPromises = Array.from(this.workers.values()).map(worker => {
                return this.stopWorker(worker);
            });

            await Promise.all(stopPromises);

            // Stop health check
            this.stopHealthCheck();

            logger.info(`Stopped ${this.workers.size} workers successfully`);
            this.emit('allWorkersStopped', { count: this.workers.size });
        } catch (error) {
            logger.error('Failed to stop all workers:', error);
            throw error;
        }
    }

    /**
     * Start a specific worker
     */
    async startWorker(worker: BaseWorker): Promise<void> {
        try {
            const workerName = worker.getWorkerName();
            logger.info(`Starting worker: ${workerName}`);

            await worker.start();

            // Set up worker event handlers
            this.setupWorkerEventHandlers(worker);

            logger.info(`Started worker: ${workerName}`);
            this.emit('workerStarted', { workerName });
        } catch (error) {
            logger.error(`Failed to start worker ${worker.getWorkerName()}:`, error);
            throw error;
        }
    }

    /**
     * Stop a specific worker
     */
    async stopWorker(worker: BaseWorker): Promise<void> {
        try {
            const workerName = worker.getWorkerName();
            logger.info(`Stopping worker: ${workerName}`);

            await worker.stop();

            logger.info(`Stopped worker: ${workerName}`);
            this.emit('workerStopped', { workerName });
        } catch (error) {
            logger.error(`Failed to stop worker ${worker.getWorkerName()}:`, error);
            throw error;
        }
    }

    /**
     * Restart a specific worker
     */
    async restartWorker(workerName: string): Promise<void> {
        try {
            const worker = this.workers.get(workerName);
            if (!worker) {
                throw new Error(`Worker ${workerName} not found`);
            }

            logger.info(`Restarting worker: ${workerName}`);
            await worker.restart();

            // Reset restart attempts
            this.restartAttempts.delete(workerName);

            logger.info(`Restarted worker: ${workerName}`);
            this.emit('workerRestarted', { workerName });
        } catch (error) {
            logger.error(`Failed to restart worker ${workerName}:`, error);
            throw error;
        }
    }

    /**
     * Set up worker event handlers
     */
    private setupWorkerEventHandlers(worker: BaseWorker): void {
        const workerName = worker.getWorkerName();

        worker.on('error', (data) => {
            logger.error(`Worker ${workerName} error:`, data.error);
            this.emit('workerError', { workerName, error: data.error });

            // Auto-restart if enabled
            if (this.config.autoRestart) {
                this.handleWorkerError(workerName);
            }
        });

        worker.on('jobFailed', (data) => {
            logger.error(`Job failed in worker ${workerName}:`, data.error);
            this.emit('jobFailed', { workerName, job: data.job, error: data.error });
        });

        worker.on('jobCompleted', (data) => {
            logger.debug(`Job completed in worker ${workerName}`);
            this.emit('jobCompleted', { workerName, job: data.job, result: data.result });
        });

        worker.on('healthCheck', (data) => {
            if (!data.isHealthy) {
                logger.warn(`Worker ${workerName} health check failed`);
                this.emit('workerUnhealthy', { workerName, data });

                // Auto-restart if enabled
                if (this.config.autoRestart) {
                    this.handleWorkerError(workerName);
                }
            }
        });
    }

    /**
     * Handle worker error and auto-restart
     */
    private async handleWorkerError(workerName: string): Promise<void> {
        try {
            const attempts = this.restartAttempts.get(workerName) || 0;

            if (attempts >= this.config.maxRestartAttempts) {
                logger.error(`Worker ${workerName} exceeded max restart attempts (${this.config.maxRestartAttempts})`);
                this.emit('workerMaxRestartAttemptsReached', { workerName, attempts });
                return;
            }

            this.restartAttempts.set(workerName, attempts + 1);

            logger.info(`Auto-restarting worker ${workerName} (attempt ${attempts + 1}/${this.config.maxRestartAttempts})`);

            // Wait before restarting
            await new Promise(resolve => setTimeout(resolve, this.config.restartDelay));

            await this.restartWorker(workerName);
        } catch (error) {
            logger.error(`Failed to auto-restart worker ${workerName}:`, error);
        }
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
     * Perform health check on all workers
     */
    private performHealthCheck(): void {
        try {
            const healthyWorkers = Array.from(this.workers.values()).filter(worker => 
                worker.isWorkerHealthy()
            ).length;

            const totalWorkers = this.workers.size;

            if (healthyWorkers < totalWorkers) {
                logger.warn(`Health check: ${healthyWorkers}/${totalWorkers} workers are healthy`);
            }

            this.emit('healthCheck', {
                totalWorkers,
                healthyWorkers,
                unhealthyWorkers: totalWorkers - healthyWorkers,
            });
        } catch (error) {
            logger.error('Health check failed:', error);
        }
    }

    /**
     * Get worker by name
     */
    getWorker(workerName: string): BaseWorker | undefined {
        return this.workers.get(workerName);
    }

    /**
     * Get all workers
     */
    getAllWorkers(): Map<string, BaseWorker> {
        return new Map(this.workers);
    }

    /**
     * Get worker pool status
     */
    getPoolStatus(): WorkerPoolStatus {
        const workers = Array.from(this.workers.values());
        const runningWorkers = workers.filter(worker => worker.getStatus().isRunning).length;
        const healthyWorkers = workers.filter(worker => worker.isWorkerHealthy()).length;

        return {
            totalWorkers: this.workers.size,
            runningWorkers,
            healthyWorkers,
            workers: workers.map(worker => worker.getStatus()),
            uptime: this.isInitialized ? Date.now() - this.startTime : 0,
            memoryUsage: process.memoryUsage(),
        };
    }

    /**
     * Get worker status by name
     */
    getWorkerStatus(workerName: string): WorkerStatus | null {
        const worker = this.workers.get(workerName);
        return worker ? worker.getStatus() : null;
    }

    /**
     * Get service status
     */
    getStatus(): { initialized: boolean; workers: number; uptime: number } {
        return {
            initialized: this.isInitialized,
            workers: this.workers.size,
            uptime: this.isInitialized ? Date.now() - this.startTime : 0,
        };
    }

    /**
     * Close the worker manager
     */
    async close(): Promise<void> {
        try {
            logger.info('Closing WorkerManager...');

            await this.stopAllWorkers();

            this.workers.clear();
            this.restartAttempts.clear();
            this.isInitialized = false;

            logger.info('WorkerManager closed');
            this.emit('closed');
        } catch (error) {
            logger.error('Error closing WorkerManager:', error);
            throw error;
        }
    }

    /**
     * Shutdown the worker manager (alias for close)
     */
    async shutdown(): Promise<void> {
        return this.close();
    }
}