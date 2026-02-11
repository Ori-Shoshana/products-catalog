type FilterableFields = Pick<Product, 'name' | 'type' | 'consumptionProtocol' | 'minZoom' | 'maxZoom' | 'resolutionBest'>;

export interface ProductQueryFilters extends Partial<FilterableFields> {
  minZoomGreater?: Product['minZoom'];
  minZoomGreaterEqual?: Product['minZoom'];
  minZoomLess?: Product['minZoom'];
  minZoomLessEqual?: Product['minZoom'];

  maxZoomGreater?: Product['maxZoom'];
  maxZoomGreaterEqual?: Product['maxZoom'];
  maxZoomLess?: Product['maxZoom'];
  maxZoomLessEqual?: Product['maxZoom'];

  resolutionBestGreater?: Product['resolutionBest'];
  resolutionBestGreaterEqual?: Product['resolutionBest'];
  resolutionBestLess?: Product['resolutionBest'];
  resolutionBestLessEqual?: Product['resolutionBest'];

  boundingPolygonContains?: Product['boundingPolygon'];
  boundingPolygonWithin?: Product['boundingPolygon'];
  boundingPolygonIntersects?: Product['boundingPolygon'];
}

export type ProductType = 'raster' | 'rasterized vector' | '3d tiles' | 'QMesh';
export type ConsumptionProtocol = 'WMS' | 'WMTS' | 'XYZ' | '3D Tiles';

export interface Product {
  id: number;
  name: string;
  description?: string;
  boundingPolygon: string;
  consumptionLink?: string;
  type: ProductType;
  consumptionProtocol: ConsumptionProtocol;
  resolutionBest?: number;
  minZoom?: number;
  maxZoom?: number;
}

export type ProductCreateInput = Omit<Product, 'id'>;
export type ProductUpdateInput = Partial<ProductCreateInput>;
