import { drizzle } from 'drizzle-orm/bun-sql';
import { relations } from './relations.ts';
import * as schema from './schema.ts';
import { eq, sql, asc } from 'drizzle-orm';
import cpuUsage from './cpu-usage.ts';
import { customers, details, employees, orders, products, suppliers } from './schema.ts';
import 'dotenv/config';
// import pg from 'pg';
import cluster from 'cluster';
import os from 'os';

const numCPUs = os.availableParallelism();

const client = new Bun.SQL(process.env.DATABASE_URL!);
// const client = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, min: 4 });
const db = drizzle({ client, schema, relations, logger: false });

const p1 = db.query.customers
  .findMany({
    limit: sql.placeholder('limit'),
    offset: sql.placeholder('offset'),
    orderBy: {
      id: 'asc',
    },
  })
  .prepare('p1');

const p2 = db.query.customers
  .findFirst({
    where: {
      id: sql.placeholder('id'),
    },
  })
  .prepare('p2');

const p3 = db.query.customers
  .findMany({
    where: {
      RAW: sql`to_tsvector('english', ${customers.companyName}) @@ to_tsquery('english', ${sql.placeholder('term')})`,
    },
  })
  .prepare('p3');

const p4 = db.query.employees
  .findMany({
    limit: sql.placeholder('limit'),
    offset: sql.placeholder('offset'),
    orderBy: {
      id: 'asc',
    },
  })
  .prepare('p4');

const p5 = db.query.employees
  .findMany({
    with: {
      recipient: true,
    },
    where: {
      id: sql.placeholder('id'),
    },
  })
  .prepare('p5');

const p6 = db.query.suppliers
  .findMany({
    limit: sql.placeholder('limit'),
    offset: sql.placeholder('offset'),
    orderBy: {
      id: 'asc',
    },
  })
  .prepare('p6');

const p7 = db.query.suppliers
  .findFirst({
    where: {
      id: sql.placeholder('id'),
    },
  })
  .prepare('p7');

const p8 = db.query.products
  .findMany({
    limit: sql.placeholder('limit'),
    offset: sql.placeholder('offset'),
    orderBy: {
      id: 'asc',
    },
  })
  .prepare('p8');

const p9 = db.query.products
  .findMany({
    where: {
      id: sql.placeholder('id'),
    },
    with: {
      supplier: true,
    },
  })
  .prepare('p9');

const p10 = db.query.products
  .findMany({
    where: {
      RAW: sql`to_tsvector('english', ${products.name}) @@ to_tsquery('english', ${sql.placeholder('term')})`,
    },
  })
  .prepare('p10');

const p11 = db
  .select({
    id: orders.id,
    shippedDate: orders.shippedDate,
    shipName: orders.shipName,
    shipCity: orders.shipCity,
    shipCountry: orders.shipCountry,
    productsCount: sql<number>`count(${details.productId})::int`,
    quantitySum: sql<number>`sum(${details.quantity})::int`,
    totalPrice: sql<number>`sum(${details.quantity} * ${details.unitPrice})::real`,
  })
  .from(orders)
  .leftJoin(details, eq(details.orderId, orders.id))
  .groupBy(orders.id)
  .orderBy(asc(orders.id))
  .limit(sql.placeholder('limit'))
  .offset(sql.placeholder('offset'))
  .prepare('p11');

const p12 = db
  .select({
    id: orders.id,
    shippedDate: orders.shippedDate,
    shipName: orders.shipName,
    shipCity: orders.shipCity,
    shipCountry: orders.shipCountry,
    productsCount: sql<number>`count(${details.productId})::int`,
    quantitySum: sql<number>`sum(${details.quantity})::int`,
    totalPrice: sql<number>`sum(${details.quantity} * ${details.unitPrice})::real`,
  })
  .from(orders)
  .leftJoin(details, eq(details.orderId, orders.id))
  .where(eq(orders.id, sql.placeholder('id')))
  .groupBy(orders.id)
  .orderBy(asc(orders.id))
  .prepare('p12');

const p13 = db.query.orders
  .findMany({
    with: {
      details: {
        with: {
          product: true,
        },
      },
    },
    where: {
      id: sql.placeholder('id'),
    }
  })
  .prepare('p13');

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    headers: {
      'content-type': 'application/json',
    },
    ...init,
  });

const methodNotAllowed = () => json({ error: 'Method not allowed' }, { status: 405 });
const notFound = () => json({ error: 'Not found' }, { status: 404 });

async function fetch(request: Request) {
  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  const url = new URL(request.url);
  const { searchParams, pathname } = url;

  switch (pathname) {
    case '/stats':
      return cpuUsage.fetch(request);
    case '/customers': {
      const limit = Number(searchParams.get('limit'));
      const offset = Number(searchParams.get('offset'));
      const result = await p1.execute({ limit, offset });
      return json(result);
    }
    case '/customer-by-id': {
      const result = await p2.execute({ id: searchParams.get('id') });
      return json(result);
    }
    case '/search-customer': {
      const term = `${searchParams.get('term')}:*`;
      const result = await p3.execute({ term });
      return json(result);
    }
    case '/employees': {
      const limit = Number(searchParams.get('limit'));
      const offset = Number(searchParams.get('offset'));
      const result = await p4.execute({ limit, offset });
      return json(result);
    }
    case '/employee-with-recipient': {
      const result = await p5.execute({ id: searchParams.get('id') });
      return json(result);
    }
    case '/suppliers': {
      const limit = Number(searchParams.get('limit'));
      const offset = Number(searchParams.get('offset'));
      const result = await p6.execute({ limit, offset });
      return json(result);
    }
    case '/supplier-by-id': {
      const result = await p7.execute({ id: searchParams.get('id') });
      return json(result);
    }
    case '/products': {
      const limit = Number(searchParams.get('limit'));
      const offset = Number(searchParams.get('offset'));
      const result = await p8.execute({ limit, offset });
      return json(result);
    }
    case '/product-with-supplier': {
      const result = await p9.execute({ id: searchParams.get('id') });
      return json(result);
    }
    case '/search-product': {
      const term = `${searchParams.get('term')}:*`;
      const result = await p10.execute({ term });
      return json(result);
    }
    case '/orders-with-details': {
      const limit = Number(searchParams.get('limit'));
      const offset = Number(searchParams.get('offset'));
      const result = await p11.execute({ limit, offset });
      return json(result);
    }
    case '/order-with-details': {
      const result = await p12.execute({ id: searchParams.get('id') });
      return json(result);
    }
    case '/order-with-details-and-products': {
      const result = await p13.execute({ id: searchParams.get('id') });
      return json(result);
    }
    default:
      return notFound();
  }
}

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);
  //Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  Bun.serve({
    port: 3000,
    reusePort: true,
    fetch,
  });
  console.log(`Worker ${process.pid} started`);
}
