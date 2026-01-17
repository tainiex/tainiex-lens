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

            // Default Error UI
            return (
                <div className="error-boundary">
                    <div className="error-boundary-content">
                        <div className="error-icon">⚠️</div>
                        <h2 className="error-title">Something went wrong</h2>
                        <p className="error-message">
                            Sorry, an error occurred. Please try refreshing the page or going back.
                        </p>
                        <div className="error-actions">
                            <button
                                className="error-button error-button-primary"
                                onClick={this.handleRetry}
                            >
                                Retry
                            </button>
                            <button
                                className="error-button error-button-secondary"
                                onClick={this.handleReload}
                            >
                                Refresh Page
                            </button>
                            <button
                                className="error-button error-button-tertiary"
                                onClick={() => window.history.back()}
                            >
                                Go Back
                            </button>
                        </div>

                        {/* Show error details in development */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details className="error-details">
                                <summary>Error Details (Dev Mode)</summary>
                                <div className="error-stack">
                                    <h4>Error Message:</h4>
                                    <pre>{this.state.error.message}</pre>
                                    <h4>Stack Trace:</h4>
                                    <pre>{this.state.error.stack}</pre>
                                    {this.state.errorInfo && (
                                        <>
                                            <h4>Component Stack:</h4>
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
