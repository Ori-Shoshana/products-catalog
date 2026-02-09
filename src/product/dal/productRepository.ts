import { injectable, inject } from 'tsyringe';
import { DataSource, Repository } from 'typeorm';
import type { Logger } from '@map-colonies/js-logger';
import { SERVICES } from '../../common/constants';
import { BadRequestError, NotFoundError, InternalServerError } from '../../common/errors';
import type { Product, ProductCreateInput, ProductUpdateInput, ProductQueryFilters } from '../models/product';
import { ProductEntity } from './productEntity';

@injectable()
export class ProductRepository {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.DB_DATASOURCE) private readonly dataSource: DataSource
  ) {}
  private get repo(): Repository<ProductEntity> {
    return this.dataSource.getRepository(ProductEntity);
  }

  public async createProduct(input: ProductCreateInput): Promise<Product> {
    this.logger.info({ msg: 'Creating a new product', productName: input.name });

    try {
      const insertResult = await this.repo
        .createQueryBuilder()
        .insert()
        .into(ProductEntity)
        .values({
          ...input,
          boundingPolygon: () => `ST_GeomFromText(:wkt, 4326)`,
        })
        .setParameters({ wkt: input.boundingPolygon })
        .returning(['id'])
        .execute();
      const id = insertResult.identifiers[0]?.id as number;
      const created = await this.getProductById(id);
      if (!created) {
        throw new InternalServerError('Product was created but could not be retrieved');
      }

      return created;
    } catch (err) {
      this.logger.error({ err, msg: 'Failed to create product in database' });
      throw new InternalServerError('Failed to create product in database');
    }
  }

  public async getProductById(id: number): Promise<Product | null> {
    this.logger.debug({ msg: 'Fetching product by id', productId: id });
    const product = await this.repo.findOne({ where: { id } });
    return product as Product | null;
  }

  public async getAllProducts(): Promise<Product[]> {
    this.logger.debug({ msg: 'Fetching all products' });
    const products = await this.repo.find();
    return products as Product[];
  }

  public async updateProduct(id: number, input: ProductUpdateInput): Promise<Product | null> {
    this.logger.info({ msg: 'Updating product', productId: id });

    if (Object.keys(input).length === 0) {
      throw new BadRequestError('No fields provided for update');
    }

    try {
      const qb = this.repo
        .createQueryBuilder()
        .update(ProductEntity)
        .set({
          ...input,
          ...(input.boundingPolygon !== undefined ? { boundingPolygon: () => `ST_GeomFromText(:wkt, 4326)` } : {}),
        });

      if (input.boundingPolygon !== undefined) qb.setParameters({ wkt: input.boundingPolygon });

      const res = await qb.where('id = :id', { id }).execute();

      if (res.affected === 0) throw new NotFoundError(`Product with id ${id} was not found`);

      return await this.getProductById(id);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      this.logger.error({ err, msg: 'Failed to update product in database' });
      throw new InternalServerError('Failed to update product in database');
    }
  }

  public async deleteProduct(id: number): Promise<void> {
    this.logger.info({ msg: 'Deleting product', productId: id });
    const res = await this.repo.delete(id);
    if (res.affected === 0) {
      throw new NotFoundError(`Product with id ${id} was not found`);
    }
  }

  public async queryProducts(filters: ProductQueryFilters): Promise<Product[]> {
    this.logger.debug({ msg: 'Querying products with filters', filters });

    const qb = this.repo.createQueryBuilder('p');

    const add = (condition: string, params: Record<string, unknown>, value: unknown): void => {
      if (value !== undefined && value !== null) {
        qb.andWhere(condition, params);
      }
    };

    add('p.name = :name', { name: filters.name }, filters.name);
    add('p.type = :type', { type: filters.type }, filters.type);
    add('p.consumptionProtocol = :protocol', { protocol: filters.consumptionProtocol }, filters.consumptionProtocol);

    add('p.minZoom > :minZG', { minZG: filters.minZoomGreater }, filters.minZoomGreater);
    add('p.minZoom >= :minZGE', { minZGE: filters.minZoomGreaterEqual }, filters.minZoomGreaterEqual);
    add('p.minZoom < :minZL', { minZL: filters.minZoomLess }, filters.minZoomLess);
    add('p.minZoom <= :minZLE', { minZLE: filters.minZoomLessEqual }, filters.minZoomLessEqual);

    add('p.maxZoom > :maxZG', { maxZG: filters.maxZoomGreater }, filters.maxZoomGreater);
    add('p.maxZoom >= :maxZGE', { maxZGE: filters.maxZoomGreaterEqual }, filters.maxZoomGreaterEqual);
    add('p.maxZoom < :maxZL', { maxZL: filters.maxZoomLess }, filters.maxZoomLess);
    add('p.maxZoom <= :maxZLE', { maxZLE: filters.maxZoomLessEqual }, filters.maxZoomLessEqual);

    add('p.resolutionBest > :resG', { resG: filters.resolutionBestGreater }, filters.resolutionBestGreater);
    add('p.resolutionBest >= :resGE', { resGE: filters.resolutionBestGreaterEqual }, filters.resolutionBestGreaterEqual);
    add('p.resolutionBest < :resL', { resL: filters.resolutionBestLess }, filters.resolutionBestLess);
    add('p.resolutionBest <= :resLE', { resLE: filters.resolutionBestLessEqual }, filters.resolutionBestLessEqual);

    if (filters.boundingPolygonContains != null) {
      add(
        'ST_Contains(p.boundingPolygon, ST_GeomFromText(:contains, 4326))',
        { contains: filters.boundingPolygonContains },
        filters.boundingPolygonContains
      );
    }
    if (filters.boundingPolygonWithin != null) {
      add('ST_Within(p.boundingPolygon, ST_GeomFromText(:within, 4326))', { within: filters.boundingPolygonWithin }, filters.boundingPolygonWithin);
    }
    if (filters.boundingPolygonIntersects != null) {
      add(
        'ST_Intersects(p.boundingPolygon, ST_GeomFromText(:intersects, 4326))',
        { intersects: filters.boundingPolygonIntersects },
        filters.boundingPolygonIntersects
      );
    }

    return qb.getMany() as Promise<Product[]>;
  }
}
