import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import httpStatusCodes from 'http-status-codes';
import { createRequestSender, RequestSender } from '@map-colonies/openapi-helpers/requestSender';
import { DataSource } from 'typeorm';
import type { Logger } from '@map-colonies/js-logger';
import type { DependencyContainer } from 'tsyringe';
import { paths, operations } from '@openapi';
import { getApp } from '@src/app';
import { SERVICES } from '@common/constants';
import { getConfig, initConfig } from '@src/common/config';
import { ProductRepository } from '@src/product/dal/productRepository';
import { ProductManager } from '@src/product/models/productManager';
import type { ProductCreateInput, ProductUpdateInput } from '@src/product/models/product';
import { ProductEntity } from '@src/product/dal/productEntity';
import { initDataSource } from '@src/common/db/dataSource';
import { BadRequestError, InternalServerError, NotFoundError } from '@src/common/errors';

const insertProduct = async (overrides?: Partial<ProductCreateInput>): Promise<number> => {
  if (!container) throw new InternalServerError('Container not initialized');
  const repo = container.resolve<ProductRepository>(SERVICES.PRODUCT_REPOSITORY);

  const product = await repo.createProduct({
    name: 'Default Product',
    description: 'desc',
    type: 'raster',
    consumptionProtocol: 'WMS',
    boundingPolygon: 'POLYGON((30 10, 40 40, 20 40, 10 20, 30 10))',
    resolutionBest: 0.1,
    minZoom: 0,
    maxZoom: 20,
    ...overrides,
  } as ProductCreateInput);

  return product.id;
};

let requestSender: RequestSender<paths, operations>;
let dataSource: DataSource;
let container: DependencyContainer | undefined;
let productRepository: ProductRepository;

describe('Product Integration Tests', function () {
  beforeAll(async function () {
    await initConfig(true);
    const config = getConfig();
    dataSource = await initDataSource(config);

    const [app, createdContainer] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
        { token: SERVICES.DB_DATASOURCE, provider: { useValue: dataSource } },
      ],
      useChild: true,
    });

    container = createdContainer;
    productRepository = container.resolve(SERVICES.PRODUCT_REPOSITORY);
    requestSender = await createRequestSender<paths, operations>('openapi3.yaml', app);
  });

  beforeEach(async function () {
    await dataSource.getRepository(ProductEntity).clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Happy Path', function () {
    it('should create a product and return 201', async function () {
      const body = {
        name: 'Integration Map',
        description: 'Valid description string',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((30 10, 40 40, 20 40, 10 20, 30 10))',
        resolutionBest: 0.1,
        minZoom: 0,
        maxZoom: 20,
      };

      const response = (await (requestSender.createProduct as unknown as (args: { requestBody: unknown }) => Promise<unknown>)({
        requestBody: body,
      })) as { status: number };

      expect(response.status).toBe(httpStatusCodes.CREATED);
      expect(response).toSatisfyApiSpec();
    });

    it('should update an existing product and return 200', async function () {
      const id = String(await insertProduct({ name: 'To Update', description: 'initial description' }));

      const updateBody = {
        name: 'Updated Name',
        description: 'Updated description',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((30 10, 40 40, 20 40, 10 20, 30 10))',
        resolutionBest: 0.5,
        minZoom: 1,
        maxZoom: 18,
      };

      const response = (await (
        requestSender.updateProduct as unknown as (args: { pathParams: { id: string }; requestBody: unknown }) => Promise<unknown>
      )({
        pathParams: { id },
        requestBody: updateBody,
      })) as { status: number };

      expect(response.status).toBe(httpStatusCodes.OK);
      expect(response).toSatisfyApiSpec();
    });

    it('should cover all query filters and return 200', async function () {
      await insertProduct({
        name: 'MegaTest',
        description: 'desc',
        minZoom: 5,
        maxZoom: 15,
        resolutionBest: 0.1,
        boundingPolygon: 'POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))',
      });

      const response = await (requestSender.getProducts as unknown as (args: { query: unknown }) => Promise<{ status: number; body: unknown[] }>)({
        query: {
          name: 'MegaTest',
          type: 'raster',
          consumptionProtocol: 'WMS',
          minZoom: 5,
          maxZoom: 15,
          minZoomGreater: 4,
          maxZoomGreater: 14,
          resolutionBest: 0.1,
          boundingPolygonIntersects: 'POLYGON((2 2, 3 2, 3 3, 2 3, 2 2))',
        },
      });

      expect(response.status).toBe(httpStatusCodes.OK);
      expect(response.body).toHaveLength(1);
      expect(response).toSatisfyApiSpec();
    });

    it('should delete an existing product and return 204', async function () {
      const id = String(await insertProduct({ name: 'To Delete' }));

      const response = (await (requestSender.deleteProduct as unknown as (args: { pathParams: { id: string } }) => Promise<unknown>)({
        pathParams: { id },
      })) as { status: number };

      expect(response.status).toBe(httpStatusCodes.NO_CONTENT);
      expect(response).toSatisfyApiSpec();
    });
  });

  describe('Bad Path', function () {
    it('should return 404 for non-existent product id on update', async function () {
      const response = (await (
        requestSender.updateProduct as unknown as (args: { pathParams: { id: string }; requestBody: unknown }) => Promise<unknown>
      )({
        pathParams: { id: '999999' },
        requestBody: { name: 'None', type: 'raster', consumptionProtocol: 'WMS', boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))' },
      })) as { status: number };

      expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      expect(response).toSatisfyApiSpec();
    });

    it('should return 404 for non-existent product id on delete', async function () {
      const response = (await (requestSender.deleteProduct as unknown as (args: { pathParams: { id: string } }) => Promise<unknown>)({
        pathParams: { id: '999999' },
      })) as { status: number };

      expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      expect(response).toSatisfyApiSpec();
    });

    it('should return 400 when name is missing', async function () {
      const invalidInput = {
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
      };
      const response = (await (requestSender.createProduct as unknown as (args: { requestBody: unknown }) => Promise<unknown>)({
        requestBody: invalidInput,
      })) as { status: number };

      expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      expect(response).toSatisfyApiSpec();
    });
  });

  describe('Edge Cases', function () {
    it('should return 500 when the DB is down', async function () {
      const spy = jest.spyOn(ProductRepository.prototype, 'createProduct').mockRejectedValue(new InternalServerError('DB connection error'));

      const validInput = {
        name: 'Valid Name',
        type: 'raster',
        consumptionProtocol: 'WMS',
        boundingPolygon: 'POLYGON((30 10, 40 40, 20 40, 10 20, 30 10))',
      };

      try {
        const response = await (requestSender.createProduct as unknown as (args: { requestBody: unknown }) => Promise<{ status: number }>)({
          requestBody: validInput,
        });

        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(response).toSatisfyApiSpec();
      } finally {
        spy.mockRestore();
      }
    });
  });
});

describe('Coverage – branch tests', () => {
  let repo: ProductRepository;
  let manager: ProductManager;
  let logger: Logger;

  beforeAll(() => {
    if (!container) throw new InternalServerError('Test container was not initialized');
    logger = jsLogger({ enabled: false });
    repo = container.resolve<ProductRepository>(SERVICES.PRODUCT_REPOSITORY);
    manager = new ProductManager(logger, repo);
  });

  beforeEach(async () => {
    await dataSource.getRepository(ProductEntity).clear();
  });

  it('repository.updateProduct should return 400 when no fields provided', async () => {
    await expect(repo.updateProduct(1, {} as ProductUpdateInput)).rejects.toThrow(BadRequestError);
  });

  it('repository.updateProduct should cover boundingPolygon branch (setParameters)', async () => {
    const id = await insertProduct({ name: 'WKT branch' });

    const updated = await repo.updateProduct(id, {
      boundingPolygon: 'POLYGON((0 0, 2 0, 2 2, 0 2, 0 0))',
    } as ProductUpdateInput);

    expect(updated).not.toBeNull();
    expect(Number(updated?.id)).toBe(id);
  });

  it('manager.createProduct should throw 400 when name is empty', async () => {
    const input: ProductCreateInput = {
      name: '',
      type: 'raster',
      consumptionProtocol: 'WMS',
      boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
    };

    await expect(manager.createProduct(input)).rejects.toThrow(BadRequestError);
  });

  it('manager.getProductById should throw 404 when product does not exist', async () => {
    await expect(manager.getProductById(999999)).rejects.toThrow(NotFoundError);
  });

  it('manager.updateProduct should throw 404 when product does not exist', async () => {
    await expect(manager.updateProduct(999999, { description: 'x' } as ProductUpdateInput)).rejects.toThrow(NotFoundError);
  });
  it('repository.createProduct should throw 500 when product not found after insert', async () => {
    const spy = jest.spyOn(repo, 'getProductById').mockResolvedValue(null);

    const input: ProductCreateInput = {
      name: 'Coverage Test',
      type: 'raster',
      consumptionProtocol: 'WMS',
      boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
    };

    try {
      await expect(repo.createProduct(input)).rejects.toThrow(InternalServerError);
    } finally {
      spy.mockRestore();
    }
  });
  it('repository.queryProducts should cover zoom and spatial filters', async () => {
    await insertProduct({ name: 'SpatialTest', minZoom: 10, maxZoom: 20 });

    const zoomResults = await repo.queryProducts({
      minZoomLess: 11,
      minZoomGreaterEqual: 10,
      maxZoomLessEqual: 20,
    });
    expect(zoomResults).toHaveLength(1);

    const containsResults = await repo.queryProducts({
      boundingPolygonContains: 'POINT(30 10)',
    });
    expect(containsResults).toBeDefined();

    const withinResults = await repo.queryProducts({
      boundingPolygonWithin: 'POLYGON((0 0, 50 0, 50 50, 0 50, 0 0))',
    });
    expect(withinResults).toBeDefined();
  });

  it('repository.deleteProduct should throw 404 when product not found', async () => {
    await expect(repo.deleteProduct(999999)).rejects.toThrow(NotFoundError);
  });

  it('repository.createProduct should throw InternalServerError on DB error', async () => {
    const repoInstance = dataSource.getRepository(ProductEntity);
    const spy = jest.spyOn(repoInstance, 'createQueryBuilder').mockImplementation(() => {
      throw new InternalServerError('Forced Insert Error');
    });

    const input = {
      name: 'Fail',
      type: 'raster',
      consumptionProtocol: 'WMS',
      boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
    } as ProductCreateInput;

    await expect(repo.createProduct(input)).rejects.toThrow(InternalServerError);
    spy.mockRestore();
  });
  it('repository.queryProducts should cover intersects filter', async () => {
    await insertProduct({ name: 'IntersectsTest', boundingPolygon: 'POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))' });

    const results = await repo.queryProducts({
      boundingPolygonIntersects: 'POLYGON((5 5, 15 5, 15 15, 5 15, 5 5))',
    });
    expect(results).toBeDefined();
  });

  it('manager.createProduct should throw and log error when repo fails', async () => {
    const spy = jest.spyOn(repo, 'createProduct').mockRejectedValue(new InternalServerError('DB Fail'));

    const input = {
      name: 'ManagerFail',
      type: 'raster',
      consumptionProtocol: 'WMS',
      boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
    } as ProductCreateInput;

    await expect(manager.createProduct(input)).rejects.toThrow(InternalServerError);
    spy.mockRestore();
  });
  it('repository.updateProduct should throw error on failed DB update', async () => {
    const id = await insertProduct({ name: 'UpdateFail' });

    const repoInstance = dataSource.getRepository(ProductEntity);

    const spy = jest.spyOn(repoInstance, 'createQueryBuilder').mockImplementation(() => {
      throw new Error('Forced Update Error');
    });

    const updateData: ProductUpdateInput = {
      description: 'new description',
    };

    await expect(repo.updateProduct(id, updateData)).rejects.toThrow(InternalServerError);

    spy.mockRestore();
  });
});

afterAll(async () => {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
});
