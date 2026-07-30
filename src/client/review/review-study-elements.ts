export function required<ElementType extends Element>(id: string, constructor: { new (): ElementType }): ElementType {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing required review element #${id}`);
  return element;
}
