export const groupItemsByDate = (items: any[]) => {
    const groups: { [key: string]: any[] } = {
        'Recent 7 Days': [],
        Earlier: [],
    };

    items.forEach(item => {
        const date = new Date(item.updatedAt || item.createdAt || new Date()); // Fallback to now if missing
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 7) {
            groups['Recent 7 Days'].push(item);
        } else {
            groups['Earlier'].push(item);
        }
    });

    return groups;
};
