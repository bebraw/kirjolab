export class DurableObject<Environment> {
  protected readonly ctx: DurableObjectState;
  protected readonly env: Environment;

  constructor(ctx: DurableObjectState, env: Environment) {
    this.ctx = ctx;
    this.env = env;
  }
}
