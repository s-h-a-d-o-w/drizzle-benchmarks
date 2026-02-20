import { serve } from '@hono/node-server';
import cluster from 'cluster';
import os from 'os';
import 'dotenv/config';
import { Hono } from 'hono';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import cpuUsage from './cpu-usage.ts';
import {
  CustomerEntity,
  DetailEntity,
  EmployeeEntity,
  OrderEntity,
  ProductEntity,
  SupplierEntity,
} from './typeorm-schema.ts';

const numCPUs = os.cpus().length;

const parseNumber = (value: string | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createApp = async () => {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [CustomerEntity, EmployeeEntity, SupplierEntity, ProductEntity, OrderEntity, DetailEntity],
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();

  const customerRepo = dataSource.getRepository(CustomerEntity);
  const employeeRepo = dataSource.getRepository(EmployeeEntity);
  const supplierRepo = dataSource.getRepository(SupplierEntity);
  const productRepo = dataSource.getRepository(ProductEntity);
  const orderRepo = dataSource.getRepository(OrderEntity);

  const app = new Hono();
  app.route('', cpuUsage);
  app.get('/customers', async (c) => {
    const limit = parseNumber(c.req.query('limit'));
    const offset = parseNumber(c.req.query('offset'));
    const result = await customerRepo.find({
      take: limit,
      skip: offset,
      order: {
        id: 'ASC',
      },
    });
    return c.json(result);
  });

  app.get('/customer-by-id', async (c) => {
    const id = parseNumber(c.req.query('id'));
    const result = await customerRepo.findOneBy({ id });
    return c.json(result);
  });

  app.get('/search-customer', async (c) => {
    const term = `${c.req.query('term')}:*`;
    const result = await customerRepo
      .createQueryBuilder('customer')
      .where(`to_tsvector('english', customer.company_name) @@ to_tsquery('english', :term)`, { term })
      .getMany();
    return c.json(result);
  });

  app.get('/employees', async (c) => {
    const limit = parseNumber(c.req.query('limit'));
    const offset = parseNumber(c.req.query('offset'));
    const result = await employeeRepo.find({
      take: limit,
      skip: offset,
      order: {
        id: 'ASC',
      },
    });
    return c.json(result);
  });

  app.get('/employee-with-recipient', async (c) => {
    const id = parseNumber(c.req.query('id'));
    const result = await employeeRepo.findOne({
      where: { id },
      relations: {
        recipient: true,
      },
    });
    return c.json([result]);
  });

  app.get('/suppliers', async (c) => {
    const limit = parseNumber(c.req.query('limit'));
    const offset = parseNumber(c.req.query('offset'));
    const result = await supplierRepo.find({
      take: limit,
      skip: offset,
      order: {
        id: 'ASC',
      },
    });
    return c.json(result);
  });

  app.get('/supplier-by-id', async (c) => {
    const id = parseNumber(c.req.query('id'));
    const result = await supplierRepo.findOneBy({ id });
    return c.json(result);
  });

  app.get('/products', async (c) => {
    const limit = parseNumber(c.req.query('limit'));
    const offset = parseNumber(c.req.query('offset'));
    const result = await productRepo.find({
      take: limit,
      skip: offset,
      order: {
        id: 'ASC',
      },
    });
    return c.json(result);
  });

  app.get('/product-with-supplier', async (c) => {
    const id = parseNumber(c.req.query('id'));
    const result = await productRepo.findOne({
      where: { id },
      relations: {
        supplier: true,
      },
    });
    return c.json([result]);
  });

  app.get('/search-product', async (c) => {
    const term = `${c.req.query('term')}:*`;
    const result = await productRepo
      .createQueryBuilder('product')
      .where(`to_tsvector('english', product.name) @@ to_tsquery('english', :term)`, { term })
      .getMany();
    return c.json(result);
  });

  app.get('/orders-with-details', async (c) => {
    const limit = parseNumber(c.req.query('limit'));
    const offset = parseNumber(c.req.query('offset'));
    const result = await orderRepo
      .createQueryBuilder('orders')
      .leftJoin('orders.details', 'details')
      .select('orders.id', 'id')
      .addSelect('orders.shipped_date', 'shippedDate')
      .addSelect('orders.ship_name', 'shipName')
      .addSelect('orders.ship_city', 'shipCity')
      .addSelect('orders.ship_country', 'shipCountry')
      .addSelect('COUNT(details.product_id)::int', 'productsCount')
      .addSelect('COALESCE(SUM(details.quantity), 0)::int', 'quantitySum')
      .addSelect('COALESCE(SUM(details.quantity * details.unit_price), 0)::real', 'totalPrice')
      .groupBy('orders.id')
      .orderBy('orders.id', 'ASC')
      .offset(offset)
      .limit(limit)
      .getRawMany();
    return c.json(result);
  });

  app.get('/order-with-details', async (c) => {
    const id = parseNumber(c.req.query('id'));
    const result = await orderRepo
      .createQueryBuilder('orders')
      .leftJoin('orders.details', 'details')
      .select('orders.id', 'id')
      .addSelect('orders.shipped_date', 'shippedDate')
      .addSelect('orders.ship_name', 'shipName')
      .addSelect('orders.ship_city', 'shipCity')
      .addSelect('orders.ship_country', 'shipCountry')
      .addSelect('COUNT(details.product_id)::int', 'productsCount')
      .addSelect('COALESCE(SUM(details.quantity), 0)::int', 'quantitySum')
      .addSelect('COALESCE(SUM(details.quantity * details.unit_price), 0)::real', 'totalPrice')
      .where('orders.id = :id', { id })
      .groupBy('orders.id')
      .orderBy('orders.id', 'ASC')
      .getRawMany();
    return c.json(result);
  });

  app.get('/order-with-details-and-products', async (c) => {
    const id = parseNumber(c.req.query('id'));
    const result = await orderRepo.find({
      where: { id },
      relations: {
        details: {
          product: true,
        },
      },
    });
    return c.json(result);
  });

  return app;
};

const startWorker = async () => {
  const app = await createApp();
  serve({
    fetch: app.fetch,
    port: 3003,
  });
  console.log(`Worker ${process.pid} started`);
};

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  await startWorker();
}
