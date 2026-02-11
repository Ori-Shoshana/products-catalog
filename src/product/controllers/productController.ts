import { RequestHandler } from 'express';
import httpStatus from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { type Registry, Counter } from 'prom-client';
import type { Logger } from '@map-colonies/js-logger';
import { SERVICES } from '@common/constants';
import { ProductManager } from '../models/productManager';
import type { ProductCreateInput, ProductUpdateInput, ProductQueryFilters, Product } from '../models/product';

interface ProductParams {
  id: string;
}

type GetProductsHandler = RequestHandler<undefined, Product[], undefined, ProductQueryFilters>;
type GetProductByIdHandler = RequestHandler<ProductParams, Product>;
type CreateProductHandler = RequestHandler<undefined, Product, ProductCreateInput>;
type UpdateProductHandler = RequestHandler<ProductParams, Product, ProductUpdateInput>;
type DeleteProductHandler = RequestHandler<ProductParams, void, undefined>;

@injectable()
export class ProductController {
  private readonly createdProductsCounter: Counter;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.PRODUCT_MANAGER) private readonly manager: ProductManager,
    @inject(SERVICES.METRICS) private readonly metricsRegistry: Registry
  ) {
    this.createdProductsCounter = new Counter({
      name: 'created_products_count',
      help: 'number of created products',
      registers: [this.metricsRegistry],
    });
  }

  public getProducts: GetProductsHandler = async (req, res, next) => {
    try {
      const products = await this.manager.getProducts(req.query);
      return res.status(httpStatus.OK).json(products);
    } catch (error) {
      return next(error);
    }
  };

  public getProductById: GetProductByIdHandler = async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const product = await this.manager.getProductById(id);
      return res.status(httpStatus.OK).json(product);
    } catch (error) {
      return next(error);
    }
  };

  public createProduct: CreateProductHandler = async (req, res, next) => {
    try {
      this.logger.info({ body: req.body }, 'createProduct incoming');

      const created = await this.manager.createProduct(req.body);
      this.createdProductsCounter.inc(1);
      return res.status(httpStatus.CREATED).json(created);
    } catch (error) {
      this.logger.error({ err: error }, 'failed to create product');
      return next(error);
    }
  };

  public updateProduct: UpdateProductHandler = async (req, res, next) => {
    try {
      this.logger.info({ idParam: req.params.id, body: req.body }, 'updateProduct incoming');

      const id = Number(req.params.id);
      const updated = await this.manager.updateProduct(id, req.body);
      return res.status(httpStatus.OK).json(updated);
    } catch (error) {
      this.logger.error({ err: error }, 'failed to update product');
      return next(error);
    }
  };
  public deleteProduct: DeleteProductHandler = async (req, res, next) => {
    try {
      this.logger.info({ idParam: req.params.id }, 'deleteProduct incoming');

      const id = Number(req.params.id);
      await this.manager.deleteProduct(id);
      return res.status(httpStatus.NO_CONTENT).send();
    } catch (error) {
      this.logger.error({ err: error }, 'failed to delete product');
      return next(error);
    }
  };
}
