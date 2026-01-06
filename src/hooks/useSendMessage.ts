import { useState, useCallback, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { useNotifications } from '../contexts/NotificationContext';
import { ErrorHandler, ApiError } from '../utils/errorHandler';

// Import validation utilities
import { validateData } from '../utils/validation';
import { ChatSendPayloadSchema, ChatStreamEventSchema, ChatErrorEventSchema } from '../types/socket';
import type { ChatSendPayload, ChatStreamEvent, ChatErrorEvent } from '../types/socket';

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

export function useSendMessage(socket: Socket | null, onSessionUpdate?: (title?: string) => void) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentMessage, setCurrentMessage] = useState<MessageState | null>(null);
  const { addNotification } = useNotifications();
  const streamTimeoutRef = useRef<NodeJS.Timeout>();
  const streamMonitorRef = useRef<NodeJS.Timeout>(); // Stream monitor timer
  const isStreamingRef = useRef(false);
  const maxRetries = 3;

  // Keep ref in sync with state
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  /**
   * Display message send error notification (improved version)
   */
  const showMessageError = useCallback((error: ApiError, retryCount: number, onRetry: () => void) => {
    const notificationType = ErrorHandler.getNotificationType(error);
    const userMessage = ErrorHandler.getUserMessage(error);
    const suggestedAction = ErrorHandler.getSuggestedAction(error);

    // Provide detailed suggestions for stream timeout errors
    let enhancedMessage = userMessage;
    if (error.message.includes('Stream timeout')) {
      enhancedMessage += '\n\nSuggestions:\n• AI model is processing a complex request, please wait patiently\n• If the issue persists, try simplifying your question or try again later\n• Check your network connection';
    }

    addNotification({
      type: notificationType,
      title: 'Failed to send message',
      message: enhancedMessage,
      action: retryCount < maxRetries ? {
        label: `Retry (${retryCount}/${maxRetries})`,
        onClick: onRetry
      } : suggestedAction ? {
        label: suggestedAction,
        onClick: onRetry
      } : undefined,
      duration: retryCount < maxRetries ? 0 : 8000,
      persistent: retryCount < maxRetries
    });
  }, [addNotification]);

  /**
   * Core logic for sending messages
   */
  const sendMessageCore = useCallback((payload: ChatSendPayload, _retryCount: number = 0): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!socket) {
        const error = ErrorHandler.parseError(new Error('Socket not connected'), 'send message');
        console.error('❌ Socket is null or undefined');
        reject(error);
        return;
      }

      if (!socket.connected) {
        const error = ErrorHandler.parseError(new Error('Socket not connected - socket.connected is false'), 'send message');
        console.error('❌ Socket is not connected:', socket.id);
        reject(error);
        return;
      }

      // Validate payload
      let validatedPayload: ChatSendPayload;
      try {
        console.log('🔍 Validating message payload...', {
          hasSessionId: !!payload.sessionId,
          hasContent: !!payload.content,
          contentLength: payload.content.length,
          hasModel: !!payload.model,
          sessionIdLength: payload.sessionId?.length,
          model: payload.model
        });

        validatedPayload = validateData(ChatSendPayloadSchema, payload, 'chat:send');

        console.log('✅ Payload validation passed:', {
          sessionIdLength: validatedPayload.sessionId.length,
          contentLength: validatedPayload.content.length,
          model: validatedPayload.model
        });
      } catch (validationError) {
        console.error('❌ Payload validation failed:', validationError);
        reject(validationError);
        return;
      }

      // Clear previous timeout timer
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }

      // Clear previous stream monitor timer
      if (streamMonitorRef.current) {
        clearTimeout(streamMonitorRef.current);
      }

      setIsStreaming(true);
      setStreamingText('');

      // Set stream monitor timer (check stream status every 10 seconds)
      const startTime = Date.now();
      const monitorStream = () => {
        const elapsed = Date.now() - startTime;
        if (isStreamingRef.current && elapsed < streamTimeoutMs) {
          console.debug(`Stream monitoring: ${elapsed / 1000}s elapsed, still streaming...`);
          streamMonitorRef.current = setTimeout(monitorStream, 10000);
        }
      };
      streamMonitorRef.current = setTimeout(monitorStream, 10000);

      // Set message timeout (90 seconds, give AI model more processing time)
      const streamTimeoutMs = 90000;
      streamTimeoutRef.current = setTimeout(() => {
        if (isStreamingRef.current) {
          console.error('Message timeout reached while streaming - No response from server');
          const timeoutError = ErrorHandler.parseError(new Error(`Message stream timeout - Server did not respond within ${streamTimeoutMs / 1000} seconds. This may be due to long AI processing time or network latency.`), 'send message');
          setIsStreaming(false);
          socket.off('chat:stream', handleStream);
          reject(timeoutError);
        }
      }, streamTimeoutMs);

      const handleStream = (event: unknown) => {
        console.debug('Received chat:stream event:', event);
        // Validate stream event data
        let validatedEvent: ChatStreamEvent;
        try {
          validatedEvent = validateData(ChatStreamEventSchema, event, 'chat:stream');
        } catch (validationError) {
          console.error('Stream event validation failed:', validationError, 'Raw event:', event);
          clearTimeout(streamTimeoutRef.current);
          setIsStreaming(false);
          socket.off('chat:stream', handleStream);
          reject(validationError);
          return;
        }

        if (validatedEvent.type === 'chunk') {
          // Accumulate text chunks and update timestamp
          const chunk = validatedEvent.data || '';
          setStreamingText(prev => prev + chunk);

          // Update message last activity time
          setCurrentMessage(prev => prev ? {
            ...prev,
            lastActivity: Date.now()
          } : null);

        } else if (validatedEvent.type === 'done') {
          // Stream completed
          console.log('Message stream completed');
          clearTimeout(streamTimeoutRef.current);
          clearTimeout(streamMonitorRef.current);
          setIsStreaming(false);
          socket.off('chat:stream', handleStream);

          // Trigger session update to refresh title in sidebar
          if (onSessionUpdate) {
            if (validatedEvent.title) {
              // If backend provided title, update immediately
              onSessionUpdate(validatedEvent.title);
            } else {
              // Fallback: fetch list after delay
              setTimeout(() => {
                onSessionUpdate();
              }, 1000);
            }
          }

          resolve();
        } else if (validatedEvent.type === 'error') {
          // Error occurred
          console.error('Stream error event received:', validatedEvent.error);
          clearTimeout(streamTimeoutRef.current);
          clearTimeout(streamMonitorRef.current);
          setIsStreaming(false);
          socket.off('chat:stream', handleStream);
          socket.off('chat:error', handleError);

          const apiError = ErrorHandler.parseError(new Error(validatedEvent.error || 'Unknown stream error'), 'chat stream');
          reject(apiError);
        }
      };

      // Listen for stream events
      socket.on('chat:stream', handleStream);

      const handleError = (error: any) => {
        console.error('🚨 Received chat:error event (raw):', error);
        console.error('🔍 Error type:', typeof error);
        console.error('🔍 Error is null/undefined:', error === null || error === undefined);
        console.error('🔍 Error keys:', error && typeof error === 'object' ? Object.keys(error) : 'N/A');
        console.error('🔍 Error JSON:', (() => {
          try {
            return JSON.stringify(error, null, 2);
          } catch (e) {
            return 'Cannot stringify error';
          }
        })());

        clearTimeout(streamTimeoutRef.current);
        clearTimeout(streamMonitorRef.current);
        setIsStreaming(false);
        socket.off('chat:stream', handleStream);
        socket.off('chat:error', handleError);

        // Try to validate error event with schema
        let validatedError: ChatErrorEvent | null = null;
        try {
          if (error !== null && error !== undefined) {
            validatedError = validateData(ChatErrorEventSchema, error, 'chat:error');
            console.log('✅ Error event validation passed:', validatedError);
          }
        } catch (validationError) {
          console.warn('⚠️ Error event validation failed, will parse manually:', validationError);
        }

        // Handle various error formats from the server
        let errorMessage = 'Unknown error from server - no error details provided';

        if (validatedError) {
          // Use validated error data
          errorMessage = validatedError.message || validatedError.error || validatedError.msg || validatedError.description || errorMessage;
        } else if (error) {
          if (typeof error === 'string') {
            // Error is a string
            errorMessage = error.trim() || errorMessage;
          } else if (error instanceof Error) {
            // Error is an Error instance
            errorMessage = error.message || errorMessage;
          } else if (typeof error === 'object') {
            // Error is an object - check various possible properties
            errorMessage = error.message || error.error || error.msg || error.description || errorMessage;

            // If still no message, try to stringify the object
            if (errorMessage === 'Unknown error from server - no error details provided') {
              try {
                const errorStr = JSON.stringify(error);
                if (errorStr && errorStr !== '{}' && errorStr !== 'null') {
                  errorMessage = `Server error (details): ${errorStr}`;
                }
              } catch (e) {
                // Ignore stringify errors
                console.warn('Failed to stringify error object:', e);
              }
            }
          }
        } else {
          errorMessage = 'Server sent empty error event';
        }

        console.error('💬 Parsed error message:', errorMessage);

        const apiError = ErrorHandler.parseError(
          new Error(errorMessage),
          'chat stream'
        );
        reject(apiError);
      };

      socket.on('chat:error', handleError);

      // Send message (with acknowledgment callback)
      try {
        console.log('📝 Preparing to send message:', {
          messageLength: validatedPayload.content.length,
          sessionId: validatedPayload.sessionId,
          model: validatedPayload.model,
          hasSocket: !!socket,
          socketConnected: socket?.connected
        });

        // Set a flag to track if we got any response
        let responseReceived = false;

        // Use acknowledgment callback to ensure server received the message
        socket.emit('chat:send', validatedPayload, (ack: any) => {
          responseReceived = true;
          console.log('✅ Message acknowledgment received from server:', ack);
          console.log('🔍 Ack type:', typeof ack);
          console.log('🔍 Ack structure:', (() => {
            try {
              return JSON.stringify(ack, null, 2);
            } catch (e) {
              return 'Cannot stringify ack';
            }
          })());

          // Check if acknowledgment indicates an error
          if (ack && ack.error) {
            const ackError = typeof ack.error === 'string' ? ack.error : JSON.stringify(ack.error);
            console.error('❌ Server acknowledged with error:', ackError);

            clearTimeout(streamTimeoutRef.current);
            clearTimeout(streamMonitorRef.current);
            setIsStreaming(false);
            socket.off('chat:stream', handleStream);
            socket.off('chat:error', handleError);

            const apiError = ErrorHandler.parseError(
              new Error(ackError),
              'message acknowledgment'
            );
            reject(apiError);
          } else if (ack === null || ack === undefined) {
            console.warn('⚠️ Server sent null/undefined acknowledgment - this might indicate a backend issue');
            // Don't reject here, wait for chat:stream or chat:error events
          } else {
            console.log('✅ Message accepted by server, waiting for stream events...');
          }
        });

        console.log('📤 Message emitted to chat:send event, waiting for acknowledgment and stream...');

        // Add a timeout to detect if server never responds at all
        setTimeout(() => {
          if (!responseReceived && isStreamingRef.current) {
            console.warn('⚠️ No acknowledgment received from server after 5 seconds');
          }
        }, 5000);

      } catch (error) {
        console.error('❌ Error emitting message:', error);
        clearTimeout(streamTimeoutRef.current);
        clearTimeout(streamMonitorRef.current);
        setIsStreaming(false);
        socket.off('chat:stream', handleStream);
        socket.off('chat:error', handleError);
        const apiError = ErrorHandler.parseError(error as Error, 'send message');
        reject(apiError);
      }
    });
  }, [socket]);

  /**
   * Smart retry delay calculation (distinguish between different timeout types)
   */
  const calculateSmartRetryDelay = useCallback((retryCount: number, error: ApiError): number => {
    // Use shorter retry intervals for stream timeout errors
    if (error.message.includes('Stream timeout') || error.message.includes('timeout')) {
      // 1st retry: 5s, subsequent: 10s, 15s
      const delays = [5000, 10000, 15000];
      return delays[Math.min(retryCount - 1, delays.length - 1)];
    }

    // Exponential backoff for network errors
    if (error.type === 'NETWORK') {
      const baseDelay = 2000; // 2s base delay
      return Math.min(baseDelay * Math.pow(1.5, retryCount - 1), 30000);
    }

    // Default delay
    return Math.min(5000 * retryCount, 30000);
  }, []);

  /**
   * Send message with retry logic
   */
  const sendMessage = useCallback(async (payload: ChatSendPayload) => {
    setStreamingText('');
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageState: MessageState = {
      id: messageId,
      content: payload.content,
      isStreaming: false,
      hasError: false,
      timestamp: Date.now(),
      retryCount: 0,
      lastActivity: Date.now()
    };

    setCurrentMessage(messageState);

    const attemptSend = async (retryCount: number = 0): Promise<void> => {
      try {
        setCurrentMessage(prev => prev ? { ...prev, isStreaming: true, retryCount } : null);
        await sendMessageCore(payload, retryCount);

        // Clear current message state after success
        setTimeout(() => {
          setCurrentMessage(null);
        }, 1000);

      } catch (error) {
        const apiError = error as ApiError;
        const newRetryCount = retryCount + 1;

        // Update message state to error
        setCurrentMessage(prev => prev ? {
          ...prev,
          isStreaming: false,
          hasError: true,
          error: apiError.message,
          retryCount: newRetryCount
        } : null);

        // Show error notification
        showMessageError(apiError, newRetryCount, () => {
          if (newRetryCount <= maxRetries) {
            attemptSend(newRetryCount);
          }
        });

        // Auto retry if chances remain
        if (newRetryCount <= maxRetries && ErrorHandler.isRetryable(apiError)) {
          const delay = calculateSmartRetryDelay(newRetryCount, apiError);
          console.warn(`Retrying message send (attempt ${newRetryCount}/${maxRetries}) in ${delay}ms`);

          setTimeout(() => {
            attemptSend(newRetryCount);
          }, delay);
        } else {
          // Final failure, no more retries
          setCurrentMessage(prev => prev ? { ...prev, isStreaming: false } : null);
        }
      }
    };

    // Start first attempt
    await attemptSend(0);
  }, [sendMessageCore, showMessageError]);

  /**
   * Manually retry the current failed message
   */
  const retryCurrentMessage = useCallback(() => {
    if (currentMessage && currentMessage.hasError && currentMessage.retryCount < maxRetries) {
      const payload: ChatSendPayload = {
        content: currentMessage.content,
        sessionId: '', // This should be passed from outside or context
        model: ''
      };

      // Needs sessionId from outside, temporarily empty string
      // In practice, this hook should accept sessionId as argument
      console.warn('retryCurrentMessage called without sessionId, please update the hook signature');

      // Reset error state
      setCurrentMessage(prev => prev ? {
        ...prev,
        hasError: false,
        error: undefined,
        isStreaming: true
      } : null);
    }
  }, [currentMessage]);

  /**
   * Cancel current message
   */
  const cancelCurrentMessage = useCallback(() => {
    if (socket) {
      socket.off('chat:stream');
      socket.off('chat:error');
    }

    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
    }

    if (streamMonitorRef.current) {
      clearTimeout(streamMonitorRef.current);
    }

    setIsStreaming(false);
    setCurrentMessage(null);
  }, [socket]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
      if (streamMonitorRef.current) {
        clearTimeout(streamMonitorRef.current);
      }
    };
  }, []);

  return {
    sendMessage,
    isStreaming,
    streamingText,
    currentMessage,
    retryCurrentMessage,
    cancelCurrentMessage,
    canRetry: currentMessage?.hasError && currentMessage.retryCount < maxRetries
  };
}