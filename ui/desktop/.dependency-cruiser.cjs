/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-acp-sdk-outside-acp',
      comment:
        'ARCHITECTURE.md §Invariants: new code never imports @agentclientprotocol/sdk or @aaif/goose-acp-client except via src/acp',
      severity: 'error',
      from: {
        path: '^src/(workspace|native)/',
      },
      to: {
        path: '(^|/)node_modules/(@agentclientprotocol/sdk|@aaif/goose-acp-client)|(^|/)goose-acp-client|^(@agentclientprotocol/sdk|@aaif/goose-acp-client)',
      },
    },
    {
      name: 'no-components-internal',
      comment:
        "ARCHITECTURE.md §Invariants: workspace and native never import components' internals; they compose exported components",
      severity: 'error',
      from: {
        path: '^src/(workspace|native)/',
      },
      to: {
        path: '^src/components/.*/internal/',
      },
    },
    {
      name: 'no-native-acp-crossing',
      comment:
        'ARCHITECTURE.md §Invariants: native never does ACP; acp never touches pty/fs/git',
      severity: 'error',
      from: {
        path: '^src/native/',
      },
      to: {
        path: '^src/acp/',
      },
    },
    {
      name: 'no-acp-native-crossing',
      comment:
        'ARCHITECTURE.md §Invariants: native never does ACP; acp never touches pty/fs/git',
      severity: 'error',
      from: {
        path: '^src/acp/',
      },
      to: {
        path: '^src/native/',
      },
    },
    {
      name: 'renderer-runs-in-a-browser',
      comment:
        'ARCHITECTURE.md §Invariants: the renderer runs in a browser',
      severity: 'error',
      from: {
        path: '^src/(workspace|native|acp)/',
      },
      to: {
        path: 'electron|node-pty',
      },
    },
    {
      name: 'renderer-runs-in-a-browser',
      comment:
        'ARCHITECTURE.md §Invariants: the renderer runs in a browser',
      severity: 'error',
      from: {
        path: '^src/(workspace|native|acp)/',
      },
      to: {
        path: '^node:',
        dependencyTypes: ['core'],
      },
    },
    {
      name: 'renderer-runs-in-a-browser',
      comment:
        'ARCHITECTURE.md §Invariants: the renderer runs in a browser',
      severity: 'error',
      from: {
        path: '^src/(workspace|native|acp)/',
      },
      to: {
        dependencyTypes: ['core'],
      },
    },
  ],
  options: {
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    tsPreCompilationDeps: true,
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(^|/)__tests__/|\\.test\\.tsx?$',
    },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
