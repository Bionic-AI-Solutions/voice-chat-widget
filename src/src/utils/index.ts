import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
    return clsx(inputs);
}

export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

export function formatCost(cost: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(cost);
}

export function generateId(): string {
    return Math.random().toString(36).substr(2, 9);
}

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export function isValidApiKey(apiKey: string): boolean {
    return apiKey && apiKey.length >= 32;
}

export function getPositionClasses(position: string): string {
    const positions = {
        'bottom-right': 'bottom-4 right-4',
        'bottom-left': 'bottom-4 left-4',
        'top-right': 'top-4 right-4',
        'top-left': 'top-4 left-4',
    };
    return positions[position as keyof typeof positions] || positions['bottom-right'];
}

export function getThemeClasses(theme: string, isDark: boolean = false): string {
    if (theme === 'auto') {
        return isDark ? 'dark' : 'light';
    }
    return theme;
}

export function createError(code: string, message: string, details?: Record<string, any>) {
    return {
        code,
        message,
        details,
        timestamp: new Date(),
    };
}

export function log(level: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
        case 'error':
            console.error(logMessage, data);
            break;
        case 'warn':
            console.warn(logMessage, data);
            break;
        case 'info':
            console.info(logMessage, data);
            break;
        case 'debug':
        case 'verbose':
            console.debug(logMessage, data);
            break;
        default:
            console.log(logMessage, data);
    }
}

export function retry<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
): Promise<T> {
    return new Promise((resolve, reject) => {
        const attempt = (attemptNumber: number) => {
            fn()
                .then(resolve)
                .catch((error) => {
                    if (attemptNumber < retries) {
                        setTimeout(() => attempt(attemptNumber + 1), delay * Math.pow(2, attemptNumber - 1));
                    } else {
                        reject(error);
                    }
                });
        };
        attempt(1);
    });
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function getBrowserInfo(): { name: string; version: string } {
    const userAgent = navigator.userAgent;
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';

    if (userAgent.indexOf('Chrome') > -1) {
        browserName = 'Chrome';
        browserVersion = userAgent.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Firefox') > -1) {
        browserName = 'Firefox';
        browserVersion = userAgent.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Safari') > -1) {
        browserName = 'Safari';
        browserVersion = userAgent.match(/Version\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Edge') > -1) {
        browserName = 'Edge';
        browserVersion = userAgent.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
    }

    return { name: browserName, version: browserVersion };
}

export function supportsWebRTC(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function supportsWebSocket(): boolean {
    return typeof WebSocket !== 'undefined';
}

export function getAudioContext(): AudioContext | null {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    return AudioContext ? new AudioContext() : null;
}