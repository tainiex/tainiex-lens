# 测试目录结构

本目录包含所有测试代码，按照类型组织：

## 目录结构

```
test/
├── unit/           # 单元测试
│   ├── machines/   # 状态机测试
│   ├── services/   # 服务层测试
│   └── utils/      # 工具函数测试
├── integration/    # 集成测试
├── e2e/           # 端到端测试
└── utils/         # 测试工具（renderWithProviders, mocks等）
```

## 测试命名规范

- 测试文件统一使用 `.test.ts` 或 `.test.tsx` 后缀
- 测试文件名应与被测试文件同名
- 例如：`connectionMachine.ts` 的测试文件为 `connectionMachine.test.ts`

## 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test connectionMachine

# 运行测试并生成覆盖率报告
pnpm test:coverage

# 使用 UI 模式
pnpm test:ui
```

## 测试覆盖率目标

| 模块           | 目标覆盖率 | 说明             |
| -------------- | ---------- | ---------------- |
| Utils          | > 80%      | 纯函数，核心逻辑 |
| Services       | > 75%      | 业务逻辑层       |
| Hooks          | > 70%      | 状态管理         |
| Components     | > 60%      | UI 组件          |
| State Machines | > 90%      | 关键状态转换逻辑 |
