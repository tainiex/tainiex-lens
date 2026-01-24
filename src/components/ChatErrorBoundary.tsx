import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../shared/utils/logger';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: ErrorInfo;
}

/**
 * 聊天错误边界组件
 * 捕获聊天组件渲染时的 JavaScript 错误，防止整个应用崩溃
 */
class ChatErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
        };
    }

    static getDerivedStateFromError(error: Error): State {
        // 更新 state 以在下次渲染时显示降级 UI
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // 记录错误到日志系统
        logger.error('[ChatErrorBoundary] Caught error in chat component:', {
            error: error.toString(),
            componentStack: errorInfo.componentStack,
        });

        // 调用外部错误处理回调
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }

        // 保存错误信息到状态
        this.setState({
            errorInfo,
        });
    }

    handleReset = () => {
        // 重置错误状态，尝试恢复
        this.setState({
            hasError: false,
            error: undefined,
            errorInfo: undefined,
        });
    };

    render() {
        if (this.state.hasError) {
            // 如果提供了自定义降级 UI，使用它
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // 默认降级 UI
            return (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem',
                        textAlign: 'center',
                        backgroundColor: 'rgba(255, 107, 107, 0.1)',
                        border: '1px solid rgba(255, 107, 107, 0.3)',
                        borderRadius: '8px',
                        margin: '1rem',
                    }}
                >
                    <div
                        style={{
                            fontSize: '3rem',
                            marginBottom: '1rem',
                        }}
                    >
                        ⚠️
                    </div>
                    <h3
                        style={{
                            margin: '0 0 0.5rem 0',
                            fontSize: '1.2rem',
                            color: '#d32f2f',
                        }}
                    >
                        聊天组件出现错误
                    </h3>
                    <p
                        style={{
                            margin: '0 0 1.5rem 0',
                            fontSize: '0.9rem',
                            color: '#666',
                            maxWidth: '500px',
                        }}
                    >
                        抱歉，聊天界面遇到了一些问题。您可以尝试刷新页面或点击下方按钮重试。
                    </p>
                    {this.state.error && (
                        <details
                            style={{
                                marginBottom: '1rem',
                                padding: '0.5rem',
                                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                maxWidth: '600px',
                                textAlign: 'left',
                            }}
                        >
                            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
                                错误详情
                            </summary>
                            <pre
                                style={{
                                    margin: 0,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}
                            >
                                {this.state.error.toString()}
                            </pre>
                        </details>
                    )}
                    <button
                        onClick={this.handleReset}
                        style={{
                            padding: '0.75rem 1.5rem',
                            fontSize: '1rem',
                            fontWeight: 500,
                            color: '#fff',
                            backgroundColor: '#1976d2',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                        }}
                        onMouseOver={e => {
                            e.currentTarget.style.backgroundColor = '#1565c0';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.backgroundColor = '#1976d2';
                        }}
                    >
                        重试
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ChatErrorBoundary;
