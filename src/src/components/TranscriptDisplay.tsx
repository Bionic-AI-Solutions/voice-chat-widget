import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Clock } from 'lucide-react';
import { cn } from '../utils';

interface TranscriptDisplayProps {
    transcript: string;
    partialTranscript: string;
    language: string;
}

export const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
    transcript,
    partialTranscript,
    language,
}) => {
    const hasContent = transcript || partialTranscript;

    if (!hasContent) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
        >
            {/* Header */}
            <div className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                <FileText className="w-4 h-4" />
                <span>Live Transcript</span>
                <span className="text-xs text-gray-500">({language})</span>
            </div>

            {/* Transcript Content */}
            <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                {/* Final transcript */}
                {transcript && (
                    <div className="text-sm text-gray-800 leading-relaxed">
                        {transcript}
                    </div>
                )}

                {/* Partial transcript */}
                {partialTranscript && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={cn(
                            'text-sm leading-relaxed',
                            transcript ? 'text-gray-600 mt-2' : 'text-gray-800'
                        )}
                    >
                        {partialTranscript}
                        <motion.span
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ duration: 1, repeat: Infinity }}
                            className="inline-block w-2 h-4 bg-primary-500 ml-1"
                        />
                    </motion.div>
                )}

                {/* Empty state */}
                {!transcript && !partialTranscript && (
                    <div className="flex items-center justify-center py-4 text-gray-500">
                        <div className="text-center">
                            <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Waiting for speech...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Transcript Stats */}
            {(transcript || partialTranscript) && (
                <div className="flex justify-between text-xs text-gray-500">
                    <span>
                        Words: {(transcript || partialTranscript).split(' ').length}
                    </span>
                    <span>
                        Characters: {(transcript || partialTranscript).length}
                    </span>
                </div>
            )}
        </motion.div>
    );
};