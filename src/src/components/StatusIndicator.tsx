import React from 'react';
import { motion } from 'framer-motion';
import { Wifi, WifiOff, Mic, MicOff, Loader, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '../utils';

interface StatusIndicatorProps {
    isConnected: boolean;
    isRecording: boolean;
    isProcessing: boolean;
    language: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
    isConnected,
    isRecording,
    isProcessing,
    language,
}) => {
    const getStatusInfo = () => {
        if (isProcessing) {
            return {
                icon: Loader,
                text: 'Processing',
                color: 'text-yellow-600',
                bgColor: 'bg-yellow-100',
                animate: true,
            };
        }

        if (isRecording) {
            return {
                icon: Mic,
                text: 'Recording',
                color: 'text-red-600',
                bgColor: 'bg-red-100',
                animate: true,
            };
        }

        if (isConnected) {
            return {
                icon: CheckCircle,
                text: 'Connected',
                color: 'text-green-600',
                bgColor: 'bg-green-100',
                animate: false,
            };
        }

        return {
            icon: WifiOff,
            text: 'Disconnected',
            color: 'text-gray-600',
            bgColor: 'bg-gray-100',
            animate: false,
        };
    };

    const statusInfo = getStatusInfo();
    const IconComponent = statusInfo.icon;

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
        >
            <div className="flex items-center space-x-3">
                <div className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full',
                    statusInfo.bgColor
                )}>
                    <motion.div
                        animate={statusInfo.animate ? { rotate: 360 } : {}}
                        transition={statusInfo.animate ? { duration: 2, repeat: Infinity, ease: 'linear' } : {}}
                    >
                        <IconComponent className={cn('w-4 h-4', statusInfo.color)} />
                    </motion.div>
                </div>

                <div>
                    <p className={cn('text-sm font-medium', statusInfo.color)}>
                        {statusInfo.text}
                    </p>
                    <p className="text-xs text-gray-500">
                        Language: {language.toUpperCase()}
                    </p>
                </div>
            </div>

            {/* Connection indicator */}
            <div className="flex items-center space-x-1">
                {isConnected ? (
                    <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                    <WifiOff className="w-4 h-4 text-gray-400" />
                )}
            </div>
        </motion.div>
    );
};