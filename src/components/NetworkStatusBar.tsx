/**
 * 网络状态栏组件
 * Network Status Bar Component
 * 
 * 显示 WebSocket 连接状态：连接中 / 已连接 / 已断开 / 重试中
 */

import { useEffect, useState } from 'react';
import type { CollaborationConnectionState } from '../types/collaboration';
import './NetworkStatusBar.css';

interface NetworkStatusBarProps {
  connectionState: CollaborationConnectionState;
  onReconnect?: () => void;
}

const NetworkStatusBar = ({ connectionState, onReconnect }: NetworkStatusBarProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const { status } = connectionState;

    if (status === 'connected') {
      // 连接成功后短暂显示成功状态
      setShowSuccess(true);
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setShowSuccess(false);
      }, 2000);
      return () => clearTimeout(timer);
    } else if (status === 'connecting' || status === 'reconnecting') {
      setIsVisible(true);
      setShowSuccess(false);
    } else if (status === 'failed' || status === 'disconnected') {
      setIsVisible(true);
      setShowSuccess(false);
    }
  }, [connectionState]);

  const { status, error } = connectionState;

  const getStatusConfig = () => {
    switch (status) {
      case 'connecting':
        return {
          icon: (
            <svg className="status-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ),
          text: '正在连接...',
          className: 'connecting',
        };
      case 'connected':
        return {
          icon: (
            <svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22,4 12,14.01 9,11.01" />
            </svg>
          ),
          text: '已连接',
          className: 'connected',
        };
      case 'reconnecting':
        return {
          icon: (
            <svg className="status-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23,4 23,10 17,10" />
              <polyline points="1,20 1,14 7,14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          ),
          text: '正在重连...',
          className: 'reconnecting',
        };
      case 'disconnected':
        return {
          icon: (
            <svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
              <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0122.58 9" />
              <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
              <path d="M8.53 16.11a6 6 0 016.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          ),
          text: '连接已断开',
          className: 'disconnected',
        };
      case 'failed':
        return {
          icon: (
            <svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ),
          text: error || '连接失败',
          className: 'failed',
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config || !isVisible) return null;

  return (
    <div className={`network-status-bar ${config.className} ${showSuccess ? 'success-fade' : ''}`}>
      <div className="status-content">
        {config.icon}
        <span className="status-text">{config.text}</span>
      </div>
      {(status === 'disconnected' || status === 'failed') && onReconnect && (
        <button className="reconnect-btn" onClick={onReconnect}>
          重新连接
        </button>
      )}
    </div>
  );
};

export default NetworkStatusBar;