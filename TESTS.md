# Testing Documentation

本文档详细说明 Tainiex Lens 项目的测试策略、工具和最佳实践。

## 测试策略 (Testing Strategy)

### 单元测试 (Unit Tests)

**目标**：测试独立的函数、类和模块，确保每个单元按预期工作。

**覆盖范围**：
- ✅ **Utils**（工具函数）：`src/shared/utils/*`
- ✅ **Services**（服务层）：`src/shared/services/*`
- ✅ **Hooks**（React Hooks）：`src/shared/hooks/*`
- ✅ **Contexts**（React Contexts）：`src/contexts/*`
- ✅ **关键 UI Components**：ErrorBoundary、ModelSelector、NetworkStatusBar 等

**不包括**：
- ❌ 复杂编辑器组件（NoteEditor、ChatMessages）→ 建议使用集成测试
- ❌ 页面组件（Pages）→ 建议使用 E2E 测试

### 集成测试 (Integration Tests)

**未来计划**：测试多个模块的交互，例如：
- Editor + Y.js + Socket 协作流程
- Chat + API + Socket 实时消息流程

### E2E 测试 (End-to-End Tests)

**未来计划**：使用 Playwright/Cypress 测试完整用户流程。

---

## 测试框架和工具 (Tools & Framework)

### 核心框架

| 工具                          | 版本   | 用途                                      |
| ----------------------------- | ------ | ----------------------------------------- |
| **Vitest**                    | 4.0.16 | 测试运行器（Vite 原生支持，速度极快）     |
| **@testing-library/react**    | 16.3.1 | React 组件测试（用户行为驱动）            |
| **@testing-library/user-event** | 14.6.1 | 模拟用户交互（点击、输入等）              |
| **jsdom**                     | 27.4.0 | 浏览器环境模拟                            |
| **@vitest/ui**                | 4.0.17 | 测试 UI 界面（可视化测试结果）            |
| **vitest-mock-extended**      | 3.1.0  | 高级 Mock 工具                            |

### 为什么选择 Vitest？

✅ **原生 Vite 集成**：无需额外配置，开箱即用  
✅ **极速执行**：使用 esbuild，比 Jest 快 10-20 倍  
✅ **兼容 Jest API**：无缝迁移现有测试  
✅ **ESM 原生支持**：完美支持现代 JavaScript 模块  
✅ **官方推荐**：Vite、React 官方文档推荐的测试框架

---

## 测试文件组织 (Test Organization)

### 文件命名规范

```
src/
├── shared/
│   ├── utils/
│   │   ├── apiClient.ts
│   │   └── apiClient.test.ts       ← 测试文件与源文件同目录
│   ├── services/
│   │   ├── YDocManager.ts
│   │   └── YDocManager.test.ts
│   └── hooks/
│       ├── useChat.ts
│       └── useChat.test.ts
├── components/
│   ├── ErrorBoundary.tsx
│   └── ErrorBoundary.test.tsx
└── test-utils/                     ← 测试工具库
    ├── index.ts                    (自定义 render、mock 工厂)
    └── mocks.ts                    (Mock 数据生成器)
```

### 命名约定

- 测试文件：`*.test.ts` 或 `*.test.tsx`
- Test suite：`describe('ComponentName', ...)`
- Test case：`it('should do something', ...)` 或 `test('does something', ...)`

---

## Mock 策略 (Mocking Strategy)

### 1. API Mocking

使用 `vi.fn()` mock `apiClient`：

```typescript
import { vi } from 'vitest';
import { apiClient } from '@/shared/utils/apiClient';

vi.mock('@/shared/utils/apiClient', () => ({
    apiClient: {
        get: vi.fn(),
        post: vi.fn(),
        // ...
    },
}));
```

### 2. Socket.IO Mocking

使用 `test-utils/mocks.ts` 中的 `createMockSocket()`:

```typescript
import { createMockSocket } from '@/test-utils/mocks';

const mockSocket = createMockSocket();
mockSocket._trigger('message', { data: 'test' }); // 触发事件
```

### 3. Y.js Mocking

对于简单测试，使用真实的 `Y.Doc`（轻量级）：

```typescript
import * as Y from 'yjs';

const doc = new Y.Doc();
const fragment = doc.getXmlFragment('blocks');
```

对于复杂场景，mock `YDocManager`：

```typescript
import { mockYDocManager } from '@/test-utils';

const mockManager = mockYDocManager();
```

### 4. React Hooks Mocking

使用 `@testing-library/react-hooks` 或直接在组件中测试：

```typescript
import { renderHook } from '@testing-library/react';

const { result } = renderHook(() => useChat(sessionId));
expect(result.current.messages).toEqual([]);
```

---

## 测试覆盖率目标 (Coverage Goals)

| 模块            | 目标覆盖率 | 原因                                     |
| --------------- | ---------- | ---------------------------------------- |
| **Utils**       | > 80%      | 纯函数，易测试，核心逻辑                 |
| **Services**    | > 75%      | 业务逻辑层，关键功能                     |
| **Hooks**       | > 70%      | 状态管理，复杂度中等                     |
| **Components**  | > 60%      | UI 组件，部分依赖用户交互                |
| **Contexts**    | > 80%      | 全局状态，影响范围广                     |

### 查看覆盖率报告

```bash
pnpm test:coverage
```

报告生成在 `coverage/` 目录，打开 `coverage/index.html` 查看详细报告。

---

## 运行测试 (Running Tests)

### 基本命令

```bash
# 运行所有测试
pnpm test

# Watch 模式（自动重新运行）
pnpm test:watch

# UI 模式（可视化界面）
pnpm test:ui

# 生成覆盖率报告
pnpm test:coverage
```

### 运行特定测试

```bash
# 运行单个文件
pnpm test src/shared/utils/apiClient.test.ts

# 运行特定目录
pnpm test src/shared/utils

# 运行匹配的测试用例
pnpm test --grep "should handle errors"
```

---

## 持续集成 (CI/CD)

### GitHub Actions

建议在 `.github/workflows/test.yml` 中添加测试步骤：

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
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test:coverage
      - uses: codecov/codecov-action@v3 # 可选：上传覆盖率到 Codecov
```

---

## 最佳实践 (Best Practices)

### 1. 测试应该独立且可重复

❌ **错误**：依赖外部状态或执行顺序

```typescript
let sharedState = 0;

test('increment', () => {
    sharedState++;
    expect(sharedState).toBe(1);
});

test('increment again', () => {
    // 依赖上一个测试！
    sharedState++;
    expect(sharedState).toBe(2); // 危险！
});
```

✅ **正确**：每个测试独立

```typescript
test('increment', () => {
    let state = 0;
    state++;
    expect(state).toBe(1);
});

test('increment again', () => {
    let state = 0;
    state++;
    expect(state).toBe(1);
});
```

### 2. 使用 beforeEach 清理状态

```typescript
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
    vi.resetAllMocks(); // 重置所有 mock
});
```

### 3. 测试行为，而非实现细节

❌ **错误**：测试内部状态

```typescript
test('component state', () => {
    const component = render(<MyComponent />);
    expect(component.state.counter).toBe(0); // 依赖内部实现
});
```

✅ **正确**：测试用户可见的行为

```typescript
test('user clicks button', async () => {
    const { getByRole } = render(<MyComponent />);
    const button = getByRole('button');
    await userEvent.click(button);
    expect(screen.getByText('Clicked!')).toBeInTheDocument();
});
```

### 4. 使用有意义的断言消息

```typescript
expect(result, 'API should return valid user object').toBeDefined();
```

### 5. Mock 尽量少

**原则**：只 mock 外部依赖（API、数据库、Socket），尽量使用真实代码。

❌ **过度 mock**：

```typescript
vi.mock('@/utils/sum'); // sum 是纯函数，不需要 mock！
```

✅ **合理 mock**：

```typescript
vi.mock('@/shared/utils/apiClient'); // apiClient 依赖网络，需要 mock
```

---

## 测试用例示例 (Test Examples)

### Utils 测试示例

```typescript
// src/shared/utils/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('should log debug messages in development', () => {
        import.meta.env.VITE_LOG_LEVEL = 'debug';
        logger.debug('test message');
        expect(console.log).toHaveBeenCalledWith('[DEBUG]', 'test message');
    });

    it('should suppress debug in production', () => {
        import.meta.env.VITE_LOG_LEVEL = 'warn';
        logger.debug('test message');
        expect(console.log).not.toHaveBeenCalled();
    });
});
```

### Hook 测试示例

```typescript
// src/shared/hooks/useChat.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useChat } from './useChat';
import { apiClient } from '@/shared/utils/apiClient';
import { vi } from 'vitest';

vi.mock('@/shared/utils/apiClient');

describe('useChat', () => {
    it('should load messages', async () => {
        const mockMessages = [{ id: '1', content: 'Hello' }];
        (apiClient.get as any).mockResolvedValue({
            json: () => Promise.resolve(mockMessages),
        });

        const { result } = renderHook(() => useChat('session-123'));

        await waitFor(() => {
            expect(result.current.messages).toEqual(mockMessages);
        });
    });
});
```

### Component 测试示例

```typescript
// src/components/ErrorBoundary.test.tsx
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const ThrowError = () => {
    throw new Error('Test error');
};

describe('ErrorBoundary', () => {
    it('should catch errors and display fallback UI', () => {
        render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        );

        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
});
```

---

## 参考资料 (References)

- [Vitest 官方文档](https://vitest.dev/)
- [Testing Library 官方文档](https://testing-library.com/)
- [React Testing 最佳实践](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Y.js 测试策略](https://github.com/yjs/yjs#testing)

---

## 贡献指南 (Contributing)

在提交 PR 前，请确保：

1. ✅ 所有测试通过：`pnpm test`
2. ✅ 新代码有相应的测试覆盖
3. ✅ 覆盖率符合目标（Utils > 80%）
4. ✅ 测试文件遵循命名规范

**English Point**: "Test Coverage" - 测试覆盖率，衡量代码被测试的百分比。高覆盖率能帮助发现潜在的 bugs，提高代码质量和可维护性。
