import { useState, useCallback, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
// [FIX] Decoupled NotificationContext
// import { useNotifications } from '../contexts/NotificationContext';
import { ErrorHandler, ApiError } from '../utils/errorHandler';
import { logger } from '../utils/logger';

// Import validation utilities
import { validateData } from '../utils/validation';
import { ChatSendPayloadSchema, ChatStreamEventSchema } from '../types/socket';
import type { ChatSendPayload, ChatStreamEvent } from '../types/socket';
import type { NotificationHandler } from '../types/ui';
export type { NotificationHandler };

/*
export interface NotificationHandler {
  (params: {
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message: string;
    action?: { label: string; onClick: () => void };
    duration?: number;
    persistent?: boolean;
  }): void;
}
*/

interface MessageState {
    id: string;
    content: string;
    isStreaming: boolean;
    hasError: boolean;
    error?: string;
    timestamp: number;
    retryCount: number;
    lastActivity: number; // Last activity timestamp
}

export function useSendMessage(
    socket: Socket | null,
    onSessionUpdate?: (title?: string) => void,
    onShowNotification?: NotificationHandler
) {
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [currentMessage, setCurrentMessage] = useState<MessageState | null>(null);
    // const { addNotification } = useNotifications(); // Removed
    const streamTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const streamMonitorRef = useRef<NodeJS.Timeout | undefined>(undefined); // Stream monitor timer
    const isStreamingRef = useRef(false);
    const maxRetries = 3;

    // Keep ref in sync with state
    useEffect(() => {
        isStreamingRef.current = isStreaming;
    }, [isStreaming]);

    /**
     * Display message send error notification (improved version)
     */
    const showMessageError = useCallback(
        (error: ApiError, retryCount: number, onRetry: () => void) => {
            const notificationType = ErrorHandler.getNotificationType(error);
            const userMessage = ErrorHandler.getUserMessage(error);
            const suggestedAction = ErrorHandler.getSuggestedAction(error);

            // Provide detailed suggestions for stream timeout errors
            let enhancedMessage = userMessage;
            if (error.message.includes('Stream timeout')) {
                enhancedMessage +=
                    '\n\nSuggestions:\n• AI model is processing a complex request, please wait patiently\n• If the issue persists, try simplifying your question or try again later\n• Check your network connection';
            }

            if (onShowNotification) {
                onShowNotification({
                    type: notificationType,
                    title: 'Failed to send message',
                    message: enhancedMessage,
                    action:
                        retryCount < maxRetries
                            ? {
                                  label: `Retry (${retryCount}/${maxRetries})`,
                                  onClick: onRetry,
                              }
                            : suggestedAction
                              ? {
                                    label: suggestedAction,
                                    onClick: onRetry,
                                }
                              : undefined,
                    duration: retryCount < maxRetries ? 0 : 8000,
                    persistent: retryCount < maxRetries,
                });
            } else {
                // Fallback logger if no UI handler
                logger.error('[useSendMessage] Error:', enhancedMessage);
            }
        },
        [onShowNotification]
    );

    /**
     * Core logic for sending messages
     */
    const sendMessageCore = useCallback(
        (payload: ChatSendPayload, _retryCount: number = 0): Promise<void> => {
            return new Promise((resolve, reject) => {
                if (!socket) {
                    const error = ErrorHandler.parseError(
                        new Error('Socket not connected'),
                        'send message'
                    );
                    reject(error);
                    return;
                }

                if (!socket.connected) {
                    const error = ErrorHandler.parseError(
                        new Error('Socket not connected - socket.connected is false'),
                        'send message'
                    );
                    reject(error);
                    return;
                }

                // Validate payload
                let validatedPayload: ChatSendPayload;
                try {
                    validatedPayload = validateData(ChatSendPayloadSchema, payload, 'chat:send');
                } catch (validationError) {
                    reject(validationError);
                    return;
                }

                // Clear previous timers
                if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
                if (streamMonitorRef.current) clearTimeout(streamMonitorRef.current);

                setIsStreaming(true);
                setStreamingText('');

                // Set stream monitor timer
                const startTime = Date.now();
                const streamTimeoutMs = 90000;

                const monitorStream = () => {
                    const elapsed = Date.now() - startTime;
                    if (isStreamingRef.current && elapsed < streamTimeoutMs) {
                        streamMonitorRef.current = setTimeout(monitorStream, 10000);
                    }
                };
                streamMonitorRef.current = setTimeout(monitorStream, 10000);

                // Set message timeout
                streamTimeoutRef.current = setTimeout(() => {
                    if (isStreamingRef.current) {
                        const timeoutError = ErrorHandler.parseError(
                            new Error(
                                `Message stream timeout - Server did not respond within ${streamTimeoutMs / 1000} seconds.`
                            ),
                            'send message'
                        );
                        cleanup();
                        reject(timeoutError);
                    }
                }, streamTimeoutMs);

                const cleanup = () => {
                    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
                    if (streamMonitorRef.current) clearTimeout(streamMonitorRef.current);
                    setIsStreaming(false);
                    socket.off('chat:stream', handleStream);
                    socket.off('chat:error', handleError);
                    socket.off('disconnect', handleDisconnect);
                };

                const handleStream = (event: unknown) => {
                    let validatedEvent: ChatStreamEvent;
                    try {
                        validatedEvent = validateData(ChatStreamEventSchema, event, 'chat:stream');
                    } catch (validationError) {
                        cleanup();
                        reject(validationError);
                        return;
                    }

                    if (validatedEvent.type === 'chunk') {
                        const chunk = validatedEvent.data || '';
                        // Debug log to confirm streaming
                        if (chunk.length > 0) {
                            logger.debug(`[useSendMessage] Received chunk: ${chunk.length} chars`);
                        }
                        setStreamingText(prev => prev + chunk);
                        setCurrentMessage(prev =>
                            prev ? { ...prev, lastActivity: Date.now() } : null
                        );
                    } else if (validatedEvent.type === 'done') {
                        cleanup();
                        if (onSessionUpdate) {
                            if (validatedEvent.title) {
                                onSessionUpdate(validatedEvent.title);
                            } else {
                                setTimeout(() => onSessionUpdate(), 1000);
                            }
                        }
                        resolve();
                    } else if (validatedEvent.type === 'error') {
                        cleanup();
                        const apiError = ErrorHandler.parseError(
                            new Error(validatedEvent.error || 'Unknown stream error'),
                            'chat stream'
                        );
                        reject(apiError);
                    }
                };

                const handleError = (error: any) => {
                    cleanup();
                    let errorMessage = 'Unknown error from server';
                    if (error && typeof error === 'object') {
                        errorMessage =
                            error.message || error.error || error.msg || JSON.stringify(error);
                    } else if (typeof error === 'string') {
                        errorMessage = error;
                    }

                    const apiError = ErrorHandler.parseError(
                        new Error(errorMessage),
                        'chat stream'
                    );
                    reject(apiError);
                };

                const handleDisconnect = (reason: string) => {
                    cleanup();
                    const disconnectError = ErrorHandler.parseError(
                        new Error(`Connection lost during streaming (${reason}).`),
                        'chat stream'
                    );
                    reject(disconnectError);
                };

                socket.on('chat:stream', handleStream);
                socket.on('chat:error', handleError);
                socket.on('disconnect', handleDisconnect);

                try {
                    socket.emit('chat:send', validatedPayload, (ack: any) => {
                        if (ack && ack.error) {
                            cleanup();
                            const ackError =
                                typeof ack.error === 'string'
                                    ? ack.error
                                    : JSON.stringify(ack.error);
                            reject(
                                ErrorHandler.parseError(
                                    new Error(ackError),
                                    'message acknowledgment'
                                )
                            );
                        }
                    });
                } catch (error) {
                    cleanup();
                    reject(ErrorHandler.parseError(error as Error, 'send message'));
                }
            });
        },
        [socket, onSessionUpdate]
    );

    /**
     * Send message
     */
    const sendMessage = useCallback(
        async (payload: ChatSendPayload) => {
            setStreamingText('');
            const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const messageState: MessageState = {
                id: messageId,
                content: payload.content,
                isStreaming: false,
                hasError: false,
                timestamp: Date.now(),
                retryCount: 0,
                lastActivity: Date.now(),
            };

            setCurrentMessage(messageState);

            const attemptSend = async (retryCount: number = 0): Promise<void> => {
                try {
                    setCurrentMessage(prev =>
                        prev ? { ...prev, isStreaming: true, retryCount } : null
                    );
                    await sendMessageCore(payload, retryCount);
                    setTimeout(() => setCurrentMessage(null), 1000);
                } catch (error) {
                    const apiError = error as ApiError;
                    const newRetryCount = retryCount + 1;

                    setCurrentMessage(prev =>
                        prev
                            ? {
                                  ...prev,
                                  isStreaming: false,
                                  hasError: true,
                                  error: apiError.message,
                                  retryCount: newRetryCount,
                              }
                            : null
                    );
                    setStreamingText('');

                    showMessageError(apiError, newRetryCount, () => {
                        if (newRetryCount <= maxRetries) {
                            attemptSend(newRetryCount);
                        }
                    });
                }
            };

            await attemptSend(0);
        },
        [sendMessageCore, showMessageError]
    );

    const retryCurrentMessage = useCallback(() => {
        if (currentMessage && currentMessage.hasError && currentMessage.retryCount < maxRetries) {
            // Just a placeholder since it requires sessionId/payload
            logger.warn('retryCurrentMessage manually triggered');
        }
    }, [currentMessage]);

    const cancelCurrentMessage = useCallback(() => {
        if (socket) {
            socket.off('chat:stream');
            socket.off('chat:error');
            socket.off('disconnect');
        }
        if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
        if (streamMonitorRef.current) clearTimeout(streamMonitorRef.current);
        setIsStreaming(false);
        setCurrentMessage(null);
    }, [socket]);

    useEffect(() => {
        return () => {
            if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
            if (streamMonitorRef.current) clearTimeout(streamMonitorRef.current);
        };
    }, []);

    return {
        sendMessage,
        isStreaming,
        streamingText,
        currentMessage,
        retryCurrentMessage,
        cancelCurrentMessage,
        setCurrentMessage,
        canRetry: currentMessage?.hasError && currentMessage.retryCount < maxRetries,
    };
}
