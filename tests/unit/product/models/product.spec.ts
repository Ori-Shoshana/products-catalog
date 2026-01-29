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
import { initConfig } from '@src/common/config';
import { ConsumptionProtocol, ProductType } from '@src/product/models/product';
import { ProductRepository } from '@src/product/dal/productRepository';
import { ProductManager } from '@src/product/models/productManager';
import type { ProductCreateInput, ProductUpdateInput } from '@src/product/models/product';

const insertProduct = async (
  dataSource: DataSource,
  overrides?: Partial<{
    name: string;
    description: string;
    type: ProductType;
    consumptionProtocol: ConsumptionProtocol;
    boundingPolygon: string;
    resolutionBest: number;
    minZoom: number;
    maxZoom: number;
  }>
): Promise<number> => {
  const {
    name = 'Default Product',
    description = 'desc',
    type = 'raster' as ProductType,
    consumptionProtocol = 'WMS' as ConsumptionProtocol,
    boundingPolygon = 'POLYGON((30 10, 40 40, 20 40, 10 20, 30 10))',
    resolutionBest = 0.1,
    minZoom = 0,
    maxZoom = 20,
  } = overrides ?? {};

  const rows: { id: number }[] = await dataSource.query(
    `
      INSERT INTO products
        (name, description, type, consumption_protocol, bounding_polygon, resolution_best, min_zoom, max_zoom)
      VALUES
        ($1, $2, $3, $4, ST_GeomFromText($5), $6, $7, $8)
      RETURNING id
    `,
    [name, description, type, consumptionProtocol, boundingPolygon, resolutionBest, minZoom, maxZoom]
  );

  return rows[0]!.id;
};
let requestSender: RequestSender<paths, operations>;
let dataSource: DataSource;
let container: DependencyContainer;

describe('Product Integration Tests', function () {
  beforeAll(async function () {
    await initConfig(true);

    const [app, createdContainer] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    container = createdContainer;
    dataSource = container.resolve<DataSource>(SERVICES.DB_DATASOURCE);

    requestSender = await createRequestSender<paths, operations>('openapi3.yaml', app);
  });

  beforeEach(async function () {
    await dataSource.query('TRUNCATE TABLE products RESTART IDENTITY CASCADE;');
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
      const id = String(await insertProduct(dataSource, { name: 'To Update', description: 'initial description' }));

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
      await insertProduct(dataSource, {
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
      const id = String(await insertProduct(dataSource, { name: 'To Delete' }));

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
        // name missing
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
      const spy = jest.spyOn(ProductRepository.prototype, 'createProduct').mockRejectedValue(new Error('DB connection error'));

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

describe('Coverage – branch tests (no mocks, no any/unknown)', () => {
  let repo: ProductRepository;
  let manager: ProductManager;
  let logger: Logger;

  beforeAll(() => {
    logger = jsLogger({ enabled: false });
    repo = container.resolve<ProductRepository>(SERVICES.PRODUCT_REPOSITORY);
    manager = new ProductManager(logger, repo);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE products RESTART IDENTITY CASCADE;');
  });

  it('repository.updateProduct should return 400 when no fields provided', async () => {
    await expect(repo.updateProduct(1, {} as ProductUpdateInput)).rejects.toMatchObject({
      status: httpStatusCodes.BAD_REQUEST,
    });
  });

  it('repository.updateProduct should cover boundingPolygon branch (setParameters)', async () => {
    const id = await insertProduct(dataSource, { name: 'WKT branch' });

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

    await expect(manager.createProduct(input)).rejects.toMatchObject({
      status: httpStatusCodes.BAD_REQUEST,
    });
  });

  it('manager.getProductById should throw 404 when product does not exist', async () => {
    await expect(manager.getProductById(999999)).rejects.toMatchObject({
      status: httpStatusCodes.NOT_FOUND,
    });
  });

  it('manager.updateProduct should throw 404 when product does not exist', async () => {
    await expect(manager.updateProduct(999999, { description: 'x' } as ProductUpdateInput)).rejects.toMatchObject({
      status: httpStatusCodes.NOT_FOUND,
    });
  });
  it('repository.createProduct should throw 500 when product not found after insert', async () => {
    const repo = container.resolve<ProductRepository>(SERVICES.PRODUCT_REPOSITORY);

    const spy = jest.spyOn(repo, 'getProductById').mockResolvedValue(null);

    const input: ProductCreateInput = {
      name: 'Coverage Test',
      type: 'raster',
      consumptionProtocol: 'WMS',
      boundingPolygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
    };

    try {
      await expect(repo.createProduct(input)).rejects.toMatchObject({
        status: httpStatusCodes.INTERNAL_SERVER_ERROR,
      });
    } finally {
      spy.mockRestore();
    }
  });
});

afterAll(async () => {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
});
