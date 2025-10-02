import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

export interface ConversationUpdate {
    id: string;
    status: 'active' | 'processing' | 'completed' | 'failed';
    transcript?: string;
    summary?: string;
    audioUrl?: string;
    pdfUrl?: string;
    error?: string;
    updatedAt: Date;
}

export interface TaskStatus {
    id: string;
    type: 'audio' | 'summary' | 'pdf' | 'email';
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress?: number;
    error?: string;
    metadata?: Record<string, any>;
}

export class SupabaseService {
    private supabase: SupabaseClient;
    private realtimeChannel: any;
    private subscriptions: Map<string, any> = new Map();

    constructor() {
        const supabaseUrl = process.env['SUPABASE_URL'];
        const supabaseKey = process.env['SUPABASE_ANON_KEY'];

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase configuration missing');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.setupRealtimeConnection();
    }

    /**
     * Setup real-time connection for database changes
     */
    private setupRealtimeConnection(): void {
        try {
            this.realtimeChannel = this.supabase
                .channel('voice-chat-updates')
                .on('postgres_changes', 
                    { 
                        event: '*', 
                        schema: 'public', 
                        table: 'conversations' 
                    }, 
                    (payload) => {
                        logger.info('Conversation update received:', payload);
                        this.handleConversationUpdate(payload);
                    }
                )
                .on('postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'tasks'
                    },
                    (payload) => {
                        logger.info('Task update received:', payload);
                        this.handleTaskUpdate(payload);
                    }
                )
                .subscribe((status) => {
                    logger.info('Realtime subscription status:', status);
                });

            logger.info('Supabase real-time connection established');
        } catch (error) {
            logger.error('Failed to setup Supabase real-time connection:', error);
        }
    }

    /**
     * Handle conversation updates from database
     */
    private handleConversationUpdate(payload: any): void {
        try {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            
            // Emit to connected clients via Socket.IO
            if (global.io) {
                global.io.emit('conversation-update', {
                    eventType,
                    conversation: newRecord || oldRecord,
                    timestamp: new Date().toISOString()
                });
            }

            // Handle specific event types
            switch (eventType) {
                case 'INSERT':
                    logger.info('New conversation created:', newRecord.id);
                    break;
                case 'UPDATE':
                    logger.info('Conversation updated:', newRecord.id, 'Status:', newRecord.status);
                    break;
                case 'DELETE':
                    logger.info('Conversation deleted:', oldRecord.id);
                    break;
            }
        } catch (error) {
            logger.error('Error handling conversation update:', error);
        }
    }

    /**
     * Handle task updates from database
     */
    private handleTaskUpdate(payload: any): void {
        try {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            
            // Emit to connected clients via Socket.IO
            if (global.io) {
                global.io.emit('task-update', {
                    eventType,
                    task: newRecord || oldRecord,
                    timestamp: new Date().toISOString()
                });
            }

            // Handle specific event types
            switch (eventType) {
                case 'INSERT':
                    logger.info('New task created:', newRecord.id);
                    break;
                case 'UPDATE':
                    logger.info('Task updated:', newRecord.id, 'Status:', newRecord.status);
                    break;
                case 'DELETE':
                    logger.info('Task deleted:', oldRecord.id);
                    break;
            }
        } catch (error) {
            logger.error('Error handling task update:', error);
        }
    }

    /**
     * Update conversation status in database
     */
    async updateConversation(update: ConversationUpdate): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('conversations')
                .update({
                    status: update.status,
                    transcript: update.transcript,
                    summary: update.summary,
                    audio_url: update.audioUrl,
                    pdf_url: update.pdfUrl,
                    error: update.error,
                    updated_at: update.updatedAt.toISOString()
                })
                .eq('id', update.id);

            if (error) {
                throw error;
            }

            logger.info('Conversation updated successfully:', update.id);
        } catch (error) {
            logger.error('Failed to update conversation:', error);
            throw error;
        }
    }

    /**
     * Create a new task in the database
     */
    async createTask(task: {
        id: string;
        type: 'audio' | 'summary' | 'pdf' | 'email';
        conversationId: string;
        status: 'queued' | 'processing' | 'completed' | 'failed';
        metadata?: Record<string, any>;
    }): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('tasks')
                .insert({
                    id: task.id,
                    type: task.type,
                    conversation_id: task.conversationId,
                    status: task.status,
                    metadata: task.metadata,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) {
                throw error;
            }

            logger.info('Task created successfully:', task.id);
        } catch (error) {
            logger.error('Failed to create task:', error);
            throw error;
        }
    }

    /**
     * Update task status in database
     */
    async updateTask(taskId: string, update: Partial<TaskStatus>): Promise<void> {
        try {
            const updateData: any = {
                updated_at: new Date().toISOString()
            };

            if (update.status) updateData.status = update.status;
            if (update.progress !== undefined) updateData.progress = update.progress;
            if (update.error) updateData.error = update.error;
            if (update.metadata) updateData.metadata = update.metadata;

            const { error } = await this.supabase
                .from('tasks')
                .update(updateData)
                .eq('id', taskId);

            if (error) {
                throw error;
            }

            logger.info('Task updated successfully:', taskId);
        } catch (error) {
            logger.error('Failed to update task:', error);
            throw error;
        }
    }

    /**
     * Cancel a task
     */
    async cancelTask(taskId: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('tasks')
                .update({
                    status: 'failed',
                    error: 'Task cancelled by user',
                    updated_at: new Date().toISOString()
                })
                .eq('id', taskId);

            if (error) {
                throw error;
            }

            logger.info('Task cancelled successfully:', taskId);
        } catch (error) {
            logger.error('Failed to cancel task:', error);
            throw error;
        }
    }

    /**
     * Retry a failed task
     */
    async retryTask(taskId: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('tasks')
                .update({
                    status: 'queued',
                    error: null,
                    progress: 0,
                    updated_at: new Date().toISOString()
                })
                .eq('id', taskId);

            if (error) {
                throw error;
            }

            logger.info('Task retry initiated:', taskId);
        } catch (error) {
            logger.error('Failed to retry task:', error);
            throw error;
        }
    }

    /**
     * Get conversation with tasks
     */
    async getConversationWithTasks(conversationId: string): Promise<any> {
        try {
            const { data: conversation, error: convError } = await this.supabase
                .from('conversations')
                .select('*')
                .eq('id', conversationId)
                .single();

            if (convError) {
                throw convError;
            }

            const { data: tasks, error: tasksError } = await this.supabase
                .from('tasks')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });

            if (tasksError) {
                throw tasksError;
            }

            return {
                ...conversation,
                tasks: tasks || []
            };
        } catch (error) {
            logger.error('Failed to get conversation with tasks:', error);
            throw error;
        }
    }

    /**
     * Subscribe to conversation updates
     */
    subscribeToConversation(conversationId: string, callback: (update: any) => void): string {
        const subscriptionId = `conv-${conversationId}-${Date.now()}`;
        
        const channel = this.supabase
            .channel(subscriptionId)
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'conversations',
                    filter: `id=eq.${conversationId}`
                },
                callback
            )
            .subscribe();

        this.subscriptions.set(subscriptionId, channel);
        return subscriptionId;
    }

    /**
     * Unsubscribe from updates
     */
    unsubscribe(subscriptionId: string): void {
        const channel = this.subscriptions.get(subscriptionId);
        if (channel) {
            this.supabase.removeChannel(channel);
            this.subscriptions.delete(subscriptionId);
        }
    }

    /**
     * Cleanup all subscriptions
     */
    cleanup(): void {
        this.subscriptions.forEach((channel, id) => {
            this.supabase.removeChannel(channel);
        });
        this.subscriptions.clear();

        if (this.realtimeChannel) {
            this.supabase.removeChannel(this.realtimeChannel);
        }
    }
}
