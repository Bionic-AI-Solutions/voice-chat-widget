import winston from 'winston';
import path from 'path';

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which logs to print based on environment
const level = () => {
    const env = process.env['NODE_ENV'] || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'warn';
};

// Define different formats
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

// Define transports
const transports = [
    // Console transport
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }),
];

// Add file transport if enabled
if (process.env['LOG_FILE_ENABLED'] === 'true') {
    const logDir = process.env['LOG_FILE_PATH'] || './logs';
    const logFile = path.join(logDir, 'app.log');
    
    transports.push(
        new winston.transports.File({
            filename: logFile,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            maxsize: parseInt(process.env['LOG_MAX_SIZE'] || '10485760'), // 10MB
            maxFiles: parseInt(process.env['LOG_MAX_FILES'] || '5'),
        })
    );
}

// Create the logger
export const logger = winston.createLogger({
    level: level(),
    levels,
    format,
    transports,
    exitOnError: false,
});

// Create a stream object for Morgan HTTP logging
export const stream = {
    write: (message: string) => {
        logger.http(message.substring(0, message.lastIndexOf('\n')));
    },
};

// Export default logger
export default logger;
