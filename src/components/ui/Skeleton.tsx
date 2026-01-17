import React from 'react';

interface SkeletonProps {
    className?: string; // Allow overriding styles (width, height, radius)
    style?: React.CSSProperties;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
    return <div className={`skeleton ${className}`} style={style} />;
};

export default Skeleton;
