export interface IndexedCollection<Item> {
  readonly [index: number]: Item | undefined;
  readonly length: number;
}

export function lowerBound<Item>(items: IndexedCollection<Item>, precedesTarget: (item: Item) => boolean): number | null {
  let lower = 0;
  let upper = items.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const item = items[middle];
    if (item === undefined) return null;
    if (precedesTarget(item)) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}
