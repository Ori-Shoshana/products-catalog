import { injectable, inject } from 'tsyringe';
import { Repository } from 'typeorm';
import type { Logger } from '@map-colonies/js-logger';
import { SERVICES } from '../../common/constants';
import { BadRequestError, NotFoundError, InternalServerError } from '../../common/errors';
import type { Product, ProductCreateInput, ProductUpdateInput, ProductQueryFilters } from '../models/product';
import { ProductEntity } from './productEntity';

@injectable()
export class ProductRepository {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.PRODUCT_ENTITY_REPOSITORY) private readonly repo: Repository<ProductEntity>
  ) {}

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
          ...(input.boundingPolygon != null ? { boundingPolygon: (): string => `ST_GeomFromText(:wkt, 4326)` } : {}),
        });

      if (input.boundingPolygon != null) qb.setParameters({ wkt: input.boundingPolygon });

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

    // Simple equality filters
    const equalityFilters: { field: string; paramKey: string; value: unknown }[] = [
      { field: 'p.name', paramKey: 'name', value: filters.name },
      { field: 'p.type', paramKey: 'type', value: filters.type },
      { field: 'p.consumptionProtocol', paramKey: 'protocol', value: filters.consumptionProtocol },
    ];

    // Range filters (greater/less comparisons)
    const rangeFilters: { field: string; operator: string; paramKey: string; value: unknown }[] = [
      { field: 'p.minZoom', operator: '>', paramKey: 'minZoomG', value: filters.minZoomGreater },
      { field: 'p.minZoom', operator: '>=', paramKey: 'minZoomGE', value: filters.minZoomGreaterEqual },
      { field: 'p.minZoom', operator: '<', paramKey: 'minZoomL', value: filters.minZoomLess },
      { field: 'p.minZoom', operator: '<=', paramKey: 'minZoomLE', value: filters.minZoomLessEqual },
      { field: 'p.maxZoom', operator: '>', paramKey: 'maxZoomG', value: filters.maxZoomGreater },
      { field: 'p.maxZoom', operator: '>=', paramKey: 'maxZoomGE', value: filters.maxZoomGreaterEqual },
      { field: 'p.maxZoom', operator: '<', paramKey: 'maxZoomL', value: filters.maxZoomLess },
      { field: 'p.maxZoom', operator: '<=', paramKey: 'maxZoomLE', value: filters.maxZoomLessEqual },
      { field: 'p.resolutionBest', operator: '>', paramKey: 'resolutionBestG', value: filters.resolutionBestGreater },
      { field: 'p.resolutionBest', operator: '>=', paramKey: 'resolutionBestGE', value: filters.resolutionBestGreaterEqual },
      { field: 'p.resolutionBest', operator: '<', paramKey: 'resolutionBestL', value: filters.resolutionBestLess },
      { field: 'p.resolutionBest', operator: '<=', paramKey: 'resolutionBestLE', value: filters.resolutionBestLessEqual },
    ];

    // Spatial filters
    const spatialFilters: { condition: string; paramKey: string; value: unknown }[] = [
      { condition: 'ST_Contains(p.boundingPolygon, ST_GeomFromText(:contains, 4326))', paramKey: 'contains', value: filters.boundingPolygonContains },
      { condition: 'ST_Within(p.boundingPolygon, ST_GeomFromText(:within, 4326))', paramKey: 'within', value: filters.boundingPolygonWithin },
      {
        condition: 'ST_Intersects(p.boundingPolygon, ST_GeomFromText(:intersects, 4326))',
        paramKey: 'intersects',
        value: filters.boundingPolygonIntersects,
      },
    ];

    // Apply all filters
    for (const { field, paramKey, value } of equalityFilters) {
      if (value != null) {
        qb.andWhere(`${field} = :${paramKey}`, { [paramKey]: value });
      }
    }

    for (const { field, operator, paramKey, value } of rangeFilters) {
      if (value != null) {
        qb.andWhere(`${field} ${operator} :${paramKey}`, { [paramKey]: value });
      }
    }

    for (const { condition, paramKey, value } of spatialFilters) {
      if (value != null) {
        qb.andWhere(condition, { [paramKey]: value });
      }
    }

    return qb.getMany() as Promise<Product[]>;
  }
}
