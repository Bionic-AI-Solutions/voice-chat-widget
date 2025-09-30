import { QueueJob } from '../services/QueueService';
import { BaseWorker } from './BaseWorker';
import { logger } from '../utils/logger';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import axios from 'axios';

export class EmailWorker extends BaseWorker {
    private supabase: any;
    private transporter: nodemailer.Transporter;

    constructor(queueService: any) {
        super('email-delivery', 'email-worker', queueService);
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

        // Initialize email transporter
        this.initializeEmailTransporter();
    }

    /**
     * Initialize email transporter
     */
    private initializeEmailTransporter(): void {
        try {
            const smtpConfig = {
                host: process.env['SMTP_HOST'] || 'smtp.gmail.com',
                port: parseInt(process.env['SMTP_PORT'] || '587'),
                secure: process.env['SMTP_SECURE'] === 'true',
                auth: {
                    user: process.env['SMTP_USER'],
                    pass: process.env['SMTP_PASS'],
                },
            };

            if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
                throw new Error('SMTP credentials missing');
            }

            this.transporter = nodemailer.createTransporter(smtpConfig);

            logger.info('Email transporter initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize email transporter:', error);
            throw error;
        }
    }

    /**
     * Process email job
     */
    protected async processJob(job: QueueJob): Promise<any> {
        try {
            const { sessionId, conversationId, metadata } = job.data;

            logger.info(`Processing email job for session: ${sessionId}`);

            // Get conversation data
            const conversation = await this.getConversationData(conversationId);

            if (!conversation) {
                throw new Error(`Conversation not found: ${conversationId}`);
            }

            // Prepare email content
            const emailContent = await this.prepareEmailContent(conversation, metadata);

            // Send email
            const emailResult = await this.sendEmail(conversation, emailContent, metadata);

            // Update conversation record
            await this.updateConversationRecord(conversationId, emailResult, metadata);

            logger.info(`Email delivery completed for session: ${sessionId}`);

            return {
                sessionId,
                conversationId,
                emailResult,
                processedAt: new Date().toISOString(),
            };
        } catch (error) {
            logger.error(`Email delivery failed for session ${job.data.sessionId}:`, error);
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
     * Prepare email content
     */
    private async prepareEmailContent(conversation: any, metadata?: any): Promise<any> {
        try {
            const language = metadata?.language || 'en';
            const isRTL = language === 'ar' || language === 'he';

            // Generate email subject
            const subject = this.generateEmailSubject(conversation, language);

            // Generate email HTML content
            const htmlContent = this.generateEmailHtml(conversation, language, isRTL);

            // Generate email text content
            const textContent = this.generateEmailText(conversation, language);

            // Prepare attachments
            const attachments = await this.prepareAttachments(conversation);

            return {
                subject,
                html: htmlContent,
                text: textContent,
                attachments,
            };
        } catch (error) {
            logger.error('Failed to prepare email content:', error);
            throw error;
        }
    }

    /**
     * Generate email subject
     */
    private generateEmailSubject(conversation: any, language: string): string {
        const date = new Date(conversation.created_at).toLocaleDateString();
        const appName = conversation.app_name || 'Voice Chat Widget';

        if (language === 'ar') {
            return `تقرير المحادثة - ${appName} - ${date}`;
        } else if (language === 'he') {
            return `דוח שיחה - ${appName} - ${date}`;
        } else {
            return `Conversation Report - ${appName} - ${date}`;
        }
    }

    /**
     * Generate email HTML content
     */
    private generateEmailHtml(conversation: any, language: string, isRTL: boolean): string {
        const direction = isRTL ? 'rtl' : 'ltr';
        const textAlign = isRTL ? 'right' : 'left';

        return `
        <!DOCTYPE html>
        <html lang="${language}" dir="${direction}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Conversation Report</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 20px;
                    background: #f4f4f4;
                    direction: ${direction};
                    text-align: ${textAlign};
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: #fff;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
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
                    font-size: 24px;
                }
                .info-section {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 30px;
                }
                .info-item {
                    margin-bottom: 10px;
                }
                .info-label {
                    font-weight: bold;
                    color: #495057;
                }
                .summary {
                    background: #e7f3ff;
                    padding: 20px;
                    border-radius: 8px;
                    border-left: 4px solid #007bff;
                    margin-bottom: 20px;
                }
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                    border-top: 1px solid #dee2e6;
                    padding-top: 20px;
                }
                .button {
                    display: inline-block;
                    background: #007bff;
                    color: white;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>${language === 'ar' ? 'تقرير المحادثة' : language === 'he' ? 'דוח שיחה' : 'Conversation Report'}</h1>
                </div>

                <div class="info-section">
                    <div class="info-item">
                        <span class="info-label">${language === 'ar' ? 'معرف الجلسة:' : language === 'he' ? 'מזהה הפעלה:' : 'Session ID:'}</span>
                        ${conversation.session_id}
                    </div>
                    <div class="info-item">
                        <span class="info-label">${language === 'ar' ? 'التاريخ:' : language === 'he' ? 'תאריך:' : 'Date:'}</span>
                        ${new Date(conversation.created_at).toLocaleDateString()}
                    </div>
                    <div class="info-item">
                        <span class="info-label">${language === 'ar' ? 'المدة:' : language === 'he' ? 'משך:' : 'Duration:'}</span>
                        ${conversation.duration ? `${conversation.duration} seconds` : 'N/A'}
                    </div>
                    <div class="info-item">
                        <span class="info-label">${language === 'ar' ? 'اللغة:' : language === 'he' ? 'שפה:' : 'Language:'}</span>
                        ${conversation.language || 'English'}
                    </div>
                </div>

                ${conversation.summary ? `
                <div class="summary">
                    <h3>${language === 'ar' ? 'ملخص المحادثة:' : language === 'he' ? 'סיכום השיחה:' : 'Conversation Summary:'}</h3>
                    <p>${conversation.summary}</p>
                </div>
                ` : ''}

                ${conversation.pdf_report_url ? `
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${conversation.pdf_report_url}" class="button">
                        ${language === 'ar' ? 'تحميل التقرير الكامل' : language === 'he' ? 'הורד דוח מלא' : 'Download Full Report'}
                    </a>
                </div>
                ` : ''}

                <div class="footer">
                    <p>${language === 'ar' ? 'تم إنشاء هذا التقرير تلقائياً بواسطة نظام Voice Chat Widget.' : language === 'he' ? 'דוח זה נוצר אוטומטית על ידי מערכת Voice Chat Widget.' : 'This report was generated automatically by the Voice Chat Widget system.'}</p>
                    <p>${language === 'ar' ? 'معرف التقرير:' : language === 'he' ? 'מזהה דוח:' : 'Report ID:'} ${conversation.id}</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Generate email text content
     */
    private generateEmailText(conversation: any, language: string): string {
        const summary = conversation.summary || 'No summary available';
        const date = new Date(conversation.created_at).toLocaleDateString();

        if (language === 'ar') {
            return `
تقرير المحادثة

معرف الجلسة: ${conversation.session_id}
التاريخ: ${date}
المدة: ${conversation.duration ? `${conversation.duration} ثانية` : 'غير متوفر'}
اللغة: ${conversation.language || 'الإنجليزية'}

ملخص المحادثة:
${summary}

تم إنشاء هذا التقرير تلقائياً بواسطة نظام Voice Chat Widget.
معرف التقرير: ${conversation.id}
            `;
        } else if (language === 'he') {
            return `
דוח שיחה

מזהה הפעלה: ${conversation.session_id}
תאריך: ${date}
משך: ${conversation.duration ? `${conversation.duration} שניות` : 'לא זמין'}
שפה: ${conversation.language || 'אנגלית'}

סיכום השיחה:
${summary}

דוח זה נוצר אוטומטית על ידי מערכת Voice Chat Widget.
מזהה דוח: ${conversation.id}
            `;
        } else {
            return `
Conversation Report

Session ID: ${conversation.session_id}
Date: ${date}
Duration: ${conversation.duration ? `${conversation.duration} seconds` : 'N/A'}
Language: ${conversation.language || 'English'}

Conversation Summary:
${summary}

This report was generated automatically by the Voice Chat Widget system.
Report ID: ${conversation.id}
            `;
        }
    }

    /**
     * Prepare email attachments
     */
    private async prepareAttachments(conversation: any): Promise<any[]> {
        const attachments = [];

        try {
            // Add PDF report if available
            if (conversation.pdf_report_url) {
                const pdfBuffer = await this.downloadFile(conversation.pdf_report_url);
                attachments.push({
                    filename: `conversation-report-${conversation.session_id}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                });
            }

            // Add audio file if available
            if (conversation.audio_file_url) {
                const audioBuffer = await this.downloadFile(conversation.audio_file_url);
                attachments.push({
                    filename: `conversation-audio-${conversation.session_id}.wav`,
                    content: audioBuffer,
                    contentType: 'audio/wav',
                });
            }
        } catch (error) {
            logger.warn('Failed to prepare some attachments:', error);
        }

        return attachments;
    }

    /**
     * Download file from URL
     */
    private async downloadFile(url: string): Promise<Buffer> {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
            });

            return Buffer.from(response.data);
        } catch (error) {
            logger.error(`Failed to download file from ${url}:`, error);
            throw error;
        }
    }

    /**
     * Send email
     */
    private async sendEmail(conversation: any, emailContent: any, metadata?: any): Promise<any> {
        try {
            const officerEmail = conversation.officer_email;
            if (!officerEmail) {
                throw new Error('Officer email not found');
            }

            const mailOptions = {
                from: process.env['EMAIL_FROM'] || 'noreply@voicechatwidget.com',
                to: officerEmail,
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html,
                attachments: emailContent.attachments,
            };

            const result = await this.transporter.sendMail(mailOptions);

            logger.info(`Email sent successfully to ${officerEmail}:`, result.messageId);

            return {
                messageId: result.messageId,
                recipient: officerEmail,
                sentAt: new Date().toISOString(),
            };
        } catch (error) {
            logger.error('Failed to send email:', error);
            throw new Error(`Email delivery failed: ${error.message}`);
        }
    }

    /**
     * Update conversation record with email status
     */
    private async updateConversationRecord(conversationId: string, emailResult: any, metadata?: any): Promise<void> {
        try {
            logger.info(`Updating conversation record with email status for conversation: ${conversationId}`);

            const { error } = await this.supabase
                .from('conversations')
                .update({
                    email_sent: true,
                    email_message_id: emailResult.messageId,
                    email_sent_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', conversationId);

            if (error) {
                throw new Error(`Database update failed: ${error.message}`);
            }

            logger.info(`Conversation record updated with email status for conversation: ${conversationId}`);
        } catch (error) {
            logger.error('Failed to update conversation record with email status:', error);
            throw new Error(`Database update failed: ${error.message}`);
        }
    }

    /**
     * Test email configuration
     */
    async testEmailConfiguration(): Promise<boolean> {
        try {
            await this.transporter.verify();
            logger.info('Email configuration test successful');
            return true;
        } catch (error) {
            logger.error('Email configuration test failed:', error);
            return false;
        }
    }
}