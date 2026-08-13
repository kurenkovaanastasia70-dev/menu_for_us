import productsJson from "@/data/products.json";
import recipesJson from "@/data/recipes.json";
import storeProductsJson from "@/data/store-products.json";
import storesJson from "@/data/stores.json";
import type { Product, Recipe, Store, StoreProduct } from "@/lib/optimizer/types";

export interface CatalogRepository {
  getStores(): Store[];
  getProducts(): Product[];
  getStoreProducts(): StoreProduct[];
  getRecipes(): Recipe[];
  getProduct(id: string): Product | undefined;
  getRecipe(id: string): Recipe | undefined;
}

class JsonCatalogRepository implements CatalogRepository {
  getStores(): Store[] {
    return storesJson as Store[];
  }

  getProducts(): Product[] {
    return productsJson as Product[];
  }

  getStoreProducts(): StoreProduct[] {
    return storeProductsJson as StoreProduct[];
  }

  getRecipes(): Recipe[] {
    return recipesJson as Recipe[];
  }

  getProduct(id: string) {
    return this.getProducts().find((item) => item.id === id);
  }

  getRecipe(id: string) {
    return this.getRecipes().find((item) => item.id === id);
  }
}

export const catalog: CatalogRepository = new JsonCatalogRepository();
