export interface SidecarArgs {
  bind?: string;
  port: number;
  cwd: string;
  gooseUrl?: string;
  gooseCertFingerprint?: string;
  gooseVersion?: string;
  staticDir?: string;
  allowedOrigins: string[];
}

const flagValue = (argv: string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
};

const flagValues = (argv: string[], flag: string): string[] =>
  argv.flatMap((arg, index) => (arg === flag && index + 1 < argv.length ? [argv[index + 1]] : []));

// Scans for flag names rather than positions: under Electron's utilityProcess
// the argv prefix differs from a plain `node dist/index.js`.
export const parseArgs = (argv: string[]): SidecarArgs => {
  const port = flagValue(argv, '--port');
  return {
    bind: flagValue(argv, '--bind'),
    port: port === undefined ? 3285 : Number(port),
    cwd: flagValue(argv, '--cwd') ?? process.cwd(),
    gooseUrl: flagValue(argv, '--goose-url'),
    gooseCertFingerprint: flagValue(argv, '--goose-cert-fingerprint'),
    gooseVersion: flagValue(argv, '--goose-version'),
    staticDir: flagValue(argv, '--static'),
    allowedOrigins: flagValues(argv, '--allowed-origin'),
  };
};
