import { serve } from '@hono/node-server';
import cluster from 'cluster';
import 'dotenv/config';
import { Hono } from 'hono';
import os from 'os';
import pg from 'pg';
import cpuUsage from './cpu-usage.ts';

const numCPUs = os.cpus().length;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const app = new Hono();
app.route('', cpuUsage);
app.get('/customers', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));
  const result = await pool.query({
    name: 'p1',
    text: 'select * from customers order by id asc limit $1 offset $2',
    values: [limit, offset],
  });
  return c.json(result.rows);
});

app.get('/customer-by-id', async (c) => {
  const result = await pool.query({
    name: 'p2',
    text: 'select * from customers where id = $1 limit 1',
    values: [Number(c.req.query('id'))],
  });
  return c.json(result.rows[0] ?? null);
});

app.get('/search-customer', async (c) => {
  const term = `${c.req.query('term')}:*`;
  const result = await pool.query({
    name: 'p3',
    text: "select * from customers where to_tsvector('english', company_name) @@ to_tsquery('english', $1)",
    values: [term],
  });
  return c.json(result.rows);
});

app.get('/employees', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));
  const result = await pool.query({
    name: 'p4',
    text: 'select * from employees order by id asc limit $1 offset $2',
    values: [limit, offset],
  });
  return c.json(result.rows);
});

app.get('/employee-with-recipient', async (c) => {
  const result = await pool.query({
    name: 'p5',
    text: `
      select
        e.*,
        case when r.id is null then null else row_to_json(r) end as recipient
      from employees e
      left join employees r on r.id = e.recipient_id
      where e.id = $1
    `,
    values: [Number(c.req.query('id'))],
  });
  return c.json(result.rows);
});

app.get('/suppliers', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));

  const result = await pool.query({
    name: 'p6',
    text: 'select * from suppliers order by id asc limit $1 offset $2',
    values: [limit, offset],
  });
  return c.json(result.rows);
});

app.get('/supplier-by-id', async (c) => {
  const result = await pool.query({
    name: 'p7',
    text: 'select * from suppliers where id = $1 limit 1',
    values: [Number(c.req.query('id'))],
  });
  return c.json(result.rows[0] ?? null);
});

app.get('/products', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));

  const result = await pool.query({
    name: 'p8',
    text: 'select * from products order by id asc limit $1 offset $2',
    values: [limit, offset],
  });
  return c.json(result.rows);
});

app.get('/product-with-supplier', async (c) => {
  const result = await pool.query({
    name: 'p9',
    text: `
      select
        p.*,
        case when s.id is null then null else row_to_json(s) end as supplier
      from products p
      left join suppliers s on s.id = p.supplier_id
      where p.id = $1
    `,
    values: [Number(c.req.query('id'))],
  });
  return c.json(result.rows);
});

app.get('/search-product', async (c) => {
  const term = `${c.req.query('term')}:*`;
  const result = await pool.query({
    name: 'p10',
    text: "select * from products where to_tsvector('english', name) @@ to_tsquery('english', $1)",
    values: [term],
  });
  return c.json(result.rows);
});

app.get('/orders-with-details', async (c) => {
  const limit = Number(c.req.query('limit'));
  const offset = Number(c.req.query('offset'));

  const result = await pool.query({
    name: 'p11',
    text: `
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
      limit $1
      offset $2
    `,
    values: [limit, offset],
  });
  return c.json(result.rows);
});

app.get('/order-with-details', async (c) => {
  const result = await pool.query({
    name: 'p12',
    text: `
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
      where o.id = $1
      group by o.id
      order by o.id asc
    `,
    values: [Number(c.req.query('id'))],
  });
  return c.json(result.rows);
});

app.get('/order-with-details-and-products', async (c) => {
  const result = await pool.query({
    name: 'p13',
    text: `
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
      where o.id = $1
      group by o.id
    `,
    values: [Number(c.req.query('id'))],
  });
  return c.json(result.rows);
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
  serve({
    fetch: app.fetch,
    port: 3004,
  });
  console.log(`Worker ${process.pid} started`);
}
