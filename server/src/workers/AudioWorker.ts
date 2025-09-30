import { QueueJob } from '../services/QueueService';
import { BaseWorker } from './BaseWorker';
import { logger } from '../utils/logger';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class AudioWorker extends BaseWorker {
    private supabase: any;

    constructor(queueService: any) {
        super('audio-processing', 'audio-worker', queueService);
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
     * Process audio job
     */
    protected async processJob(job: QueueJob): Promise<any> {
        try {
            const { sessionId, audioUrl, metadata } = job.data;

            logger.info(`Processing audio job for session: ${sessionId}`);

            // Download audio from Speechmatics
            const audioBuffer = await this.downloadAudio(audioUrl);

            // Upload to Supabase Storage
            const storageUrl = await this.uploadToStorage(sessionId, audioBuffer, metadata);

            // Update conversation record
            await this.updateConversationRecord(sessionId, storageUrl, metadata);

            logger.info(`Audio processing completed for session: ${sessionId}`);

            return {
                sessionId,
                originalUrl: audioUrl,
                storageUrl,
                size: audioBuffer.length,
                processedAt: new Date().toISOString(),
            };
        } catch (error) {
            logger.error(`Audio processing failed for session ${job.data.sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Download audio from Speechmatics
     */
    private async downloadAudio(audioUrl: string): Promise<Buffer> {
        try {
            logger.info(`Downloading audio from: ${audioUrl}`);

            const response = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: 30000, // 30 seconds timeout
            });

            if (response.status !== 200) {
                throw new Error(`Failed to download audio: HTTP ${response.status}`);
            }

            const audioBuffer = Buffer.from(response.data);
            logger.info(`Downloaded audio: ${audioBuffer.length} bytes`);

            return audioBuffer;
        } catch (error) {
            logger.error('Failed to download audio:', error);
            throw new Error(`Audio download failed: ${error.message}`);
        }
    }

    /**
     * Upload audio to Supabase Storage
     */
    private async uploadToStorage(sessionId: string, audioBuffer: Buffer, metadata?: any): Promise<string> {
        try {
            const fileName = `audio/${sessionId}/${uuidv4()}.wav`;
            const bucketName = process.env['SUPABASE_STORAGE_BUCKET'] || 'voice-chat-audio';

            logger.info(`Uploading audio to storage: ${fileName}`);

            // Upload to Supabase Storage
            const { data, error } = await this.supabase.storage
                .from(bucketName)
                .upload(fileName, audioBuffer, {
                    contentType: 'audio/wav',
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
            logger.info(`Audio uploaded successfully: ${publicUrl}`);

            return publicUrl;
        } catch (error) {
            logger.error('Failed to upload audio to storage:', error);
            throw new Error(`Storage upload failed: ${error.message}`);
        }
    }

    /**
     * Update conversation record with audio URL
     */
    private async updateConversationRecord(sessionId: string, audioUrl: string, metadata?: any): Promise<void> {
        try {
            logger.info(`Updating conversation record for session: ${sessionId}`);

            const { error } = await this.supabase
                .from('conversations')
                .update({
                    audio_file_url: audioUrl,
                    audio_processed_at: new Date().toISOString(),
                    audio_file_size: metadata?.size || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('session_id', sessionId);

            if (error) {
                throw new Error(`Database update failed: ${error.message}`);
            }

            logger.info(`Conversation record updated for session: ${sessionId}`);
        } catch (error) {
            logger.error('Failed to update conversation record:', error);
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

    /**
     * Validate audio file
     */
    private validateAudioFile(audioBuffer: Buffer): boolean {
        try {
            // Basic validation - check if it's a valid audio file
            if (audioBuffer.length === 0) {
                throw new Error('Audio file is empty');
            }

            // Check for common audio file headers
            const header = audioBuffer.slice(0, 12);
            const headerString = header.toString('ascii');

            // Check for WAV header
            if (headerString.startsWith('RIFF') && headerString.includes('WAVE')) {
                return true;
            }

            // Check for other audio formats if needed
            logger.warn('Audio file format validation failed - proceeding anyway');
            return true;
        } catch (error) {
            logger.error('Audio file validation failed:', error);
            return false;
        }
    }

    /**
     * Get audio file metadata
     */
    private getAudioMetadata(audioBuffer: Buffer): any {
        try {
            return {
                size: audioBuffer.length,
                format: 'wav', // Assuming WAV format from Speechmatics
                duration: null, // Would need audio analysis library to determine
                channels: 1, // Assuming mono from Speechmatics
                sampleRate: 16000, // Assuming 16kHz from Speechmatics
            };
        } catch (error) {
            logger.error('Failed to get audio metadata:', error);
            return {
                size: audioBuffer.length,
                format: 'unknown',
            };
        }
    }
}