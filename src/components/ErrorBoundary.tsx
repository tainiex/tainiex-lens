import React, { Component, ReactNode } from 'react';
import { logger } from '@/shared';
import './ErrorBoundary.css';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: React.ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        logger.error('ErrorBoundary caught an error:', error, errorInfo);

        this.setState({
            error,
            errorInfo,
        });

        // Call external error handler
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            // If custom fallback UI provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const isProduction = import.meta.env.PROD;

            // Default Error UI
            return (
                <div className="error-boundary">
                    <div className="error-boundary-content">
                        <div className="error-icon">
                            <svg
                                width="64"
                                height="64"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <h2 className="error-title">出现了一些问题</h2>
                        <p className="error-message">
                            {isProduction
                                ? '抱歉，页面加载时遇到错误。请尝试刷新页面或返回上一页。'
                                : '开发模式：应用程序遇到错误。请查看下方的错误详情。'}
                        </p>
                        <div className="error-actions">
                            <button
                                className="error-button error-button-primary"
                                onClick={this.handleRetry}
                            >
                                重试
                            </button>
                            <button
                                className="error-button error-button-secondary"
                                onClick={this.handleReload}
                            >
                                刷新页面
                            </button>
                            <button
                                className="error-button error-button-tertiary"
                                onClick={() => window.history.back()}
                            >
                                返回
                            </button>
                        </div>

                        {/* Show error details only in development */}
                        {!isProduction && this.state.error && (
                            <details className="error-details">
                                <summary>错误详情（开发模式）</summary>
                                <div className="error-stack">
                                    <h4>错误信息：</h4>
                                    <pre>{this.state.error.message}</pre>
                                    <h4>堆栈跟踪：</h4>
                                    <pre>{this.state.error.stack}</pre>
                                    {this.state.errorInfo && (
                                        <>
                                            <h4>组件堆栈：</h4>
                                            <pre>{this.state.errorInfo.componentStack}</pre>
                                        </>
                                    )}
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
