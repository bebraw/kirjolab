export interface ProductionConfiguration {
  readonly hostname: string;
  readonly teamDomain: string;
  readonly accessAudience: string;
  readonly crossrefMailto: string;
}

export interface ProductionDeployOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly dryRunOnly?: boolean;
  readonly run?: (arguments_: readonly string[], environment: Readonly<Record<string, string | undefined>>) => void;
}

export function productionConfiguration(environment?: Readonly<Record<string, string | undefined>>): ProductionConfiguration;
export function deployArguments(configuration: ProductionConfiguration, dryRun: boolean): string[];
export function productionWranglerEnvironment(
  environment?: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined>;
export function runProductionDeploy(options?: ProductionDeployOptions): void;
