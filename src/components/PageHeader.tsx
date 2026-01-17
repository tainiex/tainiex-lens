import React, { ReactNode } from 'react';
import './PageHeader.css';

interface PageHeaderProps {
    className?: string;
    startContent?: ReactNode;
    centerContent?: ReactNode;
    endContent?: ReactNode;
    children?: ReactNode; // Alias for centerContent or flexible use
}

/**
 * PageHeader
 *
 * A generic, reusable header component for all pages (desktop & mobile).
 * Enforces consistent height (60px) and layout structure.
 *
 * Layout: [Start Content] --- [Center Content] --- [End Content]
 */
const PageHeader = ({
    className = '',
    startContent,
    centerContent,
    endContent,
    children,
}: PageHeaderProps) => {
    return (
        <header className={`page-header ${className}`}>
            <div className="header-start">{startContent}</div>

            <div className="header-center">{centerContent || children}</div>

            <div className="header-end">{endContent}</div>
        </header>
    );
};

export default PageHeader;
