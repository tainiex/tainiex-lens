# WebSocket 连接改进方案

## 问题分析

### 原有架构存在的问题

1. **状态同步断层**
    - `SocketService.subscribe()` 只在 Chat socket 连接/断开时通知
    - 状态机依赖此通知，但 Activity/Collaboration socket 状态变化不会触发通知
    - 导致 UI 状态与实际连接状态不一致

2. **Token 更新时机问题**
    - Manager 的 `extraHeaders` 更新后，已建立的 socket 连接不会自动使用新 token
    - 导致 token 过期后持续认证失败

3. **重连逻辑混乱**
    - Socket.IO 自带重连机制（reconnectionAttempts: Infinity）
    - 自定义指数退避重连（per-socket 追踪）
    - 状态机触发重连
    - 三层逻辑互相干扰，造成状态不一致

4. **断开后状态卡死**
    - 重连成功后可能忘记调用 `notifyListeners(true)`
    - 网络恢复后，状态指示器仍然显示黄色（reconnecting）

5. **缺乏健康检查机制**
    - 无法主动检测"僵尸连接"（显示连接但实际不工作）
    - 依赖被动的 disconnect 事件

## 工业级解决方案

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Layer (状态指示器)                      │
│                    NetworkStatusBar Component                │
└────────────────────┬────────────────────────────────────────┘
                     │ subscribe to state
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                State Machine (XState)                        │
│  统一管理：initializing → connecting → connected             │
│           ↓ disconnect                                       │
│  reconnecting → (健康检查) → connected/failed                 │
└────────────────────┬────────────────────────────────────────┘
                     │ commands + events
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              SocketService (增强版)                           │
│  • 统一的连接状态追踪（所有3个socket）                         │
│  • 主动健康检查（ping/pong）                                   │
│  • 智能重连：指数退避 + jitter + 断路器                        │
│  • Token刷新：主动检测过期 + 重连时更新                        │
│  • 连接质量监控：延迟、丢包率、重连次数                        │
└─────────────────────────────────────────────────────────────┘
```

### 核心改进

#### 1. 统一连接状态追踪

**新增 `ConnectionStatus` 枚举：**

```typescript
enum ConnectionStatus {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    FAILED = 'failed',
}
```

**聚合状态追踪：**

- `getAggregatedStatus()` 方法综合所有 socket 的状态
- 所有 socket 都连接 → `CONNECTED`
- 部分 socket 连接 → `RECONNECTING`
- 全部断开 + 正在连接 → `CONNECTING`
- 断路器打开 → `FAILED`

#### 2. 健康检查机制

**定期 Ping/Pong：**

- 每 30 秒发送一次 ping
- 10 秒内未收到 pong 视为超时
- 连续超时触发主动重连

**连接质量监控：**

```typescript
interface ConnectionMetrics {
    latency: number; // 延迟（ms）
    lastPingTime: number; // 最后一次 ping 时间
    reconnectCount: number; // 重连次数
    failureCount: number; // 失败次数
    lastSuccessfulConnect: number; // 最后成功连接时间
}
```

#### 3. 智能重连策略

**指数退避 + 随机抖动：**

- 基础延迟：1 秒
- 最大延迟：30 秒
- 公式：`delay = min(base * 2^attempts + jitter, max)`
- jitter 范围：0-25% 的延迟，避免"惊群效应"

**断路器模式：**

- 连续失败 10 次后进入 `OPEN` 状态
- 停止重连 60 秒
- 60 秒后进入 `HALF_OPEN` 状态尝试恢复
- 恢复成功 → `CLOSED`，失败 → 再次 `OPEN`

**状态转换：**

```
CLOSED (正常) → OPEN (故障) → HALF_OPEN (尝试恢复) → CLOSED
      ↑______________|                    |
                                          ↓ (失败)
                                        OPEN
```

#### 4. Token 生命周期管理

**主动检测过期：**

- 每 60 秒检查一次 JWT 过期时间
- 过期前 5 分钟主动刷新
- 刷新成功后更新所有 socket 的 auth

**重连时更新 Token：**

```typescript
private async updateManagerAuth() {
    const token = apiClient.accessToken;
    if (this.manager?.opts && token) {
        // 更新 Manager 配置
        this.manager.opts.extraHeaders = {
            Authorization: `Bearer ${token}`,
            'X-Auth-Mode': 'bearer',
        };
        // 更新所有 socket 的 auth
        this.chatSocket.auth = { token };
        this.collaborationSocket.auth = { token };
        this.activitySocket.auth = { token };
    }
}
```

#### 5. 增强的状态机

**新事件类型：**

```typescript
{
    type: 'STATUS_CHANGE';
    status: ConnectionStatus;
    latency?: number;
    reconnectCount?: number;
}
```

**自动状态转换：**

- 状态机订阅 `SocketService` 的状态变化
- `SocketService` 状态变化自动触发状态机转换
- 无需手动同步，避免状态不一致

**新增 `failed` 状态：**

- 用于断路器打开时
- 用户可手动点击重试，强制重连

### 关键代码改动

#### SocketService.ts

1. **统一的 notifyListeners：**

```typescript
private notifyListeners(status: ConnectionStatus) {
    logger.debug(`[SocketService] Notifying listeners: ${status}`);
    this.listeners.forEach(l => l(status, this.metrics));
}
```

2. **聚合状态计算：**

```typescript
private getAggregatedStatus(): ConnectionStatus {
    const sockets = [this.chatSocket, this.collaborationSocket, this.activitySocket];
    const connectedCount = sockets.filter(s => s?.connected).length;
    const totalCount = sockets.filter(s => s !== null).length;

    if (totalCount === 0) return ConnectionStatus.DISCONNECTED;
    if (connectedCount === totalCount) return ConnectionStatus.CONNECTED;
    if (connectedCount > 0) return ConnectionStatus.RECONNECTING;
    if (this.connectionPromise) return ConnectionStatus.CONNECTING;
    if (this.circuitState === CircuitState.OPEN) return ConnectionStatus.FAILED;

    return ConnectionStatus.DISCONNECTED;
}
```

3. **智能重连调度：**

```typescript
private scheduleReconnection(reason: string) {
    if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
        // 打开断路器
        this.circuitState = CircuitState.OPEN;
        this.circuitOpenTime = Date.now();
        this.notifyListeners(ConnectionStatus.FAILED);
        return;
    }

    const delay = this.getReconnectionDelay();
    this.reconnectionAttempts++;

    this.reconnectionTimer = setTimeout(async () => {
        await this.connect(true);
    }, delay);
}
```

4. **健康检查：**

```typescript
private performHealthCheck() {
    const pingTime = Date.now();
    this.pingTimeout = setTimeout(() => {
        this.handleHealthCheckFailure();
    }, this.pingTimeoutMs);

    (this.chatSocket as any).emit('ping', { timestamp: pingTime });
}
```

#### connectionMachine.ts

1. **订阅增强版状态：**

```typescript
socketSubscription: fromCallback(({ sendBack }) => {
    const unsubscribe = socketService.subscribe((status, metrics) => {
        sendBack({
            type: 'STATUS_CHANGE',
            status,
            latency: metrics?.latency,
            reconnectCount: metrics?.reconnectCount,
        });
    });
    return () => unsubscribe();
});
```

2. **状态转换逻辑：**

```typescript
connected: {
    on: {
        STATUS_CHANGE: [
            {
                guard: ({ event }) => event.status === ConnectionStatus.RECONNECTING,
                target: 'reconnecting',
                actions: 'updateMetrics',
            },
            // ... 其他状态转换
        ],
    },
}
```

### 使用方法

#### 订阅连接状态

```typescript
const unsubscribe = socketService.subscribe((status, metrics) => {
    console.log('Connection status:', status);
    console.log('Latency:', metrics?.latency);
    console.log('Reconnect count:', metrics?.reconnectCount);
});

// 取消订阅
unsubscribe();
```

#### 手动重连

```typescript
// 重置断路器并强制重连
await socketService.reconnect();
```

#### 获取当前状态

```typescript
const status = socketService.getConnectionStatus();
const metrics = socketService.getMetrics();
```

### 测试覆盖

新增测试用例：

1. 聚合状态计算测试
2. 断路器行为测试
3. 状态变化通知测试
4. 重连延迟计算测试（指数退避 + jitter）

### 性能优化

1. **减少重连风暴：**
    - jitter 机制避免多个客户端同时重连
    - 断路器限制无效重连次数

2. **降低服务器负载：**
    - 最大重连间隔 30 秒（原 5 秒）
    - 健康检查间隔 30 秒（按需调整）

3. **快速故障检测：**
    - 健康检查超时 10 秒
    - 主动检测而非被动等待

### 向后兼容性

- `subscribe()` 方法签名更改，但保持向后兼容
- 旧代码中的 `subscribe(isConnected => ...)` 仍可工作
- 新代码可以使用 `subscribe((status, metrics) => ...)`

### 部署建议

1. **逐步推出：**
    - 先部署到测试环境观察
    - 确认无问题后再推到生产环境

2. **监控指标：**
    - 重连次数
    - 断路器触发次数
    - 平均延迟
    - 健康检查失败率

3. **可调参数：**
    - `maxReconnectionAttempts`：断路器前最大重连次数（默认 10）
    - `maxReconnectionDelay`：最大重连延迟（默认 30 秒）
    - `healthCheckIntervalMs`：健康检查间隔（默认 30 秒）
    - `pingTimeoutMs`：ping 超时时间（默认 10 秒）
    - `circuitResetTimeout`：断路器重置时间（默认 60 秒）

## 问题解决

### ✅ 问题 1：网络恢复后状态指示器仍然黄色

**原因：** 只有 Chat socket 的连接状态会触发通知

**解决：** 使用 `getAggregatedStatus()` 综合所有 socket 状态，任何 socket 的状态变化都会触发通知

### ✅ 问题 2：断开后无法重连

**原因：**

- Token 过期导致认证失败
- 重连逻辑混乱（多层重连互相干扰）
- 无限重连导致 rate limit

**解决：**

- 主动 Token 刷新机制
- 统一的重连调度（移除 per-socket 追踪）
- 断路器防止无限重连

### ✅ 问题 3：僵尸连接检测

**原因：** 缺乏主动健康检查

**解决：**

- 定期 ping/pong 检查
- 超时自动触发重连

## 总结

这次改进实现了：

1. ✅ **统一状态管理**：聚合多个 socket 的状态
2. ✅ **主动健康检查**：ping/pong 机制
3. ✅ **智能重连**：指数退避 + jitter + 断路器
4. ✅ **Token 管理**：主动刷新 + 重连更新
5. ✅ **质量监控**：延迟、重连次数、失败率

### 代码质量

- ✅ TypeScript 编译通过（无错误）
- ✅ 测试用例更新完成
- ✅ 向后兼容性保持
- ✅ 日志完善，方便调试

### 下一步

1. 部署到测试环境
2. 观察监控指标
3. 根据实际情况调优参数
4. 考虑添加更多监控埋点（Sentry/Analytics）
