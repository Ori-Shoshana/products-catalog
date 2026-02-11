import type { Logger } from '@map-colonies/js-logger';
import { ProductManager } from '@src/product/models/productManager';
import type { Product, ProductCreateInput, ProductUpdateInput, ProductQueryFilters } from '@src/product/models/product';
import { BadRequestError, NotFoundError } from '@src/common/errors';
import { ProductRepository } from '@src/product/dal/productRepository';

describe('ProductManager Unit Tests', () => {
  let productManager: ProductManager;
  let mockQueryProducts: jest.Mock;
  let mockGetProductById: jest.Mock;
  let mockCreateProduct: jest.Mock;
  let mockUpdateProduct: jest.Mock;
  let mockDeleteProduct: jest.Mock;
  let mockLoggerInfo: jest.Mock;
  let mockLogger: Logger;

  beforeEach(() => {
    mockQueryProducts = jest.fn();
    mockGetProductById = jest.fn();
    mockCreateProduct = jest.fn();
    mockUpdateProduct = jest.fn();
    mockDeleteProduct = jest.fn();
    mockLoggerInfo = jest.fn();

    mockLogger = {
      info: mockLoggerInfo,
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    } as unknown as Logger;

    productManager = new ProductManager(mockLogger, {
      queryProducts: mockQueryProducts,
      getProductById: mockGetProductById,
      createProduct: mockCreateProduct,
      updateProduct: mockUpdateProduct,
      deleteProduct: mockDeleteProduct,
    } as unknown as ProductRepository);
  });

  describe('getProducts', () => {
    it('should call repository.queryProducts with provided filters', async () => {
      const filters: ProductQueryFilters = { name: 'test', type: 'raster' };
      const expectedProducts: Product[] = [
        {
          id: 1,
          name: 'test',
          type: 'raster',
          consumptionProtocol: 'WMS',
          boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
        },
      ];

      mockQueryProducts.mockResolvedValue(expectedProducts);

      const result = await productManager.getProducts(filters);

      expect(result).toEqual(expectedProducts);
      expect(mockQueryProducts).toHaveBeenCalledWith(filters);
      expect(mockLoggerInfo).toHaveBeenCalledWith({ msg: 'fetching products', filters });
    });

    it('should return empty array when no products match filters', async () => {
      mockQueryProducts.mockResolvedValue([]);

      const result = await productManager.getProducts({});

      expect(result).toHaveLength(0);
    });
  });

  describe('getProductById', () => {
    it('should return product when product exists', async () => {
      const product: Product = {
        id: 1,
        name: 'Test Product',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };

      mockGetProductById.mockResolvedValue(product);

      const result = await productManager.getProductById(1);

      expect(result).toEqual(product);
      expect(mockGetProductById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundError when product does not exist', async () => {
      mockGetProductById.mockResolvedValue(null);

      await expect(productManager.getProductById(999)).rejects.toThrow(NotFoundError);
      expect(mockGetProductById).toHaveBeenCalledWith(999);
    });
  });

  describe('createProduct', () => {
    it('should create product when valid input is provided', async () => {
      const input: ProductCreateInput = {
        name: 'New Product',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };

      const createdProduct: Product = {
        id: 1,
        ...input,
      };

      mockCreateProduct.mockResolvedValue(createdProduct);

      const result = await productManager.createProduct(input);

      expect(result).toEqual(createdProduct);
      expect(mockCreateProduct).toHaveBeenCalledWith(input);
    });

    it('should throw BadRequestError when name is empty', async () => {
      const input: ProductCreateInput = {
        name: '',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };

      await expect(productManager.createProduct(input)).rejects.toThrow(BadRequestError);
      expect(mockCreateProduct).not.toHaveBeenCalled();
    });

    it('should allow whitespace-only names (not throwing BadRequestError)', async () => {
      const input: ProductCreateInput = {
        name: '   ',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };

      const expectedProduct: Product = {
        id: 1,
        ...input,
      };

      mockCreateProduct.mockResolvedValue(expectedProduct);

      const result = await productManager.createProduct(input);

      expect(result).toEqual(expectedProduct);
      expect(mockCreateProduct).toHaveBeenCalledWith(input);
    });

    it('should throw BadRequestError when name is undefined', async () => {
      const input = {
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      } as ProductCreateInput;

      await expect(productManager.createProduct(input)).rejects.toThrow(BadRequestError);
    });

    it('should pass through additional fields when creating product', async () => {
      const input: ProductCreateInput = {
        name: 'Detailed Product',
        description: 'A detailed description',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
        resolutionBest: 0.5,
        minZoom: 0,
        maxZoom: 20,
      };

      const createdProduct: Product = {
        id: 1,
        ...input,
      };

      mockCreateProduct.mockResolvedValue(createdProduct);

      const result = await productManager.createProduct(input);

      expect(result).toEqual(createdProduct);
      expect(mockCreateProduct).toHaveBeenCalledWith(input);
    });

    it('should rethrow error from repository when creation fails', async () => {
      const input: ProductCreateInput = {
        name: 'Failing Product',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };

      const dbError = new Error('Database connection failed');
      mockCreateProduct.mockRejectedValue(dbError);

      await expect(productManager.createProduct(input)).rejects.toThrow('Database connection failed');
    });
  });

  describe('updateProduct', () => {
    it('should update product when product exists', async () => {
      const id = 1;
      const updateData: ProductUpdateInput = { description: 'Updated description' };
      const updatedProduct: Product = {
        id: 1,
        name: 'Test Product',
        description: 'Updated description',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };

      mockUpdateProduct.mockResolvedValue(updatedProduct);

      const result = await productManager.updateProduct(id, updateData);

      expect(result).toEqual(updatedProduct);
      expect(mockUpdateProduct).toHaveBeenCalledWith(id, updateData);
    });

    it('should throw NotFoundError when product does not exist', async () => {
      mockUpdateProduct.mockResolvedValue(null);

      await expect(productManager.updateProduct(999, { description: 'x' })).rejects.toThrow(NotFoundError);
      expect(mockUpdateProduct).toHaveBeenCalledWith(999, { description: 'x' });
    });

    it('should allow updating multiple fields at once', async () => {
      const id = 1;
      const updateData: ProductUpdateInput = {
        name: 'New Name',
        description: 'New Description',
        minZoom: 5,
        maxZoom: 15,
      };

      const updatedProduct: Product = {
        id: 1,
        name: 'New Name',
        description: 'New Description',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
        minZoom: 5,
        maxZoom: 15,
      };

      mockUpdateProduct.mockResolvedValue(updatedProduct);

      const result = await productManager.updateProduct(id, updateData);

      expect(result).toEqual(updatedProduct);
      expect(mockUpdateProduct).toHaveBeenCalledWith(id, updateData);
    });
  });

  describe('deleteProduct', () => {
    it('should call repository.deleteProduct with correct id', async () => {
      mockDeleteProduct.mockResolvedValue(undefined);

      await productManager.deleteProduct(1);

      expect(mockDeleteProduct).toHaveBeenCalledWith(1);
    });

    it('should rethrow error from repository when deletion fails', async () => {
      const dbError = new Error('Database connection failed');
      mockDeleteProduct.mockRejectedValue(dbError);

      await expect(productManager.deleteProduct(1)).rejects.toThrow('Database connection failed');
    });
  });
});

describe('Product Type Definitions', () => {
  it('should allow creating valid ProductCreateInput', () => {
    const input: ProductCreateInput = {
      name: 'Valid Product',
      type: 'raster',
      consumptionProtocol: 'WMS',
      boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
    };

    expect(input.name).toBe('Valid Product');
    expect(input.type).toBe('raster');
  });

  it('should allow all valid product types', () => {
    const validTypes: Product['type'][] = ['raster', 'rasterized vector', '3d tiles', 'QMesh'];

    validTypes.forEach((type) => {
      const input: ProductCreateInput = {
        name: 'Test',
        type,
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };
      expect(input.type).toBe(type);
    });
  });

  it('should allow all valid consumption protocols', () => {
    const validProtocols: Product['consumptionProtocol'][] = ['WMS', 'WMTS', 'XYZ', '3D Tiles'];

    validProtocols.forEach((protocol) => {
      const input: ProductCreateInput = {
        name: 'Test',
        type: 'raster',
        consumptionProtocol: protocol,
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };
      expect(input.consumptionProtocol).toBe(protocol);
    });
  });

  it('should allow optional fields', () => {
    const input: ProductCreateInput = {
      name: 'Full Product',
      type: 'raster',
      consumptionProtocol: 'WMS',
      boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      description: 'Optional description',
      resolutionBest: 0.5,
      minZoom: 0,
      maxZoom: 20,
    };

    expect(input.description).toBe('Optional description');
    expect(input.resolutionBest).toBe(0.5);
    expect(input.minZoom).toBe(0);
    expect(input.maxZoom).toBe(20);
  });
});
