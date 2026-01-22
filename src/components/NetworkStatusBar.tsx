/**
 * 网络状态栏组件
 * Network Status Bar Component
 *
 * 显示 WebSocket 连接状态：连接中 / 已连接 / 已断开 / 重试中
 */

import type { CollaborationConnectionState } from '../shared/types/collaboration';
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

    const { status } = connectionState;

    // 穷尽性检查辅助函数
    // Exhaustiveness check helper
    const assertNever = (value: never): never => {
        throw new Error(`Unhandled status value: ${value}`);
    };

    const getStatusConfig = () => {
        switch (status) {
            case 'initializing':
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
                return {
                    icon: <div className="status-dot-pulse warning"></div>,
                    title: 'Reconnecting...',
                    className: 'reconnecting',
                };
            case 'disconnected':
            case 'failed':
                return {
                    icon: <div className="status-dot-pulse warning"></div>,
                    title: 'Disconnected',
                    className: 'disconnected',
                };
            case 'offline':
                return {
                    icon: <div className="status-dot-static danger"></div>,
                    title: 'No Internet Connection',
                    className: 'offline',
                };

            default:
                // 穷尽性检查 - 如果添加新状态而忘记处理，TypeScript 会在编译时报错
                // Exhaustiveness check - TypeScript will error at compile time if new state is added but not handled
                return assertNever(status);
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
