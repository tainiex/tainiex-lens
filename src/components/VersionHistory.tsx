/**
 * 版本历史组件
 * Version History Component
 *
 * 显示笔记/块的版本历史并支持回滚
 */

import { useState, useEffect, useCallback } from 'react';
import {
    getNoteSnapshots,
    getBlockVersions,
    rollbackBlock,
    INoteSnapshot,
    IBlockVersion,
    logger,
} from '@/shared';
import './VersionHistory.css';

interface VersionHistoryProps {
    noteId?: string;
    blockId?: string;
    onRollback?: () => void;
    onClose?: () => void;
}

const VersionHistory = ({ noteId, blockId, onRollback, onClose }: VersionHistoryProps) => {
    const [snapshots, setSnapshots] = useState<INoteSnapshot[]>([]);
    const [blockVersions, setBlockVersions] = useState<IBlockVersion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
    const [isRollingBack, setIsRollingBack] = useState(false);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 加载版本历史
    useEffect(() => {
        const loadHistory = async () => {
            setIsLoading(true);
            setError(null);

            try {
                if (blockId) {
                    const versions = await getBlockVersions(blockId);
                    setBlockVersions(versions);
                } else if (noteId) {
                    const snapshotsList = await getNoteSnapshots(noteId);
                    setSnapshots(snapshotsList);
                }
            } catch (err) {
                logger.error('Failed to load version history:', err);
                setError('加载版本历史失败');
            } finally {
                setIsLoading(false);
            }
        };

        loadHistory();
    }, [noteId, blockId]);

    // 选择版本预览
    const handleSelectVersion = useCallback((versionId: string, content: string) => {
        setSelectedVersion(versionId);
        setPreviewContent(content);
    }, []);

    // 执行回滚
    const handleRollback = useCallback(async () => {
        if (!selectedVersion || !blockId) return;

        setIsRollingBack(true);
        try {
            await rollbackBlock(blockId, selectedVersion);
            onRollback?.();
            onClose?.();
        } catch (err) {
            logger.error('Rollback failed:', err);
            setError('回滚失败，请重试');
        } finally {
            setIsRollingBack(false);
        }
    }, [selectedVersion, blockId, onRollback, onClose]);

    // 格式化时间
    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins} 分钟前`;
        if (diffHours < 24) return `${diffHours} 小时前`;
        if (diffDays < 7) return `${diffDays} 天前`;

        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (isLoading) {
        return (
            <div className="version-history-container">
                <div className="version-history-header">
                    <h3>版本历史</h3>
                    {onClose && (
                        <button className="close-btn" onClick={onClose}>
                            ×
                        </button>
                    )}
                </div>
                <div className="version-history-loading">
                    <div className="loading-spinner" />
                    <span>加载中...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="version-history-container">
                <div className="version-history-header">
                    <h3>版本历史</h3>
                    {onClose && (
                        <button className="close-btn" onClick={onClose}>
                            ×
                        </button>
                    )}
                </div>
                <div className="version-history-error">
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    const items = blockId ? blockVersions : snapshots;
    const hasItems = items.length > 0;

    return (
        <div className="version-history-container">
            <div className="version-history-header">
                <h3>版本历史</h3>
                {onClose && (
                    <button className="close-btn" onClick={onClose}>
                        ×
                    </button>
                )}
            </div>

            {!hasItems ? (
                <div className="version-history-empty">
                    <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <p>暂无版本历史</p>
                    <span>编辑内容后，系统会自动保存版本</span>
                </div>
            ) : (
                <div className="version-history-content">
                    {/* 版本列表 */}
                    <div className="version-list">
                        {blockId
                            ? // 块版本列表
                              blockVersions.map((version, index) => (
                                  <div
                                      key={version.id}
                                      className={`version-item ${selectedVersion === version.id ? 'selected' : ''}`}
                                      onClick={() =>
                                          handleSelectVersion(version.id, version.content)
                                      }
                                  >
                                      <div className="version-indicator">
                                          <div className="version-dot" />
                                          {index < blockVersions.length - 1 && (
                                              <div className="version-line" />
                                          )}
                                      </div>
                                      <div className="version-info">
                                          <div className="version-time">
                                              {formatTime(version.createdAt)}
                                          </div>
                                          <div className="version-user">
                                              {version.userName || '未知用户'}
                                          </div>
                                          <div className="version-type">{version.type}</div>
                                      </div>
                                  </div>
                              ))
                            : // 笔记快照列表
                              snapshots.map((snapshot, index) => (
                                  <div
                                      key={snapshot.id}
                                      className={`version-item ${selectedVersion === snapshot.id ? 'selected' : ''}`}
                                      onClick={() =>
                                          handleSelectVersion(
                                              snapshot.id,
                                              JSON.stringify(snapshot.blocks)
                                          )
                                      }
                                  >
                                      <div className="version-indicator">
                                          <div className="version-dot" />
                                          {index < snapshots.length - 1 && (
                                              <div className="version-line" />
                                          )}
                                      </div>
                                      <div className="version-info">
                                          <div className="version-time">
                                              {formatTime(snapshot.createdAt)}
                                          </div>
                                          <div className="version-user">
                                              {snapshot.userName || '未知用户'}
                                          </div>
                                          <div className="version-blocks">
                                              {snapshot.blocks.length} 个块
                                          </div>
                                      </div>
                                  </div>
                              ))}
                    </div>

                    {/* 预览面板 */}
                    {previewContent && (
                        <div className="version-preview">
                            <div className="preview-header">
                                <span>预览</span>
                            </div>
                            <div className="preview-content">
                                <pre>{previewContent}</pre>
                            </div>
                            {blockId && selectedVersion && (
                                <div className="preview-actions">
                                    <button
                                        className="rollback-btn"
                                        onClick={handleRollback}
                                        disabled={isRollingBack}
                                    >
                                        {isRollingBack ? (
                                            <>
                                                <div className="btn-spinner" />
                                                回滚中...
                                            </>
                                        ) : (
                                            <>
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <polyline points="1 4 1 10 7 10" />
                                                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                                </svg>
                                                回滚到此版本
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default VersionHistory;
