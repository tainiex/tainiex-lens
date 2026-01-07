
const messages1 = [
    {
        "id": "a8b20271-5771-4349-ae00-f6405cd14e71",
        "sessionId": "5899c5ea-359e-434c-9ea5-92a9d3dd0489",
        "parentId": "fa6befee-d7b9-49b4-b221-bfc407d63c3b",
        "role": "user",
        "content": "我还想把索引和黄页的概念引入ai中...",
        "createdAt": "2026-01-06T01:46:54.942Z"
    },
    {
        "id": "4927053b-bc6d-42a3-bbe4-82942c7c1861",
        "sessionId": "5899c5ea-359e-434c-9ea5-92a9d3dd0489",
        "parentId": "a8b20271-5771-4349-ae00-f6405cd14e71",
        "role": "assistant",
        "content": "这是一个非常棒的架构演进...",
        "createdAt": "2026-01-06T01:47:27.556Z"
    },
    {
        "id": "fa4b6e9d-3818-4e6d-936c-a3e66762ac1e",
        "sessionId": "5899c5ea-359e-434c-9ea5-92a9d3dd0489",
        "parentId": "4927053b-bc6d-42a3-bbe4-82942c7c1861",
        "role": "user",
        "content": "我想对于严肃问题...",
        "createdAt": "2026-01-06T16:56:52.536Z"
    }
];

const messages2 = [
    {
        "id": "6d631420-5dbf-418c-9829-f92e4f2dd9d4",
        "sessionId": "5899c5ea-359e-434c-9ea5-92a9d3dd0489",
        "parentId": "db7371a8-5415-49c1-a891-7ef95ef45d29",
        "role": "assistant",
        "content": "开发一个 AI Native 的文档编辑器...",
        "createdAt": "2026-01-05T18:27:33.152Z"
    },
    {
        "id": "ab7661b6-2562-4768-bf1f-44472901844c",
        "sessionId": "5899c5ea-359e-434c-9ea5-92a9d3dd0489",
        "parentId": "524949fb-c555-4c77-9b02-31b6f5a76ce3",
        "role": "user",
        "content": "我的设想是一个ai os...",
        "createdAt": "2026-01-06T17:02:43.663Z"
    }
    // Note: I am taking a subset to test bridging logic.
];

function topoSortMessages(messages: any[]): any[] {
    if (messages.length <= 1) return messages;

    const byId = new Map();
    const childrenMap = new Map();
    const allIds = new Set();

    messages.forEach(msg => {
        if (msg.id) {
            byId.set(msg.id, msg);
            allIds.add(msg.id);
        }
    });

    const roots: any[] = [];

    messages.forEach(msg => {
        // Use msg.parentId assuming it exists
        const pId = msg.parentId;

        if (pId && allIds.has(pId)) {
            if (!childrenMap.has(pId)) {
                childrenMap.set(pId, []);
            }
            childrenMap.get(pId).push(msg);
        } else {
            roots.push(msg);
        }
    });

    roots.sort((a, b) => {
        const tA = a.createdAt || a.timestamp || 0;
        const tB = b.createdAt || b.timestamp || 0;
        return new Date(tA).getTime() - new Date(tB).getTime();
    });

    const result: any[] = [];

    const traverse = (msg: any) => {
        result.push(msg);
        if (!msg.id) return;

        const children = childrenMap.get(msg.id);
        if (children) {
            children.sort((a: any, b: any) => {
                const tA = a.createdAt || a.timestamp || 0;
                const tB = b.createdAt || b.timestamp || 0;
                return new Date(tA).getTime() - new Date(tB).getTime();
            });
            children.forEach(traverse);
        }
    };

    roots.forEach(traverse);

    if (result.length < messages.length) {
        const processedIds = new Set(result.map(m => m.id));
        const remaining = messages.filter(m => !processedIds.has(m.id));
        remaining.sort((a, b) => {
            const tA = a.createdAt || a.timestamp || 0;
            const tB = b.createdAt || b.timestamp || 0;
            return new Date(tA).getTime() - new Date(tB).getTime();
        });
        return [...result, ...remaining];
    }

    return result;
}

// Emulate Fetch History merging
const merged = [...messages2, ...messages1];
const sorted = topoSortMessages(merged);

console.log("Sorted Order:");
sorted.forEach(m => console.log(`${m.role} (${m.createdAt}): ${m.content.slice(0, 20)}... Parent: ${m.parentId?.slice(0, 8)}`));
