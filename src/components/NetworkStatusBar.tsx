/**
 * 网络状态栏组件
 * Network Status Bar Component
 *
 * 显示 WebSocket 连接状态：连接中 / 已连接 / 已断开 / 重试中
 */

import { useEffect, useState } from 'react';
import type { CollaborationConnectionState } from '../types/collaboration';
import { useSocketContext } from '../contexts/SocketContext';
import './NetworkStatusBar.css';

interface NetworkStatusBarProps {
    connectionState?: CollaborationConnectionState;
    onReconnect?: () => void;
}

const NetworkStatusBar = ({
    connectionState: propsState,
    onReconnect: propsOnReconnect,
}: NetworkStatusBarProps = {}) => {
    const context = useSocketContext();

    // Use props if provided, otherwise fall back to context
    // This allows legacy usages to work until removed, and new usage to just use context
    const connectionState = propsState || context?.connectionState || { status: 'disconnected' };
    const onReconnect = propsOnReconnect || context?.reconnect;

    // Always visible, but only show relevant error states or generic status
    // User requested "Remove connected/disconnected popups".
    // We will make it a permanent small indicator that just changes color/icon.

    const { status, error } = connectionState;

    const getStatusConfig = () => {
        switch (status) {
            case 'connecting':
                return {
                    icon: <div className="status-dot-pulse warning"></div>,
                    title: 'Connecting...', // Tooltip
                    className: 'connecting',
                };
            case 'connected':
                return {
                    icon: <div className="status-dot-pulse success"></div>,
                    title: 'Connected',
                    className: 'connected',
                };
            case 'reconnecting':
            case 'disconnected':
            case 'failed':
                return {
                    icon: <div className="status-dot-pulse warning"></div>,
                    title: 'Connecting...',
                    className: 'reconnecting',
                };

            default:
                return {
                    icon: <div className="status-dot-static gray"></div>,
                    title: 'Unknown',
                    className: 'disconnected',
                };
        }
    };

    const config = getStatusConfig();
    if (!config) return null;

    return (
        <div className={`network-status-indicator-global ${config.className}`} title={config.title}>
            {/* Icon Only */}
            {config.icon}

            {/* Show Reconnect Button only on failure/manual disconnect, but keep it subtle? 
          User said "Remove popup". Let's hide the button for now or make it very small?
          Actually, click on the indicator to reconnect is better UX for a small indicator.
      */}
            {(status === 'disconnected' || status === 'failed') && onReconnect && (
                <div
                    className="reconnect-overlay"
                    onClick={onReconnect}
                    title="Click to Reconnect"
                />
            )}
        </div>
    );
};

export default NetworkStatusBar;
