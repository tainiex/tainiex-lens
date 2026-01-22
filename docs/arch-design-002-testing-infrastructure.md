# 测试架构文档

## 概述

本文档描述了 Tainiex Lens 项目的测试架构、组织结构和最佳实践。

## 测试目录结构

```
test/
├── unit/                    # 单元测试
│   ├── machines/           # 状态机测试
│   │   └── connectionMachine.test.ts
│   ├── services/           # 服务层测试
│   │   ├── SocketService.test.ts
│   │   ├── YDocManager.test.ts
│   │   ├── chatService.test.ts
│   │   └── notesService.test.ts
│   └── utils/              # 工具函数测试
│       ├── apiClient.test.ts
│       ├── base64.test.ts
│       ├── dateGrouping.test.ts
│       ├── errorHandler.test.ts
│       ├── logger.test.ts
│       └── validation.test.ts
├── integration/            # 集成测试（未来添加）
├── e2e/                    # 端到端测试（未来添加）
└── utils/                  # 测试工具和辅助函数
    ├── index.tsx           # 自定义 render、mock 工厂函数
    └── mocks.ts            # Mock 数据生成器
```

## 测试技术栈

| 技术                            | 版本   | 用途                     |
| ------------------------------- | ------ | ------------------------ |
| **Vitest**                      | 4.0.17 | 测试框架（Jest 兼容API） |
| **@testing-library/react**      | 16.3.1 | React 组件测试           |
| **@testing-library/jest-dom**   | 6.9.1  | DOM 断言扩展             |
| **@testing-library/user-event** | 14.6.1 | 用户交互模拟             |
| **vitest-mock-extended**        | 3.1.0  | 高级 mock 功能           |

## 测试命名规范

### 文件命名

- **单元测试**：`<FileName>.test.ts` 或 `<FileName>.test.tsx`
- **集成测试**：`<Feature>.integration.test.ts`
- **E2E 测试**：`<Flow>.e2e.test.ts`

### 测试套件命名

```typescript
describe('ComponentName', () => {
    describe('MethodName', () => {
        it('should do something when condition', () => {
            // ...
        });
    });
});
```

**命名模式**：

- `describe`：描述被测试的单元（组件、函数、类）
- `it`：描述具体的行为，使用 `should...when...` 格式

## 运行测试

### 基本命令

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test connectionMachine

# Watch 模式
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage

# UI 模式（可视化界面）
pnpm test:ui
```

### VS Code 集成

推荐安装 **Vitest** 扩展，支持：

- 文件内运行单个测试
- 实时测试结果显示
- Debug 支持

## 测试覆盖率目标

| 模块               | 目标覆盖率 | 说明             |
| ------------------ | ---------- | ---------------- |
| **State Machines** | > 90%      | 关键状态转换逻辑 |
| **Utils**          | > 80%      | 纯函数，核心逻辑 |
| **Services**       | > 75%      | 业务逻辑层       |
| **Hooks**          | > 70%      | 状态管理         |
| **Components**     | > 60%      | UI 组件          |

**当前覆盖率**：

- ✅ Utils: 高覆盖率（logger, base64, dateGrouping, validation, errorHandler）
- ✅ State Machines: 100%（connectionMachine: 9/9 通过）
- ✅ Services: 核心服务已测试（YDocManager）
- 🔄 Hooks 和 Components: 持续扩展中

## 测试策略

### 单元测试（Unit Tests）

**目标**：测试独立的函数、类、组件的行为

**示例**：

```typescript
// test/unit/utils/base64.test.ts
import { base64Utils } from '@/shared/utils/base64';

describe('base64Utils', () => {
    describe('encode', () => {
        it('should encode Uint8Array to base64 string', () => {
            const input = new Uint8Array([72, 101, 108, 108, 111]);
            const result = base64Utils.encode(input);
            expect(result).toBe('SGVsbG8=');
        });
    });
});
```

**特点**：

- 快速执行（< 10ms per test）
- 隔离测试（mock 外部依赖）
- 覆盖边界情况

### 状态机测试（State Machine Tests）

**目标**：验证状态转换逻辑的正确性

**示例**：

```typescript
// test/unit/machines/connectionMachine.test.ts
it('should handle reconnecting flow', () => {
    const actor = createActor(connectionMachine);
    actor.start();

    // connecting -> connected
    actor.send({ type: 'CONNECTED' });
    expect(actor.getSnapshot().value).toBe('connected');

    // connected -> reconnecting
    actor.send({ type: 'DISCONNECTED', error: 'Connection lost' });
    expect(actor.getSnapshot().value).toBe('reconnecting');

    // reconnecting -> connected
    actor.send({ type: 'CONNECTED' });
    expect(actor.getSnapshot().value).toBe('connected');
    expect(actor.getSnapshot().context.error).toBeUndefined();
});
```

**特点**：

- 测试所有状态转换路径
- 验证上下文（context）更新
- 确保没有非法状态转换

### Mock 策略

#### Services

Mock 外部依赖（API, Socket, Y.js）：

```typescript
vi.mock('@/shared/services/SocketService', () => ({
    socketService: {
        getChatSocket: vi.fn(() => ({ connected: false })),
        subscribe: vi.fn(() => () => {}),
        connect: vi.fn(),
    },
}));
```

#### Hooks

使用 `@testing-library/react` 的 `renderHook`：

```typescript
import { renderHook } from '@testing-library/react';
import { useChatSocket } from '@/shared/hooks/useChatSocket';

it('should return connection state', () => {
    const { result } = renderHook(() => useChatSocket());
    expect(result.current.connectionState.status).toBe('disconnected');
});
```

#### Components

使用自定义 `renderWithProviders`：

```typescript
import { renderWithProviders } from '@/test/utils/test-utils';
import { NetworkStatusBar } from '@/components/NetworkStatusBar';

it('should render connected status', () => {
  const { getByTitle } = renderWithProviders(<NetworkStatusBar />);
  expect(getByTitle('Connected')).toBeInTheDocument();
});
```

## 测试最佳实践

### 1. AAA 模式（Arrange-Act-Assert）

```typescript
it('should calculate total price', () => {
    // Arrange - 准备测试数据
    const items = [{ price: 10 }, { price: 20 }];

    // Act - 执行被测试的代码
    const total = calculateTotal(items);

    // Assert - 验证结果
    expect(total).toBe(30);
});
```

### 2. 测试隔离

每个测试应该独立，不依赖其他测试的状态：

```typescript
describe('UserService', () => {
    beforeEach(() => {
        // 每个测试前重置状态
        vi.clearAllMocks();
    });

    it('test 1', () => {
        /* ... */
    });
    it('test 2', () => {
        /* ... */
    });
});
```

### 3. 描述性测试名称

❌ 不好：

```typescript
it('test connection', () => {});
```

✅ 好：

```typescript
it('should transition to connected state when CONNECTED event is received', () => {});
```

### 4. 避免测试实现细节

❌ 不好（测试实现）：

```typescript
it('should call setState with correct value', () => {
    // 测试 React 内部实现
});
```

✅ 好（测试行为）：

```typescript
it('should display error message when validation fails', () => {
    // 测试用户可见的行为
});
```

### 5. 使用合适的断言

```typescript
// 精确匹配
expect(value).toBe(expected);

// 对象匹配
expect(object).toEqual({ key: 'value' });

// 包含检查
expect(array).toContain(item);

// 自定义匹配器（jest-dom）
expect(element).toBeInTheDocument();
expect(element).toHaveTextContent('Hello');
```

## 调试测试

### VS Code Debug

在 `.vscode/launch.json` 中配置：

```json
{
    "name": "Debug Vitest",
    "type": "node",
    "request": "launch",
    "runtimeExecutable": "pnpm",
    "runtimeArgs": ["test", "--run", "${file}"],
    "smartStep": true,
    "console": "integratedTerminal"
}
```

### 日志输出

```typescript
it('should do something', () => {
    console.log('Debug info:', someValue);
    // 测试代码
});
```

Vitest 会在测试失败时显示日志输出。

### UI 模式

```bash
pnpm test:ui
```

提供可视化界面，方便调试和查看测试结果。

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: Test
on: [push, pull_request]

jobs:
    test:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v3
            - uses: pnpm/action-setup@v2
              with:
                  version: 10
            - uses: actions/setup-node@v3
              with:
                  node-version: '20'
                  cache: 'pnpm'
            - run: pnpm install
            - run: pnpm test --run
            - run: pnpm test:coverage
            - uses: codecov/codecov-action@v3
```

## 故障排查

### 常见问题

**问题 1**: 导入路径错误

```
Cannot find module '@/shared/...'
```

**解决方案**: 确保 `vite.config.ts` 中配置了路径别名：

```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
}
```

**问题 2**: Mock 不生效

**解决方案**: 确保 `vi.mock()` 在测试文件顶部，在所有 import 之后：

```typescript
import { myFunction } from './module';
vi.mock('./module'); // ✅ 正确位置
```

**问题 3**: 异步测试超时

**解决方案**: 使用 `waitFor` 或增加超时时间：

```typescript
import { waitFor } from '@testing-library/react';

it('should load data', async () => {
    await waitFor(
        () => {
            expect(data).toBeDefined();
        },
        { timeout: 5000 }
    );
});
```

## 相关文件

- `vite.config.ts` - Vitest 配置
- `vitest.setup.ts` - 全局测试设置
- `test/utils/test-utils/` - 测试工具函数
- `package.json` - 测试脚本

## 参考资料

- [Vitest 官方文档](https://vitest.dev/)
- [Testing Library 文档](https://testing-library.com/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
