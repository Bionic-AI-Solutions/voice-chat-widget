import { QueueJob } from '../services/QueueService';
import { BaseWorker } from './BaseWorker';
import { logger } from '../utils/logger';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class PdfWorker extends BaseWorker {
    private supabase: any;

    constructor(queueService: any) {
        super('pdf-creation', 'pdf-worker', queueService);
        this.initializeSupabase();
    }

    /**
     * Initialize Supabase client
     */
    private initializeSupabase(): void {
        const supabaseUrl = process.env['SUPABASE_URL'];
        const supabaseKey = process.env['SUPABASE_ANON_KEY'];

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase configuration missing');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * Process PDF job
     */
    protected async processJob(job: QueueJob): Promise<any> {
        try {
            const { sessionId, conversationId, metadata } = job.data;

            logger.info(`Processing PDF job for session: ${sessionId}`);

            // Get conversation data
            const conversation = await this.getConversationData(conversationId);

            if (!conversation) {
                throw new Error(`Conversation not found: ${conversationId}`);
            }

            // Generate PDF
            const pdfBuffer = await this.generatePdf(conversation, metadata);

            // Upload PDF to storage
            const pdfUrl = await this.uploadPdfToStorage(sessionId, pdfBuffer, metadata);

            // Update conversation record
            await this.updateConversationRecord(conversationId, pdfUrl, metadata);

            logger.info(`PDF generation completed for session: ${sessionId}`);

            return {
                sessionId,
                conversationId,
                pdfUrl,
                size: pdfBuffer.length,
                processedAt: new Date().toISOString(),
            };
        } catch (error) {
            logger.error(`PDF generation failed for session ${job.data.sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Get conversation data
     */
    private async getConversationData(conversationId: string): Promise<any> {
        try {
            const { data, error } = await this.supabase
                .from('conversations')
                .select('*')
                .eq('id', conversationId)
                .single();

            if (error) {
                throw new Error(`Failed to get conversation data: ${error.message}`);
            }

            return data;
        } catch (error) {
            logger.error('Failed to get conversation data:', error);
            throw error;
        }
    }

    /**
     * Generate PDF using Puppeteer
     */
    private async generatePdf(conversation: any, metadata?: any): Promise<Buffer> {
        let browser: any = null;

        try {
            logger.info('Generating PDF...');

            // Launch browser
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });

            const page = await browser.newPage();

            // Generate HTML content
            const htmlContent = this.generateHtmlContent(conversation, metadata);

            // Set content
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm',
                },
            });

            logger.info('PDF generated successfully');
            return pdfBuffer;
        } catch (error) {
            logger.error('Failed to generate PDF:', error);
            throw error;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    /**
     * Generate HTML content for PDF
     */
    private generateHtmlContent(conversation: any, metadata?: any): string {
        const language = metadata?.language || 'en';
        const isRTL = language === 'ar' || language === 'he';

        return `
        <!DOCTYPE html>
        <html lang="${language}" dir="${isRTL ? 'rtl' : 'ltr'}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Conversation Report</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 20px;
                    background: #fff;
                }
                .header {
                    text-align: center;
                    border-bottom: 2px solid #007bff;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .header h1 {
                    color: #007bff;
                    margin: 0;
                    font-size: 28px;
                }
                .header .subtitle {
                    color: #666;
                    margin-top: 10px;
                    font-size: 16px;
                }
                .info-section {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 30px;
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                }
                .info-item {
                    margin-bottom: 15px;
                }
                .info-label {
                    font-weight: bold;
                    color: #495057;
                    margin-bottom: 5px;
                }
                .info-value {
                    color: #212529;
                }
                .section {
                    margin-bottom: 30px;
                }
                .section h2 {
                    color: #007bff;
                    border-bottom: 1px solid #dee2e6;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                .transcript {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    border-left: 4px solid #007bff;
                    white-space: pre-wrap;
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    line-height: 1.5;
                }
                .summary {
                    background: #e7f3ff;
                    padding: 20px;
                    border-radius: 8px;
                    border-left: 4px solid #007bff;
                }
                .summary-item {
                    margin-bottom: 10px;
                    padding-left: 20px;
                    position: relative;
                }
                .summary-item::before {
                    content: "•";
                    color: #007bff;
                    font-weight: bold;
                    position: absolute;
                    left: 0;
                }
                .footer {
                    margin-top: 50px;
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                    border-top: 1px solid #dee2e6;
                    padding-top: 20px;
                }
                @media print {
                    body { margin: 0; }
                    .header { page-break-after: avoid; }
                    .section { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Conversation Report</h1>
                <div class="subtitle">Generated on ${new Date().toLocaleDateString()}</div>
            </div>

            <div class="info-section">
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Session ID:</div>
                        <div class="info-value">${conversation.session_id}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Date:</div>
                        <div class="info-value">${new Date(conversation.created_at).toLocaleDateString()}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Duration:</div>
                        <div class="info-value">${conversation.duration ? `${conversation.duration} seconds` : 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Language:</div>
                        <div class="info-value">${conversation.language || 'English'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Officer Email:</div>
                        <div class="info-value">${conversation.officer_email || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">App Name:</div>
                        <div class="info-value">${conversation.app_name || 'N/A'}</div>
                    </div>
                </div>
            </div>

            ${conversation.transcript ? `
            <div class="section">
                <h2>Transcript</h2>
                <div class="transcript">${conversation.transcript}</div>
            </div>
            ` : ''}

            ${conversation.summary ? `
            <div class="section">
                <h2>Summary</h2>
                <div class="summary">${conversation.summary}</div>
            </div>
            ` : ''}

            ${conversation.summary_data ? `
            <div class="section">
                <h2>Detailed Analysis</h2>
                <div class="summary">
                    ${conversation.summary_data.keyPoints && conversation.summary_data.keyPoints.length > 0 ? `
                    <h3>Key Points:</h3>
                    ${conversation.summary_data.keyPoints.map((point: string) => `<div class="summary-item">${point}</div>`).join('')}
                    ` : ''}
                    
                    ${conversation.summary_data.decisions && conversation.summary_data.decisions.length > 0 ? `
                    <h3>Decisions Made:</h3>
                    ${conversation.summary_data.decisions.map((decision: string) => `<div class="summary-item">${decision}</div>`).join('')}
                    ` : ''}
                    
                    ${conversation.summary_data.actionItems && conversation.summary_data.actionItems.length > 0 ? `
                    <h3>Action Items:</h3>
                    ${conversation.summary_data.actionItems.map((item: string) => `<div class="summary-item">${item}</div>`).join('')}
                    ` : ''}
                </div>
            </div>
            ` : ''}

            <div class="footer">
                <p>This report was generated automatically by the Voice Chat Widget system.</p>
                <p>Report ID: ${conversation.id} | Generated: ${new Date().toISOString()}</p>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Upload PDF to storage
     */
    private async uploadPdfToStorage(sessionId: string, pdfBuffer: Buffer, metadata?: any): Promise<string> {
        try {
            const fileName = `reports/${sessionId}/${uuidv4()}.pdf`;
            const bucketName = process.env['SUPABASE_STORAGE_BUCKET'] || 'voice-chat-reports';

            logger.info(`Uploading PDF to storage: ${fileName}`);

            // Upload to Supabase Storage
            const { data, error } = await this.supabase.storage
                .from(bucketName)
                .upload(fileName, pdfBuffer, {
                    contentType: 'application/pdf',
                    upsert: false,
                });

            if (error) {
                throw new Error(`Storage upload failed: ${error.message}`);
            }

            // Get public URL
            const { data: urlData } = this.supabase.storage
                .from(bucketName)
                .getPublicUrl(fileName);

            const publicUrl = urlData.publicUrl;
            logger.info(`PDF uploaded successfully: ${publicUrl}`);

            return publicUrl;
        } catch (error) {
            logger.error('Failed to upload PDF to storage:', error);
            throw new Error(`Storage upload failed: ${error.message}`);
        }
    }

    /**
     * Update conversation record with PDF URL
     */
    private async updateConversationRecord(conversationId: string, pdfUrl: string, metadata?: any): Promise<void> {
        try {
            logger.info(`Updating conversation record with PDF URL for conversation: ${conversationId}`);

            const { error } = await this.supabase
                .from('conversations')
                .update({
                    pdf_report_url: pdfUrl,
                    pdf_generated_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', conversationId);

            if (error) {
                throw new Error(`Database update failed: ${error.message}`);
            }

            logger.info(`Conversation record updated with PDF URL for conversation: ${conversationId}`);
        } catch (error) {
            logger.error('Failed to update conversation record with PDF URL:', error);
            throw new Error(`Database update failed: ${error.message}`);
        }
    }

    /**
     * Clean up temporary files
     */
    private async cleanupTempFiles(filePath: string): Promise<void> {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger.debug(`Cleaned up temporary file: ${filePath}`);
            }
        } catch (error) {
            logger.warn(`Failed to clean up temporary file ${filePath}:`, error);
        }
    }
}