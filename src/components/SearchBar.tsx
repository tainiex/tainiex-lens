/**
 * 搜索栏组件
 * Search Bar Component
 * 
 * 全文搜索笔记标题和块内容
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { search } from '../services/notesService';
import type { ISearchResult, BlockType } from '../types/collaboration';
import './SearchBar.css';

interface SearchBarProps {
  className?: string;
  onResultClick?: (result: ISearchResult) => void;
}

const SearchBar = ({ className = '', onResultClick }: SearchBarProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ISearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 执行搜索
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const searchResults = await search(searchQuery);
      setResults(searchResults);
      setIsOpen(searchResults.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 防抖搜索
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  // 处理结果点击
  const handleResultClick = useCallback((result: ISearchResult) => {
    setIsOpen(false);
    setQuery('');
    
    if (onResultClick) {
      onResultClick(result);
    } else {
      // 默认导航到笔记
      navigate(`/notes/${result.noteId}`);
    }
  }, [navigate, onResultClick]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleResultClick(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  }, [isOpen, results, selectedIndex, handleResultClick]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // 获取块类型图标
  const getBlockTypeIcon = (type?: BlockType) => {
    switch (type) {
      case 'HEADING1':
      case 'HEADING2':
      case 'HEADING3':
        return 'H';
      case 'CODE':
        return '{ }';
      case 'IMAGE':
        return '🖼️';
      case 'VIDEO':
        return '🎬';
      case 'TABLE':
        return '📊';
      case 'QUOTE':
        return '"';
      default:
        return '¶';
    }
  };

  return (
    <div ref={containerRef} className={`search-bar-container ${className}`}>
      <div className="search-input-wrapper">
        <svg 
          className="search-icon" 
          width="18" 
          height="18" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="搜索笔记..."
          className="search-input"
        />
        {isLoading && (
          <div className="search-spinner" />
        )}
        {query && !isLoading && (
          <button 
            className="search-clear"
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="search-results">
          {results.map((result, index) => (
            <div
              key={`${result.noteId}-${result.blockId || index}`}
              className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleResultClick(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="result-icon">
                {result.type === 'note' ? '📝' : getBlockTypeIcon(result.blockType)}
              </div>
              <div className="result-content">
                <div className="result-title">
                  {result.noteTitle}
                  {result.type === 'block' && (
                    <span className="result-type-badge">块</span>
                  )}
                </div>
                <div 
                  className="result-highlight"
                  dangerouslySetInnerHTML={{ __html: result.highlight }}
                />
              </div>
              <div className="result-score">
                {Math.round(result.score * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen && query && results.length === 0 && !isLoading && (
        <div className="search-results">
          <div className="search-no-results">
            没有找到匹配的结果
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;