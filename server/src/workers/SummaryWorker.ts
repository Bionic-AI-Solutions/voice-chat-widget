import { QueueJob } from '../services/QueueService';
import { BaseWorker } from './BaseWorker';
import { logger } from '../utils/logger';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export class SummaryWorker extends BaseWorker {
    private supabase: any;
    private openai: OpenAI;

    constructor(queueService: any) {
        super('summary-generation', 'summary-worker', queueService);
        this.initializeServices();
    }

    /**
     * Initialize services
     */
    private initializeServices(): void {
        // Initialize Supabase
        const supabaseUrl = process.env['SUPABASE_URL'];
        const supabaseKey = process.env['SUPABASE_ANON_KEY'];

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase configuration missing');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);

        // Initialize OpenAI
        const openaiApiKey = process.env['OPENAI_API_KEY'];
        if (!openaiApiKey) {
            throw new Error('OpenAI API key missing');
        }

        this.openai = new OpenAI({
            apiKey: openaiApiKey,
        });
    }

    /**
     * Process summary job
     */
    protected async processJob(job: QueueJob): Promise<any> {
        try {
            const { sessionId, transcript, metadata } = job.data;

            logger.info(`Processing summary job for session: ${sessionId}`);

            // Generate AI summary
            const summary = await this.generateSummary(transcript, metadata);

            // Update conversation record
            await this.updateConversationRecord(sessionId, summary, metadata);

            logger.info(`Summary generation completed for session: ${sessionId}`);

            return {
                sessionId,
                summary,
                processedAt: new Date().toISOString(),
            };
        } catch (error) {
            logger.error(`Summary generation failed for session ${job.data.sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Generate AI summary using OpenAI
     */
    private async generateSummary(transcript: string, metadata?: any): Promise<any> {
        try {
            logger.info('Generating AI summary...');

            const language = metadata?.language || 'en';
            const conversationType = metadata?.conversationType || 'general';

            // Create system prompt based on conversation type
            const systemPrompt = this.createSystemPrompt(conversationType, language);

            // Create user prompt
            const userPrompt = this.createUserPrompt(transcript, language);

            // Call OpenAI API
            const response = await this.openai.chat.completions.create({
                model: process.env['OPENAI_MODEL'] || 'gpt-4',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 1000,
            });

            const summaryText = response.choices[0]?.message?.content;
            if (!summaryText) {
                throw new Error('No summary generated from OpenAI');
            }

            // Parse and structure the summary
            const summary = this.parseSummary(summaryText, transcript, metadata);

            logger.info('AI summary generated successfully');
            return summary;
        } catch (error) {
            logger.error('Failed to generate AI summary:', error);
            throw new Error(`Summary generation failed: ${error.message}`);
        }
    }

    /**
     * Create system prompt based on conversation type
     */
    private createSystemPrompt(conversationType: string, language: string): string {
        const basePrompt = `You are an AI assistant that creates comprehensive summaries of conversations. 
        The conversation is in ${language === 'en' ? 'English' : language}. 
        Create a detailed summary that captures the key points, decisions, and outcomes.`;

        switch (conversationType) {
            case 'customer_service':
                return `${basePrompt} Focus on the customer's issue, the resolution provided, and any follow-up actions needed.`;
            case 'business_meeting':
                return `${basePrompt} Focus on decisions made, action items assigned, and key discussion points.`;
            case 'interview':
                return `${basePrompt} Focus on the candidate's qualifications, responses to questions, and overall assessment.`;
            case 'medical_consultation':
                return `${basePrompt} Focus on symptoms discussed, diagnosis, treatment plan, and follow-up instructions.`;
            default:
                return basePrompt;
        }
    }

    /**
     * Create user prompt
     */
    private createUserPrompt(transcript: string, language: string): string {
        return `Please analyze the following conversation transcript and provide a comprehensive summary:

        Transcript:
        ${transcript}

        Please provide:
        1. A brief overview of the conversation
        2. Key points discussed
        3. Decisions made or conclusions reached
        4. Action items or next steps
        5. Any important details or context

        Format the response as a structured summary with clear sections.`;
    }

    /**
     * Parse and structure the summary
     */
    private parseSummary(summaryText: string, transcript: string, metadata?: any): any {
        try {
            // Extract key information from the summary
            const lines = summaryText.split('\n').filter(line => line.trim());
            
            const summary = {
                overview: '',
                keyPoints: [],
                decisions: [],
                actionItems: [],
                importantDetails: [],
                fullSummary: summaryText,
                metadata: {
                    language: metadata?.language || 'en',
                    conversationType: metadata?.conversationType || 'general',
                    transcriptLength: transcript.length,
                    summaryLength: summaryText.length,
                    generatedAt: new Date().toISOString(),
                },
            };

            // Parse structured sections
            let currentSection = 'overview';
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (trimmedLine.toLowerCase().includes('overview') || trimmedLine.toLowerCase().includes('summary')) {
                    currentSection = 'overview';
                } else if (trimmedLine.toLowerCase().includes('key points') || trimmedLine.toLowerCase().includes('main points')) {
                    currentSection = 'keyPoints';
                } else if (trimmedLine.toLowerCase().includes('decisions') || trimmedLine.toLowerCase().includes('conclusions')) {
                    currentSection = 'decisions';
                } else if (trimmedLine.toLowerCase().includes('action items') || trimmedLine.toLowerCase().includes('next steps')) {
                    currentSection = 'actionItems';
                } else if (trimmedLine.toLowerCase().includes('important') || trimmedLine.toLowerCase().includes('details')) {
                    currentSection = 'importantDetails';
                } else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•') || trimmedLine.match(/^\d+\./)) {
                    // This is a list item
                    const item = trimmedLine.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '');
                    if (item.trim()) {
                        summary[currentSection].push(item);
                    }
                } else if (trimmedLine && currentSection === 'overview') {
                    summary.overview += (summary.overview ? ' ' : '') + trimmedLine;
                }
            }

            return summary;
        } catch (error) {
            logger.error('Failed to parse summary:', error);
            return {
                overview: summaryText,
                keyPoints: [],
                decisions: [],
                actionItems: [],
                importantDetails: [],
                fullSummary: summaryText,
                metadata: {
                    language: metadata?.language || 'en',
                    conversationType: metadata?.conversationType || 'general',
                    transcriptLength: transcript.length,
                    summaryLength: summaryText.length,
                    generatedAt: new Date().toISOString(),
                },
            };
        }
    }

    /**
     * Update conversation record with summary
     */
    private async updateConversationRecord(sessionId: string, summary: any, metadata?: any): Promise<void> {
        try {
            logger.info(`Updating conversation record with summary for session: ${sessionId}`);

            const { error } = await this.supabase
                .from('conversations')
                .update({
                    summary: summary.fullSummary,
                    summary_data: summary,
                    summary_generated_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('session_id', sessionId);

            if (error) {
                throw new Error(`Database update failed: ${error.message}`);
            }

            logger.info(`Conversation record updated with summary for session: ${sessionId}`);
        } catch (error) {
            logger.error('Failed to update conversation record with summary:', error);
            throw new Error(`Database update failed: ${error.message}`);
        }
    }

    /**
     * Validate transcript
     */
    private validateTranscript(transcript: string): boolean {
        try {
            if (!transcript || transcript.trim().length === 0) {
                throw new Error('Transcript is empty');
            }

            if (transcript.length < 10) {
                throw new Error('Transcript is too short');
            }

            if (transcript.length > 50000) {
                throw new Error('Transcript is too long');
            }

            return true;
        } catch (error) {
            logger.error('Transcript validation failed:', error);
            return false;
        }
    }

    /**
     * Get conversation context
     */
    private async getConversationContext(sessionId: string): Promise<any> {
        try {
            const { data, error } = await this.supabase
                .from('conversations')
                .select('*')
                .eq('session_id', sessionId)
                .single();

            if (error) {
                logger.warn(`Failed to get conversation context: ${error.message}`);
                return null;
            }

            return data;
        } catch (error) {
            logger.error('Failed to get conversation context:', error);
            return null;
        }
    }
}