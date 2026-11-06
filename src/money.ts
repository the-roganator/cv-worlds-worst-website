/** Prices are whole pence in the database and pounds on the page: 1250 → "£12.50". */
export function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
