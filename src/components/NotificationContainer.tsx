import React, { useEffect, useRef } from 'react';
import { useNotifications, Notification } from '../contexts/NotificationContext';
import './NotificationContainer.css';

interface NotificationItemProps {
  notification: Notification;
  onClose: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClose }) => {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Clear timer
  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  };

  // Pause auto-dismiss on hover
  const handleMouseEnter = () => {
    clearTimer();
  };

  const handleMouseLeave = () => {
    if (!notification.persistent && notification.duration !== 0) {
      const remainingTime = notification.duration || 5000;
      timeoutRef.current = setTimeout(() => {
        onClose(notification.id);
      }, remainingTime);
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  const getIcon = () => {
    switch (notification.type) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      case 'info':
        return 'ℹ️';
      default:
        return 'ℹ️';
    }
  };

  const getTypeClass = () => {
    return `notification-item notification-${notification.type}`;
  };

  return (
    <div
      className={getTypeClass()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live="polite"
    >
      <div className="notification-icon">
        {getIcon()}
      </div>

      <div className="notification-content">
        {notification.title && (
          <div className="notification-title">
            {notification.title}
          </div>
        )}
        <div className="notification-message">
          {notification.message}
        </div>
        {notification.action && (
          <button
            className="notification-action"
            onClick={notification.action.onClick}
          >
            {notification.action.label}
          </button>
        )}
      </div>

      {notification.dismissible && (
        <button
          className="notification-close"
          onClick={() => onClose(notification.id)}
          aria-label="Close notification"
        >
          ×
        </button>
      )}
    </div>
  );
};

const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotifications();

  // Don't render if no notifications
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-container" aria-live="polite" aria-atomic="false">
      <div className="notification-list">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClose={removeNotification}
          />
        ))}
      </div>
    </div>
  );
};

export default NotificationContainer;