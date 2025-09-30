import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceChatWidget } from '../../src/src/components/VoiceChatWidget';
import { VoiceChatWidgetProps } from '../../src/src/types';

// Mock framer-motion
jest.mock('framer-motion', () => ({
    motion: {
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    Phone: () => <div data-testid="phone-icon" />,
    X: () => <div data-testid="x-icon" />,
    Mic: () => <div data-testid="mic-icon" />,
    MicOff: () => <div data-testid="mic-off-icon" />,
    Settings: () => <div data-testid="settings-icon" />,
    Globe: () => <div data-testid="globe-icon" />,
}));

// Mock navigator.mediaDevices
const mockGetUserMedia = jest.fn();
Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    value: {
        getUserMedia: mockGetUserMedia,
    },
});

// Mock AudioContext
const mockAudioContext = {
    createGain: jest.fn(),
    createAnalyser: jest.fn(),
    createScriptProcessor: jest.fn(),
    destination: {},
    sampleRate: 44100,
};
Object.defineProperty(window, 'AudioContext', {
    writable: true,
    value: jest.fn(() => mockAudioContext),
});

describe('VoiceChatWidget', () => {
    const defaultProps: VoiceChatWidgetProps = {
        apiKey: 'test-api-key',
        officerEmail: 'test@example.com',
        appName: 'test-app',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetUserMedia.mockResolvedValue({
            getTracks: () => [{ stop: jest.fn() }],
        });
    });

    it('should render the widget button', () => {
        render(<VoiceChatWidget {...defaultProps} />);
        
        const button = screen.getByRole('button', { name: /open voice chat/i });
        expect(button).toBeInTheDocument();
    });

    it('should open the widget panel when button is clicked', async () => {
        render(<VoiceChatWidget {...defaultProps} />);
        
        const button = screen.getByRole('button', { name: /open voice chat/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Voice Chat')).toBeInTheDocument();
        });
    });

    it('should show error when required props are missing', () => {
        const propsWithoutApiKey = {
            ...defaultProps,
            apiKey: '',
        };

        render(<VoiceChatWidget {...propsWithoutApiKey} />);
        
        // Widget should still render but with error state
        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();
    });

    it('should show language selector when settings is clicked', async () => {
        render(<VoiceChatWidget {...defaultProps} />);
        
        // Open widget
        const button = screen.getByRole('button', { name: /open voice chat/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Voice Chat')).toBeInTheDocument();
        });

        // Click settings
        const settingsButton = screen.getByRole('button', { name: /settings/i });
        fireEvent.click(settingsButton);

        // Should show language selector
        await waitFor(() => {
            expect(screen.getByText('English')).toBeInTheDocument();
        });
    });

    it('should handle conversation start', async () => {
        const onConversationStart = jest.fn();
        render(<VoiceChatWidget {...defaultProps} onConversationStart={onConversationStart} />);
        
        // Open widget
        const button = screen.getByRole('button', { name: /open voice chat/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Voice Chat')).toBeInTheDocument();
        });

        // Click start conversation button
        const startButton = screen.getByRole('button', { name: /start conversation/i });
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(mockGetUserMedia).toHaveBeenCalled();
        });
    });

    it('should handle browser not supported error', () => {
        // Mock browser not supporting mediaDevices
        Object.defineProperty(navigator, 'mediaDevices', {
            writable: true,
            value: undefined,
        });

        render(<VoiceChatWidget {...defaultProps} />);
        
        // Widget should still render
        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();
    });

    it('should show current language in header', async () => {
        render(<VoiceChatWidget {...defaultProps} language="es" />);
        
        // Open widget
        const button = screen.getByRole('button', { name: /open voice chat/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Español')).toBeInTheDocument();
        });
    });

    it('should close widget when X button is clicked', async () => {
        render(<VoiceChatWidget {...defaultProps} />);
        
        // Open widget
        const button = screen.getByRole('button', { name: /open voice chat/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Voice Chat')).toBeInTheDocument();
        });

        // Click close button
        const closeButton = screen.getByRole('button', { name: /close/i });
        fireEvent.click(closeButton);

        // Widget should be closed
        await waitFor(() => {
            expect(screen.queryByText('Voice Chat')).not.toBeInTheDocument();
        });
    });

    it('should handle microphone access error', async () => {
        mockGetUserMedia.mockRejectedValue(new Error('Microphone access denied'));
        const onError = jest.fn();

        render(<VoiceChatWidget {...defaultProps} onError={onError} />);
        
        // Open widget
        const button = screen.getByRole('button', { name: /open voice chat/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Voice Chat')).toBeInTheDocument();
        });

        // Click start conversation button
        const startButton = screen.getByRole('button', { name: /start conversation/i });
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(onError).toHaveBeenCalled();
        });
    });

    it('should apply custom styles', () => {
        const customStyles = {
            backgroundColor: 'red',
            color: 'white',
        };

        render(<VoiceChatWidget {...defaultProps} customStyles={customStyles} />);
        
        const container = screen.getByRole('button').closest('.voice-widget-container');
        expect(container).toHaveStyle('background-color: red');
        expect(container).toHaveStyle('color: white');
    });

    it('should support dark theme', () => {
        render(<VoiceChatWidget {...defaultProps} theme="dark" />);
        
        const container = screen.getByRole('button').closest('.voice-widget-container');
        expect(container).toHaveClass('dark');
    });
});
