import type { StoreProduct } from "../optimizer/types";

export interface StoreProvider {
  id: string;
  searchProducts(query: string): Promise<StoreProduct[]>;
  getProduct(productId: string): Promise<StoreProduct | null>;
  getPrice(productId: string): Promise<number>;
}

export class JsonStoreProvider implements StoreProvider {
  readonly id: string;
  private readonly products: StoreProduct[];

  constructor(id: string, products: StoreProduct[]) {
    this.id = id;
    this.products = products;
  }

  async searchProducts(query: string): Promise<StoreProduct[]> {
    const q = query.trim().toLowerCase();
    return this.products.filter(
      (item) =>
        item.store_id === this.id &&
        item.available &&
        (item.name.toLowerCase().includes(q) || item.canonical_product_id.includes(q)),
    );
  }

  async getProduct(productId: string): Promise<StoreProduct | null> {
    return (
      this.products.find(
        (item) => item.store_id === this.id && (item.id === productId || item.canonical_product_id === productId),
      ) ?? null
    );
  }

  async getPrice(productId: string): Promise<number> {
    const product = await this.getProduct(productId);
    if (!product) throw new Error("Товар не найден");
    return product.price;
  }
}

export function createStoreProviders(products: StoreProduct[]): Record<string, StoreProvider> {
  const ids = [...new Set(products.map((item) => item.store_id))];
  return Object.fromEntries(ids.map((id) => [id, new JsonStoreProvider(id, products)]));
}
