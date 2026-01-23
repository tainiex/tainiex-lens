export interface ActivityEventPayload {
    /**
     * Unique ID for this specific operation
     * 本次操作的唯一 ID
     */
    activityId: string;
    /**
     * Type of activity, e.g., 'TOOL_EXECUTION', 'LLM_GENERATION'
     * 活动类型，例如 'TOOL_EXECUTION' (工具执行), 'LLM_GENERATION' (模型生成)
     */
    type: string;
    /**
     * Current status of the activity
     * 活动当前状态
     */
    status: 'STARTED' | 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';
    /**
     * Epoch timestamp
     * 时间戳
     */
    timestamp: number;
    /**
     * Optional metadata (inputs, outputs, error details)
     * 可选元数据（输入参数、输出结果、错误详情）
     */
    metadata?: Record<string, any>;
    /**
     * Human-readable description (e.g., "Searching for weather in Tokyo")
     * 可读描述（例如 "正在查询东京的天气"）
     */
    description?: string;
}

export type ActivityStatus = ActivityEventPayload['status'];
