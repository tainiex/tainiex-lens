import * as Y from 'yjs';
import { vi } from 'vitest';
import type { Socket } from 'socket.io-client';

/**
 * Mock Y.js Document
 */
export function createMockYDoc(guid?: string): Y.Doc {
    return new Y.Doc({ guid });
}

/**
 * Mock Socket.IO Client
 */
export function createMockSocket(): Partial<Socket> {
    const eventHandlers = new Map<string, Function[]>();

    return {
        connected: true,
        id: 'mock-socket-id',
        emit: vi.fn(),
        on: vi.fn((event: string, handler: Function) => {
            if (!eventHandlers.has(event)) {
                eventHandlers.set(event, []);
            }
            eventHandlers.get(event)!.push(handler);
        }),
        off: vi.fn((event: string, handler: Function) => {
            const handlers = eventHandlers.get(event);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
            }
        }),
        disconnect: vi.fn(),
        connect: vi.fn(),
        // Helper to trigger events in tests
        _trigger: (event: string, ...args: any[]) => {
            const handlers = eventHandlers.get(event);
            if (handlers) {
                handlers.forEach((handler) => handler(...args));
            }
        },
    } as any;
}

/**
 * Mock API Response
 */
export function createMockResponse<T>(data: T, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Mock User Data
 */
export function createMockUser() {
    return {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
    };
}

/**
 * Mock Chat Session
 */
export function createMockSession() {
    return {
        id: 'session-123',
        userId: 'user-123',
        title: 'Test Session',
        modelId: 'gpt-4',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
    };
}

/**
 * Mock Chat Message
 */
export function createMockMessage(overrides: Partial<any> = {}) {
    return {
        id: 'msg-123',
        sessionId: 'session-123',
        role: 'user',
        content: 'Hello, world!',
        createdAt: new Date('2024-01-01'),
        ...overrides,
    };
}

/**
 * Mock Note
 */
export function createMockNote(overrides: Partial<any> = {}) {
    return {
        id: 'note-123',
        userId: 'user-123',
        title: 'Test Note',
        content: '',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        ...overrides,
    };
}

/**
 * Create a delayed promise for testing async behavior
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for next tick
 */
export function nextTick(): Promise<void> {
    return new Promise((resolve) => queueMicrotask(resolve));
}
