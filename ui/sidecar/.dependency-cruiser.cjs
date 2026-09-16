/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sidecar-proxies-bytes-not-acp',
      comment:
        'ARCHITECTURE.md §Invariants: the sidecar proxies bytes to goose serve, it never speaks ACP',
      severity: 'error',
      from: {
        path: '^src/',
      },
      to: {
        path: '(^|/)node_modules/(@agentclientprotocol/sdk|@aaif/goose-acp-client)|(^|/)goose-acp-client|^(@agentclientprotocol/sdk|@aaif/goose-acp-client)',
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
      path: '\\.test\\.ts$',
    },
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
