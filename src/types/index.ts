export interface Product {
  id: number;
  sku: string;
  nameTh: string;
  nameEn: string;
  shortDescriptionTh: string | null;
  shortDescriptionEn: string | null;
  descriptionTh: string | null;
  descriptionEn: string | null;
  price: number;
  originalPrice: number | null;
  stock: number;
  unit: string;
  image: string | null;
  categoryId: number;
  subCategoryId: number | null;
  costPrice: number;
  isFeatured: number;
  isNew: number;
  requiresPrescription: number;
  status: string;
  rating: number | null;
  reviewCount: number;
  soldCount: number;
  legalCategory: string;
  createdAt: string;
}

export interface Category {
  id: number;
  nameTh: string;
  nameEn: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  productCount: number;
}
