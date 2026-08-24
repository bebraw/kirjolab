export interface CorpusProductionConfiguration {
  readonly hostname: string;
  readonly teamDomain: string;
  readonly accessAudience: string;
  readonly allowedOrigins: readonly string[];
}

export interface CorpusProductionDeployOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly dryRunOnly?: boolean;
  readonly run?: (arguments_: readonly string[], environment: Readonly<Record<string, string | undefined>>) => void;
}

export function corpusProductionConfiguration(environment?: Readonly<Record<string, string | undefined>>): CorpusProductionConfiguration;
export function corpusDeployArguments(configuration: CorpusProductionConfiguration, dryRun: boolean): string[];
export function runCorpusProductionDeploy(options?: CorpusProductionDeployOptions): void;
