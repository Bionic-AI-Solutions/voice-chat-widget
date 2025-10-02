import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { SupabaseService } from './SupabaseService';

export interface WebhookPayload {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    record: any;
    old_record?: any;
    schema: string;
}

export class WebhookService {
    private supabaseService: SupabaseService;

    constructor(supabaseService: SupabaseService) {
        this.supabaseService = supabaseService;
    }

    /**
     * Handle Supabase webhook for database changes
     */
    async handleSupabaseWebhook(req: Request, res: Response): Promise<void> {
        try {
            const payload: WebhookPayload = req.body;
            
            logger.info('Webhook received:', {
                type: payload.type,
                table: payload.table,
                recordId: payload.record?.id
            });

            // Verify webhook signature if needed
            if (!this.verifyWebhookSignature(req)) {
                logger.warn('Invalid webhook signature');
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Route to appropriate handler based on table
            switch (payload.table) {
                case 'conversations':
                    await this.handleConversationWebhook(payload);
                    break;
                case 'tasks':
                    await this.handleTaskWebhook(payload);
                    break;
                case 'audit_logs':
                    await this.handleAuditLogWebhook(payload);
                    break;
                default:
                    logger.warn('Unknown table in webhook:', payload.table);
            }

            res.status(200).json({ success: true });
        } catch (error) {
            logger.error('Error handling webhook:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Handle conversation-related webhooks
     */
    private async handleConversationWebhook(payload: WebhookPayload): Promise<void> {
        const { type, record, old_record } = payload;

        switch (type) {
            case 'INSERT':
                await this.handleNewConversation(record);
                break;
            case 'UPDATE':
                await this.handleConversationUpdate(record, old_record);
                break;
            case 'DELETE':
                await this.handleConversationDelete(old_record);
                break;
        }
    }

    /**
     * Handle task-related webhooks
     */
    private async handleTaskWebhook(payload: WebhookPayload): Promise<void> {
        const { type, record, old_record } = payload;

        switch (type) {
            case 'INSERT':
                await this.handleNewTask(record);
                break;
            case 'UPDATE':
                await this.handleTaskUpdate(record, old_record);
                break;
            case 'DELETE':
                await this.handleTaskDelete(old_record);
                break;
        }
    }

    /**
     * Handle audit log webhooks
     */
    private async handleAuditLogWebhook(payload: WebhookPayload): Promise<void> {
        const { type, record } = payload;

        if (type === 'INSERT') {
            logger.info('Audit log entry created:', {
                action: record.action,
                userId: record.user_id,
                details: record.details
            });
        }
    }

    /**
     * Handle new conversation creation
     */
    private async handleNewConversation(record: any): Promise<void> {
        logger.info('New conversation created via webhook:', record.id);

        // Emit to connected clients
        if (global.io) {
            global.io.emit('conversation-created', {
                conversation: record,
                timestamp: new Date().toISOString()
            });
        }

        // Create initial tasks if needed
        if (record.status === 'active') {
            // Create audio processing task
            await this.supabaseService.createTask({
                id: `audio-${record.id}-${Date.now()}`,
                type: 'audio',
                conversationId: record.id,
                status: 'queued',
                metadata: {
                    audioUrl: record.audio_url,
                    language: record.language
                }
            });
        }
    }

    /**
     * Handle conversation updates
     */
    private async handleConversationUpdate(record: any, oldRecord: any): Promise<void> {
        logger.info('Conversation updated via webhook:', record.id);

        // Check if status changed
        if (oldRecord && oldRecord.status !== record.status) {
            logger.info('Conversation status changed:', {
                id: record.id,
                from: oldRecord.status,
                to: record.status
            });

            // Handle status-specific logic
            switch (record.status) {
                case 'completed':
                    await this.handleConversationCompleted(record);
                    break;
                case 'failed':
                    await this.handleConversationFailed(record);
                    break;
            }
        }

        // Emit to connected clients
        if (global.io) {
            global.io.emit('conversation-updated', {
                conversation: record,
                changes: this.getChanges(oldRecord, record),
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Handle conversation deletion
     */
    private async handleConversationDelete(record: any): Promise<void> {
        logger.info('Conversation deleted via webhook:', record.id);

        // Emit to connected clients
        if (global.io) {
            global.io.emit('conversation-deleted', {
                conversationId: record.id,
                timestamp: new Date().toISOString()
            });
        }

        // Cancel any pending tasks
        // This would require a query to get all tasks for this conversation
        // and update their status to 'cancelled'
    }

    /**
     * Handle new task creation
     */
    private async handleNewTask(record: any): Promise<void> {
        logger.info('New task created via webhook:', record.id);

        // Emit to connected clients
        if (global.io) {
            global.io.emit('task-created', {
                task: record,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Handle task updates
     */
    private async handleTaskUpdate(record: any, oldRecord: any): Promise<void> {
        logger.info('Task updated via webhook:', record.id);

        // Check if status changed
        if (oldRecord && oldRecord.status !== record.status) {
            logger.info('Task status changed:', {
                id: record.id,
                type: record.type,
                from: oldRecord.status,
                to: record.status
            });

            // Handle status-specific logic
            switch (record.status) {
                case 'completed':
                    await this.handleTaskCompleted(record);
                    break;
                case 'failed':
                    await this.handleTaskFailed(record);
                    break;
            }
        }

        // Emit to connected clients
        if (global.io) {
            global.io.emit('task-updated', {
                task: record,
                changes: this.getChanges(oldRecord, record),
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Handle task deletion
     */
    private async handleTaskDelete(record: any): Promise<void> {
        logger.info('Task deleted via webhook:', record.id);

        // Emit to connected clients
        if (global.io) {
            global.io.emit('task-deleted', {
                taskId: record.id,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Handle conversation completion
     */
    private async handleConversationCompleted(record: any): Promise<void> {
        logger.info('Conversation completed:', record.id);

        // Create summary task if not already created
        const existingSummaryTask = await this.checkForExistingTask(record.id, 'summary');
        if (!existingSummaryTask && record.transcript) {
            await this.supabaseService.createTask({
                id: `summary-${record.id}-${Date.now()}`,
                type: 'summary',
                conversationId: record.id,
                status: 'queued',
                metadata: {
                    transcript: record.transcript,
                    language: record.language
                }
            });
        }
    }

    /**
     * Handle conversation failure
     */
    private async handleConversationFailed(record: any): Promise<void> {
        logger.info('Conversation failed:', record.id);

        // Cancel all pending tasks for this conversation
        // This would require a query to get all tasks and update their status
    }

    /**
     * Handle task completion
     */
    private async handleTaskCompleted(record: any): Promise<void> {
        logger.info('Task completed:', record.id, record.type);

        // Handle task-specific completion logic
        switch (record.type) {
            case 'audio':
                // Audio processing completed, create summary task
                const conversation = await this.supabaseService.getConversationWithTasks(record.conversation_id);
                if (conversation.transcript && !this.hasTaskOfType(conversation.tasks, 'summary')) {
                    await this.supabaseService.createTask({
                        id: `summary-${record.conversation_id}-${Date.now()}`,
                        type: 'summary',
                        conversationId: record.conversation_id,
                        status: 'queued',
                        metadata: {
                            transcript: conversation.transcript,
                            language: conversation.language
                        }
                    });
                }
                break;
            case 'summary':
                // Summary completed, create PDF task
                if (!this.hasTaskOfType(conversation.tasks, 'pdf')) {
                    await this.supabaseService.createTask({
                        id: `pdf-${record.conversation_id}-${Date.now()}`,
                        type: 'pdf',
                        conversationId: record.conversation_id,
                        status: 'queued',
                        metadata: {
                            summary: conversation.summary,
                            transcript: conversation.transcript
                        }
                    });
                }
                break;
            case 'pdf':
                // PDF completed, create email task
                if (!this.hasTaskOfType(conversation.tasks, 'email')) {
                    await this.supabaseService.createTask({
                        id: `email-${record.conversation_id}-${Date.now()}`,
                        type: 'email',
                        conversationId: record.conversation_id,
                        status: 'queued',
                        metadata: {
                            officerEmail: conversation.officer_email,
                            pdfUrl: conversation.pdf_url,
                            summary: conversation.summary
                        }
                    });
                }
                break;
        }
    }

    /**
     * Handle task failure
     */
    private async handleTaskFailed(record: any): Promise<void> {
        logger.error('Task failed:', record.id, record.type, record.error);

        // Emit failure notification
        if (global.io) {
            global.io.emit('task-failed', {
                task: record,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Check for existing task of specific type
     */
    private async checkForExistingTask(conversationId: string, taskType: string): Promise<boolean> {
        // This would require a database query
        // For now, return false
        return false;
    }

    /**
     * Check if conversation has task of specific type
     */
    private hasTaskOfType(tasks: any[], taskType: string): boolean {
        return tasks.some(task => task.type === taskType);
    }

    /**
     * Get changes between old and new records
     */
    private getChanges(oldRecord: any, newRecord: any): Record<string, any> {
        const changes: Record<string, any> = {};
        
        if (!oldRecord) return changes;

        for (const key in newRecord) {
            if (oldRecord[key] !== newRecord[key]) {
                changes[key] = {
                    from: oldRecord[key],
                    to: newRecord[key]
                };
            }
        }

        return changes;
    }

    /**
     * Verify webhook signature (implement based on your security requirements)
     */
    private verifyWebhookSignature(req: Request): boolean {
        // Implement webhook signature verification
        // For now, return true (in production, implement proper verification)
        return true;
    }
}
