import cluster from 'cluster';
import 'dotenv/config';
import { Hono } from 'hono';
import os from 'os';
import cpuUsage from './cpu-usage.ts';

const numCPUs = os.availableParallelism();

const client = new Bun.SQL(process.env.DATABASE_URL!);

const app = new Hono();
app.route('', cpuUsage);
app.get('/customers', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));
  const result = await client`select * from customers order by id asc limit ${limit} offset ${offset}`;
  return c.json(result);
});

app.get('/customer-by-id', async (c) => {
  const id = Number(c.req.query('id'));
  const result = await client`select * from customers where id = ${id} limit 1`;
  return c.json(result[0] ?? null);
});

app.get('/search-customer', async (c) => {
  const term = `${c.req.query('term')}:*`;
  const result =
    await client`select * from customers where to_tsvector('english', company_name) @@ to_tsquery('english', ${term})`;
  return c.json(result);
});

app.get('/employees', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));
  const result = await client`select * from employees order by id asc limit ${limit} offset ${offset}`;
  return c.json(result);
});

app.get('/employee-with-recipient', async (c) => {
  const id = Number(c.req.query('id'));
  const result = await client`
      select
        e.*,
        case when r.id is null then null else row_to_json(r) end as recipient
      from employees e
      left join employees r on r.id = e.recipient_id
      where e.id = ${id}
    `;
  return c.json(result);
});

app.get('/suppliers', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));

  const result = await client`select * from suppliers order by id asc limit ${limit} offset ${offset}`;
  return c.json(result);
});

app.get('/supplier-by-id', async (c) => {
  const id = Number(c.req.query('id'));
  const result = await client`select * from suppliers where id = ${id} limit 1`;
  return c.json(result[0] ?? null);
});

app.get('/products', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));

  const result = await client`select * from products order by id asc limit ${limit} offset ${offset}`;
  return c.json(result);
});

app.get('/product-with-supplier', async (c) => {
  const id = Number(c.req.query('id'));
  const result = await client`
      select
        p.*,
        case when s.id is null then null else row_to_json(s) end as supplier
      from products p
      left join suppliers s on s.id = p.supplier_id
      where p.id = ${id}
    `;
  return c.json(result);
});

app.get('/search-product', async (c) => {
  const term = `${c.req.query('term')}:*`;
  const result = await client`select * from products where to_tsvector('english', name) @@ to_tsquery('english', ${term})`;
  return c.json(result);
});

app.get('/orders-with-details', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));

  const result = await client`
      select
        o.id,
        o.shipped_date as "shippedDate",
        o.ship_name as "shipName",
        o.ship_city as "shipCity",
        o.ship_country as "shipCountry",
        count(d.product_id)::int as "productsCount",
        coalesce(sum(d.quantity), 0)::int as "quantitySum",
        coalesce(sum(d.quantity * d.unit_price), 0)::real as "totalPrice"
      from orders o
      left join order_details d on d.order_id = o.id
      group by o.id
      order by o.id asc
      limit ${limit}
      offset ${offset}
    `;
  return c.json(result);
});

app.get('/order-with-details', async (c) => {
  const id = Number(c.req.query('id'));
  const result = await client`
      select
        o.id,
        o.shipped_date as "shippedDate",
        o.ship_name as "shipName",
        o.ship_city as "shipCity",
        o.ship_country as "shipCountry",
        count(d.product_id)::int as "productsCount",
        coalesce(sum(d.quantity), 0)::int as "quantitySum",
        coalesce(sum(d.quantity * d.unit_price), 0)::real as "totalPrice"
      from orders o
      left join order_details d on d.order_id = o.id
      where o.id = ${id}
      group by o.id
      order by o.id asc
    `;
  return c.json(result);
});

app.get('/order-with-details-and-products', async (c) => {
  const id = Number(c.req.query('id'));
  const result = await client`
      select
        o.*,
        coalesce(
          json_agg(
            json_build_object(
              'unitPrice', d.unit_price,
              'quantity', d.quantity,
              'discount', d.discount,
              'orderId', d.order_id,
              'productId', d.product_id,
              'product', row_to_json(p)
            )
          ) filter (where d.order_id is not null),
          '[]'::json
        ) as details
      from orders o
      left join order_details d on d.order_id = o.id
      left join products p on p.id = d.product_id
      where o.id = ${id}
      group by o.id
    `;
  return c.json(result);
});

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  for (let i = 0; i < 1; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  Bun.serve({
    fetch: app.fetch,
    port: 3004,
    reusePort: true,
  });
  console.log(`Worker ${process.pid} started`);
}
