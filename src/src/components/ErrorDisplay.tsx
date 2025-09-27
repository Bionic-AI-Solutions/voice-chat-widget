import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { VoiceChatError } from '../types';
import { cn } from '../utils';

interface ErrorDisplayProps {
    error: VoiceChatError;
    onDismiss: () => void;
    onRetry?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
    error,
    onDismiss,
    onRetry,
}) => {
    const getErrorIcon = (code: string) => {
        switch (code) {
            case 'MICROPHONE_ACCESS_DENIED':
                return '🎤';
            case 'BROWSER_NOT_SUPPORTED':
                return '🌐';
            case 'NETWORK_ERROR':
                return '📡';
            case 'API_ERROR':
                return '🔌';
            default:
                return '⚠️';
        }
    };

    const getErrorTitle = (code: string) => {
        switch (code) {
            case 'MICROPHONE_ACCESS_DENIED':
                return 'Microphone Access Denied';
            case 'BROWSER_NOT_SUPPORTED':
                return 'Browser Not Supported';
            case 'NETWORK_ERROR':
                return 'Network Error';
            case 'API_ERROR':
                return 'API Error';
            case 'INVALID_PROPS':
                return 'Configuration Error';
            default:
                return 'Error';
        }
    };

    const getErrorDescription = (code: string) => {
        switch (code) {
            case 'MICROPHONE_ACCESS_DENIED':
                return 'Please allow microphone access to use voice chat.';
            case 'BROWSER_NOT_SUPPORTED':
                return 'Your browser does not support voice chat features.';
            case 'NETWORK_ERROR':
                return 'Please check your internet connection and try again.';
            case 'API_ERROR':
                return 'There was an error connecting to the voice service.';
            case 'INVALID_PROPS':
                return 'The widget configuration is invalid.';
            default:
                return 'An unexpected error occurred.';
        }
    };

    const isRetryable = ['NETWORK_ERROR', 'API_ERROR'].includes(error.code);

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-red-50 border border-red-200 rounded-lg"
        >
            <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                        <span className="text-lg">{getErrorIcon(error.code)}</span>
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-red-800">
                        {getErrorTitle(error.code)}
                    </h4>
                    <p className="text-sm text-red-700 mt-1">
                        {getErrorDescription(error.code)}
                    </p>

                    {error.details && (
                        <details className="mt-2">
                            <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                                Technical Details
                            </summary>
                            <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap">
                                {JSON.stringify(error.details, null, 2)}
                            </pre>
                        </details>
                    )}

                    <div className="flex items-center space-x-2 mt-3">
                        {isRetryable && onRetry && (
                            <button
                                onClick={onRetry}
                                className="flex items-center space-x-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                            >
                                <RefreshCw className="w-3 h-3" />
                                <span>Retry</span>
                            </button>
                        )}

                        <button
                            onClick={onDismiss}
                            className="flex items-center space-x-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                        >
                            <X className="w-3 h-3" />
                            <span>Dismiss</span>
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};