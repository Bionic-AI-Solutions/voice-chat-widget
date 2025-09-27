import React from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Square, Play, Pause } from 'lucide-react';
import { cn } from '../utils';

interface VoiceControlsProps {
    isRecording: boolean;
    isProcessing: boolean;
    isConnected: boolean;
    onStart: () => void;
    onEnd: () => void;
    disabled?: boolean;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
    isRecording,
    isProcessing,
    isConnected,
    onStart,
    onEnd,
    disabled = false,
}) => {
    const handleMainAction = () => {
        if (isRecording) {
            onEnd();
        } else {
            onStart();
        }
    };

    return (
        <div className="space-y-4">
            {/* Main Control Button */}
            <div className="flex justify-center">
                <motion.button
                    className={cn(
                        'relative flex items-center justify-center w-16 h-16 rounded-full text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
                        isRecording
                            ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                            : isConnected
                                ? 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'
                                : 'bg-gray-400 hover:bg-gray-500 focus:ring-gray-500',
                        disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={handleMainAction}
                    disabled={disabled || isProcessing}
                    whileHover={{ scale: disabled ? 1 : 1.05 }}
                    whileTap={{ scale: disabled ? 1 : 0.95 }}
                    aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                >
                    {isProcessing ? (
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : isRecording ? (
                        <Square className="w-6 h-6" />
                    ) : (
                        <Mic className="w-6 h-6" />
                    )}

                    {/* Recording pulse animation */}
                    {isRecording && (
                        <motion.div
                            className="absolute inset-0 rounded-full bg-red-500"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0, 0.7] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        />
                    )}
                </motion.button>
            </div>

            {/* Status Text */}
            <div className="text-center">
                <p className="text-sm text-gray-600">
                    {isProcessing
                        ? 'Processing...'
                        : isRecording
                            ? 'Recording in progress'
                            : isConnected
                                ? 'Ready to record'
                                : 'Click to start recording'}
                </p>
            </div>

            {/* Secondary Controls */}
            {isRecording && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center space-x-4"
                >
                    <button
                        className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                        onClick={onEnd}
                        disabled={disabled}
                    >
                        <MicOff className="w-4 h-4" />
                        <span>Mute</span>
                    </button>

                    <button
                        className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                        onClick={onEnd}
                        disabled={disabled}
                    >
                        <Pause className="w-4 h-4" />
                        <span>Pause</span>
                    </button>
                </motion.div>
            )}
        </div>
    );
};